import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_WORDS, ORIGINAL_WORDS_VERSION } from './wordBank.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../..');

const EXPECTED_WORDS_SHA256 = '441d5367dc45ecceb1d95b55dcc3b46b18707b417ae17ad0ee5b0ea08e39865b';
const EXPECTED_PROTOTYPE_SHA256 =
  'ded9e54228327ecddef7883f005841b24dfa2eae8df78008a3cd408aceeb5d1e';

describe('original word bank', () => {
  it('contains 110 words, 22 per tier, a-z only, no duplicates, and matches canonical SHA-256', () => {
    expect(ORIGINAL_WORDS_VERSION).toBe('original-v1');
    expect(ORIGINAL_WORDS).toHaveLength(110);

    const seenWords = new Set<string>();
    const tierCounts = new Map<number, number>();

    for (const record of ORIGINAL_WORDS) {
      expect(record.id).toBe(`en-${record.word}`);
      expect(record.word).toMatch(/^[a-z]{5,15}$/);
      expect(seenWords.has(record.word)).toBe(false);
      seenWords.add(record.word);

      expect(record.definition.trim().length).toBeGreaterThan(0);
      expect(record.definition.toLowerCase()).not.toContain(record.word);

      tierCounts.set(record.tier, (tierCounts.get(record.tier) ?? 0) + 1);
    }

    for (const tier of [1, 2, 3, 4, 5]) {
      expect(tierCounts.get(tier)).toBe(22);
    }

    const canonical = JSON.stringify(ORIGINAL_WORDS);
    const sha256 = createHash('sha256').update(canonical, 'utf8').digest('hex');
    expect(sha256).toBe(EXPECTED_WORDS_SHA256);
  });

  it('keeps reference/starspell.html byte-identical to baseline', () => {
    const html = readFileSync(resolve(REPO_ROOT, 'reference/starspell.html'));
    const sha256 = createHash('sha256').update(html).digest('hex');
    expect(sha256).toBe(EXPECTED_PROTOTYPE_SHA256);
  });
});
