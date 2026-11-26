import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UpdateProfileSchema, UpdateSettingsSchema } from '@starspell/shared';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { parseOrThrow } from '../common/zod-validation.js';
import { ProfileService } from './profile.service.js';

@Controller('api')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('profile')
  getProfile(@Req() req: AuthenticatedRequest) {
    const userId = req.authSession?.userId ?? '';
    return this.profileService.getProfile(userId);
  }

  @Patch('profile')
  updateProfile(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const userId = req.authSession?.userId ?? '';
    const input = parseOrThrow(UpdateProfileSchema, body);
    return this.profileService.updateProfile(userId, input);
  }

  @Get('settings')
  getSettings(@Req() req: AuthenticatedRequest) {
    const userId = req.authSession?.userId ?? '';
    return this.profileService.getSettings(userId);
  }

  @Patch('settings')
  updateSettings(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const userId = req.authSession?.userId ?? '';
    const input = parseOrThrow(UpdateSettingsSchema, body);
    return this.profileService.updateSettings(userId, input);
  }
}
