/**
 * Starspell Vocabulary Importer (M-V)
 *
 * Validates candidate words against GAME_RULES §9 & VOCAB_RUBRIC.md:
 *   - Unique normalized word (no batch duplicates, no collision with original-words.json)
 *   - Lowercase a-z only, length 5-15
 *   - Integer tier 1-5
 *   - Non-empty definition <= 90 characters
 *   - Definition does not contain the word (case-insensitive)
 *   - Word exists in `an-array-of-english-words`
 *
 * Usage:
 *   node scripts/import-words.mjs --input <candidates.json> --output <expansion.json>
 *   node scripts/import-words.mjs --check <expansion.json>
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const englishWordsList = require('an-array-of-english-words');

/** Set of lowercase English words for O(1) dictionary lookup. */
export const ENGLISH_WORD_SET = new Set(englishWordsList.map((w) => String(w).toLowerCase()));

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');
export const ORIGINAL_WORDS_PATH = resolve(
  REPO_ROOT,
  'packages/shared/src/data/original-words.json',
);
export const DEFAULT_OUTPUT_PATH = resolve(
  REPO_ROOT,
  'packages/shared/src/data/words/expansion-v1.json',
);

export const MAX_DEFINITION_LENGTH = 90;
const WORD_PATTERN = /^[a-z]{5,15}$/;
const UNCOMMON_LETTERS = new Set(['q', 'x', 'z', 'j', 'k', 'v', 'y']);
const TRICKY_CLUSTERS = [
  'eau',
  'ough',
  'sch',
  'qu',
  'ph',
  'ch',
  'gh',
  'sc',
  'ps',
  'gn',
  'mn',
  'ae',
  'oe',
];

/**
 * Compute an explainable 0-100 spelling difficulty heuristic.
 * Kept strictly separate from the curated tier (curated tier always wins).
 *
 * @param {string} word - Normalized lowercase a-z word.
 * @returns {number}
 */
export function computeSpellingDifficultyScore(word) {
  let score = Math.max(0, word.length - 5) * 4.5;

  for (const ch of word) {
    if (UNCOMMON_LETTERS.has(ch)) {
      score += 7;
    }
  }

  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) {
      score += 6;
    }
  }

  for (const cluster of TRICKY_CLUSTERS) {
    let idx = word.indexOf(cluster);
    while (idx !== -1) {
      score += 7;
      idx = word.indexOf(cluster, idx + cluster.length);
    }
  }

  const vowelClusters = word.match(/[aeiou]{2,}/g);
  if (vowelClusters) {
    score += vowelClusters.length * 4;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Load existing words from original-words.json as a lowercase Set.
 * @param {string} [originalPath]
 * @returns {Set<string>}
 */
export function loadOriginalWordSet(originalPath = ORIGINAL_WORDS_PATH) {
  const raw = readFileSync(originalPath, 'utf8');
  const records = JSON.parse(raw);
  return new Set(records.map((r) => String(r.word).trim().toLowerCase()));
}

/**
 * Validate a batch of candidate word entries and return normalized expansion records.
 *
 * @param {unknown[]} candidates
 * @param {{ existingWords?: Set<string>, enforceReviewedFalse?: boolean }} [options]
 * @returns {{ valid: boolean, records: Array<object>, errors: Array<{ index: number, word: string, reason: string }> }}
 */
export function validateWordBatch(candidates, options = {}) {
  const existingWords = options.existingWords ?? loadOriginalWordSet();
  const enforceReviewedFalse = options.enforceReviewedFalse ?? false;

  if (!Array.isArray(candidates)) {
    return {
      valid: false,
      records: [],
      errors: [{ index: -1, word: '', reason: 'Input must be a JSON array of word entries' }],
    };
  }

  const seenInBatch = new Set();
  const records = [];
  const errors = [];

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    if (!item || typeof item !== 'object') {
      errors.push({ index: i, word: '', reason: 'Entry must be an object' });
      continue;
    }

    const rawWord = typeof item.word === 'string' ? item.word : '';
    const word = rawWord.trim().toLowerCase();

    if (!word) {
      errors.push({ index: i, word: rawWord, reason: 'Word is missing or empty' });
      continue;
    }

    if (!WORD_PATTERN.test(word)) {
      errors.push({
        index: i,
        word,
        reason: 'Word must contain only a-z letters and be 5-15 characters long',
      });
      continue;
    }

    if (existingWords.has(word)) {
      errors.push({
        index: i,
        word,
        reason: 'Word already exists in original-words.json',
      });
      continue;
    }

    if (seenInBatch.has(word)) {
      errors.push({
        index: i,
        word,
        reason: 'Duplicate word in candidate batch',
      });
      continue;
    }
    seenInBatch.add(word);

    if (!ENGLISH_WORD_SET.has(word)) {
      errors.push({
        index: i,
        word,
        reason: 'Word not found in English dictionary (an-array-of-english-words)',
      });
      continue;
    }

    if (!Number.isInteger(item.tier) || item.tier < 1 || item.tier > 5) {
      errors.push({
        index: i,
        word,
        reason: 'Tier must be an integer between 1 and 5',
      });
      continue;
    }

    const def = typeof item.definition === 'string' ? item.definition.trim() : '';
    if (def.length === 0) {
      errors.push({
        index: i,
        word,
        reason: 'Definition must be a non-empty string',
      });
      continue;
    }

    if (def.length > MAX_DEFINITION_LENGTH) {
      errors.push({
        index: i,
        word,
        reason: `Definition exceeds ${MAX_DEFINITION_LENGTH} characters (${def.length})`,
      });
      continue;
    }

    if (def.toLowerCase().includes(word)) {
      errors.push({
        index: i,
        word,
        reason: 'Definition must not contain the target word',
      });
      continue;
    }

    if (enforceReviewedFalse && item.reviewed !== false) {
      errors.push({
        index: i,
        word,
        reason: 'Expansion entries must have reviewed: false',
      });
      continue;
    }

    records.push({
      id: `en-${word}`,
      word,
      tier: item.tier,
      definition: def,
      reviewed: false,
      spellingDifficultyScore: computeSpellingDifficultyScore(word),
    });
  }

  // Sort deterministically by tier then word
  records.sort((a, b) => a.tier - b.tier || a.word.localeCompare(b.word));

  return {
    valid: errors.length === 0,
    records,
    errors,
  };
}

function parseArgs(argv) {
  const args = { input: '', output: DEFAULT_OUTPUT_PATH, check: '' };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--input' && argv[i + 1]) {
      args.input = resolve(process.cwd(), argv[++i]);
    } else if (flag === '--output' && argv[i + 1]) {
      args.output = resolve(process.cwd(), argv[++i]);
    } else if (flag === '--check' && argv[i + 1]) {
      args.check = resolve(process.cwd(), argv[++i]);
    }
  }
  return args;
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const targetPath = args.check || args.input;

  if (!targetPath) {
    console.error(
      'Usage:\n  node scripts/import-words.mjs --input <candidates.json> [--output <expansion.json>]\n  node scripts/import-words.mjs --check <expansion.json>',
    );
    process.exit(1);
  }

  const raw = readFileSync(targetPath, 'utf8');
  const candidates = JSON.parse(raw);
  const result = validateWordBatch(candidates, {
    enforceReviewedFalse: Boolean(args.check),
  });

  if (!result.valid) {
    console.error(`Validation failed with ${result.errors.length} error(s):`);
    for (const err of result.errors) {
      console.error(`  [index ${err.index}] (${err.word || '?'}): ${err.reason}`);
    }
    process.exit(1);
  }

  if (args.check) {
    console.log(`Checked ${result.records.length} expansion words: all valid.`);
    return;
  }

  mkdirSync(dirname(args.output), { recursive: true });
  writeFileSync(args.output, `${JSON.stringify(result.records, null, 2)}\n`, 'utf8');
  console.log(`Imported ${result.records.length} validated words to ${args.output}`);
}

const isDirectExecution =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectExecution) {
  runCli();
}
