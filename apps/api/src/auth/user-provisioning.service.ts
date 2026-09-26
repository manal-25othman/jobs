import { Injectable } from '@nestjs/common';
import { DbService } from '../infra/db.service';
import { emitAuditEvent } from '../infra/audit';
import type { AuthenticatedUser } from './auth.guard';

/**
 * Mirrors a Supabase Auth user into `app_user` on first use.
 *
 * Identity lives in Supabase; the product profile lives here. Keeping them in
 * separate tables means changing auth provider later rewrites one row shape,
 * not every foreign key in the product.
 */
@Injectable()
export class UserProvisioningService {
  constructor(private readonly db: DbService) {}

  async ensureUser(user: AuthenticatedUser, displayName?: string): Promise<void> {
    await this.db.asService(async (c) => {
      const existing = await c.query('select 1 from app_user where id = $1', [user.id]);
      if (existing.rowCount && existing.rowCount > 0) return;

      await c.query(
        `insert into app_user (id, display_name, locale)
         values ($1, $2, 'ar')
         on conflict (id) do nothing`,
        [user.id, displayName ?? user.email?.split('@')[0] ?? 'مستخدم'],
      );
      await emitAuditEvent(c, {
        eventType: 'user.provisioned',
        userId: user.id,
        actorKind: 'system',
        subjectTable: 'app_user',
        subjectId: user.id,
        reason: 'first authenticated request for this Supabase identity',
      });
    });
  }
}
