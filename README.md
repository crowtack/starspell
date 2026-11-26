# Starspell

Wilderness-canyon spelling arcade with deterministic solo chapters, resumable event-sourced solo sync, server-authoritative multiplayer Competition & Survival modes, Elo-style ratings, and UTC-windowed leaderboards.

## Architecture

- `packages/shared`: Pure TypeScript game rules (`soloReducer`, `planChapter`, `competition`, `survival`, `rating`, `leaderboardWindows`), Zod schemas, and word banks (`original-words.json` + `expansion-v1.json`).
- `apps/api`: NestJS + Prisma + PostgreSQL REST API and Socket.IO `/multiplayer` gateway.
- `apps/web`: React + TypeScript + Vite + Tailwind CSS v3 client with Canvas sunset scenery, Web Audio synthesizer/SFX, IndexedDB sync outbox, and multiplayer UI.
- `reference/starspell.html`: Read-only original prototype (source of truth for visuals, audio, and core solo behavior).

## Prerequisites

- Node.js 20+
- `corepack pnpm` (`pnpm@10.11.0`)
- Docker (for local PostgreSQL) or a local PostgreSQL 16+ instance

## Local Setup

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   corepack pnpm install
   ```
3. Start PostgreSQL and run migrations + seed:
   ```bash
   docker compose up -d
   corepack pnpm --filter @starspell/api exec prisma migrate dev
   corepack pnpm --filter @starspell/api build
   corepack pnpm --filter @starspell/api prisma:seed
   ```
4. Start development servers:
   ```bash
   corepack pnpm dev
   ```
   - Web client: `http://localhost:5173`
   - API server: `http://localhost:3001`

## Environment Variables

See `.env.example`:
- `DATABASE_URL`: PostgreSQL connection string.
- `API_PORT`: API HTTP/WebSocket port (default `3001`).
- `SESSION_SECRET`: Random secret for API runtime.
- `CORS_ORIGIN`: Comma-separated list of allowed web origins (e.g. `http://localhost:5173`).
- `VITE_API_URL`: Base URL of the API server for the web client.

## Verification & Tests

- Typecheck: `corepack pnpm -r typecheck`
- Lint: `corepack pnpm -r lint`
- Unit & integration tests: `corepack pnpm -r test`
- Build: `corepack pnpm -r build`
- Format check: `corepack pnpm format:check`
- Playwright E2E suite: `corepack pnpm e2e`
