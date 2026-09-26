import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, InvariantViolation, IllegalTransition, MissingPrerequisite } from '@naqla/domain';
import { HTTP_STATUS_BY_CODE, type ErrorCode } from '@naqla/contracts';

/**
 * Maps domain refusals to the contract's closed error set.
 *
 * A rule that refuses an operation is a 4xx with the rule named, never a 500:
 * the client can explain WHICH rule stopped it, and an on-call engineer is
 * not paged for a user trying to approve a draft they have not previewed.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let code: ErrorCode = 'internal';
    let message = 'unexpected error';
    let invariant: string | undefined;

    if (exception instanceof InvariantViolation) {
      code = 'invariant_violation'; message = exception.message; invariant = exception.invariant;
    } else if (exception instanceof IllegalTransition) {
      code = 'illegal_transition'; message = exception.message;
    } else if (exception instanceof MissingPrerequisite) {
      code = 'missing_prerequisite'; message = exception.message;
    } else if (exception instanceof DomainError) {
      code = 'validation_failed'; message = exception.message;
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      code = status === 401 ? 'unauthenticated' : status === 403 ? 'forbidden'
           : status === 404 ? 'not_found' : status === 409 ? 'conflict'
           : status === 400 || status === 422 ? 'validation_failed' : 'internal';
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as { message?: string | string[] }).message?.toString() ?? exception.message;
      res.status(status).json({ ok: false, error: { code, message } });
      return;
    } else {
      // Never leak internals. The stack goes to the log, not the client.
      console.error(exception);
    }

    res.status(HTTP_STATUS_BY_CODE[code]).json({
      ok: false, error: { code, message, ...(invariant ? { invariant } : {}) },
    });
  }
}
