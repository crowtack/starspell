import { describe, expect, it, vi } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { InternalServerErrorException } from '@nestjs/common';
import type { Response } from 'express';
import { ApiExceptionFilter } from '../common/api-exception.filter.js';
import { OriginHeaderGuard } from '../common/origin-header.guard.js';
import { requestIdMiddleware, type RequestWithId } from '../common/request-id.middleware.js';

describe('M6 API security & observability invariants', () => {
  it('OriginHeaderGuard rejects mutating requests without valid Origin or X-Requested-With', () => {
    const guard = new OriginHeaderGuard();
    const makeCtx = (method: string, headers: Record<string, string>) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            method,
            headers,
          }),
        }),
      }) as never;

    expect(guard.canActivate(makeCtx('GET', {}))).toBe(true);
    expect(() => guard.canActivate(makeCtx('POST', {}))).toThrow();
    expect(() =>
      guard.canActivate(
        makeCtx('POST', {
          origin: 'https://evil.example.com',
          'x-requested-with': 'starspell',
        }),
      ),
    ).toThrow();
    expect(
      guard.canActivate(
        makeCtx('POST', {
          origin: 'http://localhost:5173',
          'x-requested-with': 'starspell',
        }),
      ),
    ).toBe(true);
  });

  it('ApiExceptionFilter hides internal error details in production', () => {
    const prevEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      const filter = new ApiExceptionFilter();
      const json = vi.fn();
      const status = vi.fn(() => ({ json }));
      const host = {
        switchToHttp: () => ({
          getResponse: () => ({ status }) as unknown as Response,
        }),
      } as ArgumentsHost;

      filter.catch(new Error('postgres://secret-connection-string'), host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        },
      });
      filter.catch(new InternalServerErrorException('db detail'), host);
    } finally {
      process.env['NODE_ENV'] = prevEnv;
    }
  });

  it('requestIdMiddleware assigns X-Request-Id header safely', () => {
    const req = {
      method: 'GET',
      originalUrl: '/api/health',
      header: () => undefined,
    } as unknown as RequestWithId;
    const setHeader = vi.fn();
    const res = {
      statusCode: 200,
      setHeader,
      on: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();

    requestIdMiddleware(req, res, next);
    expect(typeof req.requestId).toBe('string');
    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
