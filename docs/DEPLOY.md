# Starspell Deployment Guide

This document describes how to run and operate Starspell in production. **Do not deploy directly from agent sessions.**

## 1. Environment Variables

Configure these on the API host (never commit secrets or expose them in `VITE_*` client env vars):

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | Enables `Secure` cookies and hides stack traces | `production` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@db:5432/starspell?schema=public` |
| `API_PORT` | Internal HTTP/WebSocket port | `3001` |
| `SESSION_SECRET` | High-entropy random secret | `$(openssl rand -hex 32)` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated | `https://starspell.example.com` |

Configure on the Web build (`apps/web`):
- `VITE_API_URL=https://api.starspell.example.com` (or same-origin `/api` reverse proxy).

## 2. Database Migrations & Seed

1. Generate Prisma client and deploy migrations:
   ```bash
   corepack pnpm --filter @starspell/api exec prisma migrate deploy
   ```
2. Seed the canonical 110-word mirror (idempotent):
   ```bash
   corepack pnpm --filter @starspell/api build
   corepack pnpm --filter @starspell/api prisma:seed
   ```

## 3. HTTPS, Cookies & CORS

- Terminate TLS (HTTPS) at your reverse proxy (Nginx, Caddy, Cloudflare, or cloud load balancer).
- When `NODE_ENV=production`, session cookies (`starspell_sid`) are issued with `HttpOnly`, `SameSite=Lax`, and `Secure=true`.
- Mutating REST endpoints enforce `Origin` / `Referer` against `CORS_ORIGIN` plus `X-Requested-With`.
- Ensure `CORS_ORIGIN` matches the exact scheme + host of the web frontend.

## 4. WebSocket Proxying (Socket.IO)

Multiplayer uses Socket.IO on namespace `/multiplayer`. Reverse proxies must forward WebSocket upgrade headers and sticky/long-lived connections:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Scaling note:** Room and match state is held in memory on a single API instance. Scaling beyond one API instance requires a shared Socket.IO Redis adapter and externalized room/match coordination (out of scope for v1).

## 5. PostgreSQL Backups

Schedule daily logical backups with `pg_dump` (custom format) and verify restores periodically:

```bash
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="starspell-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Restore to a fresh database:

```bash
pg_restore --no-owner --clean --if-exists --dbname="$TARGET_DATABASE_URL" starspell-YYYYMMDDTHHMMSSZ.dump
```
