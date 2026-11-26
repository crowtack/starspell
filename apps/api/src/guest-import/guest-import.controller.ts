import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { GuestImportConfirmSchema, GuestImportPreviewSchema } from '@starspell/shared';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { parseOrThrow } from '../common/zod-validation.js';
import { GuestImportService } from './guest-import.service.js';

@Controller('api/guest-import')
@UseGuards(AuthGuard)
export class GuestImportController {
  constructor(private readonly guestImportService: GuestImportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const userId = req.authSession?.userId ?? '';
    const input = parseOrThrow(GuestImportPreviewSchema, body);
    return this.guestImportService.preview(userId, input);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const userId = req.authSession?.userId ?? '';
    const input = parseOrThrow(GuestImportConfirmSchema, body);
    return this.guestImportService.confirm(userId, input);
  }
}
