import { Controller, Get, Param, Query } from '@nestjs/common';
import { LeaderboardQuerySchema } from '@starspell/shared';
import { parseOrThrow } from '../common/zod-validation.js';
import { LeaderboardsService } from './leaderboards.service.js';

@Controller('api')
export class LeaderboardsController {
  constructor(private readonly leaderboardsService: LeaderboardsService) {}

  @Get('leaderboards')
  async getLeaderboard(@Query() rawQuery: unknown) {
    const query = parseOrThrow(LeaderboardQuerySchema, rawQuery);
    return this.leaderboardsService.getLeaderboard(query);
  }

  @Get('profile/public/:username')
  async getPublicProfile(@Param('username') username: string) {
    return this.leaderboardsService.getPublicProfile(username);
  }
}
