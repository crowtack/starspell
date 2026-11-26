import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  rankCompetitionResults,
} from './competition.js';
import { mulberry32 } from './prng.js';

describe('competition rules', () => {
  it('normalizes and validates room codes without I, O, 0, 1', () => {
    expect(normalizeRoomCode(' ab-cd2 ')).toBe('ABCD2');
    expect(isValidRoomCode('ABCD2')).toBe(true);
    expect(isValidRoomCode('ABCDE')).toBe(true);
    expect(isValidRoomCode('ABCDO')).toBe(false);
    expect(isValidRoomCode('ABCDI')).toBe(false);
    expect(isValidRoomCode('ABCD0')).toBe(false);
    expect(isValidRoomCode('ABCD1')).toBe(false);
    const code = generateRoomCode(mulberry32(42));
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('ranks by score desc -> wordsSolved desc -> elapsedActiveMs asc -> userId asc', () => {
    const ranked = rankCompetitionResults([
      {
        userId: 'u_slow',
        outcome: 'finished',
        score: 1000,
        wordsSolved: 15,
        elapsedActiveMs: 45_000,
      },
      {
        userId: 'u_fast',
        outcome: 'finished',
        score: 1000,
        wordsSolved: 15,
        elapsedActiveMs: 30_000,
      },
      {
        userId: 'u_top',
        outcome: 'finished',
        score: 1200,
        wordsSolved: 15,
        elapsedActiveMs: 50_000,
      },
      {
        userId: 'u_fewer',
        outcome: 'finished',
        score: 1000,
        wordsSolved: 12,
        elapsedActiveMs: 20_000,
      },
      {
        userId: 'u_tie_b',
        outcome: 'finished',
        score: 800,
        wordsSolved: 10,
        elapsedActiveMs: 25_000,
      },
      {
        userId: 'u_tie_a',
        outcome: 'finished',
        score: 800,
        wordsSolved: 10,
        elapsedActiveMs: 25_000,
      },
    ]);

    expect(ranked.map((r) => r.entry.userId)).toEqual([
      'u_top',
      'u_fast',
      'u_slow',
      'u_fewer',
      'u_tie_a',
      'u_tie_b',
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('places forfeits below all non-forfeits and marks forfeit vs forfeit as draw', () => {
    const ranked = rankCompetitionResults([
      {
        userId: 'u_forfeit_1',
        outcome: 'forfeit',
        score: 9999,
        wordsSolved: 14,
        elapsedActiveMs: 10_000,
      },
      {
        userId: 'u_fin_low',
        outcome: 'finished',
        score: 100,
        wordsSolved: 2,
        elapsedActiveMs: 60_000,
      },
      {
        userId: 'u_forfeit_2',
        outcome: 'forfeit',
        score: 500,
        wordsSolved: 3,
        elapsedActiveMs: 12_000,
      },
    ]);

    expect(ranked[0]?.entry.userId).toBe('u_fin_low');
    expect(ranked[0]?.rank).toBe(1);
    expect(ranked[0]?.isDraw).toBe(false);

    expect(ranked[1]?.rank).toBe(2);
    expect(ranked[1]?.isDraw).toBe(true);
    expect(ranked[2]?.rank).toBe(2);
    expect(ranked[2]?.isDraw).toBe(true);
  });
});
