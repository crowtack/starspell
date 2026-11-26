import type { DifficultyConfig } from './difficulties.js';
import {
  POINTS_PER_CHAR,
  TIME_BONUS_XP_PER_SECOND,
  XP_PER_LEVEL,
  XP_PER_POINT_RATIO,
} from './params.js';
import { getExactStreakMilestone, getStreakMultiplier, type StreakMilestone } from './streaks.js';

export interface WordSolveScoreResult {
  readonly nextStreak: number;
  readonly multiplier: number;
  readonly wordPoints: number;
  readonly wordXp: number;
  readonly milestone: StreakMilestone | null;
}

/**
 * Computes points for a solved word using the exact prototype operation order.
 * Expects streakAfterIncrement (streak is incremented before multiplier lookup).
 */
export function calculateWordPoints(
  wordLength: number,
  xpMultiplier: number,
  streakAfterIncrement: number,
): number {
  const mult = getStreakMultiplier(streakAfterIncrement);
  return Math.round(wordLength * POINTS_PER_CHAR * xpMultiplier * mult);
}

export function calculateWordXp(wordPoints: number): number {
  return Math.round(wordPoints * XP_PER_POINT_RATIO);
}

export function scoreWordSolve(
  wordLength: number,
  difficulty: DifficultyConfig,
  currentStreak: number,
): WordSolveScoreResult {
  const nextStreak = currentStreak + 1;
  const multiplier = getStreakMultiplier(nextStreak);
  const wordPoints = calculateWordPoints(wordLength, difficulty.xpMultiplier, nextStreak);
  const wordXp = calculateWordXp(wordPoints);
  const milestone = getExactStreakMilestone(nextStreak);

  return {
    nextStreak,
    multiplier,
    wordPoints,
    wordXp,
    milestone,
  };
}

export function calculateTimeBonusXp(
  timeLeftSeconds: number,
  difficulty: DifficultyConfig,
): number {
  return Math.round(
    Math.max(0, timeLeftSeconds) * TIME_BONUS_XP_PER_SECOND * difficulty.xpMultiplier,
  );
}

export function calculateLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.max(0, totalXp) / XP_PER_LEVEL) + 1);
}
