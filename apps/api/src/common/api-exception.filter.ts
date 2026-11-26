import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Formats every API error into `{ error: { code, message, details? } }`.
 * Never leaks stack traces, database internals, or secrets.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && 'code' in body && 'message' in body) {
        const typed = body as { code: string; message: string; details?: unknown };
        res.status(status).json({
          error: {
            code: typed.code,
            message: typed.message,
            ...(typed.details !== undefined ? { details: typed.details } : {}),
          },
        });
        return;
      }

      const msg =
        typeof body === 'string'
          ? body
          : typeof body === 'object' && 'message' in body
            ? String((body as Record<string, unknown>)['message'])
            : exception.message;

      res.status(status).json({
        error: {
          code: statusToCode(status),
          message: msg,
        },
      });
      return;
    }

    const safeMessage =
      process.env['NODE_ENV'] === 'production'
        ? 'Internal server error'
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: safeMessage,
      },
    });
  }
}

function statusToCode(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
