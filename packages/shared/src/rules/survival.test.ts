import { describe, expect, it } from 'vitest';
import { EXPANDED_WORDS, isSurvivalEnabled } from '../data/wordBank.js';
import { SURVIVAL_MAX_WORDS } from './params.js';
import { getSurvivalSlotTier, planSurvivalChapter, rankSurvivalResults } from './survival.js';

describe('survival rules (GAME_RULES §12.4 & §12.5)', () => {
  it('passes vocabulary gate with >= 60 words per tier', () => {
    expect(isSurvivalEnabled(EXPANDED_WORDS)).toBe(true);
  });

  it('computes slot tier progression min(5, startTier + floor(slot / 5))', () => {
    expect(getSurvivalSlotTier('EASY', 0)).toBe(1);
    expect(getSurvivalSlotTier('EASY', 5)).toBe(2);
    expect(getSurvivalSlotTier('EASY', 20)).toBe(5);
    expect(getSurvivalSlotTier('EASY', 59)).toBe(5);
    expect(getSurvivalSlotTier('INTERMEDIATE', 0)).toBe(2);
    expect(getSurvivalSlotTier('HARD', 0)).toBe(3);
    expect(getSurvivalSlotTier('HARD', 10)).toBe(5);
  });

  it('plans 60 unique slots deterministically', () => {
    const plan = planSurvivalChapter({ seed: 4242, difficulty: 'HARD' });
    expect(plan.slots.length).toBe(SURVIVAL_MAX_WORDS);
    expect(new Set(plan.slots.map((s) => s.id)).size).toBe(SURVIVAL_MAX_WORDS);
  });

  it('ranks survival by wordsSolved desc -> score desc -> elapsedActiveMs asc', () => {
    const ranked = rankSurvivalResults([
      {
        userId: 'u_high_score',
        outcome: 'finished',
        wordsSolved: 20,
        score: 9000,
        elapsedActiveMs: 40_000,
      },
      {
        userId: 'u_more_words',
        outcome: 'finished',
        wordsSolved: 22,
        score: 5000,
        elapsedActiveMs: 60_000,
      },
      {
        userId: 'u_forfeit',
        outcome: 'forfeit',
        wordsSolved: 50,
        score: 99999,
        elapsedActiveMs: 10_000,
      },
    ]);

    expect(ranked.map((r) => r.entry.userId)).toEqual([
      'u_more_words',
      'u_high_score',
      'u_forfeit',
    ]);
  });
});
