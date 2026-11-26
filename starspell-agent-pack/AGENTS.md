# Starspell — Agent Operating Rules

Always-on rules for every agent session in this repo. Keep this file short. Details live in `docs/`.

## Project

Starspell is a wilderness-canyon spelling arcade. The working prototype is `reference/starspell.html`
(single file, 3,496 lines: Canvas scenery, Web Audio music/SFX, SpeechSynthesis, LocalStorage).
We are turning it into a React + TypeScript web app with accounts, resumable solo play,
and server-authoritative multiplayer.

## Source of truth (in priority order)

1. `reference/starspell.html` — visuals, audio, behavior, vocabulary. **Read-only. Never edit it.**
2. `docs/GAME_RULES.md` — rules extracted from the prototype plus decided rules for new modes.
3. `docs/MILESTONES.md` — the scope of the milestone you were asked to do.
4. Everything else.

If two sources conflict, or a needed rule is missing, **stop and ask**. Do not pick silently.
New tunable numbers go in `packages/shared/src/rules/params.ts` and in `GAME_RULES.md` §13, never inline.

## How to work (Antigravity)

- Use **Planning mode**. Produce the Implementation Plan artifact first and wait for approval before editing.
- Do **only the current milestone**. Do not pre-build later milestones or add unrequested features.
- Do not load the whole prototype into context repeatedly. Use the line map in `GAME_RULES.md` §10.
- For anything visual or interactive, use the **browser subagent** and attach screenshots.
  Never claim visual parity or a working flow from reading code alone.
- Commit locally at each green gate: `M<n>: <summary>`. Never push, force-push, or edit remotes.
- Finish with a **Walkthrough artifact**: exact commands run, real pass/fail output, files changed,
  known gaps. Run `/verify` first and paste its table.
- Never write "done", "working", or "passing" for anything you did not run and observe.

## Hard invariants (tests must enforce these)

1. Easy, Intermediate, and Hard are always unlocked for everyone, including guests.
2. The 110 original words and definitions are unchanged. Canonical file hash is in `GAME_RULES.md` §9.
3. All scoring, XP, level, clock, streak, and ranking math lives in `packages/shared/src/rules/` only.
   UI and server code call it. They never re-implement it.
4. Shared rules are pure TypeScript: no DOM, no Node APIs, no `Math.random` (use the injected seeded PRNG).
5. The client never sets XP, level, score, rating, or rank. The server computes them.
6. Every reward and event write is idempotent (unique event ID / ledger key).
7. A prototype save file (`starspell_celestial_v1`) must still load in the port.
8. Public leaderboards use only server-validated multiplayer results from registered users.

## Architecture (fixed unless the owner approves a change)

- Monorepo, pnpm workspaces: `apps/web`, `apps/api`, `packages/shared`, `reference/`, `scripts/`, `docs/`.
- Web: React + TypeScript (strict) + Vite + **Tailwind v3** (same major version as the prototype's CDN build).
- API: NestJS + Prisma + PostgreSQL. REST for accounts/progress/leaderboards, Socket.IO gateway for rooms/matches.
- Multiplayer is **server-authoritative over WebSockets**. There is no WebRTC and no host trust.
- Validation: zod schemas in `packages/shared`, used by both client and server.
- Tests: Vitest (unit/integration), Playwright (E2E, run through real browser contexts).

## Code standards

- "Move, don't rewrite": port the scenery engine and audio engine as TypeScript classes with minimal edits.
  Copy the prototype CSS verbatim into `apps/web/src/styles/`. Keep class names so visuals stay identical.
- TypeScript strict. No `any` without a one-line reason. Modules under about 400 lines.
- Validate every input at the server boundary. Return one consistent error shape.
- No secrets in code or client env vars. Only placeholders in `.env.example`.
- No new dependency without a one-line justification in the plan.

## Terminal and safety

- No deploys, DNS changes, paid services, global installs, or `curl | sh`.
- No destructive commands outside this repo. No `git push`.
- If something is blocked (Docker or Postgres missing, no network), append it to `docs/BLOCKERS.md`
  with the exact error, finish what you can, and **never mock success**.
- Test-only hooks (like `?seed=`) must be compiled out of production builds and covered by a test that proves it.

## Honesty rules

- Report partial work as partial. List what works and what does not.
- If a test cannot run, say which test and why. Do not skip it silently or weaken it to pass.
- Do not change formulas, difficulty values, or vocabulary to make a test pass.
