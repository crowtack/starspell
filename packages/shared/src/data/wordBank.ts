import originalWordsJson from './original-words.json' with { type: 'json' };
import expansionV1Json from './words/expansion-v1.json' with { type: 'json' };
import { MIN_WORDS_PER_TIER_FOR_SURVIVAL } from '../rules/params.js';

export type WordTier = 1 | 2 | 3 | 4 | 5;

export interface WordRecord {
  readonly id: string;
  readonly word: string;
  readonly tier: WordTier;
  readonly definition: string;
}

export const ORIGINAL_WORDS_VERSION = 'original-v1';
export const EXPANDED_WORDS_VERSION = 'expanded-v1';

export const ORIGINAL_WORDS: readonly WordRecord[] = originalWordsJson as WordRecord[];

export const EXPANDED_WORDS: readonly WordRecord[] = [
  ...ORIGINAL_WORDS,
  ...(
    expansionV1Json as Array<{
      id: string;
      word: string;
      tier: WordTier;
      definition: string;
    }>
  ).map((w) => ({
    id: w.id,
    word: w.word,
    tier: w.tier,
    definition: w.definition,
  })),
];

export function getWordCountsByTier(
  bank: readonly WordRecord[] = EXPANDED_WORDS,
): Record<WordTier, number> {
  const counts: Record<WordTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const w of bank) {
    counts[w.tier] += 1;
  }
  return counts;
}

export function isSurvivalEnabled(bank: readonly WordRecord[] = EXPANDED_WORDS): boolean {
  const counts = getWordCountsByTier(bank);
  return ([1, 2, 3, 4, 5] as const).every(
    (tier) => counts[tier] >= MIN_WORDS_PER_TIER_FOR_SURVIVAL,
  );
}
