import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AccountDifficultyStat,
  type AccountProfile,
  type AvatarId,
  calculateLevel,
  DIFFICULTY_KEYS,
  GUEST_IMPORT_XP_CAP,
  type GuestImportConfirmInput,
  type GuestImportConfirmResponse,
  type GuestImportPreviewInput,
  type GuestImportPreviewResponse,
} from '@starspell/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class GuestImportService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(
    userId: string,
    input: GuestImportPreviewInput,
  ): Promise<GuestImportPreviewResponse> {
    const [profile, existingImport] = await Promise.all([
      this.prisma.playerProfile.findUnique({ where: { userId } }),
      this.prisma.guestImport.findUnique({ where: { userId } }),
    ]);

    if (!profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Profile not found' });
    }

    const accountHasProgress =
      profile.xp > 0 || profile.wordsSolved > 0 || profile.constellationsCleared > 0;
    const guestXp = Math.max(0, Math.floor(input.saveData.profile.xp));
    const cappedXpDelta = existingImport ? 0 : Math.min(guestXp, GUEST_IMPORT_XP_CAP);
    const resultingXp = profile.xp + cappedXpDelta;
    const resultingLevel = calculateLevel(resultingXp);

    return {
      alreadyImported: Boolean(existingImport),
      accountHasProgress,
      defaultAction: accountHasProgress ? 'skip' : 'import',
      guestXp,
      cappedXpDelta,
      resultingXp,
      resultingLevel,
      guestWordsSolved: Math.max(0, Math.floor(input.saveData.profile.wordsSolved)),
      guestHighScore: Math.max(0, Math.floor(input.saveData.profile.highScore)),
      guestBestStreak: Math.max(0, Math.floor(input.saveData.profile.bestStreak)),
    };
  }

  async confirm(
    userId: string,
    input: GuestImportConfirmInput,
  ): Promise<GuestImportConfirmResponse> {
    return this.prisma.$transaction(async (tx) => {
      const existingImport = await tx.guestImport.findUnique({ where: { userId } });

      if (existingImport) {
        if (existingImport.importId === input.importId) {
          const [profile, diffRows] = await Promise.all([
            tx.playerProfile.findUniqueOrThrow({ where: { userId } }),
            tx.playerDifficultyStats.findMany({ where: { userId } }),
          ]);
          return {
            applied: existingImport.applied,
            idempotentReplay: true,
            xpAdded: existingImport.xpAdded,
            profile: mapProfile(profile),
            difficulties: mapDifficulties(diffRows),
          };
        }
        throw new ConflictException({
          code: 'ALREADY_IMPORTED',
          message: 'Guest progress has already been imported to this account',
        });
      }

      const profile = await tx.playerProfile.findUnique({ where: { userId } });
      if (!profile) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Profile not found' });
      }

      const guest = input.saveData.profile;
      const xpAdded = Math.min(Math.max(0, Math.floor(guest.xp)), GUEST_IMPORT_XP_CAP);
      const nextXp = profile.xp + xpAdded;
      const nextLevel = calculateLevel(nextXp);

      const updatedProfile = await tx.playerProfile.update({
        where: { userId },
        data: {
          xp: nextXp,
          level: nextLevel,
          highScore: Math.max(profile.highScore, Math.floor(guest.highScore)),
          bestStreak: Math.max(profile.bestStreak, Math.floor(guest.bestStreak)),
          wordsSolved: profile.wordsSolved + Math.max(0, Math.floor(guest.wordsSolved)),
          constellationsCleared:
            profile.constellationsCleared + Math.max(0, Math.floor(guest.constellationsCleared)),
          imported: true,
        },
      });

      const existingDiffs = await tx.playerDifficultyStats.findMany({ where: { userId } });
      const byDiff = new Map(existingDiffs.map((d) => [d.difficulty, d]));

      for (const diffKey of DIFFICULTY_KEYS) {
        const incoming = input.saveData.difficulties[diffKey];
        const current = byDiff.get(diffKey);
        await tx.playerDifficultyStats.upsert({
          where: { userId_difficulty: { userId, difficulty: diffKey } },
          create: {
            userId,
            difficulty: diffKey,
            unlocked: true,
            completed: incoming.completed,
            highScore: Math.floor(incoming.highScore),
            bestStreak: Math.floor(incoming.bestStreak),
            wordsSolved: Math.floor(incoming.wordsSolved),
            runsCleared: Math.floor(incoming.runsCleared),
          },
          update: {
            unlocked: true,
            completed: (current?.completed ?? false) || incoming.completed,
            highScore: Math.max(current?.highScore ?? 0, Math.floor(incoming.highScore)),
            bestStreak: Math.max(current?.bestStreak ?? 0, Math.floor(incoming.bestStreak)),
            wordsSolved:
              (current?.wordsSolved ?? 0) + Math.max(0, Math.floor(incoming.wordsSolved)),
            runsCleared:
              (current?.runsCleared ?? 0) + Math.max(0, Math.floor(incoming.runsCleared)),
          },
        });
      }

      await tx.guestImport.create({
        data: {
          userId,
          importId: input.importId,
          xpAdded,
          applied: true,
        },
      });

      const updatedDiffs = await tx.playerDifficultyStats.findMany({ where: { userId } });

      return {
        applied: true,
        idempotentReplay: false,
        xpAdded,
        profile: mapProfile(updatedProfile),
        difficulties: mapDifficulties(updatedDiffs),
      };
    });
  }
}

function mapProfile(row: {
  displayName: string;
  avatarId: string;
  bio: string;
  xp: number;
  level: number;
  highScore: number;
  bestStreak: number;
  wordsSolved: number;
  constellationsCleared: number;
  imported: boolean;
}): AccountProfile {
  return {
    displayName: row.displayName,
    avatarId: row.avatarId as AvatarId,
    bio: row.bio,
    xp: row.xp,
    level: row.level,
    highScore: row.highScore,
    bestStreak: row.bestStreak,
    wordsSolved: row.wordsSolved,
    constellationsCleared: row.constellationsCleared,
    imported: row.imported,
  };
}

function mapDifficulties(
  rows: Array<{
    difficulty: string;
    unlocked: boolean;
    completed: boolean;
    highScore: number;
    bestStreak: number;
    wordsSolved: number;
    runsCleared: number;
  }>,
): AccountDifficultyStat[] {
  const byDiff = new Map(rows.map((r) => [r.difficulty, r]));
  return DIFFICULTY_KEYS.map((key) => {
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
  });
}
