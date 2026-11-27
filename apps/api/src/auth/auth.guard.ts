import {
  CanActivate, ExecutionContext, Injectable, ForbiddenException, UnauthorizedException, Logger,
} from '@nestjs/common';
import { jwtVerify } from 'jose';
import type { Request } from 'express';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string | null;
}

declare module 'express' {
  interface Request {
    naqlaUser?: AuthenticatedUser;
  }
}

/**
 * Verifies a Supabase Auth access token.
 *
 * Supabase signs user JWTs with the project's JWT secret (HS256) and puts the
 * user id in `sub`. Verifying here rather than trusting a header means the API
 * is safe to expose directly: a forged `sub` fails the signature check.
 *
 * Only the end-user path is implemented. No social login, no admin console, no
 * organisation membership — none of it is needed to secure this slice.
 */
class StagingRefusal extends Error {}

/**
 * Staging (NAQLA_ENV=staging) is a PRIVATE trial: only addresses on STAGING_ALLOWED_EMAILS (exact e-mails or @domain
 * suffixes) may use the API, whatever the session. Public sign-up is also disabled in the auth provider; this is the
 * second lock, enforced here.
 */
export function stagingAllows(email: string | null, env: NodeJS.ProcessEnv = process.env): boolean {
  if (env['NAQLA_ENV'] !== 'staging') return true;
  const list = (env['STAGING_ALLOWED_EMAILS'] ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!email || list.length === 0) return false;
  const e = email.trim().toLowerCase();
  return list.some((x) => (x.startsWith('@') ? e.endsWith(x) : e === x));
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('a bearer token is required');
    }
    const token = header.slice('Bearer '.length).trim();

    const secret = process.env['SUPABASE_JWT_SECRET'];
    if (!secret) {
      // Refuse rather than fall back to an unverified decode: an API that
      // accepts unsigned identity in one configuration will eventually run in
      // that configuration.
      this.logger.error('SUPABASE_JWT_SECRET is not set; refusing to authenticate anyone');
      throw new UnauthorizedException('authentication is not configured');
    }

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ['HS256'],
      });
      const sub = typeof payload.sub === 'string' ? payload.sub : null;
      if (!sub) throw new Error('token carries no subject');

      const email = typeof payload['email'] === 'string' ? payload['email'] : null;
      if (!stagingAllows(email)) throw new StagingRefusal();
      req.naqlaUser = { id: sub, email };
      return true;
    } catch (e) {
      if (e instanceof StagingRefusal) throw new ForbiddenException('[staging_not_invited] هذه بيئة تجربة خاصة؛ الدخول للمدعوّين فقط.');
      throw new UnauthorizedException(`invalid token: ${(e as Error).message}`);
    }
  }
}
