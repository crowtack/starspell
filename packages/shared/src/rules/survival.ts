import { EXPANDED_WORDS, type WordRecord, type WordTier } from '../data/wordBank.js';
import type { CompetitionRankInput, CompetitionRankedEntry } from './competition.js';
import type { DifficultyKey } from './difficulties.js';
import { SURVIVAL_MAX_WORDS } from './params.js';
import { pickWordForTier } from './planChapter.js';
import { deriveSeed, mulberry32 } from './prng.js';

const SURVIVAL_START_TIER: Record<DifficultyKey, WordTier> = {
  EASY: 1,
  INTERMEDIATE: 2,
  HARD: 3,
};

/**
 * GAME_RULES §12.4: slot tier = min(5, startTier + floor(slot / 5))
 * with startTier EASY 1, INTERMEDIATE 2, HARD 3.
 */
export function getSurvivalSlotTier(difficulty: DifficultyKey, slot: number): WordTier {
  const start = SURVIVAL_START_TIER[difficulty];
  const raw = start + Math.floor(Math.max(0, slot) / 5);
  return Math.min(5, raw) as WordTier;
}

export function planSurvivalChapter(params: {
  readonly seed: number;
  readonly difficulty: DifficultyKey;
  readonly wordBank?: readonly WordRecord[];
}): { readonly slots: readonly WordRecord[]; readonly usedWordIds: readonly string[] } {
  const bank = params.wordBank ?? EXPANDED_WORDS;
  const rng = mulberry32(deriveSeed(params.seed, 1, 0, 999));
  const slots: WordRecord[] = [];
  let usedWordIds: readonly string[] = [];

  for (let slot = 0; slot < SURVIVAL_MAX_WORDS; slot += 1) {
    const tier = getSurvivalSlotTier(params.difficulty, slot);
    const picked = pickWordForTier({
      rng,
      tier,
      usedWordIds,
      wordBank: bank,
    });
    slots.push(picked.word);
    usedWordIds = picked.usedWordIds;
  }

  return { slots, usedWordIds };
}

/**
 * GAME_RULES §12.4: Survival ranks by wordsSolved desc -> score desc ->
 * elapsedActiveMs asc -> userId asc. Forfeits always rank below non-forfeits.
 */
export function rankSurvivalResults<T extends CompetitionRankInput>(
  entries: readonly T[],
): CompetitionRankedEntry<T>[] {
  const nonForfeits = entries
    .filter((e) => e.outcome !== 'forfeit')
    .sort((a, b) => {
      if (b.wordsSolved !== a.wordsSolved) return b.wordsSolved - a.wordsSolved;
      if (b.score !== a.score) return b.score - a.score;
      if (a.elapsedActiveMs !== b.elapsedActiveMs) return a.elapsedActiveMs - b.elapsedActiveMs;
      return a.userId.localeCompare(b.userId);
    });

  const forfeits = entries
    .filter((e) => e.outcome === 'forfeit')
    .sort((a, b) => a.userId.localeCompare(b.userId));

  const ranked: CompetitionRankedEntry<T>[] = [];
  for (let i = 0; i < nonForfeits.length; i += 1) {
    const entry = nonForfeits[i];
    if (!entry) continue;
    ranked.push({ entry, rank: i + 1, isDraw: false });
  }

  const forfeitRank = nonForfeits.length + 1;
  const forfeitDraw = forfeits.length > 1;
  for (const entry of forfeits) {
    ranked.push({ entry, rank: forfeitRank, isDraw: forfeitDraw });
  }

  return ranked;
}
