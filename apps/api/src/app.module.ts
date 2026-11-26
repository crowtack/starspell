import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthService } from './auth/auth.service.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { OriginHeaderGuard } from './common/origin-header.guard.js';
import { GuestImportController } from './guest-import/guest-import.controller.js';
import { GuestImportService } from './guest-import/guest-import.service.js';
import { HealthController } from './health/health.controller.js';
import { LeaderboardsController } from './leaderboards/leaderboards.controller.js';
import { LeaderboardsService } from './leaderboards/leaderboards.service.js';
import { MultiplayerController } from './multiplayer/multiplayer.controller.js';
import { MultiplayerGateway } from './multiplayer/multiplayer.gateway.js';
import { MultiplayerService } from './multiplayer/multiplayer.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ProfileController } from './profile/profile.controller.js';
import { ProfileService } from './profile/profile.service.js';
import { SoloController } from './solo/solo.controller.js';
import { SoloService } from './solo/solo.service.js';

@Module({
  controllers: [
    AuthController,
    ProfileController,
    GuestImportController,
    SoloController,
    MultiplayerController,
    LeaderboardsController,
    HealthController,
  ],
  providers: [
    PrismaService,
    AuthService,
    AuthGuard,
    ProfileService,
    GuestImportService,
    SoloService,
    MultiplayerService,
    MultiplayerGateway,
    LeaderboardsService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: OriginHeaderGuard },
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AppModule {}
