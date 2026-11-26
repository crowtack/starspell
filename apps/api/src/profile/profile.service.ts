import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AccountDifficultyStat,
  type AccountProfile,
  type AvatarId,
  DIFFICULTY_KEYS,
  type UpdateProfileInput,
  type UpdateSettingsInput,
  type UserSettingsSave,
} from '@starspell/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string): Promise<{
    profile: AccountProfile;
    difficulties: AccountDifficultyStat[];
  }> {
    const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Profile not found' });
    }
    const diffRows = await this.prisma.playerDifficultyStats.findMany({ where: { userId } });
    const byDiff = new Map(diffRows.map((d) => [d.difficulty, d]));

    return {
      profile: {
        displayName: profile.displayName,
        avatarId: profile.avatarId as AvatarId,
        bio: profile.bio,
        xp: profile.xp,
        level: profile.level,
        highScore: profile.highScore,
        bestStreak: profile.bestStreak,
        wordsSolved: profile.wordsSolved,
        constellationsCleared: profile.constellationsCleared,
        imported: profile.imported,
      },
      difficulties: DIFFICULTY_KEYS.map((key) => {
        const row = byDiff.get(key);
        return {
          difficulty: key,
          unlocked: true,
          completed: row?.completed ?? false,
          highScore: row?.highScore ?? 0,
          bestStreak: row?.bestStreak ?? 0,
          wordsSolved: row?.wordsSolved ?? 0,
          runsCleared: row?.runsCleared ?? 0,
        };
      }),
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<AccountProfile> {
    // Allow-list mutable fields explicitly; never pass raw body to Prisma.
    const data: { displayName?: string; avatarId?: string; bio?: string } = {};
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.avatarId !== undefined) data.avatarId = input.avatarId;
    if (input.bio !== undefined) data.bio = input.bio;

    const updated = await this.prisma.playerProfile.update({
      where: { userId },
      data,
    });

    return {
      displayName: updated.displayName,
      avatarId: updated.avatarId as AvatarId,
      bio: updated.bio,
      xp: updated.xp,
      level: updated.level,
      highScore: updated.highScore,
      bestStreak: updated.bestStreak,
      wordsSolved: updated.wordsSolved,
      constellationsCleared: updated.constellationsCleared,
      imported: updated.imported,
    };
  }

  async getSettings(userId: string): Promise<UserSettingsSave> {
    const settings = await this.prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Settings not found' });
    }
    return {
      masterVol: settings.masterVol,
      musicVol: settings.musicVol,
      sfxVol: settings.sfxVol,
      musicEnabled: settings.musicEnabled,
      typingSfxEnabled: settings.typingSfxEnabled,
      gameSfxEnabled: settings.gameSfxEnabled,
      reducedEffects: settings.reducedEffects,
    };
  }

  async updateSettings(userId: string, input: UpdateSettingsInput): Promise<UserSettingsSave> {
    const data: Partial<UserSettingsSave> = {};
    if (input.masterVol !== undefined) data.masterVol = input.masterVol;
    if (input.musicVol !== undefined) data.musicVol = input.musicVol;
    if (input.sfxVol !== undefined) data.sfxVol = input.sfxVol;
    if (input.musicEnabled !== undefined) data.musicEnabled = input.musicEnabled;
    if (input.typingSfxEnabled !== undefined) data.typingSfxEnabled = input.typingSfxEnabled;
    if (input.gameSfxEnabled !== undefined) data.gameSfxEnabled = input.gameSfxEnabled;
    if (input.reducedEffects !== undefined) data.reducedEffects = input.reducedEffects;

    const updated = await this.prisma.userSettings.update({
      where: { userId },
      data,
    });

    return {
      masterVol: updated.masterVol,
      musicVol: updated.musicVol,
      sfxVol: updated.sfxVol,
      musicEnabled: updated.musicEnabled,
      typingSfxEnabled: updated.typingSfxEnabled,
      gameSfxEnabled: updated.gameSfxEnabled,
      reducedEffects: updated.reducedEffects,
    };
  }
}
