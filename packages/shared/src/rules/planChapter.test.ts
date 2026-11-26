import { describe, expect, it } from 'vitest';
import { ORIGINAL_WORDS, type WordRecord } from '../data/wordBank.js';
import { DIFFICULTY_CONFIGS } from './difficulties.js';
import {
  clampTier,
  getChapterBoost,
  getSlotTier,
  pickWordForTier,
  planChapter,
} from './planChapter.js';
import { deriveSeed, mulberry32, pickIndex } from './prng.js';

describe('prng', () => {
  it('is deterministic for a given seed and mixes derived seeds cleanly', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    const seqC = [c(), c(), c(), c()];

    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }

    expect(deriveSeed(42, 1, 2, 0)).toBe(deriveSeed(42, 1, 2, 0));
    expect(deriveSeed(42, 1, 2, 0)).not.toBe(deriveSeed(42, 1, 2, 1));
  });

  it('throws on empty pickIndex', () => {
    const rng = mulberry32(1);
    expect(() => pickIndex(rng, 0)).toThrow();
    expect(pickIndex(rng, 5)).toBeGreaterThanOrEqual(0);
    expect(pickIndex(rng, 5)).toBeLessThan(5);
  });
});

describe('planChapter', () => {
  it('produces identical plans for the same seed and different plans for different seeds', () => {
    const p1 = planChapter({
      seed: 12345,
      difficulty: 'EASY',
      chapter: 1,
      usedWordIds: [],
    });
    const p2 = planChapter({
      seed: 12345,
      difficulty: 'EASY',
      chapter: 1,
      usedWordIds: [],
    });
    const p3 = planChapter({
      seed: 99999,
      difficulty: 'EASY',
      chapter: 1,
      usedWordIds: [],
    });

    expect(p1).toEqual(p2);
    expect(p1.slots).toHaveLength(15);
    expect(p1.slots.map((w) => w.id)).not.toEqual(p3.slots.map((w) => w.id));
  });

  it('respects tier curve and chapter boost (+0 ch1-2, +1 ch3-4, +2 ch5+)', () => {
    expect(getChapterBoost(1)).toBe(0);
    expect(getChapterBoost(2)).toBe(0);
    expect(getChapterBoost(3)).toBe(1);
    expect(getChapterBoost(4)).toBe(1);
    expect(getChapterBoost(5)).toBe(2);
    expect(getChapterBoost(10)).toBe(2);
    expect(clampTier(0)).toBe(1);
    expect(clampTier(9)).toBe(5);
    expect(getSlotTier('EASY', 99, 1, true)).toBe(3);

    const ch1 = planChapter({ seed: 7, difficulty: 'EASY', chapter: 1, usedWordIds: [] });
    const ch3 = planChapter({ seed: 7, difficulty: 'EASY', chapter: 3, usedWordIds: [] });
    const ch5 = planChapter({ seed: 7, difficulty: 'EASY', chapter: 5, usedWordIds: [] });

    const curve = DIFFICULTY_CONFIGS.EASY.tierCurve;
    ch1.slots.forEach((word, i) => {
      expect(word.tier).toBe(curve[i]);
    });
    ch3.slots.forEach((word, i) => {
      expect(word.tier).toBe(Math.min(5, (curve[i] ?? 1) + 1));
    });
    ch5.slots.forEach((word, i) => {
      expect(word.tier).toBe(Math.min(5, (curve[i] ?? 1) + 2));
    });
  });

  it('avoids repeats while the tier pool allows, and resets only the exhausted tier pool', () => {
    const ch1 = planChapter({ seed: 101, difficulty: 'HARD', chapter: 1, usedWordIds: [] });
    const ch2 = planChapter({
      seed: 202,
      difficulty: 'HARD',
      chapter: 2,
      usedWordIds: ch1.usedWordIds,
    });

    const ids1 = new Set(ch1.slots.map((w) => w.id));
    const ids2 = new Set(ch2.slots.map((w) => w.id));
    expect(ids1.size).toBe(15);
    expect(ids2.size).toBe(15);
    // HARD uses 3x tier3, 5x tier4, 7x tier5 per chapter (total 14 tier5 in 2 chapters < 22)
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false);
    }

    // Exhaust all tier-1 words while keeping a tier-2 word marked used
    const tier1Ids = ORIGINAL_WORDS.filter((w) => w.tier === 1).map((w) => w.id);
    const tier2Sample = ORIGINAL_WORDS.find((w) => w.tier === 2);
    if (!tier2Sample) {
      throw new Error('Expected at least one tier 2 word');
    }
    const used = [...tier1Ids, tier2Sample.id];

    const picked = pickWordForTier({
      rng: mulberry32(55),
      tier: 1,
      usedWordIds: used,
    });

    expect(picked.word.tier).toBe(1);
    // Tier 2 word stays marked used, while tier 1 pool reset except the newly picked word
    expect(picked.usedWordIds).toContain(tier2Sample.id);
    expect(picked.usedWordIds).toContain(picked.word.id);
    expect(picked.usedWordIds.filter((id) => tier1Ids.includes(id))).toEqual([picked.word.id]);
  });

  it('throws when word bank is empty and falls back to tier 1 when a higher tier is absent', () => {
    const tinyBank: WordRecord[] = [
      { id: 'en-canyon', word: 'canyon', tier: 1, definition: 'A deep gorge.' },
    ];
    const picked = pickWordForTier({
      rng: mulberry32(1),
      tier: 5,
      usedWordIds: [],
      wordBank: tinyBank,
    });
    expect(picked.word.id).toBe('en-canyon');

    expect(() =>
      pickWordForTier({ rng: mulberry32(1), tier: 1, usedWordIds: [], wordBank: [] }),
    ).toThrow();
  });
});
