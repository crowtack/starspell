import { describe, expect, it } from 'vitest';
import { calculateMatchRatings } from './rating.js';

describe('Elo-style rating rules (GAME_RULES §12.7)', () => {
  it('vector 1: two players at 1000, K=32 -> winner +16, loser -16', () => {
    const res = calculateMatchRatings([
      {
        userId: 'winner',
        rating: 1000,
        rankedMatches: 0,
        rank: 1,
        score: 500,
        wordsSolved: 15,
        outcome: 'finished',
      },
      {
        userId: 'loser',
        rating: 1000,
        rankedMatches: 0,
        rank: 2,
        score: 300,
        wordsSolved: 10,
        outcome: 'finished',
      },
    ]);

    expect(res.find((r) => r.userId === 'winner')?.delta).toBe(16);
    expect(res.find((r) => r.userId === 'winner')?.ratingAfter).toBe(1016);
    expect(res.find((r) => r.userId === 'loser')?.delta).toBe(-16);
    expect(res.find((r) => r.userId === 'loser')?.ratingAfter).toBe(984);
  });

  it('vector 2: three players at 1000 ranked 1/2/3, K=32 -> +16, 0, -16', () => {
    const res = calculateMatchRatings([
      {
        userId: 'p1',
        rating: 1000,
        rankedMatches: 0,
        rank: 1,
        score: 900,
        wordsSolved: 15,
        outcome: 'finished',
      },
      {
        userId: 'p2',
        rating: 1000,
        rankedMatches: 0,
        rank: 2,
        score: 700,
        wordsSolved: 12,
        outcome: 'finished',
      },
      {
        userId: 'p3',
        rating: 1000,
        rankedMatches: 0,
        rank: 3,
        score: 500,
        wordsSolved: 10,
        outcome: 'finished',
      },
    ]);

    expect(res.find((r) => r.userId === 'p1')?.delta).toBe(16);
    expect(res.find((r) => r.userId === 'p2')?.delta).toBe(0);
    expect(res.find((r) => r.userId === 'p3')?.delta).toBe(-16);
  });

  it('counts forfeit as a loss even with higher score and enforces RATING_FLOOR', () => {
    const res = calculateMatchRatings([
      {
        userId: 'finisher',
        rating: 1000,
        rankedMatches: 25,
        rank: 1,
        score: 100,
        wordsSolved: 2,
        outcome: 'finished',
      },
      {
        userId: 'forfeiter',
        rating: 1000,
        rankedMatches: 25,
        rank: 2,
        score: 900,
        wordsSolved: 14,
        outcome: 'forfeit',
      },
    ]);

    const fin = res.find((r) => r.userId === 'finisher');
    const forf = res.find((r) => r.userId === 'forfeiter');
    expect(fin?.kFactor).toBe(24);
    expect(fin?.delta).toBe(12);
    expect(forf?.delta).toBe(-12);

    const floorRes = calculateMatchRatings([
      {
        userId: 'w',
        rating: 105,
        rankedMatches: 25,
        rank: 1,
        score: 200,
        wordsSolved: 5,
        outcome: 'finished',
      },
      {
        userId: 'l',
        rating: 105,
        rankedMatches: 25,
        rank: 2,
        score: 100,
        wordsSolved: 2,
        outcome: 'forfeit',
      },
    ]);
    expect(floorRes.find((r) => r.userId === 'l')?.ratingAfter).toBe(100);
  });
});
