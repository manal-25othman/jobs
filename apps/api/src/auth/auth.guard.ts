import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException, Logger,
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

      req.naqlaUser = {
        id: sub,
        email: typeof payload['email'] === 'string' ? payload['email'] : null,
      };
      return true;
    } catch (e) {
      throw new UnauthorizedException(`invalid token: ${(e as Error).message}`);
    }
  }
}
