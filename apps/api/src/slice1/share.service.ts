import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import { assertShareLinkPolicyValid } from '@naqla/domain';

/**
 * Share links.
 *
 * The token is returned once and stored only as a hash: a database leak does
 * not hand anyone a working link. Every link expires and none is indexable —
 * OPEN-016 is unresolved, so the conservative reading applies and the database
 * enforces it.
 */
@Injectable()
export class ShareService {
  constructor(private readonly db: DbService) {}

  async create(userId: string, input: {
    resourceKind: 'recruiter_report'; resourceId: string; expiresInDays: number;
  }) {
    const days = Math.min(Math.max(input.expiresInDays ?? 7, 1), 90);
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    assertShareLinkPolicyValid({ expiresAt, revokedAt: null, indexable: false });

    return this.db.asService(async (c) => {
      const owned = await c.query(
        'select id from evidence_report where id = $1 and user_id = $2',
        [input.resourceId, userId],
      );
      if (owned.rowCount === 0) throw new NotFoundException('report not found');

      const token = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const { rows } = await c.query(
        `insert into share_link (user_id, resource_kind, resource_id, token_hash, expires_at)
         values ($1,$2,$3,$4,$5)
         returning id, expires_at, revoked_at, indexable`,
        [userId, input.resourceKind, input.resourceId, tokenHash, expiresAt],
      );

      await emitAuditEvent(c, {
        eventType: 'share_link.created',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'share_link', subjectId: rows[0].id,
        reason: 'the user created a time-limited link to their evidence report',
        payload: { resourceKind: input.resourceKind, expiresAt },
      });

      // The token is shown once. It is never retrievable again.
      return { ...rows[0], token, resourceId: input.resourceId };
    });
  }

  async verifyToken(
    resourceKind: string, resourceId: string, token?: string,
  ): Promise<boolean> {
    if (!token) return false;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `select 1 from share_link
          where resource_kind = $1 and resource_id = $2 and token_hash = $3
            and revoked_at is null and expires_at > now()`,
        [resourceKind, resourceId, tokenHash],
      );
      return rows.length > 0;
    });
  }

  async revoke(userId: string, shareLinkId: string) {
    return this.db.asService(async (c) => {
      const { rows } = await c.query(
        `update share_link set revoked_at = now()
          where id = $1 and user_id = $2 and revoked_at is null
          returning id, revoked_at`,
        [shareLinkId, userId],
      );
      if (rows.length === 0) throw new BadRequestException('no active link to revoke');
      await emitAuditEvent(c, {
        eventType: 'share_link.revoked',
        userId, actorKind: 'user', actorId: userId,
        subjectTable: 'share_link', subjectId: shareLinkId,
        reason: 'the user revoked the link',
      });
      return rows[0];
    });
  }
}
