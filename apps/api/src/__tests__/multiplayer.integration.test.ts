import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { Server } from 'node:http';
import {
  MULTIPLAYER_ENVELOPE_VERSION,
  type MatchResultsPayload,
  type RoomSnapshot,
  type WordIssuePayload,
} from '@starspell/shared';
import { createApiApp } from '../app.factory.js';
import { MultiplayerService } from '../multiplayer/multiplayer.service.js';

const ORIGIN_HEADERS = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'starspell',
};

function must<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`${label} is not initialized`);
  return value;
}

function asCookieHeader(setCookie: string[] | string | undefined): string {
  if (!setCookie) return '';
  return Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : (setCookie.split(';')[0] ?? '');
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

interface AckResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

function emitAck<T>(
  socket: Socket,
  type: string,
  roomCode: string,
  payload: unknown,
  seq = 0,
  eventId = crypto.randomUUID(),
): Promise<AckResult<T>> {
  return new Promise((resolve) => {
    socket.emit(
      type,
      {
        v: MULTIPLAYER_ENVELOPE_VERSION,
        type,
        eventId,
        seq,
        roomCode,
        ts: Date.now(),
        payload,
      },
      (ack: AckResult<T>) => {
        resolve(ack);
      },
    );
  });
}

describe.skipIf(!dbAvailable)('M4 Multiplayer Integration (real Socket.IO + Postgres)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaClient | undefined;
  let baseUrl = '';
  let mpService: MultiplayerService | undefined;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    app = await createApiApp({ authRateLimitMax: 100, authRateLimitWindowMs: 60_000 });
    const svc = app.get(MultiplayerService);
    mpService = svc;
    svc.configureTimings({
      countdownMs: 250,
      reconnectGraceMs: 400,
      hardCapMs: 60_000,
      clockTickMs: 200,
    });
    await app.listen(0, '127.0.0.1');
    const addr = (app.getHttpServer() as Server).address();
    if (typeof addr === 'object' && addr) {
      baseUrl = `http://127.0.0.1:${String(addr.port)}`;
    }
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createAuthedSocket(
    tag: string,
  ): Promise<{ socket: Socket; userId: string; cookie: string }> {
    const server = must(app, 'app').getHttpServer() as Server;
    const suffix = `${Date.now().toString(36)}_${tag}_${Math.random().toString(36).slice(2, 6)}`;
    const reg = await request(server)
      .post('/api/auth/register')
      .set(ORIGIN_HEADERS)
      .send({
        email: `mp_${suffix}@example.com`,
        username: `mp_${suffix}`.slice(0, 24),
        password: 'canyon-lantern-password',
      });
    expect(reg.status).toBe(201);
    const cookie = asCookieHeader(reg.headers['set-cookie']);
    const userId = (reg.body as { user: { id: string } }).user.id;

    const socket = io(`${baseUrl}/multiplayer`, {
      extraHeaders: { cookie },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => {
        resolve();
      });
      socket.once('connect_error', (err) => {
        reject(err);
      });
    });
    return { socket, userId, cookie };
  }

  it('rejects invalid, expired, full, and already-started rooms', async () => {
    const p1 = await createAuthedSocket('p1');
    const badJoin = await emitAck(p1.socket, 'room.join', '', { code: 'ZZZZZ' });
    expect(badJoin.ok).toBe(false);
    expect(badJoin.error?.code).toBe('INVALID_CODE');

    const created = await emitAck<RoomSnapshot>(p1.socket, 'room.create', '', {
      difficulty: 'EASY',
      style: 'STARLIGHT',
    });
    expect(created.ok).toBe(true);
    const code = must(created.data?.code, 'code');

    // Fill room to 6 players, 7th rejected as ROOM_FULL
    const extras: Array<{ socket: Socket }> = [];
    for (let i = 0; i < 5; i += 1) {
      const px = await createAuthedSocket(`full_${String(i)}`);
      extras.push(px);
      const j = await emitAck(px.socket, 'room.join', code, { code });
      expect(j.ok).toBe(true);
    }
    const p7 = await createAuthedSocket('p7');
    const fullJoin = await emitAck(p7.socket, 'room.join', code, { code });
    expect(fullJoin.ok).toBe(false);
    expect(fullJoin.error?.code).toBe('ROOM_FULL');
    p7.socket.disconnect();

    // Ready all & start -> p8 rejected as ALREADY_STARTED
    await emitAck(p1.socket, 'room.ready', code, { ready: true });
    for (const px of extras) {
      await emitAck(px.socket, 'room.ready', code, { ready: true });
    }
    const started = await emitAck(p1.socket, 'room.start', code, {});
    expect(started.ok).toBe(true);

    const p8 = await createAuthedSocket('p8');
    const lateJoin = await emitAck(p8.socket, 'room.join', code, { code });
    expect(lateJoin.ok).toBe(false);
    expect(lateJoin.error?.code).toBe('ALREADY_STARTED');
    p8.socket.disconnect();

    // Expired room check
    const pExp = await createAuthedSocket('exp');
    const expRoom = await emitAck<RoomSnapshot>(pExp.socket, 'room.create', '', {
      difficulty: 'EASY',
      style: 'STARLIGHT',
    });
    const expCode = must(expRoom.data?.code, 'expCode');
    await must(mpService, 'mpService').forceExpireRoomForTest(expCode);
    const pExpJoin = await createAuthedSocket('expj');
    const expJoinRes = await emitAck(pExpJoin.socket, 'room.join', expCode, { code: expCode });
    expect(expJoinRes.ok).toBe(false);
    expect(expJoinRes.error?.code).toBe('ROOM_EXPIRED');

    p1.socket.disconnect();
    for (const px of extras) px.socket.disconnect();
    pExp.socket.disconnect();
    pExpJoin.socket.disconnect();
  });

  it('replaces duplicate connection and transfers ownership when owner leaves', async () => {
    const p1 = await createAuthedSocket('own1');
    const p2 = await createAuthedSocket('own2');

    const created = await emitAck<RoomSnapshot>(p1.socket, 'room.create', '', {
      difficulty: 'EASY',
      style: 'STARLIGHT',
    });
    const code = must(created.data?.code, 'code');
    await emitAck(p2.socket, 'room.join', code, { code });

    // Duplicate connection for p1 replaces first socket
    const p1Dup = io(`${baseUrl}/multiplayer`, {
      extraHeaders: { cookie: p1.cookie },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve) =>
      p1Dup.once('connect', () => {
        resolve();
      }),
    );
    const replacedPromise = new Promise<boolean>((resolve) => {
      p1.socket.once('session.replaced', () => {
        resolve(true);
      });
    });
    await emitAck(p1Dup, 'room.join', code, { code });
    expect(await replacedPromise).toBe(true);

    // Owner leaves -> p2 becomes owner
    const leaveRes = await emitAck(p1Dup, 'room.leave', code, {});
    expect(leaveRes.ok).toBe(true);
    const readyRes = await emitAck<RoomSnapshot>(p2.socket, 'room.ready', code, { ready: true });
    expect(readyRes.data?.ownerId).toBe(p2.userId);

    p1Dup.disconnect();
    p2.socket.disconnect();
  });

  it('rejects out-of-order, duplicate, and tampered events; interrupts single-player match with 0 XP', async () => {
    const p1 = await createAuthedSocket('play1');
    const p2 = await createAuthedSocket('play2');

    const created = await emitAck<RoomSnapshot>(p1.socket, 'room.create', '', {
      difficulty: 'EASY',
      style: 'STARLIGHT',
    });
    const code = must(created.data?.code, 'code');
    await emitAck(p2.socket, 'room.join', code, { code });
    await emitAck(p1.socket, 'room.ready', code, { ready: true });
    await emitAck(p2.socket, 'room.ready', code, { ready: true });

    const issuePromise = new Promise<WordIssuePayload>((resolve) => {
      p1.socket.once('word.issue', (d: WordIssuePayload) => {
        resolve(d);
      });
    });
    await emitAck(p1.socket, 'room.start', code, {});
    const issue = await issuePromise;
    expect(issue.currentWord).not.toBeNull();
    expect(issue.nextWord).not.toBeNull();

    // Out of order seq=2 before seq=1
    const ooo = await emitAck(p1.socket, 'word.solve', code, { slot: 0, answer: 'wrong' }, 2);
    expect(ooo.ok).toBe(false);
    expect(ooo.error?.code).toBe('OUT_OF_ORDER');

    // Tampered answer (wrong word at seq=1)
    const evId = crypto.randomUUID();
    const tampered = await emitAck(
      p1.socket,
      'word.solve',
      code,
      { slot: 0, answer: 'zzzzzz' },
      1,
      evId,
    );
    expect(tampered.ok).toBe(false);
    expect(tampered.error?.code).toBe('TAMPERED_ANSWER');

    // Duplicate eventId
    const dup = await emitAck(
      p1.socket,
      'word.solve',
      code,
      { slot: 0, answer: 'zzzzzz' },
      2,
      evId,
    );
    expect(dup.ok).toBe(false);
    expect(dup.error?.code).toBe('DUPLICATE_EVENT');

    // Disconnect p2 -> outside 400ms grace window -> only 1 connected player -> interrupted with 0 XP
    const resultsPromise = new Promise<MatchResultsPayload>((resolve) => {
      p1.socket.once('match.results', (res: MatchResultsPayload) => {
        resolve(res);
      });
    });
    p2.socket.disconnect();
    const results = await resultsPromise;
    expect(results.status).toBe('interrupted');
    expect(results.results.every((r) => r.xpAwarded === 0)).toBe(true);

    p1.socket.disconnect();
  });
});
