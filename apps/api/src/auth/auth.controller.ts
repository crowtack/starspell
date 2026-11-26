import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { LoginSchema, RegisterSchema } from '@starspell/shared';
import type { CookieOptions, Request, Response } from 'express';
import { parseOrThrow } from '../common/zod-validation.js';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard.js';
import { AuthService, SESSION_COOKIE_NAME } from './auth.service.js';

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  };
}

@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseOrThrow(RegisterSchema, body);
    const { token, me } = await this.authService.register(input);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return me;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseOrThrow(LoginSchema, body);
    const { token, me } = await this.authService.login(input);
    res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return me;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    await this.authService.logout(cookies?.[SESSION_COOKIE_NAME]);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
    });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return req.authSession?.me;
  }
}
