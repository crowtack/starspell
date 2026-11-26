import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  applySkipPenalty,
  applySolveTimeBonus,
  type AvatarId,
  calculateLevel,
  calculateMatchRatings,
  calculateWordXp,
  COMPETITION_HARD_CAP_MS,
  type CreateRoomPayload,
  deriveSeed,
  DIFFICULTY_CONFIGS,
  type DifficultyKey,
  EXPANDED_WORDS,
  generateRoomCode,
  getSlotTier,
  getSurvivalSlotTier,
  isSurvivalEnabled,
  isValidRoomCode,
  MATCH_COUNTDOWN_SECONDS,
  type MatchHistoryItem,
  type MatchMode,
  type MatchResultPlayerDto,
  type MatchResultsPayload,
  MIN_MS_PER_CHAR,
  MP_DAILY_XP_CAP,
  mulberry32,
  normalizeRoomCode,
  type OpponentProgress,
  ORIGINAL_WORDS,
  pickWordForTier,
  planChapter,
  planSurvivalChapter,
  rankCompetitionResults,
  rankSurvivalResults,
  RECONNECT_GRACE_MS,
  ROOM_FINISHED_EXPIRY_MS,
  ROOM_IDLE_EXPIRY_MS,
  ROOM_MAX_PLAYERS,
  ROOM_MIN_PLAYERS,
  type RoomSnapshot,
  scoreWordSolve,
  SKIP_USES_BOOSTED_TIER,
  SURVIVAL_HARD_CAP_MS,
  SURVIVAL_MAX_WORDS,
  type UpdateRoomSettingsPayload,
  type WayfaringStyle,
  type WordIssuePayload,
  type WordRecord,
  WORDS_PER_CHAPTER,
} from '@starspell/shared';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * NOTE: Room and match runtime state is kept in memory on this single API instance
 * with persistence to PostgreSQL. Scaling beyond one API instance requires a shared
 * Socket.IO adapter (e.g. Redis adapter) and externalized state (out of scope for M4).
 */

export interface SocketIdentity {
  readonly userId: string;
  readonly username: string;
  readonly avatarId: AvatarId;
}

interface RoomPlayerRuntime {
  userId: string;
  username: string;
  avatarId: AvatarId;
  isReady: boolean;
  isConnected: boolean;
  joinedAt: number;
  socketId: string | null;
}

interface MatchPlayerRuntime {
  userId: string;
  username: string;
  avatarId: AvatarId;
  slots: WordRecord[];
  usedWordIds: string[];
  wordIndex: number;
  skipCount: number;
  score: number;
  streak: number;
  bestStreak: number;
  wordsSolved: number;
  timeLeft: number;
  elapsedActiveMs: number;
  wordIssuedAtMs: number;
  lastSeq: number;
  seenEventIds: Set<string>;
  status: 'playing' | 'finished' | 'forfeit' | 'interrupted';
  isConnected: boolean;
  suspect: boolean;
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface MatchRuntime {
  matchId: string;
  roomCode: string;
  seed: number;
  difficulty: DifficultyKey;
  style: WayfaringStyle;
  mode: MatchMode;
  isRanked: boolean;
  maxWords: number;
  status: 'countdown' | 'active' | 'completed' | 'interrupted';
  startedAtMs: number;
  lastTickMs: number;
  players: Map<string, MatchPlayerRuntime>;
  clockTimer: ReturnType<typeof setInterval> | null;
  hardCapTimer: ReturnType<typeof setTimeout> | null;
  countdownTimer: ReturnType<typeof setTimeout> | null;
}

interface RoomRuntime {
  id: string;
  code: string;
  ownerId: string;
  difficulty: DifficultyKey;
  style: WayfaringStyle;
  mode: MatchMode;
  status: 'waiting' | 'countdown' | 'active' | 'finished' | 'expired';
  isRanked: boolean;
  expiresAtMs: number;
  players: Map<string, RoomPlayerRuntime>;
  activeMatch: MatchRuntime | null;
  countdownEndsAt: number | null;
}

export interface MultiplayerTimings {
  countdownMs?: number;
  reconnectGraceMs?: number;
  hardCapMs?: number;
  clockTickMs?: number;
  idleExpiryMs?: number;
}

export interface MultiplayerBroadcaster {
  emitToRoom(roomCode: string, event: string, payload: unknown): void;
  emitToSocket(socketId: string, event: string, payload: unknown): void;
  disconnectSocket(socketId: string, reason: string): void;
  joinSocketToRoom(socketId: string, roomCode: string): void;
  leaveSocketFromRoom(socketId: string, roomCode: string): void;
}

export class MultiplayerError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MultiplayerError';
    this.code = code;
  }
}

@Injectable()
export class MultiplayerService implements OnModuleInit, OnModuleDestroy {
  private readonly rooms = new Map<string, RoomRuntime>();
  private readonly userRoom = new Map<string, string>();
  private readonly joinAttempts = new Map<
    string,
    { timestamps: number[]; failures: number; lockedUntil: number }
  >();
  private broadcaster: MultiplayerBroadcaster | null = null;
  private timings: Required<MultiplayerTimings> = {
    countdownMs: MATCH_COUNTDOWN_SECONDS * 1000,
    reconnectGraceMs: RECONNECT_GRACE_MS,
    hardCapMs: COMPETITION_HARD_CAP_MS,
    clockTickMs: 500,
    idleExpiryMs: ROOM_IDLE_EXPIRY_MS,
  };

  constructor(private readonly prisma: PrismaService) {}

  setBroadcaster(broadcaster: MultiplayerBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  configureTimings(overrides: MultiplayerTimings): void {
    this.timings = { ...this.timings, ...overrides };
  }

  async onModuleInit(): Promise<void> {
    // GAME_RULES §12.6: on server start, any active/countdown match becomes interrupted
    await this.prisma.match
      .updateMany({
        where: { status: { in: ['active', 'countdown'] } },
        data: { status: 'interrupted', endedAt: new Date() },
      })
      .catch(() => undefined);
  }

  onModuleDestroy(): void {
    for (const room of this.rooms.values()) {
      if (room.activeMatch) {
        this.clearMatchTimers(room.activeMatch);
      }
    }
    this.rooms.clear();
    this.userRoom.clear();
  }

  async getMatchHistory(userId: string): Promise<MatchHistoryItem[]> {
    const rows = await this.prisma.matchPlayerResult.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        match: {
          include: {
            room: { select: { code: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      matchId: row.matchId,
      roomCode: row.match.room.code,
      mode: row.match.mode as MatchMode,
      isRanked: row.match.isRanked,
      difficulty: row.match.difficulty as DifficultyKey,
      style: row.match.style as WayfaringStyle,
      matchStatus: row.match.status,
      rank: row.rank,
      isDraw: row.isDraw,
      playerStatus: row.status,
      score: row.score,
      wordsSolved: row.wordsSolved,
      bestStreak: row.bestStreak,
      xpAwarded: row.xpAwarded,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createRoom(
    identity: SocketIdentity,
    socketId: string,
    payload: CreateRoomPayload,
  ): Promise<RoomSnapshot> {
    await this.leaveCurrentRoomIfAny(identity.userId, socketId);

    let code = '';
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = generateRoomCode(mulberry32(randomInt(1, 2_147_483_647)));
      const inMemory = this.rooms.get(candidate);
      if (inMemory && inMemory.status !== 'expired') continue;
      const existingDb = await this.prisma.multiplayerRoom.findUnique({
        where: { code: candidate },
        select: { status: true, expiresAt: true },
      });
      if (!existingDb || existingDb.status === 'expired' || existingDb.expiresAt <= new Date()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new MultiplayerError('ROOM_CREATE_FAILED', 'Unable to allocate room code');
    }

    const mode: MatchMode = payload.mode;
    if (mode === 'SURVIVAL' && !isSurvivalEnabled(EXPANDED_WORDS)) {
      throw new MultiplayerError('SURVIVAL_DISABLED', 'Survival vocabulary gate not met');
    }

    const expiresAt = new Date(Date.now() + this.timings.idleExpiryMs);
    const dbRoom = await this.prisma.multiplayerRoom.upsert({
      where: { code },
      create: {
        code,
        ownerId: identity.userId,
        difficulty: payload.difficulty,
        style: payload.style,
        mode,
        status: 'waiting',
        isRanked: payload.isRanked,
        expiresAt,
      },
      update: {
        ownerId: identity.userId,
        difficulty: payload.difficulty,
        style: payload.style,
        mode,
        status: 'waiting',
        isRanked: payload.isRanked,
        expiresAt,
      },
    });

    await this.prisma.roomPlayer.deleteMany({ where: { roomId: dbRoom.id } });
    await this.prisma.roomPlayer.create({
      data: {
        roomId: dbRoom.id,
        userId: identity.userId,
        username: identity.username,
        avatarId: identity.avatarId,
        isReady: false,
        isConnected: true,
      },
    });

    const room: RoomRuntime = {
      id: dbRoom.id,
      code,
      ownerId: identity.userId,
      difficulty: payload.difficulty,
      style: payload.style,
      mode,
      status: 'waiting',
      isRanked: payload.isRanked,
      expiresAtMs: expiresAt.getTime(),
      players: new Map([
        [
          identity.userId,
          {
            userId: identity.userId,
            username: identity.username,
            avatarId: identity.avatarId,
            isReady: false,
            isConnected: true,
            joinedAt: Date.now(),
            socketId,
          },
        ],
      ]),
      activeMatch: null,
      countdownEndsAt: null,
    };

    this.rooms.set(code, room);
    this.userRoom.set(identity.userId, code);
    this.broadcaster?.joinSocketToRoom(socketId, code);
    return this.toRoomSnapshot(room);
  }

  async joinRoom(
    identity: SocketIdentity,
    socketId: string,
    rawCode: string,
  ): Promise<{ room: RoomSnapshot; wordIssue?: WordIssuePayload; opponents?: OpponentProgress[] }> {
    const now = Date.now();
    const limiter = this.joinAttempts.get(identity.userId) ?? {
      timestamps: [],
      failures: 0,
      lockedUntil: 0,
    };
    if (limiter.lockedUntil > now) {
      throw new MultiplayerError('JOIN_LOCKED', 'Too many failed join attempts. Try again later.');
    }
    limiter.timestamps = limiter.timestamps.filter((t) => now - t < 60_000);
    if (limiter.timestamps.length >= 10) {
      throw new MultiplayerError(
        'JOIN_RATE_LIMITED',
        'Too many join attempts. Please wait a minute.',
      );
    }
    limiter.timestamps.push(now);
    this.joinAttempts.set(identity.userId, limiter);

    const recordJoinFailure = () => {
      limiter.failures += 1;
      if (limiter.failures >= 30) {
        limiter.lockedUntil = Date.now() + 10 * 60 * 1000;
        limiter.failures = 0;
      }
    };

    const code = normalizeRoomCode(rawCode);
    if (!isValidRoomCode(code)) {
      recordJoinFailure();
      throw new MultiplayerError('INVALID_CODE', 'Invalid room code format');
    }

    const room = this.rooms.get(code);
    if (!room) {
      const dbRoom = await this.prisma.multiplayerRoom.findUnique({ where: { code } });
      if (dbRoom && (dbRoom.status === 'expired' || dbRoom.expiresAt <= new Date())) {
        recordJoinFailure();
        throw new MultiplayerError('ROOM_EXPIRED', 'This room has expired');
      }
      recordJoinFailure();
      throw new MultiplayerError('INVALID_CODE', 'Room not found');
    }

    if (room.status === 'expired' || room.expiresAtMs <= Date.now()) {
      room.status = 'expired';
      await this.prisma.multiplayerRoom
        .update({ where: { id: room.id }, data: { status: 'expired' } })
        .catch(() => undefined);
      throw new MultiplayerError('ROOM_EXPIRED', 'This room has expired');
    }

    const existingPlayer = room.players.get(identity.userId);
    if (!existingPlayer) {
      if (room.status !== 'waiting') {
        throw new MultiplayerError('ALREADY_STARTED', 'This match has already started');
      }
      if (room.players.size >= ROOM_MAX_PLAYERS) {
        throw new MultiplayerError('ROOM_FULL', 'Room is full (max 6 players)');
      }

      const prevRoomCode = this.userRoom.get(identity.userId);
      if (prevRoomCode && prevRoomCode !== code) {
        await this.leaveCurrentRoomIfAny(identity.userId, socketId);
      }

      const player: RoomPlayerRuntime = {
        userId: identity.userId,
        username: identity.username,
        avatarId: identity.avatarId,
        isReady: false,
        isConnected: true,
        joinedAt: Date.now(),
        socketId,
      };
      room.players.set(identity.userId, player);
      await this.prisma.roomPlayer.upsert({
        where: { roomId_userId: { roomId: room.id, userId: identity.userId } },
        create: {
          roomId: room.id,
          userId: identity.userId,
          username: identity.username,
          avatarId: identity.avatarId,
          isReady: false,
          isConnected: true,
        },
        update: { isConnected: true },
      });
    } else {
      // Duplicate connection or reconnect: replace older socket cleanly
      if (existingPlayer.socketId && existingPlayer.socketId !== socketId) {
        this.broadcaster?.emitToSocket(existingPlayer.socketId, 'session.replaced', {
          code: 'DUPLICATE_CONNECTION',
          message: 'Connected from a newer session',
        });
        this.broadcaster?.disconnectSocket(existingPlayer.socketId, 'duplicate_connection');
      }
      existingPlayer.socketId = socketId;
      existingPlayer.isConnected = true;
      await this.prisma.roomPlayer
        .update({
          where: { roomId_userId: { roomId: room.id, userId: identity.userId } },
          data: { isConnected: true },
        })
        .catch(() => undefined);

      // Reconnect inside active match
      const mp = room.activeMatch?.players.get(identity.userId);
      if (mp && room.activeMatch) {
        mp.isConnected = true;
        if (mp.graceTimer) {
          clearTimeout(mp.graceTimer);
          mp.graceTimer = null;
        }
      }
    }

    this.userRoom.set(identity.userId, code);
    this.broadcaster?.joinSocketToRoom(socketId, code);

    const snapshot = this.toRoomSnapshot(room);
    this.broadcaster?.emitToRoom(code, 'room.state', snapshot);

    if (room.activeMatch && room.activeMatch.status === 'active') {
      const mp = room.activeMatch.players.get(identity.userId);
      if (mp) {
        return {
          room: snapshot,
          wordIssue: this.buildWordIssue(room.activeMatch, mp),
          opponents: this.buildOpponents(room.activeMatch),
        };
      }
    }

    return { room: snapshot };
  }

  /** Helper for tests to force-expire a room without waiting 15 minutes. */
  async forceExpireRoomForTest(rawCode: string): Promise<void> {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (room) {
      room.expiresAtMs = Date.now() - 1000;
      room.status = 'expired';
      await this.prisma.multiplayerRoom
        .update({
          where: { id: room.id },
          data: { status: 'expired', expiresAt: new Date(Date.now() - 1000) },
        })
        .catch(() => undefined);
    }
  }

  async setReady(identity: SocketIdentity, rawCode: string, ready: boolean): Promise<RoomSnapshot> {
    const room = this.requireRoom(rawCode);
    if (room.status !== 'waiting') {
      throw new MultiplayerError('ALREADY_STARTED', 'Match already started');
    }
    const player = room.players.get(identity.userId);
    if (!player) {
      throw new MultiplayerError('NOT_IN_ROOM', 'You are not in this room');
    }
    player.isReady = ready;
    await this.prisma.roomPlayer
      .update({
        where: { roomId_userId: { roomId: room.id, userId: identity.userId } },
        data: { isReady: ready },
      })
      .catch(() => undefined);

    const snapshot = this.toRoomSnapshot(room);
    this.broadcaster?.emitToRoom(room.code, 'room.state', snapshot);
    return snapshot;
  }

  async updateSettings(
    identity: SocketIdentity,
    rawCode: string,
    payload: UpdateRoomSettingsPayload,
  ): Promise<RoomSnapshot> {
    const room = this.requireRoom(rawCode);
    if (room.ownerId !== identity.userId) {
      throw new MultiplayerError('NOT_OWNER', 'Only the room owner can change settings');
    }
    if (room.status !== 'waiting') {
      throw new MultiplayerError('ALREADY_STARTED', 'Cannot change settings after start');
    }
    if (payload.difficulty) room.difficulty = payload.difficulty;
    if (payload.style) room.style = payload.style;
    if (payload.mode) {
      if (payload.mode === 'SURVIVAL' && !isSurvivalEnabled(EXPANDED_WORDS)) {
        throw new MultiplayerError('SURVIVAL_DISABLED', 'Survival vocabulary gate not met');
      }
      room.mode = payload.mode;
    }
    if (payload.isRanked !== undefined) room.isRanked = payload.isRanked;

    await this.prisma.multiplayerRoom
      .update({
        where: { id: room.id },
        data: {
          difficulty: room.difficulty,
          style: room.style,
          mode: room.mode,
          isRanked: room.isRanked,
        },
      })
      .catch(() => undefined);

    const snapshot = this.toRoomSnapshot(room);
    this.broadcaster?.emitToRoom(room.code, 'room.state', snapshot);
    return snapshot;
  }

  async startMatch(identity: SocketIdentity, rawCode: string): Promise<RoomSnapshot> {
    const room = this.requireRoom(rawCode);
    if (room.ownerId !== identity.userId) {
      throw new MultiplayerError('NOT_OWNER', 'Only the room owner can start the match');
    }
    if (room.status !== 'waiting') {
      throw new MultiplayerError('ALREADY_STARTED', 'Match already started');
    }

    const connectedPlayers = Array.from(room.players.values()).filter((p) => p.isConnected);
    if (connectedPlayers.length < ROOM_MIN_PLAYERS) {
      throw new MultiplayerError('NOT_ENOUGH_PLAYERS', 'At least 2 connected players are required');
    }
    if (connectedPlayers.some((p) => !p.isReady)) {
      throw new MultiplayerError('NOT_READY', 'All connected players must be ready');
    }

    const seed = randomInt(1, 2_147_483_647);
    const dbMatch = await this.prisma.match.create({
      data: {
        roomId: room.id,
        seed,
        difficulty: room.difficulty,
        style: room.style,
        mode: room.mode,
        isRanked: room.isRanked,
        status: 'countdown',
      },
    });

    const cfg = DIFFICULTY_CONFIGS[room.difficulty];
    const isSurvival = room.mode === 'SURVIVAL';
    const maxWords = isSurvival ? SURVIVAL_MAX_WORDS : WORDS_PER_CHAPTER;
    const basePlan = isSurvival
      ? planSurvivalChapter({
          seed,
          difficulty: room.difficulty,
          wordBank: EXPANDED_WORDS,
        })
      : planChapter({
          seed,
          difficulty: room.difficulty,
          chapter: 1,
          usedWordIds: [],
          wordBank: ORIGINAL_WORDS,
        });

    const matchPlayers = new Map<string, MatchPlayerRuntime>();
    for (const p of connectedPlayers) {
      matchPlayers.set(p.userId, {
        userId: p.userId,
        username: p.username,
        avatarId: p.avatarId,
        slots: [...basePlan.slots],
        usedWordIds: [...basePlan.usedWordIds],
        wordIndex: 0,
        skipCount: 0,
        score: 0,
        streak: 0,
        bestStreak: 0,
        wordsSolved: 0,
        timeLeft: cfg.initialClock,
        elapsedActiveMs: 0,
        wordIssuedAtMs: Date.now(),
        lastSeq: 0,
        seenEventIds: new Set<string>(),
        status: 'playing',
        isConnected: true,
        suspect: false,
        graceTimer: null,
      });
    }

    const match: MatchRuntime = {
      matchId: dbMatch.id,
      roomCode: room.code,
      seed,
      difficulty: room.difficulty,
      style: room.style,
      mode: room.mode,
      isRanked: room.isRanked,
      maxWords,
      status: 'countdown',
      startedAtMs: 0,
      lastTickMs: 0,
      players: matchPlayers,
      clockTimer: null,
      hardCapTimer: null,
      countdownTimer: null,
    };

    room.status = 'countdown';
    room.activeMatch = match;
    room.countdownEndsAt = Date.now() + this.timings.countdownMs;

    await this.prisma.multiplayerRoom.update({
      where: { id: room.id },
      data: { status: 'countdown' },
    });

    match.countdownTimer = setTimeout(() => {
      void this.activateMatch(room);
    }, this.timings.countdownMs);

    const snapshot = this.toRoomSnapshot(room);
    this.broadcaster?.emitToRoom(room.code, 'room.state', snapshot);
    return snapshot;
  }

  private async activateMatch(room: RoomRuntime): Promise<void> {
    const match = room.activeMatch;
    if (!match || match.status !== 'countdown') return;

    const connectedCount = Array.from(match.players.values()).filter((p) => p.isConnected).length;
    if (connectedCount < ROOM_MIN_PLAYERS) {
      await this.interruptMatch(room, match);
      return;
    }

    const now = Date.now();
    match.status = 'active';
    match.startedAtMs = now;
    match.lastTickMs = now;
    room.status = 'active';
    room.countdownEndsAt = null;

    for (const mp of match.players.values()) {
      mp.wordIssuedAtMs = now;
    }

    await this.prisma.match
      .update({
        where: { id: match.matchId },
        data: { status: 'active', startedAt: new Date(now) },
      })
      .catch(() => undefined);
    await this.prisma.multiplayerRoom
      .update({ where: { id: room.id }, data: { status: 'active' } })
      .catch(() => undefined);

    this.broadcaster?.emitToRoom(room.code, 'room.state', this.toRoomSnapshot(room));
    for (const mp of match.players.values()) {
      const rp = room.players.get(mp.userId);
      if (rp?.socketId) {
        this.broadcaster?.emitToSocket(rp.socketId, 'word.issue', this.buildWordIssue(match, mp));
      }
    }
    this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));

    match.clockTimer = setInterval(() => {
      void this.tickMatchClock(room);
    }, this.timings.clockTickMs);

    const hardCapMs =
      match.mode === 'SURVIVAL'
        ? Math.max(this.timings.hardCapMs, SURVIVAL_HARD_CAP_MS)
        : this.timings.hardCapMs;

    match.hardCapTimer = setTimeout(() => {
      void this.finishMatchByHardCap(room);
    }, hardCapMs);
  }

  async handleWordSolve(
    identity: SocketIdentity,
    rawCode: string,
    eventId: string,
    seq: number,
    slot: number,
    answer: string,
  ): Promise<WordIssuePayload> {
    const { room, match, player } = this.requireActiveMatchPlayer(identity.userId, rawCode);
    this.validateSeqAndEventId(player, seq, eventId);

    if (player.status !== 'playing') {
      throw new MultiplayerError('PLAYER_FINISHED', 'You have already finished this match');
    }
    if (slot !== player.wordIndex) {
      player.suspect = true;
      throw new MultiplayerError('SLOT_MISMATCH', 'Submitted slot does not match current word');
    }
    const currentWord = player.slots[player.wordIndex];
    if (!currentWord) {
      throw new MultiplayerError('MISSING_SLOT', 'No word at current slot');
    }

    const now = Date.now();
    const elapsedMs = now - player.wordIssuedAtMs;
    const minMs = MIN_MS_PER_CHAR * currentWord.word.length;
    if (answer.trim().toLowerCase() !== currentWord.word.toLowerCase() || elapsedMs < minMs) {
      player.suspect = true;
      throw new MultiplayerError('TAMPERED_ANSWER', 'Answer rejected by server plausibility check');
    }

    const cfg = DIFFICULTY_CONFIGS[match.difficulty];
    const scored = scoreWordSolve(currentWord.word.length, cfg, player.streak);
    player.score += scored.wordPoints;
    player.streak = scored.nextStreak;
    player.bestStreak = Math.max(player.bestStreak, scored.nextStreak);
    player.wordsSolved += 1;
    player.wordIndex += 1;
    player.timeLeft = applySolveTimeBonus(player.timeLeft, cfg);
    player.elapsedActiveMs = now - match.startedAtMs;
    player.wordIssuedAtMs = now;

    if (player.wordIndex >= match.maxWords) {
      player.status = 'finished';
    }

    const issue = this.buildWordIssue(match, player);
    const rp = room.players.get(identity.userId);
    if (rp?.socketId) {
      this.broadcaster?.emitToSocket(rp.socketId, 'word.issue', issue);
    }
    this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));

    await this.checkMatchCompletion(room, match);
    return issue;
  }

  async handleWordSkip(
    identity: SocketIdentity,
    rawCode: string,
    eventId: string,
    seq: number,
    slot: number,
  ): Promise<WordIssuePayload> {
    const { room, match, player } = this.requireActiveMatchPlayer(identity.userId, rawCode);
    this.validateSeqAndEventId(player, seq, eventId);

    if (player.status !== 'playing') {
      throw new MultiplayerError('PLAYER_FINISHED', 'You have already finished this match');
    }
    if (slot !== player.wordIndex) {
      throw new MultiplayerError('SLOT_MISMATCH', 'Submitted slot does not match current word');
    }

    const cfg = DIFFICULTY_CONFIGS[match.difficulty];
    player.streak = 0;
    player.timeLeft = applySkipPenalty(player.timeLeft, cfg);
    player.elapsedActiveMs = Date.now() - match.startedAtMs;

    if (player.timeLeft <= 0) {
      player.timeLeft = 0;
      player.status = 'finished';
    } else {
      const tier =
        match.mode === 'SURVIVAL'
          ? getSurvivalSlotTier(match.difficulty, player.wordIndex)
          : getSlotTier(match.difficulty, player.wordIndex, 1, SKIP_USES_BOOSTED_TIER);
      const rng = mulberry32(deriveSeed(match.seed, 1, player.wordIndex, player.skipCount));
      const picked = pickWordForTier({
        rng,
        tier,
        usedWordIds: player.usedWordIds,
        wordBank: match.mode === 'SURVIVAL' ? EXPANDED_WORDS : ORIGINAL_WORDS,
      });
      player.slots[player.wordIndex] = picked.word;
      player.usedWordIds = [...picked.usedWordIds];
      player.skipCount += 1;
      player.wordIssuedAtMs = Date.now();
    }

    const issue = this.buildWordIssue(match, player);
    const rp = room.players.get(identity.userId);
    if (rp?.socketId) {
      this.broadcaster?.emitToSocket(rp.socketId, 'word.issue', issue);
    }
    this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));

    await this.checkMatchCompletion(room, match);
    return issue;
  }

  async handleDisconnect(userId: string, socketId: string): Promise<void> {
    const code = this.userRoom.get(userId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room) return;
    const rp = room.players.get(userId);
    if (!rp || rp.socketId !== socketId) return;

    if (room.status === 'waiting') {
      await this.leaveRoom(userId, code, socketId);
      return;
    }

    rp.isConnected = false;
    rp.socketId = null;
    await this.prisma.roomPlayer
      .update({
        where: { roomId_userId: { roomId: room.id, userId } },
        data: { isConnected: false },
      })
      .catch(() => undefined);

    const match = room.activeMatch;
    if (match && (match.status === 'active' || match.status === 'countdown')) {
      const mp = match.players.get(userId);
      if (mp && mp.status === 'playing') {
        mp.isConnected = false;
        mp.graceTimer = setTimeout(() => {
          void this.handleGraceExpired(room, match, mp);
        }, this.timings.reconnectGraceMs);
      }
      this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));
    }

    this.broadcaster?.emitToRoom(room.code, 'room.state', this.toRoomSnapshot(room));
  }

  async leaveRoom(userId: string, rawCode: string, socketId: string): Promise<void> {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) return;

    this.broadcaster?.leaveSocketFromRoom(socketId, code);
    this.userRoom.delete(userId);
    room.players.delete(userId);
    await this.prisma.roomPlayer
      .deleteMany({ where: { roomId: room.id, userId } })
      .catch(() => undefined);

    if (room.players.size === 0) {
      room.status = 'expired';
      if (room.activeMatch) {
        this.clearMatchTimers(room.activeMatch);
      }
      await this.prisma.multiplayerRoom
        .update({ where: { id: room.id }, data: { status: 'expired' } })
        .catch(() => undefined);
      return;
    }

    if (room.ownerId === userId) {
      const candidates = Array.from(room.players.values())
        .filter((p) => p.isConnected)
        .sort((a, b) => a.joinedAt - b.joinedAt);
      const nextOwner = candidates[0] ?? Array.from(room.players.values())[0];
      if (nextOwner) {
        room.ownerId = nextOwner.userId;
        await this.prisma.multiplayerRoom
          .update({ where: { id: room.id }, data: { ownerId: nextOwner.userId } })
          .catch(() => undefined);
      }
    }

    this.broadcaster?.emitToRoom(room.code, 'room.state', this.toRoomSnapshot(room));
  }

  private async leaveCurrentRoomIfAny(userId: string, socketId: string): Promise<void> {
    const prevCode = this.userRoom.get(userId);
    if (prevCode) {
      await this.leaveRoom(userId, prevCode, socketId);
    }
  }

  private async handleGraceExpired(
    room: RoomRuntime,
    match: MatchRuntime,
    mp: MatchPlayerRuntime,
  ): Promise<void> {
    mp.graceTimer = null;
    if (mp.isConnected || (match.status !== 'active' && match.status !== 'countdown')) return;

    const connectedCount = Array.from(match.players.values()).filter((p) => p.isConnected).length;
    if (connectedCount < ROOM_MIN_PLAYERS) {
      await this.interruptMatch(room, match);
      return;
    }

    mp.status = 'forfeit';
    this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));
    await this.checkMatchCompletion(room, match);
  }

  private async tickMatchClock(room: RoomRuntime): Promise<void> {
    const match = room.activeMatch;
    if (!match || match.status !== 'active') return;

    const now = Date.now();
    const dtSec = (now - match.lastTickMs) / 1000;
    match.lastTickMs = now;

    for (const mp of match.players.values()) {
      if (mp.status !== 'playing') continue;
      mp.timeLeft = Math.max(0, mp.timeLeft - dtSec);
      mp.elapsedActiveMs = now - match.startedAtMs;
      if (mp.timeLeft <= 0) {
        mp.status = 'finished';
        const rp = room.players.get(mp.userId);
        if (rp?.socketId) {
          this.broadcaster?.emitToSocket(rp.socketId, 'word.issue', this.buildWordIssue(match, mp));
        }
      }
    }

    this.broadcaster?.emitToRoom(room.code, 'match.progress', this.buildOpponents(match));
    await this.checkMatchCompletion(room, match);
  }

  private async finishMatchByHardCap(room: RoomRuntime): Promise<void> {
    const match = room.activeMatch;
    if (!match || match.status !== 'active') return;
    for (const mp of match.players.values()) {
      if (mp.status === 'playing') {
        mp.status = 'finished';
      }
    }
    await this.checkMatchCompletion(room, match);
  }

  private async interruptMatch(room: RoomRuntime, match: MatchRuntime): Promise<void> {
    if (match.status === 'completed' || match.status === 'interrupted') return;
    match.status = 'interrupted';
    this.clearMatchTimers(match);
    room.status = 'finished';
    room.expiresAtMs = Date.now() + ROOM_FINISHED_EXPIRY_MS;

    const results: MatchResultPlayerDto[] = [];
    let rank = 1;
    for (const mp of match.players.values()) {
      mp.status = 'interrupted';
      results.push({
        userId: mp.userId,
        username: mp.username,
        rank: rank++,
        isDraw: true,
        status: 'interrupted',
        score: mp.score,
        wordsSolved: mp.wordsSolved,
        bestStreak: mp.bestStreak,
        elapsedActiveMs: mp.elapsedActiveMs,
        xpAwarded: 0,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.matchId },
        data: { status: 'interrupted', endedAt: new Date() },
      });
      await tx.multiplayerRoom.update({
        where: { id: room.id },
        data: { status: 'finished', expiresAt: new Date(room.expiresAtMs) },
      });
      for (const r of results) {
        await tx.matchPlayerResult.upsert({
          where: { matchId_userId: { matchId: match.matchId, userId: r.userId } },
          create: {
            matchId: match.matchId,
            userId: r.userId,
            username: r.username,
            rank: r.rank,
            isDraw: r.isDraw,
            status: r.status,
            score: r.score,
            wordsSolved: r.wordsSolved,
            bestStreak: r.bestStreak,
            elapsedActiveMs: r.elapsedActiveMs,
            xpAwarded: 0,
            suspect: false,
          },
          update: {},
        });
      }
    });

    const payload: MatchResultsPayload = {
      matchId: match.matchId,
      roomCode: room.code,
      mode: match.mode,
      isRanked: match.isRanked,
      status: 'interrupted',
      difficulty: match.difficulty,
      style: match.style,
      results,
    };
    this.broadcaster?.emitToRoom(room.code, 'match.results', payload);
    this.broadcaster?.emitToRoom(room.code, 'room.state', this.toRoomSnapshot(room));
  }

  private async checkMatchCompletion(room: RoomRuntime, match: MatchRuntime): Promise<void> {
    if (match.status !== 'active') return;
    const stillPlaying = Array.from(match.players.values()).some((p) => p.status === 'playing');
    if (stillPlaying) return;

    match.status = 'completed';
    this.clearMatchTimers(match);
    room.status = 'finished';
    room.expiresAtMs = Date.now() + ROOM_FINISHED_EXPIRY_MS;

    const rankFn = match.mode === 'SURVIVAL' ? rankSurvivalResults : rankCompetitionResults;
    const ranked = rankFn(
      Array.from(match.players.values()).map((mp) => ({
        userId: mp.userId,
        outcome: mp.status === 'forfeit' ? ('forfeit' as const) : ('finished' as const),
        score: mp.score,
        wordsSolved: mp.wordsSolved,
        elapsedActiveMs: mp.elapsedActiveMs,
        mp,
      })),
    );

    const results: MatchResultPlayerDto[] = ranked.map((r) => {
      const xpAwarded =
        r.entry.outcome === 'forfeit' || r.entry.mp.suspect ? 0 : calculateWordXp(r.entry.score);
      return {
        userId: r.entry.userId,
        username: r.entry.mp.username,
        rank: r.rank,
        isDraw: r.isDraw,
        status: r.entry.outcome,
        score: r.entry.score,
        wordsSolved: r.entry.wordsSolved,
        bestStreak: r.entry.mp.bestStreak,
        elapsedActiveMs: r.entry.elapsedActiveMs,
        xpAwarded,
      };
    });

    const utcDayStart = new Date();
    utcDayStart.setUTCHours(0, 0, 0, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { id: match.matchId },
        data: { status: 'completed', endedAt: new Date() },
      });
      await tx.multiplayerRoom.update({
        where: { id: room.id },
        data: { status: 'finished', expiresAt: new Date(room.expiresAtMs) },
      });

      const profiles = await tx.playerProfile.findMany({
        where: { userId: { in: results.map((r) => r.userId) } },
      });
      const profileByUser = new Map(profiles.map((p) => [p.userId, p]));

      const ratingChanges =
        match.isRanked && results.length >= 2
          ? calculateMatchRatings(
              results.map((r) => {
                const prof = profileByUser.get(r.userId);
                return {
                  userId: r.userId,
                  rating: prof?.rating ?? 1000,
                  rankedMatches: prof?.rankedMatches ?? 0,
                  rank: r.rank,
                  score: r.score,
                  wordsSolved: r.wordsSolved,
                  outcome: r.status,
                };
              }),
            )
          : [];
      const ratingByUser = new Map(ratingChanges.map((rc) => [rc.userId, rc]));

      for (const r of results) {
        const mp = match.players.get(r.userId);
        const rc = ratingByUser.get(r.userId);
        if (rc) {
          r.ratingBefore = rc.ratingBefore;
          r.ratingAfter = rc.ratingAfter;
          r.ratingDelta = rc.delta;
        }

        let finalXp = r.xpAwarded;
        if (finalXp > 0) {
          const todaySum = await tx.rewardLedger.aggregate({
            where: {
              userId: r.userId,
              ledgerKey: { startsWith: 'mp:' },
              createdAt: { gte: utcDayStart },
            },
            _sum: { xpDelta: true },
          });
          const usedToday = todaySum._sum.xpDelta ?? 0;
          finalXp = Math.max(0, Math.min(finalXp, MP_DAILY_XP_CAP - usedToday));
          r.xpAwarded = finalXp;
        }

        await tx.matchPlayerResult.upsert({
          where: { matchId_userId: { matchId: match.matchId, userId: r.userId } },
          create: {
            matchId: match.matchId,
            userId: r.userId,
            username: r.username,
            rank: r.rank,
            isDraw: r.isDraw,
            status: r.status,
            score: r.score,
            wordsSolved: r.wordsSolved,
            bestStreak: r.bestStreak,
            elapsedActiveMs: r.elapsedActiveMs,
            xpAwarded: finalXp,
            suspect: mp?.suspect ?? false,
          },
          update: {},
        });

        const profile = profileByUser.get(r.userId);
        if (finalXp > 0) {
          const ledgerKey = `mp:${match.matchId}:${r.userId}:complete`;
          const existing = await tx.rewardLedger.findUnique({ where: { ledgerKey } });
          if (!existing) {
            await tx.rewardLedger.create({
              data: {
                userId: r.userId,
                ledgerKey,
                xpDelta: finalXp,
              },
            });
            if (profile) {
              profile.xp += finalXp;
              profile.level = calculateLevel(profile.xp);
            }
          }
        }

        if (rc && profile) {
          const existingRh = await tx.ratingHistory.findUnique({
            where: { matchId_userId: { matchId: match.matchId, userId: r.userId } },
          });
          if (!existingRh) {
            await tx.ratingHistory.create({
              data: {
                userId: r.userId,
                matchId: match.matchId,
                ratingBefore: rc.ratingBefore,
                ratingAfter: rc.ratingAfter,
                delta: rc.delta,
                kFactor: rc.kFactor,
              },
            });
            profile.rating = rc.ratingAfter;
            profile.rankedMatches += 1;
          }
        }

        if (profile && (finalXp > 0 || rc)) {
          await tx.playerProfile.update({
            where: { userId: r.userId },
            data: {
              xp: profile.xp,
              level: profile.level,
              rating: profile.rating,
              rankedMatches: profile.rankedMatches,
            },
          });
        }
      }
    });

    const payload: MatchResultsPayload = {
      matchId: match.matchId,
      roomCode: room.code,
      mode: match.mode,
      isRanked: match.isRanked,
      status: 'completed',
      difficulty: match.difficulty,
      style: match.style,
      results,
    };
    this.broadcaster?.emitToRoom(room.code, 'match.results', payload);
    this.broadcaster?.emitToRoom(room.code, 'room.state', this.toRoomSnapshot(room));
  }

  private clearMatchTimers(match: MatchRuntime): void {
    if (match.clockTimer) {
      clearInterval(match.clockTimer);
      match.clockTimer = null;
    }
    if (match.hardCapTimer) {
      clearTimeout(match.hardCapTimer);
      match.hardCapTimer = null;
    }
    if (match.countdownTimer) {
      clearTimeout(match.countdownTimer);
      match.countdownTimer = null;
    }
    for (const mp of match.players.values()) {
      if (mp.graceTimer) {
        clearTimeout(mp.graceTimer);
        mp.graceTimer = null;
      }
    }
  }

  private requireRoom(rawCode: string): RoomRuntime {
    const code = normalizeRoomCode(rawCode);
    const room = this.rooms.get(code);
    if (!room) {
      throw new MultiplayerError('INVALID_CODE', 'Room not found');
    }
    if (room.status === 'expired' || room.expiresAtMs <= Date.now()) {
      throw new MultiplayerError('ROOM_EXPIRED', 'Room has expired');
    }
    return room;
  }

  private requireActiveMatchPlayer(
    userId: string,
    rawCode: string,
  ): { room: RoomRuntime; match: MatchRuntime; player: MatchPlayerRuntime } {
    const room = this.requireRoom(rawCode);
    const match = room.activeMatch;
    if (!match || match.status !== 'active') {
      throw new MultiplayerError('MATCH_NOT_ACTIVE', 'Match is not active');
    }
    const player = match.players.get(userId);
    if (!player) {
      throw new MultiplayerError('NOT_IN_MATCH', 'You are not a participant in this match');
    }
    return { room, match, player };
  }

  private validateSeqAndEventId(player: MatchPlayerRuntime, seq: number, eventId: string): void {
    if (player.seenEventIds.has(eventId)) {
      throw new MultiplayerError('DUPLICATE_EVENT', 'Duplicate eventId');
    }
    if (seq !== player.lastSeq + 1) {
      throw new MultiplayerError(
        'OUT_OF_ORDER',
        `Expected seq ${String(player.lastSeq + 1)}, got ${String(seq)}`,
      );
    }
    player.seenEventIds.add(eventId);
    player.lastSeq = seq;
  }

  private toRoomSnapshot(room: RoomRuntime): RoomSnapshot {
    return {
      id: room.id,
      code: room.code,
      ownerId: room.ownerId,
      difficulty: room.difficulty,
      style: room.style,
      mode: room.mode,
      status: room.status,
      isRanked: room.isRanked,
      maxWords: room.mode === 'SURVIVAL' ? SURVIVAL_MAX_WORDS : WORDS_PER_CHAPTER,
      players: Array.from(room.players.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        avatarId: p.avatarId,
        isReady: p.isReady,
        isConnected: p.isConnected,
        isOwner: p.userId === room.ownerId,
      })),
      matchId: room.activeMatch?.matchId ?? null,
      countdownEndsAt: room.countdownEndsAt,
    };
  }

  private buildWordIssue(match: MatchRuntime, mp: MatchPlayerRuntime): WordIssuePayload {
    return {
      matchId: match.matchId,
      slot: mp.wordIndex,
      currentWord: mp.status === 'playing' ? (mp.slots[mp.wordIndex] ?? null) : null,
      nextWord: mp.status === 'playing' ? (mp.slots[mp.wordIndex + 1] ?? null) : null,
      score: mp.score,
      streak: mp.streak,
      timeLeft: mp.timeLeft,
      status: mp.status,
    };
  }

  private buildOpponents(match: MatchRuntime): OpponentProgress[] {
    return Array.from(match.players.values()).map((mp) => ({
      userId: mp.userId,
      username: mp.username,
      avatarId: mp.avatarId,
      wordIndex: mp.wordIndex,
      score: mp.score,
      streak: mp.streak,
      timeLeft: mp.timeLeft,
      isConnected: mp.isConnected,
      status: mp.status,
    }));
  }
}
