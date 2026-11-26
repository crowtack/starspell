# Starspell — Game Rules (canonical)

Sections 1–11 were extracted from `reference/starspell.html` and checked against its code.
Section 12 holds **decided rules for new features** (the prototype has no multiplayer).
Section 13 is the single place to tune numbers. If code and this file disagree, this file wins; fix the code.

## 0. Vocabulary of terms (avoid the naming trap)

| Term | Meaning | Values |
|---|---|---|
| **Difficulty** | Clock/tier/theme preset | `EASY`, `INTERMEDIATE`, `HARD` |
| **Style** | How a word is presented. The prototype calls these "modes" in code (`selectedMode`) | `STARLIGHT` (UI name "Storybook"), `ECHO` ("Evening Echo"), `FLASH` ("Sunbeam") |
| **Game mode** | How a session is played. New. | `SOLO`, `COMPETITION`, `SURVIVAL` |
| **Chapter** | 15 words ("constellation" in profile stats) | |
| **Run** | Consecutive chapters with score and streak carried over, until a failure, Replay, or Lobby | |

Styles are a setting of the session or room. They do not change scoring.

## 1. Difficulty presets (exact)

| Key | Name | Initial clock | Solve bonus | Skip penalty | XP mult | BPM | Primary | Secondary |
|---|---|---:|---:|---:|---:|---:|---|---|
| EASY | Sunset Breeze | 45.0 s | +3.2 s | −3.0 s | 1.00 | 96 | `#facc15` | `#fb923c` |
| INTERMEDIATE | Twilight Journey | 42.0 s | +2.8 s | −3.5 s | 1.30 | 106 | `#818cf8` | `#c084fc` |
| HARD | Eclipse of the Summit | 38.0 s | +2.4 s | −4.0 s | 1.65 | 118 | `#fb7185` | `#f97316` |

Tier curves (15 slots): EASY `[1,1,1,2,2,2,3,3,3,3,4,4,4,5,5]`,
INTERMEDIATE `[2,2,2,3,3,3,3,4,4,4,4,4,5,5,5]`, HARD `[3,3,3,4,4,4,4,4,5,5,5,5,5,5,5]`.
Copy `description`, `summary`, `ambientLabel`, glow colors, CTA gradient classes, and `envIndex` (0, 1, 2)
from the prototype config at lines 709–770. Do not retype them.

## 2. Chapter word plan

- `WORDS_PER_CHAPTER = 15`.
- Chapter boost: `boost = min(2, floor((chapter − 1) / 2))`. Slot tier = `min(5, curve[slot] + boost)`.
  Chapters 1–2 → +0, 3–4 → +1, 5+ → +2.
- No repeats: a word is excluded once used in the session. If a tier's pool is fully used, that tier's used-set resets.
- Skip: replaces the current slot with a fresh word of tier `curve[slot]` (see Quirk Q1: the boost is not applied here).
- Port requirement: one pure function
  `planChapter({ seed, difficulty, chapter, usedWordIds, wordBank }) → { slots, usedWordIds }`
  driven by a seeded PRNG (mulberry32 or equivalent). Default seed comes from `crypto.getRandomValues`.

## 3. Scoring (preserve operation order exactly; it affects float rounding)

```
streak = streak + 1                      // incremented BEFORE the multiplier lookup
mult   = highest milestone where streak >= milestone.streak, else 1.0
wordPoints = round(word.length * 25 * difficulty.xpMultiplier * mult)
wordXp     = round(wordPoints * 0.4)
score += wordPoints;  chapterXp += wordXp
timeBonusXp (victory only) = round(timeLeftSeconds * 12 * difficulty.xpMultiplier)
level = max(1, floor(totalXp / 600) + 1)
```

Streak table: 3 → 1.25 `STREAK ×3`, 5 → 1.50 `COMBO ×5`, 8 → 2.00 `OVERDRIVE`, 12 → 2.50 `UNSTOPPABLE`,
20 → 3.00 `LEGENDARY`. Glow radius: base 22px, then 28, 34, 40, 46, 54 px at each milestone.
Skipping sets streak to 0. Nothing else does.

### Golden test vectors (verified by running the formulas)

| Case | Result |
|---|---|
| EASY, length 6, streak 1 | points 150, XP 60 |
| INTERMEDIATE, length 8, streak 3 | points 325, XP 130 |
| HARD, length 5, streak 5 | points 309, XP 124 |
| HARD, length 15, streak 20 | points 1856, XP 742 |
| HARD victory, 12.34 s left | time bonus 244 |
| INTERMEDIATE victory, 30 s left | time bonus 468 |
| level(0), level(599), level(600), level(1199), level(1200) | 1, 1, 2, 2, 3 |

## 4. Clock

- Each chapter starts at `initialClock` (it does not carry over). Solve: `timeLeft = min(initialClock + 15, timeLeft + solveBonus)`.
- Skip: `timeLeft = max(0, timeLeft − skipPenalty)`. If it reaches 0, the chapter fails on that skip.
- The clock does not run while Settings is open or during the 420 ms after a correct word (`isVerifying`).
- Warnings: under 15 s the ring turns amber `#fbbf24`. Under 5 s it turns `#fb7185`, shows the eclipse vignette,
  and enables the tension music stem. Tick sound at 4, 3, 2, 1 s.
- The prototype clock is **frame-time based**: `dt = min(0.1 s, frameDelta)`. A hidden tab or very slow frames slow the clock.
  Solo keeps this. Multiplayer uses wall-clock (§12).
- Chapter ends: victory when slot 15 is solved; failure when the clock hits 0.
  Failure still keeps XP from words already solved, gives no time bonus, and does not count a cleared constellation.

## 5. Per-chapter flow

`Lobby → Style select → Playing → Summary`. Summary shows score, best streak, XP gained.
On failure it also shows the word that was missed and its definition, with Replay and Lobby buttons.
On victory it adds **Next chapter**, which keeps score and streak but resets the clock and chapter XP.
Replay restarts chapter 1 and resets score and streak.
Profile updates at chapter end: `xp`, `level`, `highScore` (run score), `bestStreak`, per-difficulty bests,
`constellationsCleared` and `runsCleared` (victory only), `wordsSolved` (per solved word).

## 6. Styles

| Style | UI name | On each word |
|---|---|---|
| STARLIGHT | Storybook / Guided | Definition shown. Word spoken automatically. First tile shows its letter for 750 ms with an "Opening Lantern" badge. |
| ECHO | Evening Echo / Listening | Definition shown. Word spoken automatically. No letter reveal. |
| FLASH | Sunbeam / Memory | Whole word shown for 1100 ms with a "Sunbeam Glimpse" badge, then hidden. No automatic speech. |

Typing the first letter early cancels any reveal. The pronounce button (and Tab) replays speech at rate 0.92, pitch 1.02.
Default style on load is STARLIGHT. Style is not persisted in the prototype. Difficulty is.

## 7. Controls

| Input | Effect while playing |
|---|---|
| A–Z | Place letter (wrong letters stay on the tile marked as an error; there is no penalty) |
| Backspace | Remove last letter |
| Enter | Completes only if the typed word is exact (the last correct letter already auto-completes) |
| Tab | Pronounce the word |
| Esc | **Skip** the word (with penalty) |
| On-screen 3-row keyboard | Same as the physical keys; uses `pointerdown` |

Lobby: Enter → style select. Style select: Enter → begin, Esc → back. Settings: Esc closes.
Ctrl/Meta/Alt combinations are ignored. Settings open pauses the clock.

## 8. Persistence format (prototype)

Key `starspell_celestial_v1`:
`{ profile:{xp,level,highScore,bestStreak,wordsSolved,constellationsCleared}, selectedDifficulty,
difficulties:{EASY|INTERMEDIATE|HARD:{unlocked,completed,highScore,bestStreak,wordsSolved,runsCleared}},
settings:{masterVol:.80,musicVol:.65,sfxVol:.85,musicEnabled:true,typingSfxEnabled:true,gameSfxEnabled:true,reducedEffects:false} }`.
The loader merges over defaults and forces `unlocked: true`. The port adds `schemaVersion: 1` and keeps the same key.

Audio engine surface to port as-is: `setMusicMode('LOBBY'|'GAMEPLAY'|'SILENT', difficulty)`, `setStreak`, `setTension`,
`applySettings`, `toggleMute`, `ensureContext`, and SFX `playKeyCorrect(i)`, `playKeyError`, `playBackspace`,
`playWordComplete(streak)`, `playMilestone`, `playStreakReset`, `playCountdownTick`, `playVictoryFanfare`, `playTimeoutResolve`.
Audio starts only after a user gesture.

## 9. Vocabulary

110 words, exactly 22 per tier (tiers 1–5), lengths 5–15, all lowercase a–z, no duplicates, no definition contains its own word.
Do not retype them. Generate `packages/shared/src/data/original-words.json` with `scripts/extract-wordbank.mjs`,
which evaluates the `WORD_BANK` literal from the reference file.

- Stable ID: `en-<word>` (example `en-canyon`).
- Record shape: `{ id, word, tier, definition }`, in tier order then source order.
- Canonical SHA-256 of `JSON.stringify(records)` for that shape (keys in that order, no whitespace):
  `441d5367dc45ecceb1d95b55dcc3b46b18707b417ae17ad0ee5b0ea08e39865b`.
  A unit test must assert this hash. If the extraction changes it, the extraction is wrong.
- Expansion words live in separate files under `packages/shared/src/data/words/` and never modify the original file.
- JSON files are the canonical word source. The database `Word` table is an idempotent seeded mirror (upsert by `id`).
  Clients bundle the same JSON. Sessions record `wordBankVersion` so a replay uses the same bank.

## 10. Prototype line map (read by region)

| Lines | Content |
|---|---|
| 23–339 | CSS (`<style>`) |
| 341–697 | DOM markup (lobby, style select, HUD, arena, summary, settings) |
| 702–903 | Constants, difficulty configs (709–770), streak table (772), `WORD_BANK` |
| 904–963 | Save/load |
| 964–2244 | `SunsetSceneryEngine` (canvas scenery, parallax, lightning, particles) |
| 2245–2673 | `CelestialAudioEngine` (procedural music stems and SFX) |
| 2674–3495 | Controller: theme/lobby (2734), word picking (2837), loadWord, typing (3023), completion/finish, keyboard (3238), settings (3288), listeners (3347), main loop (3456), boot (3485) |

## 11. Prototype quirks and v1 decisions

| ID | Quirk | v1 decision |
|---|---|---|
| Q1 | Skip replacement uses `curve[slot]` without the chapter boost, so later chapters get easier replacements | **Preserve** for parity behind `SKIP_USES_BOOSTED_TIER = false`. Flag to owner after M1. |
| Q2 | Clock is frame-based (hidden tab slows it) | Preserve in Solo. Multiplayer is wall-clock. |
| Q3 | Home button leaves a running chapter with no confirmation | **Change:** confirm dialog. |
| Q4 | XP is added to the profile only at chapter end, so quitting mid-chapter loses it | **Change:** credit XP per solved word. Uninterrupted totals must equal the prototype's totals (test it). |
| Q5 | `usedWords` resets on page reload | Persist used IDs inside the active-chapter checkpoint. |
| Q6 | Esc skips with a penalty and no confirmation | Preserve (it is a core mechanic). |
| Q7 | Only 22 words per tier | Preserve the bank. Expansion required before Survival (§12.5). |

## 12. Decided rules for new features

### 12.1 Word delivery and anti-cheat (honest scope)

The client must know the current word to display it and speak it, so a bot can always auto-type. The server therefore
does best-effort integrity, not absolute: it issues words just in time, recomputes everything, and rejects the implausible.

- Server holds the match seed and the word plan. It sends **only the current slot and the next slot** (`word.issue`).
- Client sends `word.solve { slot, answer, eventId, seq }` or `word.skip { slot, eventId, seq }`.
- Server checks: membership, match active, `seq` is exactly last+1, slot is the player's current slot, `answer` equals the word,
  and elapsed time since issue ≥ `MIN_MS_PER_CHAR × length`. Anything else is rejected and counted toward a `suspect` flag.
- Solo (client-planned from a seed) is validated at sync time the same way: the server regenerates the plan from the seed
  and `wordBankVersion`. Solo is never used for public leaderboards.
- Multiplayer clock is the **server's wall clock**. The client clock display is cosmetic and resynced from server results.
- Per-player skip replacements are drawn server-side from the slot's tier, avoiding words that player already saw in the match,
  using a PRNG stream seeded from `(matchSeed, playerId)`.

### 12.2 Rooms

- Code: 5 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1). Input is trimmed, uppercased, and spaces/hyphens removed.
  Collisions are retried. Unique among non-expired rooms.
- 2–6 players. Owner starts when ≥ 2 connected players are ready. 5-second countdown.
- Idle waiting room expires after 15 min. A finished room closes after 10 min.
- One live connection per user per room. A newer connection replaces the older one.
- Owner leaves → ownership passes to the longest-present connected player. Empty room → expires.
- Guests may join **unranked** rooms. A room is **ranked** only if every member is a registered account.
- Join attempts: 10 per minute per IP+session, then a 10-minute lockout after 30 failures.
- Room members see only username, avatar, ready state, and connection state.

### 12.3 Competition

- Everyone gets the same difficulty, style, and 15-slot chapter 1 plan (no boost). Same clock rules as §4, but wall-clock.
- A player finishes by clearing 15 slots or when their clock hits 0. The match ends when all players have finished or at
  `COMPETITION_HARD_CAP_MS`.
- Others see progress only (slots solved, score, streak, status), never words.
- Rank by: score desc → words solved desc → elapsed active ms asc → user ID asc.

### 12.4 Survival

- Same difficulty clock rules as Solo (initial clock, solve bonus, skip penalty, +15 s cap, streak multipliers).
- Endless word plan: slot tier = `min(5, startTier + floor(slot / 5))` with `startTier` EASY 1, INTERMEDIATE 2, HARD 3.
- A player is eliminated when their clock reaches 0. The plan ends after `SURVIVAL_MAX_WORDS`; clearing it is a finish.
- Match ends when all players are eliminated or finished, or at `SURVIVAL_HARD_CAP_MS`.
- Rank by: **words solved** desc → score desc → elapsed active ms asc → user ID asc.
  (Duration-first would reward dawdling: waiting until the last second before each solve stretches time alive.)

### 12.5 Vocabulary gate for Survival

Survival is not enabled until every tier has ≥ `MIN_WORDS_PER_TIER_FOR_SURVIVAL` words (Hard reaches tier 5 by slot 10,
so it needs about 50 distinct tier-5 words). Competition works with the original bank.

### 12.6 Disconnects and match status

- Reconnect grace: `RECONNECT_GRACE_MS`. The player's server clock keeps running.
- Not back in time → status `forfeit`: ranked below every non-forfeit player and counted as a loss in rating.
  Forfeit vs forfeit counts as a draw. A forfeit never gets a win or a completion reward.
- Match status values: `waiting`, `countdown`, `active`, `completed`, `interrupted`, `cancelled`, `invalid`.
- Fewer than 2 connected players for longer than the grace window → `interrupted`: no rating, no leaderboard entry, no XP.
- On server start, any `active` match becomes `interrupted`. Suspect-flagged matches become `invalid`.

### 12.7 Rewards and rating

- Multiplayer XP uses the §3 formulas. It is granted through the reward ledger only for matches with ≥ 2 participants who started,
  capped at `MP_DAILY_XP_CAP` per user per UTC day.
- Rating: Elo-style, **ranked rooms only**, starts at `RATING_START`. For N players, each player's delta is
  `K / (N − 1) × Σ_over_opponents (actual − expected)`, where `actual` is 1 (ranked above), 0 (below), 0.5 (equal score and words),
  and `expected = 1 / (1 + 10^((Ropp − Rself) / 400))`. Round deltas to integers. Floor at `RATING_FLOOR`.
  `K = K_PROVISIONAL` for a player's first `PROVISIONAL_MATCHES`, then `K_STANDARD`.
- Test vectors: two players at 1000, K 32 → winner +16, loser −16. Three players at 1000 ranked 1/2/3, K 32 → +16, 0, −16.
- Every change is appended to `RatingHistory`. The current rating is never the only record.

### 12.8 Leaderboards (never mix metrics)

| Board | Metric | Filters |
|---|---|---|
| Rating | Current rating (needs ≥ `LEADERBOARD_MIN_RANKED` ranked matches) | All-time |
| Competition | Best single validated match score | Difficulty × {all-time, weekly, monthly} |
| Survival | Best single validated words-solved (tie: score) | Difficulty × {all-time, weekly, monthly} |

- Best result per user in the window, not a sum. Ties: earlier achievement first, then username.
- Eligible: `completed` matches, registered users, not flagged. Excluded: guests, solo, interrupted, invalid.
- Windows are UTC: week starts Monday 00:00 UTC, month is the calendar month in UTC. UI states the UTC reset time.
- Keyset pagination on `(metric desc, achievedAt asc, userId)`. Public rows show rank, username, avatar, value. No emails or internal IDs.

### 12.9 Accounts and guests

- Argon2id passwords. Opaque session ID in an HttpOnly, SameSite=Lax, Secure (production) cookie; store only a hash in the DB.
  State-changing requests require an allowed `Origin` plus a custom header. Rate-limit auth and join endpoints.
- Guest progress stays on the device. Guest-to-account import is explicit, previewed, and one time per account (unique key).
  Import adds XP and counters, takes the max of bests, is capped at `GUEST_IMPORT_XP_CAP`, and is marked `imported`
  so it can never reach a leaderboard. If the account already has progress, the default choice is "skip".
- Password reset is built only if an email provider is configured. Otherwise show a clear, documented "not available" state.

## 13. Tunable parameters (single source: `params.ts`)

| Name | Default | Note |
|---|---:|---|
| `MIN_MS_PER_CHAR` | 40 | Plausibility floor for a solve |
| `RECONNECT_GRACE_MS` | 30,000 | |
| `COMPETITION_HARD_CAP_MS` | 360,000 | |
| `SURVIVAL_MAX_WORDS` | 60 | |
| `SURVIVAL_HARD_CAP_MS` | 720,000 | |
| `MIN_WORDS_PER_TIER_FOR_SURVIVAL` | 60 | 300 words total |
| `MP_DAILY_XP_CAP` | 3,000 | |
| `RATING_START` / `RATING_FLOOR` | 1000 / 100 | |
| `K_PROVISIONAL` / `K_STANDARD` / `PROVISIONAL_MATCHES` | 32 / 24 / 20 | |
| `LEADERBOARD_MIN_RANKED` | 5 | |
| `GUEST_IMPORT_XP_CAP` | 30,000 | About level 51 |
| `SKIP_USES_BOOSTED_TIER` | false | Quirk Q1 |
