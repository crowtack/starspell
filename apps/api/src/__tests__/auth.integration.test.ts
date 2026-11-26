import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import {
  type AuthMeResponse,
  type GuestImportConfirmResponse,
  type GuestImportPreviewResponse,
  ORIGINAL_WORDS,
  UpdateProfileSchema,
  createDefaultSaveData,
} from '@starspell/shared';
import { createApiApp } from '../app.factory.js';
import { seedOriginalWords } from '../../prisma/seed.js';

const ORIGIN_HEADERS = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'starspell',
};

function must<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`${label} is not initialized`);
  }
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
  if (!process.env['DATABASE_URL']) {
    return false;
  }
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

describe('API schema & security invariants (offline)', () => {
  it('UpdateProfileSchema strips mass-assignment privileged fields', () => {
    const parsed = UpdateProfileSchema.parse({
      displayName: 'SkyWalker',
      avatarId: 'comet',
      bio: 'Canyon speller',
      xp: 999999,
      level: 99,
      imported: true,
      highScore: 999999,
    });

    expect(parsed).toEqual({
      displayName: 'SkyWalker',
      avatarId: 'comet',
      bio: 'Canyon speller',
    });
    expect('xp' in parsed).toBe(false);
    expect('level' in parsed).toBe(false);
    expect('imported' in parsed).toBe(false);
    expect('highScore' in parsed).toBe(false);
  });
});

describe.skipIf(!dbAvailable)('M2 API Integration (real Postgres)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = await createApiApp({ authRateLimitMax: 30, authRateLimitWindowMs: 60_000 });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('health endpoint returns ok', async () => {
    const res = await request(httpServer(must(app, 'app'))).get('/api/health');
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe('ok');
  });

  it('seed is idempotent: running twice leaves 110 rows matching ORIGINAL_WORDS', async () => {
    const db = must(prisma, 'prisma');
    await seedOriginalWords(db);
    await seedOriginalWords(db);
    const words = await db.word.findMany({ orderBy: { id: 'asc' } });
    expect(words.length).toBe(110);
    const byWord = new Map(words.map((w) => [w.word, w]));
    for (const orig of ORIGINAL_WORDS) {
      const row = byWord.get(orig.word);
      expect(row).toBeDefined();
      expect(row?.definition).toBe(orig.definition);
      expect(row?.tier).toBe(orig.tier);
    }
  });

  it('register, me, logout, login, unauthorized & mass-assignment protection', async () => {
    const server = httpServer(must(app, 'app'));
    const suffix = Date.now().toString(36);
    const email = `user_${suffix}@example.com`;
    const username = `speller_${suffix}`.slice(0, 24);
    const password = 'canyon-lantern-password';

    const unauthMe = await request(server).get('/api/auth/me');
    expect(unauthMe.status).toBe(401);

    const regRes = await request(server)
      .post('/api/auth/register')
      .set(ORIGIN_HEADERS)
      .send({ email, username, password });
    expect(regRes.status).toBe(201);
    expect((regRes.body as AuthMeResponse).user.username).toBe(username);
    const cookies = asCookieHeader(regRes.headers['set-cookie']);
    expect(cookies.length).toBeGreaterThan(0);

    const meRes = await request(server).get('/api/auth/me').set('Cookie', cookies);
    expect(meRes.status).toBe(200);
    expect((meRes.body as AuthMeResponse).profile.xp).toBe(0);

    const patchRes = await request(server)
      .patch('/api/profile')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({
        displayName: 'Updated Name',
        xp: 999999,
        level: 50,
        imported: true,
      });
    expect(patchRes.status).toBe(200);
    const patchBody = patchRes.body as { profile: AuthMeResponse['profile'] };
    expect(patchBody.profile.displayName).toBe('Updated Name');
    expect(patchBody.profile.xp).toBe(0);
    expect(patchBody.profile.level).toBe(1);
    expect(patchBody.profile.imported).toBe(false);

    const logoutRes = await request(server)
      .post('/api/auth/logout')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies);
    expect(logoutRes.status).toBe(200);

    const meAfterLogout = await request(server).get('/api/auth/me').set('Cookie', cookies);
    expect(meAfterLogout.status).toBe(401);

    const loginRes = await request(server)
      .post('/api/auth/login')
      .set(ORIGIN_HEADERS)
      .send({ identifier: username, password });
    expect(loginRes.status).toBe(200);
    expect((loginRes.body as AuthMeResponse).profile.displayName).toBe('Updated Name');
  });

  it('guest import preview, confirm idempotency, XP cap, and conflict on second importId', async () => {
    const server = httpServer(must(app, 'app'));
    const suffix = `${Date.now().toString(36)}imp`;
    const regRes = await request(server)
      .post('/api/auth/register')
      .set(ORIGIN_HEADERS)
      .send({
        email: `imp_${suffix}@example.com`,
        username: `imp_${suffix}`.slice(0, 24),
        password: 'canyon-lantern-password',
      });
    const cookies = asCookieHeader(regRes.headers['set-cookie']);

    const saveData = createDefaultSaveData();
    saveData.profile.xp = 999_999;
    saveData.profile.wordsSolved = 42;
    saveData.profile.highScore = 4500;
    saveData.profile.bestStreak = 12;

    const previewRes = await request(server)
      .post('/api/import/guest/preview')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({ saveData });
    expect(previewRes.status).toBe(200);
    const previewBody = previewRes.body as GuestImportPreviewResponse;
    expect(previewBody.defaultAction).toBe('import');
    expect(previewBody.cappedXpDelta).toBe(5000);

    const importId = crypto.randomUUID();
    const confirm1 = await request(server)
      .post('/api/import/guest/confirm')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({ importId, saveData });
    expect(confirm1.status).toBe(200);
    const confirm1Body = confirm1.body as GuestImportConfirmResponse;
    expect(confirm1Body.xpAdded).toBe(5000);
    expect(confirm1Body.profile.imported).toBe(true);

    const confirm2 = await request(server)
      .post('/api/import/guest/confirm')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({ importId, saveData });
    expect(confirm2.status).toBe(200);
    const confirm2Body = confirm2.body as GuestImportConfirmResponse;
    expect(confirm2Body.idempotentReplay).toBe(true);
    expect(confirm2Body.profile.xp).toBe(5000);

    const confirm3 = await request(server)
      .post('/api/import/guest/confirm')
      .set(ORIGIN_HEADERS)
      .set('Cookie', cookies)
      .send({ importId: crypto.randomUUID(), saveData });
    expect(confirm3.status).toBe(409);
  });

  it('rate limiter triggers 429 on repeated login attempts', async () => {
    const limitedApp = await createApiApp({ authRateLimitMax: 3, authRateLimitWindowMs: 60_000 });
    await limitedApp.init();
    const server = httpServer(limitedApp);
    try {
      for (let i = 0; i < 3; i += 1) {
        await request(server)
          .post('/api/auth/login')
          .set(ORIGIN_HEADERS)
          .send({ identifier: 'nobody', password: 'wrong' });
      }
      const res = await request(server)
        .post('/api/auth/login')
        .set(ORIGIN_HEADERS)
        .send({ identifier: 'nobody', password: 'wrong' });
      expect(res.status).toBe(429);
    } finally {
      await limitedApp.close();
    }
  });
});
