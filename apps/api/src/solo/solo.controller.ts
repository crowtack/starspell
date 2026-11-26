import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AbandonSoloSessionSchema,
  AppendSoloEventsSchema,
  CreateSoloSessionSchema,
} from '@starspell/shared';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { parseOrThrow } from '../common/zod-validation.js';
import { SoloService } from './solo.service.js';

@Controller('api/solo/sessions')
@UseGuards(AuthGuard)
export class SoloController {
  constructor(private readonly soloService: SoloService) {}

  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseOrThrow(CreateSoloSessionSchema, body);
    const userId = req.authSession?.userId ?? '';
    return this.soloService.createSession(userId, input);
  }

  @Get('active')
  async getActive(@Req() req: AuthenticatedRequest) {
    const userId = req.authSession?.userId ?? '';
    return this.soloService.getActiveSession(userId);
  }

  @Post(':id/events')
  @HttpCode(HttpStatus.OK)
  async appendEvents(
    @Req() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(AppendSoloEventsSchema, body);
    const userId = req.authSession?.userId ?? '';
    return this.soloService.appendEvents(userId, sessionId, input);
  }

  @Post(':id/abandon')
  @HttpCode(HttpStatus.OK)
  async abandon(
    @Req() req: AuthenticatedRequest,
    @Param('id') sessionId: string,
    @Body() body: unknown,
  ) {
    const input = parseOrThrow(AbandonSoloSessionSchema, body ?? {});
    const userId = req.authSession?.userId ?? '';
    return this.soloService.abandonSession(userId, sessionId, input);
  }
}
