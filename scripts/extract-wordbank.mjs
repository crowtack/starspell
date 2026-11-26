import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const REFERENCE_PATH = resolve(ROOT_DIR, 'reference', 'starspell.html');
const OUTPUT_PATH = resolve(ROOT_DIR, 'packages', 'shared', 'src', 'data', 'original-words.json');

const EXPECTED_PROTOTYPE_SHA256 =
  'ded9e54228327ecddef7883f005841b24dfa2eae8df78008a3cd408aceeb5d1e';
const EXPECTED_WORDS_SHA256 = '441d5367dc45ecceb1d95b55dcc3b46b18707b417ae17ad0ee5b0ea08e39865b';

function extractObjectLiteral(source, declaration) {
  const markerIndex = source.indexOf(declaration);
  if (markerIndex === -1) {
    throw new Error(`Could not find declaration: ${declaration}`);
  }
  const startBrace = source.indexOf('{', markerIndex);
  if (startBrace === -1) {
    throw new Error(`Could not find opening brace for: ${declaration}`);
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = startBrace; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(startBrace, i + 1);
      }
    }
  }
  throw new Error(`Unterminated object literal for: ${declaration}`);
}

const htmlBuffer = readFileSync(REFERENCE_PATH);
const protoHash = createHash('sha256').update(htmlBuffer).digest('hex');
if (protoHash !== EXPECTED_PROTOTYPE_SHA256) {
  throw new Error(
    `Prototype hash mismatch: expected ${EXPECTED_PROTOTYPE_SHA256}, got ${protoHash}`,
  );
}

const html = htmlBuffer.toString('utf8');
const literal = extractObjectLiteral(html, 'const WORD_BANK =');
const rawBank = vm.runInNewContext(`(${literal})`, Object.create(null));

const seen = new Set();
const records = [];

for (const tier of [1, 2, 3, 4, 5]) {
  const entries = rawBank[tier];
  if (!Array.isArray(entries) || entries.length !== 22) {
    throw new Error(
      `Tier ${tier} must have exactly 22 entries, got ${Array.isArray(entries) ? entries.length : typeof entries}`,
    );
  }
  for (const entry of entries) {
    const word = entry?.word;
    const definition = entry?.def;
    if (typeof word !== 'string' || !/^[a-z]{5,15}$/.test(word)) {
      throw new Error(`Invalid word in tier ${tier}: ${String(word)}`);
    }
    if (seen.has(word)) {
      throw new Error(`Duplicate word found: ${word}`);
    }
    seen.add(word);
    if (typeof definition !== 'string' || definition.trim().length === 0) {
      throw new Error(`Empty definition for word: ${word}`);
    }
    if (definition.toLowerCase().includes(word)) {
      throw new Error(`Definition for "${word}" contains the word itself`);
    }
    records.push({
      id: `en-${word}`,
      word,
      tier,
      definition,
    });
  }
}

if (records.length !== 110) {
  throw new Error(`Expected 110 total words, got ${records.length}`);
}

const canonicalJson = JSON.stringify(records);
const wordsHash = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
if (wordsHash !== EXPECTED_WORDS_SHA256) {
  throw new Error(
    `Word bank SHA-256 mismatch: expected ${EXPECTED_WORDS_SHA256}, got ${wordsHash}`,
  );
}

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
console.log(`Extracted ${records.length} words to ${OUTPUT_PATH} (SHA-256: ${wordsHash})`);
