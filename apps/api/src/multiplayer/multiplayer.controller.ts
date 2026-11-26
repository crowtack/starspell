import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard.js';
import { MultiplayerService } from './multiplayer.service.js';

@Controller('api/multiplayer')
@UseGuards(AuthGuard)
export class MultiplayerController {
  constructor(private readonly multiplayerService: MultiplayerService) {}

  @Get('history')
  async history(@Req() req: AuthenticatedRequest) {
    const userId = req.authSession?.userId ?? '';
    const items = await this.multiplayerService.getMatchHistory(userId);
    return { items };
  }
}
