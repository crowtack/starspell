import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type AccountDifficultyStat,
  type AccountProfile,
  type AuthMeResponse,
  type AvatarId,
  DIFFICULTY_KEYS,
  type LoginInput,
  type RegisterInput,
  type UserSettingsSave,
} from '@starspell/shared';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export const SESSION_COOKIE_NAME = 'starspell_sid';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly me: AuthMeResponse;
}

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async register(input: RegisterInput): Promise<{ token: string; me: AuthMeResponse }> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email }, { username: input.username }],
      },
      select: { email: true, username: true },
    });

    if (existing) {
      const conflictField = existing.email === input.email ? 'Email' : 'Username';
      throw new ConflictException({
        code: 'ACCOUNT_EXISTS',
        message: `${conflictField} is already registered`,
      });
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          username: input.username,
          passwordHash,
          profile: {
            create: {
              displayName: input.username,
              avatarId: 'lantern',
              bio: '',
              xp: 0,
              level: 1,
            },
          },
          settings: {
            create: {},
          },
          difficulties: {
            create: DIFFICULTY_KEYS.map((difficulty) => ({
              difficulty,
              unlocked: true,
            })),
          },
          sessions: {
            create: {
              tokenHash,
              expiresAt,
            },
          },
        },
        include: {
          profile: true,
          settings: true,
          difficulties: true,
        },
      });
      return user;
    });

    return {
      token: rawToken,
      me: this.toAuthMeResponse(created),
    };
  }

  async login(input: LoginInput): Promise<{ token: string; me: AuthMeResponse }> {
    const normalized = input.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized.toLowerCase() }, { username: normalized }],
      },
      include: {
        profile: true,
        settings: true,
        difficulties: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email/username or password',
      });
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email/username or password',
      });
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      token: rawToken,
      me: this.toAuthMeResponse(user),
    };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = hashSessionToken(rawToken);
    await this.prisma.session.deleteMany({
      where: { tokenHash },
    });
  }

  async authenticateToken(rawToken: string | undefined): Promise<AuthenticatedSession | null> {
    if (!rawToken) return null;
    const tokenHash = hashSessionToken(rawToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            profile: true,
            settings: true,
            difficulties: true,
          },
        },
      },
    });

    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      me: this.toAuthMeResponse(session.user),
    };
  }

  toAuthMeResponse(user: {
    id: string;
    email: string;
    username: string;
    createdAt: Date;
    profile: {
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
      rating: number;
      rankedMatches: number;
    } | null;
    settings: {
      masterVol: number;
      musicVol: number;
      sfxVol: number;
      musicEnabled: boolean;
      typingSfxEnabled: boolean;
      gameSfxEnabled: boolean;
      reducedEffects: boolean;
    } | null;
    difficulties: Array<{
      difficulty: string;
      unlocked: boolean;
      completed: boolean;
      highScore: number;
      bestStreak: number;
      wordsSolved: number;
      runsCleared: number;
    }>;
  }): AuthMeResponse {
    const profile: AccountProfile = user.profile
      ? {
          displayName: user.profile.displayName,
          avatarId: user.profile.avatarId as AvatarId,
          bio: user.profile.bio,
          xp: user.profile.xp,
          level: user.profile.level,
          highScore: user.profile.highScore,
          bestStreak: user.profile.bestStreak,
          wordsSolved: user.profile.wordsSolved,
          constellationsCleared: user.profile.constellationsCleared,
          imported: user.profile.imported,
          rating: user.profile.rating,
          rankedMatches: user.profile.rankedMatches,
        }
      : {
          displayName: user.username,
          avatarId: 'lantern',
          bio: '',
          xp: 0,
          level: 1,
          highScore: 0,
          bestStreak: 0,
          wordsSolved: 0,
          constellationsCleared: 0,
          imported: false,
          rating: 1000,
          rankedMatches: 0,
        };

    const settings: UserSettingsSave = user.settings
      ? {
          masterVol: user.settings.masterVol,
          musicVol: user.settings.musicVol,
          sfxVol: user.settings.sfxVol,
          musicEnabled: user.settings.musicEnabled,
          typingSfxEnabled: user.settings.typingSfxEnabled,
          gameSfxEnabled: user.settings.gameSfxEnabled,
          reducedEffects: user.settings.reducedEffects,
        }
      : {
          masterVol: 0.8,
          musicVol: 0.65,
          sfxVol: 0.85,
          musicEnabled: true,
          typingSfxEnabled: true,
          gameSfxEnabled: true,
          reducedEffects: false,
        };

    const byDiff = new Map(user.difficulties.map((d) => [d.difficulty, d]));
    const difficulties: AccountDifficultyStat[] = DIFFICULTY_KEYS.map((key) => {
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

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt.toISOString(),
      },
      profile,
      settings,
      difficulties,
    };
  }
}
