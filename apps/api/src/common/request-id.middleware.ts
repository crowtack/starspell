import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
  requestId?: string;
}

/**
 * Assigns a correlation request ID (`X-Request-Id`) and logs a safe
 * structured summary without cookies, authorization headers, or request bodies.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER);
  const requestId = incoming && /^[a-zA-Z0-9._-]{1,64}$/.test(incoming) ? incoming : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    if (process.env['NODE_ENV'] === 'test') return;
    const durationMs = Date.now() - startedAt;
    const entry = {
      level: res.statusCode >= 500 ? 'error' : 'info',
      reqId: requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs,
    };
    console.info(JSON.stringify(entry));
  });

  next();
}
