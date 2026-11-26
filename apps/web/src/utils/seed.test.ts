import { describe, expect, it } from 'vitest';
import { deriveSeed } from '@starspell/shared';
import { resolveBaseSeed, resolveChapterSeed } from './seed';

describe('resolveBaseSeed / resolveChapterSeed', () => {
  it('honours ?seed=<n> in non-production builds', () => {
    expect(import.meta.env.PROD).toBe(false);
    expect(resolveBaseSeed('?seed=12345')).toBe(12345);
    expect(resolveChapterSeed(1, '?seed=12345')).toBe(12345);
    expect(resolveChapterSeed(2, '?seed=12345')).toBe(deriveSeed(12345, 2));
  });

  it('falls back to a random uint32 when ?seed= is absent or invalid', () => {
    const s1 = resolveBaseSeed('');
    const s2 = resolveBaseSeed('?seed=notanumber');
    expect(Number.isInteger(s1)).toBe(true);
    expect(s1).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(s2)).toBe(true);
  });
});
