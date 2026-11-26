import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ORIGINAL_WORDS } from '../wordBank.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../..');
const IMPORTER_PATH = resolve(REPO_ROOT, 'scripts/import-words.mjs');
const EXPANSION_PATH = resolve(__dirname, 'expansion-v1.json');

interface ValidationError {
  index: number;
  word: string;
  reason: string;
}

interface ExpansionRecord {
  id: string;
  word: string;
  tier: number;
  definition: string;
  reviewed: boolean;
  spellingDifficultyScore: number;
}

interface ImporterModule {
  validateWordBatch: (
    candidates: ReadonlyArray<Record<string, unknown>>,
    options?: { existingWords?: Set<string>; enforceReviewedFalse?: boolean },
  ) => {
    valid: boolean;
    records: ExpansionRecord[];
    errors: ValidationError[];
  };
  computeSpellingDifficultyScore: (word: string) => number;
}

async function loadImporter(): Promise<ImporterModule> {
  return (await import(pathToFileURL(IMPORTER_PATH).href)) as ImporterModule;
}

describe('scripts/import-words.mjs validation', () => {
  it('rejects duplicate normalized words within a batch', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'Acorn', tier: 1, definition: 'A smooth oval nut beneath an oak tree.' },
      { word: ' acorn ', tier: 1, definition: 'A small seed cup found in oak woods.' },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.reason).toMatch(/Duplicate word/i);
  });

  it('rejects words already present in original-words.json', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'CANYON', tier: 1, definition: 'A deep rocky gorge carved by water.' },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.reason).toMatch(/already exists in original-words\.json/i);
  });

  it('rejects non a-z characters and out-of-range word lengths', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'crag', tier: 1, definition: 'A steep rugged cliff face of stone.' },
      { word: 'rock-wall', tier: 1, definition: 'A vertical face of weathered stone.' },
      { word: 'trail1', tier: 1, definition: 'A narrow dirt path along a ridge.' },
      {
        word: 'electroencephalograph',
        tier: 5,
        definition: 'An instrument that records brain wave activity.',
      },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(4);
    for (const err of res.errors) {
      expect(err.reason).toMatch(/a-z letters and be 5-15 characters/i);
    }
  });

  it('rejects invalid tiers outside integer 1..5', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'acorn', tier: 0, definition: 'A smooth oval nut beneath an oak.' },
      { word: 'amber', tier: 6, definition: 'Warm golden fossilized evergreen resin.' },
      { word: 'aspen', tier: 2.5, definition: 'A slender tree with trembling leaves.' },
      { word: 'birch', tier: '1', definition: 'A pale-barked northern woodland tree.' },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(4);
    for (const err of res.errors) {
      expect(err.reason).toMatch(/Tier must be an integer between 1 and 5/i);
    }
  });

  it('rejects empty definitions and definitions longer than 90 characters', async () => {
    const { validateWordBatch } = await loadImporter();
    const tooLong = 'A'.repeat(91);
    const res = validateWordBatch([
      { word: 'acorn', tier: 1, definition: '   ' },
      { word: 'amber', tier: 1, definition: tooLong },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors).toHaveLength(2);
    expect(res.errors[0]?.reason).toMatch(/non-empty/i);
    expect(res.errors[1]?.reason).toMatch(/exceeds 90 characters/i);
  });

  it('rejects definitions that contain the target word', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'acorn', tier: 1, definition: 'An Acorn resting quietly beneath an oak.' },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.reason).toMatch(/must not contain the target word/i);
  });

  it('rejects words not present in an-array-of-english-words', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch([
      { word: 'zxqwkj', tier: 5, definition: 'Not a real English dictionary word.' },
    ]);
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.reason).toMatch(/not found in English dictionary/i);
  });

  it('enforces reviewed: false when checking expansion files', async () => {
    const { validateWordBatch } = await loadImporter();
    const res = validateWordBatch(
      [
        {
          word: 'acorn',
          tier: 1,
          definition: 'A smooth oval nut beneath an oak.',
          reviewed: true,
        },
      ],
      { enforceReviewedFalse: true },
    );
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.reason).toMatch(/reviewed: false/i);
  });
});

describe('expansion-v1.json word bank', () => {
  it('passes CLI --check and meets >= 60 per tier / >= 300 total with original-words.json', () => {
    const out = execFileSync(process.execPath, [IMPORTER_PATH, '--check', EXPANSION_PATH], {
      encoding: 'utf8',
    });
    expect(out).toMatch(/all valid/i);

    const expansion = JSON.parse(readFileSync(EXPANSION_PATH, 'utf8')) as ExpansionRecord[];
    const origSet = new Set(ORIGINAL_WORDS.map((w) => w.word));

    const tierCounts = new Map<number, number>();
    for (const orig of ORIGINAL_WORDS) {
      tierCounts.set(orig.tier, (tierCounts.get(orig.tier) ?? 0) + 1);
    }

    for (const rec of expansion) {
      expect(rec.id).toBe(`en-${rec.word}`);
      expect(rec.reviewed).toBe(false);
      expect(rec.word).toMatch(/^[a-z]{5,15}$/);
      expect(origSet.has(rec.word)).toBe(false);
      expect(rec.definition.length).toBeGreaterThan(0);
      expect(rec.definition.length).toBeLessThanOrEqual(90);
      expect(rec.definition.toLowerCase()).not.toContain(rec.word);
      expect(rec.spellingDifficultyScore).toBeGreaterThanOrEqual(0);
      expect(rec.spellingDifficultyScore).toBeLessThanOrEqual(100);
      tierCounts.set(rec.tier, (tierCounts.get(rec.tier) ?? 0) + 1);
    }

    for (const tier of [1, 2, 3, 4, 5]) {
      expect(tierCounts.get(tier) ?? 0).toBeGreaterThanOrEqual(60);
    }
    expect(ORIGINAL_WORDS.length + expansion.length).toBeGreaterThanOrEqual(300);
  });
});
