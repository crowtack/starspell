import { K_PROVISIONAL, K_STANDARD, PROVISIONAL_MATCHES, RATING_FLOOR } from './params.js';

export interface RatingParticipantInput {
  readonly userId: string;
  readonly rating: number;
  readonly rankedMatches: number;
  readonly rank: number;
  readonly score: number;
  readonly wordsSolved: number;
  readonly outcome: 'finished' | 'forfeit' | 'interrupted';
}

export interface RatingChangeResult {
  readonly userId: string;
  readonly ratingBefore: number;
  readonly ratingAfter: number;
  readonly delta: number;
  readonly kFactor: number;
}

export function getKFactor(rankedMatches: number): number {
  return rankedMatches < PROVISIONAL_MATCHES ? K_PROVISIONAL : K_STANDARD;
}

/**
 * Computes Elo-style rating deltas per GAME_RULES.md §12.7:
 * - Only for N >= 2 players in a ranked, completed match.
 * - Forfeit loses against any non-forfeit; forfeit vs forfeit is 0.5.
 * - Otherwise actual = 0.5 if equal score and wordsSolved, 1 if ranked above, 0 if below.
 * - delta = round((K / (N - 1)) * sum_opp(actual - expected)), floored at RATING_FLOOR.
 */
export function calculateMatchRatings(
  participants: readonly RatingParticipantInput[],
): RatingChangeResult[] {
  const n = participants.length;
  if (n < 2) {
    return participants.map((p) => ({
      userId: p.userId,
      ratingBefore: p.rating,
      ratingAfter: p.rating,
      delta: 0,
      kFactor: getKFactor(p.rankedMatches),
    }));
  }

  return participants.map((self) => {
    const k = getKFactor(self.rankedMatches);
    let sumDiff = 0;

    for (const opp of participants) {
      if (opp.userId === self.userId) continue;

      let actual: number;
      if (self.outcome === 'forfeit' && opp.outcome !== 'forfeit') {
        actual = 0;
      } else if (self.outcome !== 'forfeit' && opp.outcome === 'forfeit') {
        actual = 1;
      } else if (self.outcome === 'forfeit' && opp.outcome === 'forfeit') {
        actual = 0.5;
      } else if (self.score === opp.score && self.wordsSolved === opp.wordsSolved) {
        actual = 0.5;
      } else {
        actual = self.rank < opp.rank ? 1 : 0;
      }

      const expected = 1 / (1 + Math.pow(10, (opp.rating - self.rating) / 400));
      sumDiff += actual - expected;
    }

    const rawDelta = Math.round((k / (n - 1)) * sumDiff);
    const unclampedAfter = self.rating + rawDelta;
    const ratingAfter = Math.max(RATING_FLOOR, unclampedAfter);
    const delta = ratingAfter - self.rating;

    return {
      userId: self.userId,
      ratingBefore: self.rating,
      ratingAfter,
      delta,
      kFactor: k,
    };
  });
}
