import { ORIGINAL_WORDS, type WordRecord } from '../data/wordBank.js';
import { applySkipPenalty, applySolveTimeBonus } from './clock.js';
import { DIFFICULTY_CONFIGS, type DifficultyKey } from './difficulties.js';
import { SKIP_USES_BOOSTED_TIER, WORDS_PER_CHAPTER } from './params.js';
import { getSlotTier, pickWordForTier, planChapter } from './planChapter.js';
import { deriveSeed, mulberry32 } from './prng.js';
import { calculateLevel, calculateTimeBonusXp, scoreWordSolve } from './scoring.js';

export type SoloStatus = 'idle' | 'playing' | 'victory' | 'failed';

export interface SoloState {
  readonly status: SoloStatus;
  readonly difficulty: DifficultyKey;
  readonly chapter: number;
  readonly seed: number;
  readonly wordIndex: number;
  readonly slots: readonly WordRecord[];
  readonly usedWordIds: readonly string[];
  readonly skipCount: number;
  readonly score: number;
  readonly streak: number;
  readonly bestChapterStreak: number;
  readonly chapterXp: number;
  readonly totalXp: number;
  readonly level: number;
  readonly timeLeft: number;
  readonly wordsSolved: number;
  readonly constellationsCleared: number;
  readonly runsCleared: number;
  readonly missedWord: WordRecord | null;
}

export type SoloEvent =
  | {
      readonly type: 'chapter_started';
      readonly difficulty: DifficultyKey;
      readonly chapter: number;
      readonly seed: number;
      readonly keepRun?: boolean;
      readonly wordBank?: readonly WordRecord[];
    }
  | {
      readonly type: 'word_solved';
      readonly elapsedSeconds?: number;
      readonly wordBank?: readonly WordRecord[];
    }
  | {
      readonly type: 'word_skipped';
      readonly elapsedSeconds?: number;
      readonly wordBank?: readonly WordRecord[];
    }
  | {
      readonly type: 'clock_expired';
    }
  | {
      readonly type: 'chapter_finished';
      readonly elapsedSeconds?: number;
    };

export function createInitialSoloState(overrides: Partial<SoloState> = {}): SoloState {
  const difficulty = overrides.difficulty ?? 'EASY';
  const totalXp = overrides.totalXp ?? 0;
  return {
    status: 'idle',
    difficulty,
    chapter: 1,
    seed: 0,
    wordIndex: 0,
    slots: [],
    usedWordIds: [],
    skipCount: 0,
    score: 0,
    streak: 0,
    bestChapterStreak: 0,
    chapterXp: 0,
    totalXp,
    level: calculateLevel(totalXp),
    timeLeft: DIFFICULTY_CONFIGS[difficulty].initialClock,
    wordsSolved: 0,
    constellationsCleared: 0,
    runsCleared: 0,
    missedWord: null,
    ...overrides,
  };
}

function handleChapterStarted(
  state: SoloState,
  event: Extract<SoloEvent, { type: 'chapter_started' }>,
): SoloState {
  const chapter = Math.max(1, Math.trunc(event.chapter));
  const keepRun = event.keepRun ?? chapter > 1;
  const cfg = DIFFICULTY_CONFIGS[event.difficulty];
  const startingUsedIds = keepRun ? state.usedWordIds : [];
  const plan = planChapter({
    seed: event.seed,
    difficulty: event.difficulty,
    chapter,
    usedWordIds: startingUsedIds,
    wordBank: event.wordBank ?? ORIGINAL_WORDS,
  });

  const carriedScore = keepRun ? state.score : 0;
  const carriedStreak = keepRun ? state.streak : 0;

  return {
    ...state,
    status: 'playing',
    difficulty: event.difficulty,
    chapter,
    seed: event.seed,
    wordIndex: 0,
    slots: plan.slots,
    usedWordIds: plan.usedWordIds,
    skipCount: 0,
    score: carriedScore,
    streak: carriedStreak,
    bestChapterStreak: carriedStreak,
    chapterXp: 0,
    timeLeft: cfg.initialClock,
    missedWord: null,
  };
}

function handleWordSolved(
  state: SoloState,
  event: Extract<SoloEvent, { type: 'word_solved' }>,
): SoloState {
  if (state.status !== 'playing') {
    return state;
  }
  const currentWord = state.slots[state.wordIndex];
  if (!currentWord) {
    return state;
  }

  const elapsed = Math.max(0, event.elapsedSeconds ?? 0);
  const timeAfterElapsed = Math.max(0, state.timeLeft - elapsed);
  if (timeAfterElapsed <= 0) {
    return {
      ...state,
      status: 'failed',
      timeLeft: 0,
      missedWord: currentWord,
    };
  }

  const cfg = DIFFICULTY_CONFIGS[state.difficulty];
  const scored = scoreWordSolve(currentWord.word.length, cfg, state.streak);
  const nextTotalXp = state.totalXp + scored.wordXp;

  return {
    ...state,
    wordIndex: state.wordIndex + 1,
    score: state.score + scored.wordPoints,
    streak: scored.nextStreak,
    bestChapterStreak: Math.max(state.bestChapterStreak, scored.nextStreak),
    chapterXp: state.chapterXp + scored.wordXp,
    totalXp: nextTotalXp,
    level: calculateLevel(nextTotalXp),
    timeLeft: applySolveTimeBonus(timeAfterElapsed, cfg),
    wordsSolved: state.wordsSolved + 1,
  };
}

function handleWordSkipped(
  state: SoloState,
  event: Extract<SoloEvent, { type: 'word_skipped' }>,
): SoloState {
  if (state.status !== 'playing') {
    return state;
  }
  const currentWord = state.slots[state.wordIndex];
  if (!currentWord) {
    return state;
  }

  const cfg = DIFFICULTY_CONFIGS[state.difficulty];
  const elapsed = Math.max(0, event.elapsedSeconds ?? 0);
  const timeAfterElapsed = Math.max(0, state.timeLeft - elapsed);
  const nextTimeLeft = applySkipPenalty(timeAfterElapsed, cfg);

  if (nextTimeLeft <= 0) {
    return {
      ...state,
      status: 'failed',
      streak: 0,
      timeLeft: 0,
      missedWord: currentWord,
    };
  }

  const tier = getSlotTier(
    state.difficulty,
    state.wordIndex,
    state.chapter,
    SKIP_USES_BOOSTED_TIER,
  );
  const rng = mulberry32(deriveSeed(state.seed, state.chapter, state.wordIndex, state.skipCount));
  const picked = pickWordForTier({
    rng,
    tier,
    usedWordIds: state.usedWordIds,
    wordBank: event.wordBank ?? ORIGINAL_WORDS,
  });

  const nextSlots = state.slots.map((slot, idx) => (idx === state.wordIndex ? picked.word : slot));

  return {
    ...state,
    slots: nextSlots,
    usedWordIds: picked.usedWordIds,
    skipCount: state.skipCount + 1,
    streak: 0,
    timeLeft: nextTimeLeft,
  };
}

function handleClockExpired(state: SoloState): SoloState {
  if (state.status !== 'playing') {
    return state;
  }
  const currentWord = state.slots[state.wordIndex] ?? null;
  return {
    ...state,
    status: 'failed',
    timeLeft: 0,
    missedWord: currentWord,
  };
}

function handleChapterFinished(
  state: SoloState,
  event: Extract<SoloEvent, { type: 'chapter_finished' }>,
): SoloState {
  if (state.status !== 'playing') {
    return state;
  }

  const elapsed = Math.max(0, event.elapsedSeconds ?? 0);
  const finalTimeLeft = Math.max(0, state.timeLeft - elapsed);

  if (state.wordIndex >= WORDS_PER_CHAPTER && finalTimeLeft > 0) {
    const cfg = DIFFICULTY_CONFIGS[state.difficulty];
    const timeBonusXp = calculateTimeBonusXp(finalTimeLeft, cfg);
    const nextTotalXp = state.totalXp + timeBonusXp;
    return {
      ...state,
      status: 'victory',
      timeLeft: finalTimeLeft,
      chapterXp: state.chapterXp + timeBonusXp,
      totalXp: nextTotalXp,
      level: calculateLevel(nextTotalXp),
      constellationsCleared: state.constellationsCleared + 1,
      runsCleared: state.runsCleared + 1,
      missedWord: null,
    };
  }

  return {
    ...state,
    status: 'failed',
    timeLeft: finalTimeLeft,
    missedWord: state.slots[state.wordIndex] ?? null,
  };
}

export function reduce(state: SoloState, event: SoloEvent): SoloState {
  switch (event.type) {
    case 'chapter_started':
      return handleChapterStarted(state, event);
    case 'word_solved':
      return handleWordSolved(state, event);
    case 'word_skipped':
      return handleWordSkipped(state, event);
    case 'clock_expired':
      return handleClockExpired(state);
    case 'chapter_finished':
      return handleChapterFinished(state, event);
  }
}
