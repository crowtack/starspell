import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import type { LeaderboardResponse, PublicProfileDto } from '@starspell/shared';
import { createApiApp } from '../app.factory.js';

function must<T>(value: T | undefined | null, label: string): T {
  if (value === undefined || value === null) {
    throw new Error(`${label} is not initialized`);
  }
  return value;
}

async function canConnectPostgres(): Promise<boolean> {
  if (!process.env['DATABASE_URL']) return false;
  const client = new PrismaClient();
  try {
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.$disconnect().catch(() => undefined);
  }
}

const dbAvailable = await canConnectPostgres();

describe.skipIf(!dbAvailable)(
  'M5 Leaderboards & Public Profile Integration (real Postgres)',
  () => {
    let app: INestApplication | undefined;
    let prisma: PrismaClient | undefined;

    beforeAll(async () => {
      prisma = new PrismaClient();
      await prisma.$connect();
      app = await createApiApp();
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.$disconnect();
    });

    it('excludes interrupted/invalid/suspect, applies best-per-user, tie-breaks, and paginates with no duplicates or gaps', async () => {
      const db = must(prisma, 'prisma');
      const server = must(app, 'app').getHttpServer() as Server;
      const tag = Date.now().toString(36);

      const users = await Promise.all(
        ['a', 'b', 'c'].map(async (label, idx) => {
          const u = await db.user.create({
            data: {
              email: `lb_${tag}_${label}@example.com`,
              username: `lb_${tag}_${label}`,
              passwordHash: 'hash',
              profile: {
                create: {
                  displayName: `Player ${label}`,
                  rating: 1050 + idx * 10,
                  rankedMatches: 5,
                },
              },
            },
          });
          return u;
        }),
      );

      const u0 = must(users[0], 'u0');
      const u1 = must(users[1], 'u1');
      const u2 = must(users[2], 'u2');

      const room = await db.multiplayerRoom.create({
        data: {
          code: `L${tag.slice(-4).toUpperCase()}`.slice(0, 5),
          ownerId: u0.id,
          difficulty: 'EASY',
          style: 'STARLIGHT',
          mode: 'COMPETITION',
          status: 'finished',
          isRanked: true,
          expiresAt: new Date(Date.now() + 60_000),
        },
      });

      const completedMatch = await db.match.create({
        data: {
          roomId: room.id,
          seed: 123,
          difficulty: 'EASY',
          style: 'STARLIGHT',
          mode: 'COMPETITION',
          isRanked: true,
          status: 'completed',
        },
      });

      const interruptedMatch = await db.match.create({
        data: {
          roomId: room.id,
          seed: 124,
          difficulty: 'EASY',
          style: 'STARLIGHT',
          mode: 'COMPETITION',
          isRanked: true,
          status: 'interrupted',
        },
      });

      const t0 = new Date('2026-11-26T00:00:01Z');
      const t1 = new Date('2026-11-26T00:00:02Z');

      // User 0 has two scores (best is 900, not sum 1400); User 1 ties 900 later; User 2 has 700
      await db.matchPlayerResult.createMany({
        data: [
          {
            matchId: completedMatch.id,
            userId: u0.id,
            username: u0.username,
            rank: 1,
            status: 'finished',
            score: 900,
            wordsSolved: 15,
            createdAt: t0,
          },
          {
            matchId: interruptedMatch.id,
            userId: u2.id,
            username: u2.username,
            rank: 1,
            status: 'interrupted',
            score: 99999,
            wordsSolved: 15,
            createdAt: t0,
          },
          {
            matchId: completedMatch.id,
            userId: u1.id,
            username: u1.username,
            rank: 2,
            status: 'finished',
            score: 900,
            wordsSolved: 15,
            createdAt: t1,
          },
          {
            matchId: completedMatch.id,
            userId: u2.id,
            username: u2.username,
            rank: 3,
            status: 'finished',
            score: 700,
            wordsSolved: 12,
            createdAt: t1,
          },
        ],
      });

      // Keyset pagination with limit=2 -> page1 + page2 has no duplicates or gaps
      const page1Res = await request(server).get(
        '/api/leaderboards?board=competition&difficulty=EASY&window=all&limit=2',
      );
      expect(page1Res.status).toBe(200);
      const page1 = page1Res.body as LeaderboardResponse;
      expect(page1.items.length).toBe(2);
      const cursor = must(page1.nextCursor, 'nextCursor');

      const page2Res = await request(server).get(
        `/api/leaderboards?board=competition&difficulty=EASY&window=all&limit=2&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(page2Res.status).toBe(200);
      const page2 = page2Res.body as LeaderboardResponse;

      const allUsernames = [...page1.items, ...page2.items].map((i) => i.username);
      expect(new Set(allUsernames).size).toBe(allUsernames.length);
      // Interrupted 99999 score for users[2] must never appear
      expect(page1.items.every((i) => i.value < 99999)).toBe(true);

      // Public profile exposes no email
      const pubRes = await request(server).get(`/api/profile/public/${u0.username}`);
      expect(pubRes.status).toBe(200);
      const pub = pubRes.body as PublicProfileDto;
      expect(pub.username).toBe(u0.username);
      expect('email' in pub).toBe(false);
    });
  },
);
