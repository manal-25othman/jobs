import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.guard';

/** The authenticated user, or a refusal. Never an optional the caller forgets. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.naqlaUser) throw new UnauthorizedException('no authenticated user on this request');
    return req.naqlaUser;
  },
);
