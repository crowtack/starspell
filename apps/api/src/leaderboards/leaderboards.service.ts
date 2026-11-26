import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AvatarId,
  type DifficultyKey,
  getNextWindowResetUtc,
  getWindowStartUtc,
  LEADERBOARD_MIN_RANKED,
  type LeaderboardQueryInput,
  type LeaderboardResponse,
  type LeaderboardRowDto,
  type MatchMode,
  type PublicProfileDto,
  type WayfaringStyle,
} from '@starspell/shared';
import { PrismaService } from '../prisma/prisma.service.js';

interface KeysetCursor {
  metric: number;
  achievedAtMs: number;
  userId: string;
  offset: number;
}

function encodeCursor(c: KeysetCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as Partial<KeysetCursor>;
    if (
      typeof parsed.metric === 'number' &&
      typeof parsed.achievedAtMs === 'number' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.offset === 'number'
    ) {
      return parsed as KeysetCursor;
    }
    return null;
  } catch {
    return null;
  }
}

@Injectable()
export class LeaderboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(query: LeaderboardQueryInput): Promise<LeaderboardResponse> {
    const now = new Date();
    const cursor = decodeCursor(query.cursor);
    const limit = query.limit;

    if (query.board === 'rating') {
      const profiles = await this.prisma.playerProfile.findMany({
        where: { rankedMatches: { gte: LEADERBOARD_MIN_RANKED } },
        include: { user: { select: { id: true, username: true } } },
        orderBy: [{ rating: 'desc' }, { updatedAt: 'asc' }, { userId: 'asc' }],
      });

      const filtered = cursor
        ? profiles.filter((p) => {
            const ms = p.updatedAt.getTime();
            if (p.rating !== cursor.metric) return p.rating < cursor.metric;
            if (ms !== cursor.achievedAtMs) return ms > cursor.achievedAtMs;
            return p.userId > cursor.userId;
          })
        : profiles;

      const page = filtered.slice(0, limit);
      const startRank = cursor ? cursor.offset + 1 : 1;
      const items: LeaderboardRowDto[] = page.map((p, idx) => ({
        rank: startRank + idx,
        username: p.user.username,
        avatarId: p.avatarId as AvatarId,
        value: p.rating,
        achievedAt: p.updatedAt.toISOString(),
      }));

      const last = page[page.length - 1];
      const nextCursor =
        filtered.length > limit && last
          ? encodeCursor({
              metric: last.rating,
              achievedAtMs: last.updatedAt.getTime(),
              userId: last.userId,
              offset: startRank + page.length - 1,
            })
          : null;

      return {
        board: 'rating',
        difficulty: query.difficulty,
        window: 'all',
        items,
        nextCursor,
        resetAtUtc: null,
      };
    }

    const mode: MatchMode = query.board === 'competition' ? 'COMPETITION' : 'SURVIVAL';
    const windowStart = getWindowStartUtc(query.window, now);
    const resetAt = getNextWindowResetUtc(query.window, now);

    const rows = await this.prisma.matchPlayerResult.findMany({
      where: {
        suspect: false,
        status: { not: 'interrupted' },
        ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
        match: {
          mode,
          difficulty: query.difficulty,
          status: 'completed',
        },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: { select: { avatarId: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    // Best single validated match per user in the window
    const bestByUser = new Map<
      string,
      {
        userId: string;
        username: string;
        avatarId: AvatarId;
        metric: number;
        secondary: number;
        achievedAtMs: number;
      }
    >();

    for (const r of rows) {
      const metric = mode === 'SURVIVAL' ? r.wordsSolved : r.score;
      const secondary = mode === 'SURVIVAL' ? r.score : r.wordsSolved;
      const achievedAtMs = r.createdAt.getTime();
      const prev = bestByUser.get(r.userId);

      const isBetter =
        !prev ||
        metric > prev.metric ||
        (metric === prev.metric && secondary > prev.secondary) ||
        (metric === prev.metric &&
          secondary === prev.secondary &&
          achievedAtMs < prev.achievedAtMs);

      if (isBetter) {
        bestByUser.set(r.userId, {
          userId: r.userId,
          username: r.user.username,
          avatarId: (r.user.profile?.avatarId ?? 'lantern') as AvatarId,
          metric,
          secondary,
          achievedAtMs,
        });
      }
    }

    const sorted = Array.from(bestByUser.values()).sort((a, b) => {
      if (b.metric !== a.metric) return b.metric - a.metric;
      if (a.achievedAtMs !== b.achievedAtMs) return a.achievedAtMs - b.achievedAtMs;
      return a.userId.localeCompare(b.userId);
    });

    const filtered = cursor
      ? sorted.filter((entry) => {
          if (entry.metric !== cursor.metric) return entry.metric < cursor.metric;
          if (entry.achievedAtMs !== cursor.achievedAtMs) {
            return entry.achievedAtMs > cursor.achievedAtMs;
          }
          return entry.userId > cursor.userId;
        })
      : sorted;

    const page = filtered.slice(0, limit);
    const startRank = cursor ? cursor.offset + 1 : 1;
    const items: LeaderboardRowDto[] = page.map((entry, idx) => ({
      rank: startRank + idx,
      username: entry.username,
      avatarId: entry.avatarId,
      value: entry.metric,
      secondaryValue: entry.secondary,
      achievedAt: new Date(entry.achievedAtMs).toISOString(),
    }));

    const last = page[page.length - 1];
    const nextCursor =
      filtered.length > limit && last
        ? encodeCursor({
            metric: last.metric,
            achievedAtMs: last.achievedAtMs,
            userId: last.userId,
            offset: startRank + page.length - 1,
          })
        : null;

    return {
      board: query.board,
      difficulty: query.difficulty,
      window: query.window,
      items,
      nextCursor,
      resetAtUtc: resetAt ? resetAt.toISOString() : null,
    };
  }

  async getPublicProfile(username: string): Promise<PublicProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        profile: true,
        ratingHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        matchResults: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            match: {
              include: {
                room: { select: { code: true } },
              },
            },
          },
        },
      },
    });

    if (!user || !user.profile) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Player not found' });
    }

    return {
      username: user.username,
      displayName: user.profile.displayName,
      avatarId: user.profile.avatarId as AvatarId,
      bio: user.profile.bio,
      level: user.profile.level,
      rating: user.profile.rating,
      rankedMatches: user.profile.rankedMatches,
      highScore: user.profile.highScore,
      bestStreak: user.profile.bestStreak,
      wordsSolved: user.profile.wordsSolved,
      constellationsCleared: user.profile.constellationsCleared,
      ratingHistory: user.ratingHistory.map((rh) => ({
        matchId: rh.matchId,
        ratingBefore: rh.ratingBefore,
        ratingAfter: rh.ratingAfter,
        delta: rh.delta,
        kFactor: rh.kFactor,
        createdAt: rh.createdAt.toISOString(),
      })),
      recentMatches: user.matchResults.map((mr) => ({
        matchId: mr.matchId,
        roomCode: mr.match.room.code,
        mode: mr.match.mode as MatchMode,
        isRanked: mr.match.isRanked,
        difficulty: mr.match.difficulty as DifficultyKey,
        style: mr.match.style as WayfaringStyle,
        matchStatus: mr.match.status,
        rank: mr.rank,
        isDraw: mr.isDraw,
        playerStatus: mr.status,
        score: mr.score,
        wordsSolved: mr.wordsSolved,
        bestStreak: mr.bestStreak,
        xpAwarded: mr.xpAwarded,
        createdAt: mr.createdAt.toISOString(),
      })),
    };
  }
}
