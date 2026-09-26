import { Inject, Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';
import {
  assertUploadIntentValid, objectPathFor, signedUrlTtlSeconds, UPLOAD_MAX_BYTES_DEFAULT,
} from '@naqla/domain';

const BUCKET_BY_PURPOSE = {
  submission_file: 'naqla-submissions',
  cv_upload: 'naqla-cv-uploads',
} as const;

/**
 * Private uploads with signed access only.
 *
 *   1. intent   → a pending `upload` row and a signed PUT target (60 s)
 *   2. client PUTs the bytes to storage directly; the API never proxies them
 *   3. confirm  → the API reads the stored object, measures size and sha256,
 *                 and marks the row confirmed. Client-declared values are
 *                 never trusted for the measured columns.
 *   4. download → a signed GET URL (300 s), owner only.
 *
 * No raw object path or bucket URL is ever returned from any method.
 */
@Injectable()
export class UploadService {
  constructor(
    private readonly db: DbService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  private prefix(): string { return process.env['STORAGE_BUCKET_PREFIX'] ? `${process.env['STORAGE_BUCKET_PREFIX']}-` : ''; }
  private bucketFor(purpose: keyof typeof BUCKET_BY_PURPOSE): string { return `${this.prefix()}${BUCKET_BY_PURPOSE[purpose]}`; }
  private maxBytes(): number { return Number(process.env['UPLOAD_MAX_BYTES'] ?? UPLOAD_MAX_BYTES_DEFAULT); }

  async createIntent(userId: string, input: {
    declaredName: string; contentType: string; declaredSize: number;
    purpose?: 'submission_file' | 'cv_upload';
  }) {
    const purpose = input.purpose ?? 'submission_file';
    assertUploadIntentValid({ ...input, maxBytes: this.maxBytes() });
    const bucket = this.bucketFor(purpose);
    await this.storage.ensureBucket(bucket);

    return this.db.asService(async (c) => {
      const idRow = await c.query('select gen_random_uuid() as id');
      const uploadId: string = idRow.rows[0].id;
      const objectPath = objectPathFor(userId, uploadId, input.declaredName);

      await c.query(
        `insert into upload (id, user_id, bucket, object_path, declared_name, content_type,
                             declared_size, state, purpose, provenance_source)
         values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)`,
        [uploadId, userId, bucket, objectPath, input.declaredName, input.contentType,
         input.declaredSize, purpose, `user upload intent by ${userId}`],
      );

      const target = await this.storage.createSignedUpload(
        bucket, objectPath, input.contentType, signedUrlTtlSeconds('upload'),
      );

      await emitAuditEvent(c, {
        eventType: 'upload.intent_created', userId, actorKind: 'user', actorId: userId,
        subjectTable: 'upload', subjectId: uploadId,
        reason: 'the user requested a signed upload target',
        payload: { purpose, contentType: input.contentType, declaredSize: input.declaredSize },
      });

      // The object path stays server-side. The client gets an opaque id and a signed target.
      return { uploadId, target };
    });
  }

  async confirm(userId: string, uploadId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select id, user_id, bucket, object_path, declared_size, state, created_at from upload where id = $1`,
        [uploadId],
      );
      if (rows.length === 0) throw new NotFoundException('upload not found');
      const u = rows[0];
      if (u.user_id !== userId) throw new NotFoundException('upload not found');
      if (u.state === 'confirmed') return { uploadId, state: 'confirmed' as const, alreadyConfirmed: true };

      const info = await this.storage.stat(u.bucket, u.object_path);
      if (!info.exists) throw new BadRequestException('no object was stored at the signed target');

      const max = this.maxBytes();
      if ((info.sizeBytes ?? 0) > max) {
        await this.storage.remove(u.bucket, u.object_path);
        await c.query(`update upload set state = 'rejected' where id = $1`, [uploadId]);
        throw new BadRequestException(`stored object exceeds ${max} bytes and was removed`);
      }

      // Measure from the stored bytes, never from the client's declaration.
      const bytes = await this.storage.read(u.bucket, u.object_path);
      const checksum = createHash('sha256').update(bytes).digest('hex');

      await c.query(
        `update upload set state = 'confirmed', size_bytes = $2, checksum_sha256 = $3, confirmed_at = now()
          where id = $1`,
        [uploadId, bytes.byteLength, checksum],
      );
      await emitAuditEvent(c, {
        eventType: 'upload.confirmed', userId, actorKind: 'system',
        subjectTable: 'upload', subjectId: uploadId,
        reason: 'the stored object was measured and recorded',
        payload: { sizeBytes: bytes.byteLength, checksumSha256: checksum },
      });
      return { uploadId, state: 'confirmed' as const, sizeBytes: bytes.byteLength, checksumSha256: checksum };
    });
  }

  async signedDownload(userId: string, uploadId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select user_id, bucket, object_path, state, declared_name, content_type from upload where id = $1`,
        [uploadId],
      );
      if (rows.length === 0 || rows[0].user_id !== userId) throw new NotFoundException('upload not found');
      if (rows[0].state !== 'confirmed') throw new ForbiddenException('only a confirmed upload can be downloaded');
      const url = await this.storage.createSignedDownload(rows[0].bucket, rows[0].object_path, signedUrlTtlSeconds('download'));
      await emitAuditEvent(c, {
        eventType: 'upload.download_signed', userId, actorKind: 'user', actorId: userId,
        subjectTable: 'upload', subjectId: uploadId, reason: 'the owner requested a signed download URL',
      });
      return { url, expiresInSeconds: signedUrlTtlSeconds('download'), name: rows[0].declared_name, contentType: rows[0].content_type };
    });
  }

  /** Used by SubmissionService inside its own transaction. */
  async assertOwnedConfirmed(c: import('pg').PoolClient, userId: string, uploadId: string) {
    const { rows } = await c.query(
      `select id, user_id, state, declared_name from upload where id = $1`, [uploadId],
    );
    if (rows.length === 0 || rows[0].user_id !== userId) throw new NotFoundException(`upload ${uploadId} not found`);
    if (rows[0].state !== 'confirmed') throw new BadRequestException(`upload ${uploadId} is not confirmed`);
    return rows[0] as { id: string; declared_name: string };
  }
}
