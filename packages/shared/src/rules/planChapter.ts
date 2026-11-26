import { ORIGINAL_WORDS, type WordRecord, type WordTier } from '../data/wordBank.js';
import { DIFFICULTY_CONFIGS, type DifficultyKey } from './difficulties.js';
import { MAX_CHAPTER_TIER_BOOST, MAX_TIER, MIN_TIER } from './params.js';
import { mulberry32, pickIndex, type SeededRng } from './prng.js';

export interface PickWordParams {
  readonly rng: SeededRng;
  readonly tier: WordTier;
  readonly usedWordIds: readonly string[] | ReadonlySet<string>;
  readonly wordBank?: readonly WordRecord[];
}

export interface PickWordResult {
  readonly word: WordRecord;
  readonly usedWordIds: string[];
}

export interface PlanChapterParams {
  readonly seed: number;
  readonly difficulty: DifficultyKey;
  readonly chapter: number;
  readonly usedWordIds: readonly string[] | ReadonlySet<string>;
  readonly wordBank?: readonly WordRecord[];
}

export interface PlanChapterResult {
  readonly slots: WordRecord[];
  readonly usedWordIds: string[];
}

export function clampTier(tier: number): WordTier {
  const clamped = Math.min(MAX_TIER, Math.max(MIN_TIER, Math.trunc(tier)));
  return clamped as WordTier;
}

export function getChapterBoost(chapter: number): number {
  const normalizedChapter = Math.max(1, Math.trunc(chapter));
  return Math.min(MAX_CHAPTER_TIER_BOOST, Math.floor((normalizedChapter - 1) / 2));
}

export function getSlotTier(
  difficulty: DifficultyKey,
  slotIndex: number,
  chapter: number,
  applyBoost = true,
): WordTier {
  const curve = DIFFICULTY_CONFIGS[difficulty].tierCurve;
  const baseTier = curve[slotIndex] ?? 3;
  const boost = applyBoost ? getChapterBoost(chapter) : 0;
  return clampTier(baseTier + boost);
}

export function pickWordForTier({
  rng,
  tier,
  usedWordIds,
  wordBank = ORIGINAL_WORDS,
}: PickWordParams): PickWordResult {
  const tierPool = wordBank.filter((item) => item.tier === tier);
  const pool = tierPool.length > 0 ? tierPool : wordBank.filter((item) => item.tier === 1);
  if (pool.length === 0) {
    throw new Error(`No words available for tier ${String(tier)}`);
  }

  const nextUsed = new Set<string>(usedWordIds);
  let available = pool.filter((item) => !nextUsed.has(item.id));
  if (available.length === 0) {
    for (const item of pool) {
      nextUsed.delete(item.id);
    }
    available = pool;
  }

  const chosen = available[pickIndex(rng, available.length)];
  if (!chosen) {
    throw new Error(`Failed to pick word for tier ${String(tier)}`);
  }
  nextUsed.add(chosen.id);

  return {
    word: chosen,
    usedWordIds: Array.from(nextUsed),
  };
}

export function planChapter({
  seed,
  difficulty,
  chapter,
  usedWordIds,
  wordBank = ORIGINAL_WORDS,
}: PlanChapterParams): PlanChapterResult {
  const rng = mulberry32(seed);
  const curve = DIFFICULTY_CONFIGS[difficulty].tierCurve;
  const boost = getChapterBoost(chapter);

  let currentUsed: readonly string[] | ReadonlySet<string> = usedWordIds;
  const slots: WordRecord[] = [];

  for (const baseTier of curve) {
    const tier = clampTier(baseTier + boost);
    const picked = pickWordForTier({
      rng,
      tier,
      usedWordIds: currentUsed,
      wordBank,
    });
    slots.push(picked.word);
    currentUsed = picked.usedWordIds;
  }

  return {
    slots,
    usedWordIds: Array.from(new Set(currentUsed)),
  };
}
