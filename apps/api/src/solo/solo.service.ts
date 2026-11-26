import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AbandonSoloSessionInput,
  type AppendSoloEventsInput,
  type AppendSoloEventsResult,
  calculateLevel,
  createInitialSoloState,
  type CreateSoloSessionInput,
  type DifficultyKey,
  MIN_MS_PER_CHAR,
  ORIGINAL_WORDS,
  reduce,
  SOLO_WORD_BANK_VERSION,
  type SoloEvent,
  type SoloSessionDto,
  type SoloSessionStatus,
  type SoloState,
  SoloStateSchema,
  type SoloSyncEventInput,
  type WayfaringStyle,
  WORDS_PER_CHAPTER,
} from '@starspell/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class SoloService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string, input: CreateSoloSessionInput): Promise<SoloSessionDto> {
    if (input.wordBankVersion !== SOLO_WORD_BANK_VERSION) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_WORD_BANK',
        message: `Unsupported wordBankVersion: ${input.wordBankVersion}`,
      });
    }

    const existing = await this.prisma.gameSession.findUnique({
      where: {
        userId_clientSessionId: {
          userId,
          clientSessionId: input.clientSessionId,
        },
      },
    });
    if (existing) {
      return toSessionDto(existing);
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      select: { xp: true },
    });

    const initialState = createInitialSoloState({
      difficulty: input.difficulty,
      seed: input.seed,
      totalXp: profile?.xp ?? 0,
    });

    const created = await this.prisma.gameSession.create({
      data: {
        userId,
        clientSessionId: input.clientSessionId,
        seed: input.seed,
        difficulty: input.difficulty,
        style: input.style,
        wordBankVersion: input.wordBankVersion,
        status: 'active',
        state: initialState as unknown as Prisma.InputJsonValue,
        version: 0,
      },
    });

    return toSessionDto(created);
  }

  async getActiveSession(userId: string): Promise<{ session: SoloSessionDto | null }> {
    const active = await this.prisma.gameSession.findFirst({
      where: { userId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return { session: active ? toSessionDto(active) : null };
  }

  async abandonSession(
    userId: string,
    sessionId: string,
    input: AbandonSoloSessionInput,
  ): Promise<SoloSessionDto> {
    const existing = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Solo session not found' });
    }
    if (existing.status === 'abandoned') {
      return toSessionDto(existing);
    }

    const updated = await this.prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: 'abandoned',
        abandonReason: input.reason,
      },
    });
    return toSessionDto(updated);
  }

  async appendEvents(
    userId: string,
    sessionId: string,
    input: AppendSoloEventsInput,
  ): Promise<AppendSoloEventsResult> {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.userId !== userId) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Solo session not found' });
      }

      const sortedEvents = [...input.events].sort((a, b) => a.seq - b.seq);

      // Idempotent batch replay check when server version is already ahead of baseSeq
      if (input.baseSeq < session.version) {
        const eventIds = sortedEvents.map((e) => e.eventId);
        const existingRows = await tx.gameEvent.findMany({
          where: { sessionId, eventId: { in: eventIds } },
          select: { eventId: true },
        });
        if (existingRows.length === eventIds.length) {
          return {
            session: toSessionDto(session),
            idempotentReplay: true,
            acceptedCount: 0,
            rejectedCount: 0,
            rejectedEventIds: [],
            xpCredited: 0,
          };
        }
        throw new ConflictException({
          code: 'SEQ_CONFLICT',
          message: 'Server session is ahead of local event log',
          details: {
            serverVersion: session.version,
            serverSession: toSessionDto(session),
          },
        });
      }

      if (input.baseSeq > session.version) {
        throw new ConflictException({
          code: 'SEQ_CONFLICT',
          message: 'Base sequence is ahead of server version',
          details: {
            serverVersion: session.version,
            serverSession: toSessionDto(session),
          },
        });
      }

      if (session.status !== 'active') {
        throw new ConflictException({
          code: 'SESSION_NOT_ACTIVE',
          message: `Cannot append events to a ${session.status} session`,
        });
      }

      let currentState = SoloStateSchema.parse(session.state) as SoloState;
      let currentSeq = session.version;
      let acceptedCount = 0;
      let xpCredited = 0;
      const rejectedEventIds: string[] = [];

      const profile = await tx.playerProfile.findUniqueOrThrow({ where: { userId } });
      let runningProfileXp = profile.xp;
      let runningHighScore = profile.highScore;
      let runningBestStreak = profile.bestStreak;
      let runningWordsSolved = profile.wordsSolved;
      let runningConstellationsCleared = profile.constellationsCleared;

      for (const ev of sortedEvents) {
        if (ev.seq !== currentSeq + 1) {
          throw new BadRequestException({
            code: 'INVALID_SEQ',
            message: `Expected seq ${String(currentSeq + 1)}, got ${String(ev.seq)}`,
          });
        }

        const existingEv = await tx.gameEvent.findUnique({
          where: { eventId: ev.eventId },
        });
        if (existingEv) {
          if (existingEv.sessionId === sessionId) {
            currentSeq = ev.seq;
            continue;
          }
          throw new ConflictException({
            code: 'EVENT_ID_CONFLICT',
            message: 'Event ID already used in another session',
          });
        }

        const rejectReason = validatePlausibility(currentState, ev);
        if (rejectReason !== null) {
          await tx.gameEvent.create({
            data: {
              sessionId,
              eventId: ev.eventId,
              seq: ev.seq,
              type: ev.type,
              payload: ev,
              accepted: false,
              rejectReason,
            },
          });
          rejectedEventIds.push(ev.eventId);
          currentSeq = ev.seq;
          continue;
        }

        const soloEvent = toReducerEvent(session.difficulty as DifficultyKey, session.seed, ev);
        const nextState = reduce(currentState, soloEvent);

        await tx.gameEvent.create({
          data: {
            sessionId,
            eventId: ev.eventId,
            seq: ev.seq,
            type: ev.type,
            payload: ev,
            accepted: true,
          },
        });
        acceptedCount += 1;

        if (ev.type === 'word_solved' && nextState.status === 'playing') {
          const deltaXp = Math.max(0, nextState.totalXp - currentState.totalXp);
          const ledgerKey = `solo:${sessionId}:c${String(currentState.chapter)}:s${String(currentState.wordIndex)}:solve`;
          const existingLedger = await tx.rewardLedger.findUnique({ where: { ledgerKey } });
          if (!existingLedger) {
            await tx.rewardLedger.create({
              data: {
                userId,
                ledgerKey,
                sessionId,
                xpDelta: deltaXp,
              },
            });
            xpCredited += deltaXp;
            runningProfileXp += deltaXp;
            runningWordsSolved += 1;
            runningHighScore = Math.max(runningHighScore, nextState.score);
            runningBestStreak = Math.max(runningBestStreak, nextState.bestChapterStreak);

            await tx.playerProfile.update({
              where: { userId },
              data: {
                xp: runningProfileXp,
                level: calculateLevel(runningProfileXp),
                highScore: runningHighScore,
                bestStreak: runningBestStreak,
                wordsSolved: runningWordsSolved,
              },
            });

            const existingDiff = await tx.playerDifficultyStats.findUnique({
              where: { userId_difficulty: { userId, difficulty: session.difficulty } },
            });
            await tx.playerDifficultyStats.upsert({
              where: { userId_difficulty: { userId, difficulty: session.difficulty } },
              create: {
                userId,
                difficulty: session.difficulty,
                unlocked: true,
                highScore: nextState.score,
                bestStreak: nextState.bestChapterStreak,
                wordsSolved: 1,
                runsCleared: 0,
              },
              update: {
                highScore: Math.max(existingDiff?.highScore ?? 0, nextState.score),
                bestStreak: Math.max(existingDiff?.bestStreak ?? 0, nextState.bestChapterStreak),
                wordsSolved: (existingDiff?.wordsSolved ?? 0) + 1,
              },
            });
          }
        } else if (ev.type === 'chapter_finished' && nextState.status === 'victory') {
          const deltaXp = Math.max(0, nextState.totalXp - currentState.totalXp);
          const ledgerKey = `solo:${sessionId}:c${String(currentState.chapter)}:victory`;
          const existingLedger = await tx.rewardLedger.findUnique({ where: { ledgerKey } });
          if (!existingLedger) {
            await tx.rewardLedger.create({
              data: {
                userId,
                ledgerKey,
                sessionId,
                xpDelta: deltaXp,
              },
            });
            xpCredited += deltaXp;
            runningProfileXp += deltaXp;
            runningConstellationsCleared += 1;
            runningHighScore = Math.max(runningHighScore, nextState.score);
            runningBestStreak = Math.max(runningBestStreak, nextState.bestChapterStreak);

            await tx.playerProfile.update({
              where: { userId },
              data: {
                xp: runningProfileXp,
                level: calculateLevel(runningProfileXp),
                highScore: runningHighScore,
                bestStreak: runningBestStreak,
                constellationsCleared: runningConstellationsCleared,
              },
            });

            const existingDiff = await tx.playerDifficultyStats.findUnique({
              where: { userId_difficulty: { userId, difficulty: session.difficulty } },
            });
            await tx.playerDifficultyStats.upsert({
              where: { userId_difficulty: { userId, difficulty: session.difficulty } },
              create: {
                userId,
                difficulty: session.difficulty,
                unlocked: true,
                completed: true,
                highScore: nextState.score,
                bestStreak: nextState.bestChapterStreak,
                wordsSolved: 0,
                runsCleared: 1,
              },
              update: {
                completed: true,
                highScore: Math.max(existingDiff?.highScore ?? 0, nextState.score),
                bestStreak: Math.max(existingDiff?.bestStreak ?? 0, nextState.bestChapterStreak),
                runsCleared: (existingDiff?.runsCleared ?? 0) + 1,
              },
            });
          }
        }

        currentState = nextState;
        currentSeq = ev.seq;
      }

      const nextStatus: SoloSessionStatus = currentState.status === 'failed' ? 'failed' : 'active';

      const updatedSession = await tx.gameSession.update({
        where: { id: sessionId },
        data: {
          state: currentState as unknown as Prisma.InputJsonValue,
          version: currentSeq,
          status: nextStatus,
        },
      });

      return {
        session: toSessionDto(updatedSession),
        idempotentReplay: false,
        acceptedCount,
        rejectedCount: rejectedEventIds.length,
        rejectedEventIds,
        xpCredited,
      };
    });
  }
}

function validatePlausibility(state: SoloState, ev: SoloSyncEventInput): string | null {
  switch (ev.type) {
    case 'chapter_started': {
      if (state.status !== 'idle' && state.status !== 'victory') {
        return 'INVALID_STATE_FOR_CHAPTER_START';
      }
      return null;
    }
    case 'word_solved': {
      if (state.status !== 'playing') {
        return 'SESSION_NOT_PLAYING';
      }
      if (ev.slot !== state.wordIndex) {
        return 'SLOT_MISMATCH';
      }
      const currentWord = state.slots[state.wordIndex];
      if (!currentWord) {
        return 'MISSING_SLOT';
      }
      if (
        typeof ev.answer !== 'string' ||
        ev.answer.trim().toLowerCase() !== currentWord.word.toLowerCase()
      ) {
        return 'ANSWER_MISMATCH';
      }
      const elapsedMs = ev.elapsedMs ?? (ev.elapsedSeconds ?? 0) * 1000;
      const minMs = MIN_MS_PER_CHAR * currentWord.word.length;
      if (elapsedMs < minMs) {
        return 'IMPOSSIBLE_SPEED';
      }
      return null;
    }
    case 'word_skipped': {
      if (state.status !== 'playing') {
        return 'SESSION_NOT_PLAYING';
      }
      if (ev.slot !== state.wordIndex) {
        return 'SLOT_MISMATCH';
      }
      return null;
    }
    case 'clock_expired': {
      if (state.status !== 'playing') {
        return 'SESSION_NOT_PLAYING';
      }
      return null;
    }
    case 'chapter_finished': {
      if (state.status !== 'playing') {
        return 'SESSION_NOT_PLAYING';
      }
      if (state.wordIndex < WORDS_PER_CHAPTER) {
        return 'CHAPTER_INCOMPLETE';
      }
      return null;
    }
  }
}

function toReducerEvent(
  difficulty: DifficultyKey,
  sessionSeed: number,
  ev: SoloSyncEventInput,
): SoloEvent {
  switch (ev.type) {
    case 'chapter_started':
      return {
        type: 'chapter_started',
        difficulty,
        chapter: ev.chapter ?? 1,
        seed: ev.seed ?? sessionSeed,
        keepRun: ev.keepRun,
        wordBank: ORIGINAL_WORDS,
      };
    case 'word_solved':
      return {
        type: 'word_solved',
        elapsedSeconds: ev.elapsedSeconds ?? 0,
        wordBank: ORIGINAL_WORDS,
      };
    case 'word_skipped':
      return {
        type: 'word_skipped',
        elapsedSeconds: ev.elapsedSeconds ?? 0,
        wordBank: ORIGINAL_WORDS,
      };
    case 'clock_expired':
      return { type: 'clock_expired' };
    case 'chapter_finished':
      return {
        type: 'chapter_finished',
        elapsedSeconds: ev.elapsedSeconds ?? 0,
      };
  }
}

function toSessionDto(row: {
  id: string;
  clientSessionId: string;
  seed: number;
  difficulty: string;
  style: string;
  wordBankVersion: string;
  status: string;
  abandonReason: string | null;
  version: number;
  state: unknown;
  updatedAt: Date;
}): SoloSessionDto {
  return {
    id: row.id,
    clientSessionId: row.clientSessionId,
    seed: row.seed,
    difficulty: row.difficulty as DifficultyKey,
    style: row.style as WayfaringStyle,
    wordBankVersion: row.wordBankVersion,
    status: row.status as SoloSessionStatus,
    abandonReason: row.abandonReason,
    version: row.version,
    state: SoloStateSchema.parse(row.state),
    updatedAt: row.updatedAt.toISOString(),
  };
}
