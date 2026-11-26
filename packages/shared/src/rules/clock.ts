import type { DifficultyConfig } from './difficulties.js';
import {
  CLOCK_CAP_BONUS_SECONDS,
  CLOCK_WARNING_AMBER_SECONDS,
  CLOCK_WARNING_RED_SECONDS,
  MAX_FRAME_DELTA_SECONDS,
} from './params.js';

export type ClockWarningLevel = 'normal' | 'amber' | 'eclipse';

export function applySolveTimeBonus(timeLeft: number, difficulty: DifficultyConfig): number {
  return Math.min(
    difficulty.initialClock + CLOCK_CAP_BONUS_SECONDS,
    timeLeft + difficulty.solveBonus,
  );
}

export function applySkipPenalty(timeLeft: number, difficulty: DifficultyConfig): number {
  return Math.max(0, timeLeft - difficulty.skipPenalty);
}

export function clampFrameDelta(deltaSeconds: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return 0;
  }
  return Math.min(MAX_FRAME_DELTA_SECONDS, deltaSeconds);
}

export function getClockWarningLevel(timeLeft: number): ClockWarningLevel {
  if (timeLeft < CLOCK_WARNING_RED_SECONDS) {
    return 'eclipse';
  }
  if (timeLeft < CLOCK_WARNING_AMBER_SECONDS) {
    return 'amber';
  }
  return 'normal';
}
