export type SeededRng = () => number;

/**
 * Pure 32-bit mulberry32 seeded PRNG returning values in [0, 1).
 */
export function mulberry32(seed: number): SeededRng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically mixes a base seed with integer coordinates (chapter, slot, skipCount).
 */
export function deriveSeed(seed: number, ...parts: readonly number[]): number {
  let hash = (seed >>> 0) ^ 0x811c9dc5;
  for (const part of parts) {
    hash ^= part | 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function pickIndex(rng: SeededRng, length: number): number {
  if (length <= 0) {
    throw new Error('Cannot pick an index from an empty collection');
  }
  return Math.floor(rng() * length);
}
