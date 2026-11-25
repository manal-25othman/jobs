import { Injectable, Inject, NotFoundException, ForbiddenException } from '@nestjs/common';
import { signedUrlTtlSeconds } from '@naqla/domain';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { STORAGE_PORT, type StoragePort } from '../storage/storage.port';

/**
 * Phase B, package 3 — delivery of activity materials (0039).
 *
 * Materials are platform-private (FR-U-022): no client ever reads `activity_material` or a storage path. A file is
 * delivered only as a short-lived signed URL, and only to someone entitled to it:
 *   graduate materials — the OWNER of a (non-deleted) project on that activity; another user's project, a material
 *                        of another activity, or a reviewer material is "not found" (no existence leak);
 *   reviewer materials — the reviewer to whom a review item of that activity is ASSIGNED, with an active
 *                        human_reviewer grant (enforced by the review guard before this service is reached).
 * Every delivery is audited.
 */
@Injectable()
export class MaterialService {
  constructor(private readonly db: DbService, @Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  async listForProject(userId: string, projectId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new NotFoundException('project not found');
    return this.db.asService(async (c) => {
      const p = (await c.query('select user_id, activity_spec_id from project where id = $1 and deleted_at is null', [projectId])).rows[0];
      if (!p || p.user_id !== userId || !p.activity_spec_id) throw new NotFoundException('project not found');
      const rows = (await c.query(`select id, file_name, size_bytes, material_version, covers_input_keys from activity_material
                                    where activity_spec_id = $1 and audience = 'graduate' order by created_at`, [p.activity_spec_id])).rows;
      return { items: rows.map((m) => ({ id: String(m.id), fileName: String(m.file_name), sizeBytes: Number(m.size_bytes), version: String(m.material_version), coversInputKeys: m.covers_input_keys as string[] })) };
    });
  }

  async downloadForProject(userId: string, projectId: string, materialId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f-]{36}$/i.test(materialId)) throw new NotFoundException('material not found');
    return this.db.asService(async (c) => {
      const p = (await c.query('select user_id, activity_spec_id from project where id = $1 and deleted_at is null', [projectId])).rows[0];
      if (!p || p.user_id !== userId || !p.activity_spec_id) throw new NotFoundException('material not found');
      const m = (await c.query(`select id, bucket, object_path, file_name, material_version from activity_material
                                 where id = $1 and activity_spec_id = $2 and audience = 'graduate'`, [materialId, p.activity_spec_id])).rows[0];
      if (!m) throw new NotFoundException('material not found');
      const ttl = signedUrlTtlSeconds('download');
      const url = await this.storage.createSignedDownload(m.bucket, m.object_path, ttl);
      await emitAuditEvent(c, { eventType: 'activity_material.downloaded', userId, actorKind: 'user', actorId: userId, subjectTable: 'activity_material', subjectId: m.id,
        reason: 'the graduate downloaded the starter materials of their own activity', payload: { projectId, fileName: m.file_name, version: m.material_version } });
      return { url, fileName: String(m.file_name), expiresInSeconds: ttl };
    });
  }

  /** Reviewer-only references of the activity of an item ASSIGNED to this reviewer. */
  async forReviewItem(reviewerId: string, itemId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) throw new NotFoundException('review item not found');
    return this.db.asService(async (c) => {
      const item = (await c.query('select id, assigned_to, activity_spec_id from review_queue_item where id = $1', [itemId])).rows[0];
      if (!item) throw new NotFoundException('review item not found');
      if (item.assigned_to !== reviewerId) throw new ForbiddenException('this item is assigned to another reviewer');
      const rows = (await c.query(`select id, bucket, object_path, file_name, material_version from activity_material
                                    where activity_spec_id = $1 and audience = 'reviewer' order by created_at`, [item.activity_spec_id])).rows;
      const ttl = signedUrlTtlSeconds('download');
      const items = [];
      for (const m of rows) {
        items.push({ id: String(m.id), fileName: String(m.file_name), version: String(m.material_version), url: await this.storage.createSignedDownload(m.bucket, m.object_path, ttl), expiresInSeconds: ttl });
        await emitAuditEvent(c, { eventType: 'activity_material.reviewer_accessed', userId: null, actorKind: 'human_reviewer', actorId: reviewerId, rolePerformed: 'human_reviewer',
          subjectTable: 'activity_material', subjectId: m.id, reason: 'an assigned reviewer opened the reference material of the activity under review', payload: { reviewItemId: itemId } });
      }
      return { items };
    });
  }
}
