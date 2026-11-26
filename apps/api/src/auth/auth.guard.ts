import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { type AuthenticatedSession, AuthService, SESSION_COOKIE_NAME } from './auth.service.js';

export interface AuthenticatedRequest extends Request {
  authSession?: AuthenticatedSession;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const rawToken = cookies?.[SESSION_COOKIE_NAME];
    const session = await this.authService.authenticateToken(rawToken);
    if (!session) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }
    req.authSession = session;
    return true;
  }
}
