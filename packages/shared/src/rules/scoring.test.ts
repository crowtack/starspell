import { describe, expect, it } from 'vitest';
import {
  applySkipPenalty,
  applySolveTimeBonus,
  clampFrameDelta,
  getClockWarningLevel,
} from './clock.js';
import { DIFFICULTY_CONFIGS, DIFFICULTY_KEYS, isDifficultyKey } from './difficulties.js';
import {
  calculateLevel,
  calculateTimeBonusXp,
  calculateWordPoints,
  calculateWordXp,
  scoreWordSolve,
} from './scoring.js';
import {
  getExactStreakMilestone,
  getStreakGlow,
  getStreakMilestone,
  getStreakMultiplier,
  STREAK_MILESTONES,
} from './streaks.js';

describe('scoring golden vectors (GAME_RULES §3)', () => {
  it('matches all word scoring golden vectors', () => {
    // EASY, length 6, streak 1 -> points 150, XP 60
    const easy1 = scoreWordSolve(6, DIFFICULTY_CONFIGS.EASY, 0);
    expect(easy1.nextStreak).toBe(1);
    expect(easy1.wordPoints).toBe(150);
    expect(easy1.wordXp).toBe(60);

    // INTERMEDIATE, length 8, streak 3 -> points 325, XP 130
    const inter3 = scoreWordSolve(8, DIFFICULTY_CONFIGS.INTERMEDIATE, 2);
    expect(inter3.nextStreak).toBe(3);
    expect(inter3.multiplier).toBe(1.25);
    expect(inter3.wordPoints).toBe(325);
    expect(inter3.wordXp).toBe(130);
    expect(inter3.milestone?.label).toBe('STREAK ×3');

    // HARD, length 5, streak 5 -> points 309, XP 124
    const hard5 = scoreWordSolve(5, DIFFICULTY_CONFIGS.HARD, 4);
    expect(hard5.nextStreak).toBe(5);
    expect(hard5.multiplier).toBe(1.5);
    expect(hard5.wordPoints).toBe(309);
    expect(hard5.wordXp).toBe(124);
    expect(hard5.milestone?.label).toBe('COMBO ×5');

    // HARD, length 15, streak 20 -> points 1856, XP 742
    const hard20 = scoreWordSolve(15, DIFFICULTY_CONFIGS.HARD, 19);
    expect(hard20.nextStreak).toBe(20);
    expect(hard20.multiplier).toBe(3.0);
    expect(hard20.wordPoints).toBe(1856);
    expect(hard20.wordXp).toBe(742);
    expect(hard20.milestone?.label).toBe('LEGENDARY');
  });

  it('matches direct helper functions and time bonus golden vectors', () => {
    expect(calculateWordPoints(6, 1.0, 1)).toBe(150);
    expect(calculateWordXp(150)).toBe(60);

    // HARD victory, 12.34 s left -> time bonus 244
    expect(calculateTimeBonusXp(12.34, DIFFICULTY_CONFIGS.HARD)).toBe(244);

    // INTERMEDIATE victory, 30 s left -> time bonus 468
    expect(calculateTimeBonusXp(30, DIFFICULTY_CONFIGS.INTERMEDIATE)).toBe(468);

    // Negative timeLeft clamps to 0
    expect(calculateTimeBonusXp(-2, DIFFICULTY_CONFIGS.EASY)).toBe(0);
  });

  it('matches level boundaries', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(599)).toBe(1);
    expect(calculateLevel(600)).toBe(2);
    expect(calculateLevel(1199)).toBe(2);
    expect(calculateLevel(1200)).toBe(3);
    expect(calculateLevel(-100)).toBe(1);
  });
});

describe('streaks and difficulties', () => {
  it('returns correct streak multipliers, milestones, and glow radii', () => {
    expect(STREAK_MILESTONES).toHaveLength(5);
    expect(getStreakMultiplier(0)).toBe(1.0);
    expect(getStreakMultiplier(2)).toBe(1.0);
    expect(getStreakMultiplier(3)).toBe(1.25);
    expect(getStreakMultiplier(5)).toBe(1.5);
    expect(getStreakMultiplier(8)).toBe(2.0);
    expect(getStreakMultiplier(12)).toBe(2.5);
    expect(getStreakMultiplier(20)).toBe(3.0);

    expect(getStreakMilestone(2)).toBeNull();
    expect(getStreakMilestone(9)?.label).toBe('OVERDRIVE');
    expect(getExactStreakMilestone(4)).toBeNull();
    expect(getExactStreakMilestone(12)?.label).toBe('UNSTOPPABLE');

    expect(getStreakGlow(0)).toBe('22px');
    expect(getStreakGlow(3)).toBe('28px');
    expect(getStreakGlow(5)).toBe('34px');
    expect(getStreakGlow(8)).toBe('40px');
    expect(getStreakGlow(12)).toBe('46px');
    expect(getStreakGlow(20)).toBe('54px');
  });

  it('validates difficulty keys and preset curves', () => {
    expect(DIFFICULTY_KEYS).toEqual(['EASY', 'INTERMEDIATE', 'HARD']);
    expect(isDifficultyKey('EASY')).toBe(true);
    expect(isDifficultyKey('INTERMEDIATE')).toBe(true);
    expect(isDifficultyKey('HARD')).toBe(true);
    expect(isDifficultyKey('EXPERT')).toBe(false);
    expect(isDifficultyKey(null)).toBe(false);

    expect(DIFFICULTY_CONFIGS.EASY.initialClock).toBe(45.0);
    expect(DIFFICULTY_CONFIGS.INTERMEDIATE.initialClock).toBe(42.0);
    expect(DIFFICULTY_CONFIGS.HARD.initialClock).toBe(38.0);
    for (const key of DIFFICULTY_KEYS) {
      expect(DIFFICULTY_CONFIGS[key].tierCurve).toHaveLength(15);
    }
  });
});

describe('clock helpers', () => {
  it('caps solve bonus at initialClock + 15 and floors skip penalty at 0', () => {
    expect(applySolveTimeBonus(40, DIFFICULTY_CONFIGS.EASY)).toBe(43.2);
    expect(applySolveTimeBonus(59, DIFFICULTY_CONFIGS.EASY)).toBe(60);
    expect(applySkipPenalty(10, DIFFICULTY_CONFIGS.HARD)).toBe(6);
    expect(applySkipPenalty(2, DIFFICULTY_CONFIGS.HARD)).toBe(0);
  });

  it('clamps frame delta and classifies warning levels', () => {
    expect(clampFrameDelta(0.016)).toBe(0.016);
    expect(clampFrameDelta(0.5)).toBe(0.1);
    expect(clampFrameDelta(-1)).toBe(0);
    expect(clampFrameDelta(Number.NaN)).toBe(0);

    expect(getClockWarningLevel(20)).toBe('normal');
    expect(getClockWarningLevel(15)).toBe('normal');
    expect(getClockWarningLevel(14.9)).toBe('amber');
    expect(getClockWarningLevel(5)).toBe('amber');
    expect(getClockWarningLevel(4.9)).toBe('eclipse');
  });
});
