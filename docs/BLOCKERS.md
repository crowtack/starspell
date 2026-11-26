# Blockers

## 2026-11-25 — M0 `/verify` Environment Blockers

- **`git` missing / not on PATH**
  - Exact error: `git : The term 'git' is not recognized as the name of a cmdlet, function, script file, or operable program.`
  - Impact: Cannot run `git status --short`, `git diff --stat`, `git show <baseline>:reference/starspell.html`, or create the local `M0:` commit. No `.git` directory exists in the workspace.
  - Mitigation: `reference/starspell.html` is verified byte-identical via SHA-256 (`DED9E54228327ECDDEF7883F005841B24DFA2EAE8DF78008A3CD408ACEEB5D1E`) against `starspell-agent-pack/reference/starspell.html`.

- **`pnpm` binary not directly on PATH**
  - Exact error: `pnpm : The term 'pnpm' is not recognized as the name of a cmdlet, function, script file, or operable program.`
  - Mitigation: `corepack pnpm` (`pnpm@10.11.0`, pinned in `package.json`) is installed and working for all workspace commands (`typecheck`, `lint`, `test`, `build`).

## 2026-11-25 — M2 Postgres & Docker Environment Blocker

- **PostgreSQL / Docker unavailable in sandbox**
  - Exact error: `connect ECONNREFUSED 127.0.0.1:5432` (and `docker` is not installed/running).
  - Impact:
    - Real-Postgres integration tests in `apps/api/src/__tests__/auth.integration.test.ts` (`M2 API Integration (real Postgres)`) are skipped via `describe.skipIf(!dbAvailable)` rather than mocking Postgres.
    - Playwright account E2E test (`register, import guest progress, log out, log in from fresh context and see same profile`) in `apps/web/e2e/accounts.spec.ts` is skipped via `test.skip(!apiOk, ...)` because the API requires Postgres.
    - `prisma db push` / `prisma migrate dev` and `prisma:seed` could not be executed against a live database.
  - To unblock locally:
    1. Start Postgres: `docker compose up -d`
    2. Push/migrate schema and seed: `corepack pnpm --filter @starspell/api exec prisma migrate dev --name init` and `corepack pnpm --filter @starspell/api prisma:seed`
    3. Re-run `corepack pnpm --filter @starspell/api test` and `corepack pnpm e2e`
- **Local commit `M2: Accounts and API` deferred**: `git` is not installed in this environment (see M0 blocker above).

## 2026-11-25 — M3 Postgres & Docker Environment Blocker

- **PostgreSQL / Docker unavailable in sandbox**
  - Exact error: `connect ECONNREFUSED 127.0.0.1:5432` (and `docker` is not installed/running).
  - Impact:
    - Real-Postgres integration tests in `apps/api/src/__tests__/solo.integration.test.ts` (`M3 Solo Sync Integration (real Postgres)`) are skipped via `describe.skipIf(!dbAvailable)` rather than mocking Postgres.
    - Live-API Playwright E2E tests in `apps/web/e2e/soloSync.spec.ts` (offline→online sync and two-context conflict dialog) are skipped via `test.skip(!apiOk, ...)` because the API requires Postgres. (The mid-chapter tab-close/reopen resume E2E test runs and passes.)
  - To unblock locally:
    1. Start Postgres: `docker compose up -d`
    2. Push/migrate schema: `corepack pnpm --filter @starspell/api exec prisma migrate dev --name m3_solo_sync`
    3. Re-run `corepack pnpm --filter @starspell/api test` and `corepack pnpm e2e`
- **Local commit `M3: Solo sync, resume, idempotency` deferred**: `git` is not installed in this environment.

## 2026-11-25 — M4 Postgres & Docker Environment Blocker

- **PostgreSQL / Docker unavailable in sandbox**
  - Exact error: `connect ECONNREFUSED 127.0.0.1:5432` (and `docker` is not installed/running).
  - Impact:
    - Real-Socket.IO + Postgres integration tests in `apps/api/src/__tests__/multiplayer.integration.test.ts` are skipped via `describe.skipIf(!dbAvailable)` rather than mocking Postgres.
    - Two-context Playwright E2E test (`two browser contexts create, join, ready, play, see results, and see match in history`) in `apps/web/e2e/multiplayer.spec.ts` is skipped via `test.skip(!apiOk, ...)` because the API requires Postgres. (The lobby Multiplayer button E2E check runs and passes.)
  - To unblock locally:
    1. Start Postgres: `docker compose up -d`
    2. Push/migrate schema: `corepack pnpm --filter @starspell/api exec prisma migrate dev --name m4_multiplayer`
    3. Re-run `corepack pnpm --filter @starspell/api test` and `corepack pnpm e2e`
- **Local commit `M4: Rooms and Competition` deferred**: `git` is not installed in this environment.

## 2026-11-26 — M5 Postgres & Docker Environment Blocker

- **PostgreSQL / Docker unavailable in sandbox**
  - Exact error: `connect ECONNREFUSED 127.0.0.1:5432` (and `docker` is not installed/running).
  - Impact:
    - Real-Postgres integration tests in `apps/api/src/__tests__/leaderboards.integration.test.ts` are skipped via `describe.skipIf(!dbAvailable)` rather than mocking Postgres.
    - Two-account ranked Survival E2E test in `apps/web/e2e/m5.spec.ts` is skipped via `test.skip(!apiOk, ...)` because the API requires Postgres. (The lobby Leaderboards UI E2E check runs and passes.)
  - To unblock locally:
    1. Start Postgres: `docker compose up -d`
    2. Push/migrate schema: `corepack pnpm --filter @starspell/api exec prisma migrate dev --name m5_survival_rating_leaderboards`
    3. Re-run `corepack pnpm --filter @starspell/api test` and `corepack pnpm e2e`
- **Local commit `M5: Survival, rating, leaderboards, history` deferred**: `git` is not installed in this environment.

## 2026-11-26 — M6 Final `/verify` Environment Blockers

- **PostgreSQL / Docker unavailable**: Live-DB integration tests (12 tests in `apps/api`) and live-API Playwright E2E specs (7 specs across `accounts.spec.ts`, `soloSync.spec.ts`, `multiplayer.spec.ts`, `m5.spec.ts`) remain skipped without mocking Postgres.
- **`git` unavailable**: Local commits M0–M6 could not be created (`git` is not installed).
