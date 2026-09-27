import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DbService } from '../infra/db.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';

export interface ReviewerIdentity { readonly id: string; readonly rolePerformed: 'human_reviewer' | 'sme'; }
declare module 'express' { interface Request { naqlaReviewer?: ReviewerIdentity } }

/**
 * A reviewer is an authenticated user holding an active reviewer_grant with
 * role `human_reviewer`. Grants are an operator action; nobody grants themself.
 * SME and Human Reviewer stay separate roles even when one person holds both:
 * this guard admits the human_reviewer role only.
 */
@Injectable()
export class HumanReviewerGuard implements CanActivate {
  constructor(private readonly auth: SupabaseAuthGuard, private readonly db: DbService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await this.auth.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<Request>();
    const user = req.naqlaUser!;
    const grant = await this.db.asService((c) => c.query(
      `select role_performed from reviewer_grant where user_id = $1 and role_performed = 'human_reviewer' and revoked_at is null`, [user.id]));
    if (grant.rowCount === 0) throw new ForbiddenException('this account holds no active human_reviewer grant');
    req.naqlaReviewer = { id: user.id, rolePerformed: 'human_reviewer' };
    return true;
  }
}
