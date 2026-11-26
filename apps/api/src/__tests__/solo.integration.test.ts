import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import {
  type AppendSoloEventsResult,
  AppendSoloEventsSchema,
  createInitialSoloState,
  MAX_SOLO_EVENT_BATCH,
  MIN_MS_PER_CHAR,
  ORIGINAL_WORDS,
  reduce,
  SOLO_WORD_BANK_VERSION,
  type SoloSessionDto,
} from '@starspell/shared';
import { createApiApp } from '../app.factory.js';

const ORIGIN_HEADERS = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'starspell',
};

function must<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`${label} is not initialized`);
  return value;
}

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function asCookieHeader(setCookie: string[] | string | undefined): string[] {
  if (!setCookie) return [];
  return Array.isArray(setCookie) ? setCookie : [setCookie];
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

describe('M3 Solo Sync schemas & plausibility math (offline)', () => {
  it('enforces batch size <= 50', () => {
    const events = Array.from({ length: MAX_SOLO_EVENT_BATCH + 1 }, (_, idx) => ({
      eventId: crypto.randomUUID(),
      seq: idx + 1,
      type: 'clock_expired' as const,
    }));
    const parsed = AppendSoloEventsSchema.safeParse({ baseSeq: 0, events });
    expect(parsed.success).toBe(false);
  });

  it('reducer produces deterministic slots from seed for server verification', () => {
    const state = reduce(createInitialSoloState({ difficulty: 'EASY' }), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 123456,
      wordBank: ORIGINAL_WORDS,
    });
    expect(state.slots.length).toBe(15);
    expect(state.slots[0]?.word.length).toBeGreaterThan(0);
    expect(MIN_MS_PER_CHAR).toBe(40);
  });
});

describe.skipIf(!dbAvailable)('M3 Solo Sync Integration (real Postgres)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = await createApiApp({ authRateLimitMax: 50, authRateLimitWindowMs: 60_000 });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function registerUser(tag: string) {
    const server = httpServer(must(app, 'app'));
    const suffix = `${Date.now().toString(36)}_${tag}`;
    const res = await request(server)
      .post('/api/auth/register')
      .set(ORIGIN_HEADERS)
      .send({
        email: `solo_${suffix}@example.com`,
        username: `solo_${suffix}`.slice(0, 24),
        password: 'canyon-lantern-password',
      });
    expect(res.status).toBe(201);
    return asCookieHeader(res.headers['set-cookie']);
  }

  it('replaying the same batch twice yields identical state and no duplicate XP', async () => {
    const server = httpServer(must(app, 'app'));
    const cookies = await registerUser('replay');
    const clientSessionId = crypto.randomUUID();
    const seed = 424242;

    const createRes = await request(server)
      .post('/api/solo/sessions')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        clientSessionId,
        difficulty: 'EASY',
        style: 'STARLIGHT',
        seed,
        wordBankVersion: SOLO_WORD_BANK_VERSION,
      });
    expect(createRes.status).toBe(201);
    const session = createRes.body as SoloSessionDto;

    const localPlan = reduce(createInitialSoloState({ difficulty: 'EASY' }), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed,
      wordBank: ORIGINAL_WORDS,
    });
    const firstWord = must(localPlan.slots[0], 'firstWord');

    const batch = {
      baseSeq: 0,
      events: [
        {
          eventId: crypto.randomUUID(),
          seq: 1,
          type: 'chapter_started',
          chapter: 1,
          seed,
          keepRun: false,
        },
        {
          eventId: crypto.randomUUID(),
          seq: 2,
          type: 'word_solved',
          slot: 0,
          answer: firstWord.word,
          elapsedSeconds: 2.5,
          elapsedMs: 2500,
        },
      ],
    };

    const res1 = await request(server)
      .post(`/api/solo/sessions/${session.id}/events`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send(batch);
    expect(res1.status).toBe(200);
    const body1 = res1.body as AppendSoloEventsResult;
    expect(body1.idempotentReplay).toBe(false);
    expect(body1.acceptedCount).toBe(2);
    expect(body1.xpCredited).toBeGreaterThan(0);

    // Replay exact same batch
    const res2 = await request(server)
      .post(`/api/solo/sessions/${session.id}/events`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send(batch);
    expect(res2.status).toBe(200);
    const body2 = res2.body as AppendSoloEventsResult;
    expect(body2.idempotentReplay).toBe(true);
    expect(body2.xpCredited).toBe(0);
    expect(body2.session.state.totalXp).toBe(body1.session.state.totalXp);
    expect(body2.session.version).toBe(2);
  });

  it('rejects tampered events (wrong word, impossible speed) and logs them without XP', async () => {
    const server = httpServer(must(app, 'app'));
    const db = must(prisma, 'prisma');
    const cookies = await registerUser('tamper');
    const seed = 777111;

    const createRes = await request(server)
      .post('/api/solo/sessions')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        clientSessionId: crypto.randomUUID(),
        difficulty: 'EASY',
        style: 'STARLIGHT',
        seed,
        wordBankVersion: SOLO_WORD_BANK_VERSION,
      });
    const session = createRes.body as SoloSessionDto;

    const localPlan = reduce(createInitialSoloState({ difficulty: 'EASY' }), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed,
      wordBank: ORIGINAL_WORDS,
    });
    const firstWord = must(localPlan.slots[0], 'firstWord');

    const wrongWordId = crypto.randomUUID();
    const fastWordId = crypto.randomUUID();

    const res = await request(server)
      .post(`/api/solo/sessions/${session.id}/events`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        baseSeq: 0,
        events: [
          {
            eventId: crypto.randomUUID(),
            seq: 1,
            type: 'chapter_started',
            chapter: 1,
            seed,
            keepRun: false,
          },
          {
            eventId: wrongWordId,
            seq: 2,
            type: 'word_solved',
            slot: 0,
            answer: 'zzzzzz',
            elapsedSeconds: 2,
            elapsedMs: 2000,
          },
          {
            eventId: fastWordId,
            seq: 3,
            type: 'word_solved',
            slot: 0,
            answer: firstWord.word,
            elapsedSeconds: 0.01,
            elapsedMs: 10,
          },
        ],
      });

    expect(res.status).toBe(200);
    const body = res.body as AppendSoloEventsResult;
    expect(body.acceptedCount).toBe(1);
    expect(body.rejectedCount).toBe(2);
    expect(body.rejectedEventIds).toEqual([wrongWordId, fastWordId]);
    expect(body.xpCredited).toBe(0);
    expect(body.session.state.wordIndex).toBe(0);

    const loggedEvents = await db.gameEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { seq: 'asc' },
    });
    expect(loggedEvents.length).toBe(3);
    expect(loggedEvents[1]?.accepted).toBe(false);
    expect(loggedEvents[1]?.rejectReason).toBe('ANSWER_MISMATCH');
    expect(loggedEvents[2]?.accepted).toBe(false);
    expect(loggedEvents[2]?.rejectReason).toBe('IMPOSSIBLE_SPEED');
  });

  it('returns 409 SEQ_CONFLICT when server is ahead and preserves abandoned conflict session', async () => {
    const server = httpServer(must(app, 'app'));
    const db = must(prisma, 'prisma');
    const cookies = await registerUser('conflict');
    const seed = 999333;

    const createRes = await request(server)
      .post('/api/solo/sessions')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        clientSessionId: crypto.randomUUID(),
        difficulty: 'EASY',
        style: 'STARLIGHT',
        seed,
        wordBankVersion: SOLO_WORD_BANK_VERSION,
      });
    const session = createRes.body as SoloSessionDto;

    await request(server)
      .post(`/api/solo/sessions/${session.id}/events`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        baseSeq: 0,
        events: [
          {
            eventId: crypto.randomUUID(),
            seq: 1,
            type: 'chapter_started',
            chapter: 1,
            seed,
            keepRun: false,
          },
        ],
      });

    // Stale client sends baseSeq: 0 with a different eventId
    const conflictRes = await request(server)
      .post(`/api/solo/sessions/${session.id}/events`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        baseSeq: 0,
        events: [
          {
            eventId: crypto.randomUUID(),
            seq: 1,
            type: 'chapter_started',
            chapter: 1,
            seed,
            keepRun: false,
          },
        ],
      });
    expect(conflictRes.status).toBe(409);

    const abandonRes = await request(server)
      .post(`/api/solo/sessions/${session.id}/abandon`)
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({ reason: 'conflict' });
    expect(abandonRes.status).toBe(200);

    const row = await db.gameSession.findUnique({ where: { id: session.id } });
    expect(row?.status).toBe('abandoned');
    expect(row?.abandonReason).toBe('conflict');
  });
});
