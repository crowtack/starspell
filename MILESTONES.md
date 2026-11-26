# Starspell — Milestones

Run **one milestone per Antigravity conversation**, in order (M-V can run any time after M0).
Start each conversation by pasting its prompt block. Approve the Implementation Plan artifact before the agent edits anything.
Do not start the next milestone until `/verify` is green and you have checked the Walkthrough yourself.

Setup once, by hand:
1. Create the repo folder, copy this pack into it, and place the prototype at `reference/starspell.html`.
2. `git init`, then commit the untouched pack and prototype as "baseline".
3. Open the folder in Antigravity.

---

## M0 — Foundation and shared rules (no UI)

**Prompt**
```
Start M0 from docs/MILESTONES.md. Read AGENTS.md and docs/GAME_RULES.md first.
Use Planning mode and stop after the Implementation Plan.
```

**Scope**
- pnpm workspace with `apps/web`, `apps/api` (empty stubs are fine), `packages/shared`, `scripts/`.
  TypeScript strict, ESLint, Prettier, Vitest, `.env.example`, `docker-compose.yml` for Postgres (used from M2).
- Root scripts: `dev`, `build`, `typecheck`, `lint`, `test`.
- `scripts/extract-wordbank.mjs` and the generated `original-words.json` (GAME_RULES §9).
- `packages/shared/src/rules/`: difficulty presets, streak table, scoring, level, clock helpers, seeded PRNG,
  `planChapter`, `params.ts`. Zod schemas for the save format (GAME_RULES §8).
- `packages/shared` also exports a pure **solo reducer**: `reduce(state, event) → state`
  for events `chapter_started`, `word_solved`, `word_skipped`, `clock_expired`, `chapter_finished`.
  The client and server will both use it (M1, M3).

**Acceptance**
- `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build` all pass.
- Golden vectors from GAME_RULES §3 pass as unit tests, including the level boundaries.
- Vocabulary test asserts: 110 words, 22 per tier, no duplicates, only a–z, and the SHA-256 in §9.
- `planChapter` tests: same seed gives the same plan, tier curve and chapter boost are respected, no repeats while a pool allows.
- Reducer tests: a full 15-word chapter, skip resets streak, timeout fails with XP kept, +15 s clock cap, next chapter carries score and streak.
- Rules coverage ≥ 95% of lines. `reference/starspell.html` is byte-identical to baseline (check with a hash).

---

## M1 — Faithful port: guest Solo

**Prompt**
```
Start M1 from docs/MILESTONES.md. M0 is merged. Read AGENTS.md, docs/GAME_RULES.md, and use the line map in §10 to read
the prototype region by region. Planning mode. Stop after the Implementation Plan.
```

**Scope**
- `apps/web`: Vite + React + TS + Tailwind v3 (match the prototype's tailwind config: Fraunces serif, Plus Jakarta Sans).
- **Move, don't rewrite:** scenery engine → `src/engine/scenery.ts`, audio engine → `src/engine/audio.ts`
  (typed, otherwise unchanged). Prototype CSS → `src/styles/starspell.css` verbatim. Markup → React components keeping the class names.
- Screens: lobby with difficulty cards and live theme change, style select, play (HUD, timer ring, tiles, on-screen keyboard, constellation lines, milestone toasts),
  summary (victory/failure/missed word), settings, mute. Every control from GAME_RULES §7.
- Game state through the shared reducer. No formulas in components.
- Saves: same key `starspell_celestial_v1` plus `schemaVersion`. A real prototype save must load.
- **New for guests:** active-chapter checkpoint under `starspell_active_v1` (after each word, every 5 s, on `visibilitychange`),
  a "Resume chapter" prompt on the lobby, and confirm dialogs for Home and abandon. XP credited per solved word (Quirk Q4).
- Dev/test seed: `?seed=<n>` is honoured only outside production builds.

**Acceptance**
- Visual parity, checked with the browser subagent and saved to `docs/parity/`: screenshots of reference vs port at 1280×720 and 390×844
  for lobby (all 3 difficulties), style select, gameplay with 4 letters typed (all 3 difficulties), summary victory, summary failure, settings.
  The agent lists every visible difference. Anything beyond animation phase is a bug.
- Playwright E2E with a fixed seed: finish a chapter on each difficulty × each style, a failed chapter via timeout, skip, resume after reload mid-chapter, abandon with confirm.
- Test: an uninterrupted chapter yields exactly the prototype's XP and score totals (Q4).
- Test: a saved JSON copied from the prototype loads and keeps all three difficulties unlocked.
- Test: production build ignores `?seed=`.
- Audio cannot be screenshot-tested. The agent adds unit tests for engine setup and volume mapping, and writes a short manual listening checklist in `docs/parity/AUDIO_CHECKLIST.md` for **you** to run.

---

## M-V — Vocabulary expansion (parallel, data and tooling only)

**Prompt**
```
Start M-V from docs/MILESTONES.md. M0 is merged. Do not touch original-words.json or any app code.
```

**Scope**
- Import tool `scripts/import-words.mjs` validating: unique normalized word, a–z only, tier 1–5, non-empty definition ≤ 90 characters,
  definition does not contain the word, and the word exists in an English word list (e.g. `an-array-of-english-words`, installed as a dev dependency).
- New words in `packages/shared/src/data/words/expansion-v1.json` with `reviewed: false`.
  Target ≥ 60 words in every tier (≥ 300 total including the original 110).
- Tier rubric in `docs/VOCAB_RUBRIC.md` (explain how tier was chosen; the original bank is the calibration set).
- Optional explainable `spellingDifficultyScore` kept separate from the tier. Curated tier always wins.

**Acceptance**
- Importer rejects each bad-input case in tests. Original hash test still passes. The agent produces a review list for **you** to approve or edit.

---

## M2 — Accounts and API

**Prompt**
```
Start M2 from docs/MILESTONES.md. M1 is merged. Read AGENTS.md and GAME_RULES §9, §12.9. Planning mode.
```

**Scope**
- `apps/api` NestJS, Prisma, Postgres. Entities: `User`, `Session`, `PlayerProfile`, `UserSettings`, `Word` (seeded mirror), `PlayerDifficultyStats`, `GuestImport`.
- Endpoints: register, login, logout, me, profile read/update (allow-list fields only), settings read/update, health.
- Frontend: sign up, login, logout, account menu, profile page, settings sync (server wins, debounced), "guest progress is stored on this device" notice.
- Guest import: preview → confirm → idempotent `POST` with a client-generated import ID (GAME_RULES §12.9).
- Security: argon2id, session cookies, Origin check, rate limiting, helmet, CORS to configured origins, zod validation, safe logging.

**Acceptance**
- Integration tests: register/login/logout, unauthorized and cross-user access rejected, mass-assignment attempt ignored, rate limit triggers.
- Seed is idempotent: run twice, still 110 rows, definitions identical to the JSON.
- Import: run twice → no extra XP; cap applied; account with existing progress defaults to skip; imported progress flagged.
- E2E: register, import, log out, log in from a fresh browser context and see the same profile.

---

## M3 — Solo sync, resume, idempotency

**Prompt**
```
Start M3 from docs/MILESTONES.md. M2 is merged. Read GAME_RULES §4, §11, §12.1. Planning mode.
```

**Scope**
- Event-sourced solo sessions using the shared reducer. Tables: `GameSession` (seed, difficulty, style, wordBankVersion, state, version), `GameEvent`
  (unique `eventId`, unique `(sessionId, seq)`), `RewardLedger` (unique key such as `solo:{session}:c{chapter}:s{slot}:solve`).
- Endpoints: create session (idempotent by client session ID), append events (batch ≤ 50, with `baseSeq`), get active, abandon.
  Server regenerates the plan from the seed and applies §12.1 plausibility checks; rejected events earn nothing.
- Client outbox (IndexedDB) with bounded backoff retry and an honest status: **Synced**, **Saving…**, **Offline — will sync**, **Needs attention**.
  Never show Synced before the server confirms.
- Conflicts: if the server is ahead of the local log (another device played), show a choice. The unchosen version is kept as an `abandoned` session with reason `conflict`. Never delete.
- Rewards credited per solved word and at victory in the same transaction as the events.

**Acceptance**
- Replaying the same batch twice yields identical state and no duplicate XP (integration test).
- Playwright: close the tab mid-chapter, reopen, resume at the same word index, score, and streak (clock within one second of the last saved value).
- Playwright `context.setOffline`: play three words offline, go online, all sync in order once.
- Two browser contexts on one account trigger the conflict dialog and no data is lost.
- A tampered event (wrong word, impossible speed) is rejected and logged without XP.

---

## M4 — Rooms and Competition

**Prompt**
```
Start M4 from docs/MILESTONES.md. M3 is merged. Read GAME_RULES §12.1–12.3, §12.6. Planning mode.
```

**Scope**
- Socket.IO gateway on the API. Room and match state in memory with persistence to `MultiplayerRoom`, `RoomPlayer`, `Match`, `MatchPlayerResult`.
  Document that scaling beyond one API instance needs a shared adapter (out of scope).
- Typed event envelope in `packages/shared`: `{ v, type, eventId, seq, roomCode, matchId?, ts, payload }`. Identity comes from the session, never the payload.
- UI: create/join, waiting room (players, ready state, owner, settings), countdown, game screen with an opponents' progress strip, results, reconnect banner, clear errors for invalid, expired, full, and started rooms.
- Competition per §12.3, server clock, forfeit and interrupted handling per §12.6. Unranked results and match history are persisted; rating arrives in M5.

**Acceptance**
- Unit tests: ranking and tie-breaks, forfeit ordering.
- Integration tests with real socket clients: invalid code, expired, full, already started, duplicate connection replaced, owner leaves, disconnect inside and outside the grace window, out-of-order and duplicate events rejected, tampered answer rejected.
- E2E with two browser contexts: create, join, ready, play, see results, and see the match in history for both accounts.
- Match with only one connected player after start becomes `interrupted` and awards nothing.

---

## M5 — Survival, rating, leaderboards, history

**Prompt**
```
Start M5 from docs/MILESTONES.md. M4 and M-V are merged. Read GAME_RULES §12.4–12.8. Planning mode.
```

**Gate:** every tier has ≥ `MIN_WORDS_PER_TIER_FOR_SURVIVAL` words. If not, build everything except enabling Survival, and say so.

**Scope**
- Survival per §12.4, using the same match engine as Competition.
- Rating with `RatingHistory` (§12.7), ranked rooms only.
- Leaderboards per §12.8 with filters, keyset pagination, and loading/empty/error/populated states.
- Profile: stats, rating history, recent matches. Public profile exposes no private data.

**Acceptance**
- Rating tests include both vectors in §12.7 plus a forfeit case. Weekly/monthly window tests at UTC boundaries.
- Leaderboard tests: guests, solo, interrupted, and invalid matches never appear; best-per-user logic; tie-break order; pagination has no duplicates or gaps.
- E2E: two accounts play a ranked Survival match, ratings change by the expected integers, and both boards update.

---

## M6 — Hardening and release readiness

**Prompt**
```
Start M6 from docs/MILESTONES.md. M5 is merged. Planning mode.
```

**Scope**
- Security review against AGENTS.md invariants (auth, ownership, validation, rate limits, headers, logging without secrets).
- Accessibility: keyboard-only path through every screen, visible focus, labels, contrast; automated axe checks in Playwright.
- Responsive checks at 390, 768, 1280 widths. Reduced-effects honoured everywhere.
- Error boundaries, offline and reconnect messaging, request IDs in logs.
- Performance: record initial bundle size and frame rate on the lobby and gameplay screens; fix regressions against the M1 baseline.
- `README.md` and `docs/DEPLOY.md`: local setup, env vars, migrations, seed, tests, HTTPS, cookies, CORS, WebSocket proxying, Postgres backups.
  **Do not deploy anything.**

**Acceptance**
- Full `/verify` green plus the entire Playwright suite. Every known failure is listed in `docs/BLOCKERS.md`.
- Final report with the headings: Features (complete / partial / not done), Commands and results, Security, Known limitations, How to run.
