import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export function getAllowedOrigins(): Set<string> {
  const raw = process.env['CORS_ORIGIN'] ?? 'http://localhost:5173';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/**
 * Enforces Origin + custom header (X-Requested-With) on state-changing HTTP requests
 * per GAME_RULES.md §12.9.
 */
@Injectable()
export class OriginHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!STATE_CHANGING_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const origin = req.headers.origin;
    const allowedOrigins = getAllowedOrigins();
    if (typeof origin !== 'string' || !allowedOrigins.has(origin)) {
      throw new ForbiddenException({
        code: 'INVALID_ORIGIN',
        message: 'Missing or disallowed Origin header',
      });
    }

    const customHeader = req.headers['x-requested-with'];
    if (customHeader !== 'starspell') {
      throw new ForbiddenException({
        code: 'MISSING_CUSTOM_HEADER',
        message: 'Missing required X-Requested-With header',
      });
    }

    return true;
  }
}
