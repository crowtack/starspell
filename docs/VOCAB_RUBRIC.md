# Starspell Vocabulary Tier Rubric

This rubric calibrates word tiers (**1–5**) for Starspell expansion banks using the **110 original words** in `packages/shared/src/data/original-words.json` as the calibration set.

**Golden Rule:** The **curated `tier` always wins**. The `spellingDifficultyScore` is an optional, explainable heuristic kept strictly separate from `tier` for authoring guidance and review sorting.

---

## 1. Calibration Summary (Original 110 Words)

| Tier | Count | Length Range | Avg Length | Representative Calibration Words |
|---|---|---|---|---|
| **1** | 22 | 5–7 | 5.7 | `canyon`, `lantern`, `meadow`, `breeze`, `pebble`, `ember`, `beacon`, `valley` |
| **2** | 22 | 7–10 | 7.7 | `horizon`, `twilight`, `cascade`, `compass`, `glacier`, `wildflower`, `crescent` |
| **3** | 22 | 6–13 | 8.8 | `observatory`, `silhouette`, `constellation`, `precipice`, `zenith`, `equinox` |
| **4** | 22 | 7–12 | 8.9 | `ephemeral`, `incandescent`, `penumbra`, `halcyon`, `labyrinth`, `crystalline` |
| **5** | 22 | 9–15 | 12.0 | `bioluminescence`, `quintessential`, `onomatopoeia`, `chiaroscuro`, `archipelago` |

---

## 2. Tier Criteria

### Tier 1 — Everyday Concrete (5–7 letters)
- Common, concrete nouns or basic nature/outdoor words familiar to general readers.
- Mostly regular phoneme-to-grapheme mapping (no silent Greek/French clusters).
- Typical examples: `trail`, `ridge`, `cloud`, `timber`, `ripple`.

### Tier 2 — Scenic & Compound (7–10 letters)
- Familiar compound words (`moonbeam`, `wildflower`, `campground`) or common two-to-three syllable words (`horizon`, `granite`, `whisper`).
- Lightly tricky spellings (soft `c`, `sc`, `qu`, `gh`) are acceptable if the word is part of everyday vocabulary.

### Tier 3 — Descriptive & Geographic (6–13 letters)
- Richer academic, astronomical, or geographic vocabulary (`equinox`, `precipice`, `panorama`, `traverse`, `nocturnal`).
- May include uncommon letters (`z`, `x`, `q`) or silent/borrowed patterns (`silhouette`).

### Tier 4 — Literary & Poetic (7–12 letters)
- Elevated literary, musical, or classical terms (`ephemeral`, `halcyon`, `ethereal`, `gossamer`, `crescendo`, `reverie`).
- Non-obvious vowel choices (`y` as vowel, `ae`/`oe`, schwa ambiguity) or double consonants (`vermilion` vs `crystalline`).

### Tier 5 — Master Orthographic Challenges (9–15 letters)
- Long words (typically 9–15 letters) or notoriously tricky spellings (`onomatopoeia`, `chiaroscuro`, `connoisseur`, `phosphorescence`, `idiosyncrasy`).
- Multiple morphological boundaries, Greek/Latinate/French silent letters, double consonants, or rare letter combinations (`ch` = /k/, `ph`, `ps`, `sc`, `qu`).

---

## 3. Hard Validation Rules (Enforced by `scripts/import-words.mjs`)

Every imported word must satisfy **all** of the following:
1. **Normalized & Unique**: `word.trim().toLowerCase()` is unique across the expansion batch and does not collide with `original-words.json`.
2. **Alphabet & Length**: `^[a-z]{5,15}$` only (lowercase ASCII `a–z`, 5–15 characters, matching `GAME_RULES.md` §9).
3. **Tier**: Integer `1` through `5`.
4. **Definition**: Non-empty trimmed string, **≤ 90 characters**.
5. **No Self-Reference**: `definition.toLowerCase()` must not contain `word`.
6. **Valid English Word**: `word` must exist in `an-array-of-english-words`.

---

## 4. Explainable `spellingDifficultyScore` (0–100)

`scripts/import-words.mjs` computes a deterministic, transparent score (`0` = easiest, `100` = hardest) strictly as metadata:

```
raw =
  max(0, word.length - 5) * 4.5          // length contribution (0..45)
  + uncommonLettersCount * 7             // q, x, z, j, k, v, y (7 pts each)
  + doubleLetterPairs * 6                // aa..zz consecutive repeats (6 pts each)
  + trickyClusterHits * 7                // qu, ph, ch, gh, sch, sc, ps, gn, mn, oe, ae, eau, ough
  + vowelClusterHits * 4                 // 2+ adjacent vowels (e.g. io, ea, ui, eou)

spellingDifficultyScore = clamp(round(raw), 0, 100)
```

Because orthographic difficulty depends on familiarity as well as letter patterns (e.g. `meadow` vs `vespers`), **`spellingDifficultyScore` never overrides the curated `tier`**.
