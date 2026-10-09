import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { AdminService, type AdminIdentity } from './admin.service';

declare module 'express' { interface Request { naqlaAdmin?: AdminIdentity } }

/**
 * Admin Track Builder access (Phase 8). Authenticated AND holding at least one
 * active grant of track_admin, sme or product_owner. Which act each role may
 * perform is checked again in AdminService for every request — hidden UI
 * controls are never the authorisation.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: SupabaseAuthGuard, private readonly admin: AdminService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await this.auth.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<Request>();
    const who = await this.admin.identity(req.naqlaUser!.id);
    if (who.roles.length === 0) throw new ForbiddenException('this account holds no Track Builder grant (track_admin, sme or product_owner)');
    req.naqlaAdmin = who;
    return true;
  }
}
