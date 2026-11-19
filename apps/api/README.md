# Zuri OS API

Fastify-based MongoDB platform API. The API is deployed separately from the Vite web application.

## Vercel deployment

Vercel has native zero-configuration Fastify support. The API project uses the existing Fastify entrypoint `src/server.ts`, which registers the application routes and starts Fastify with `app.listen()`. Vercel packages the Fastify application as a single Function and routes requests through Fastify's router.

Project configuration:
- Project: `zurios-api`
- Root directory: `apps/api`
- Framework: Fastify
- Node runtime: 22.x
- Package manager: pnpm 9.15.4 through Corepack
- Install command: `cd ../.. && corepack pnpm install --frozen-lockfile`
- Build command: `cd ../.. && corepack pnpm --filter @zuri/api... build`
- Fastify entrypoint: `src/server.ts`

The root-relative commands explicitly return to the monorepo workspace so the committed root lockfile and `@zuri/core-platform` workspace dependency are included. Do not add a second `api/index.ts` handler; Vercel's Fastify adapter detects `src/server.ts`.

## Environment variables

Set these as encrypted Vercel project environment variables before the API is deployed:

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | MongoDB Atlas connection URI for the dedicated Zuri OS database |
| `MONGODB_DATABASE` | Dedicated database name, recommended `zuri_os` |
| `JWT_ISSUER` | Stable HTTPS issuer URL |
| `JWT_AUDIENCE` | API audience identifier |
| `JWT_SECRET` | Random secret, minimum 32 characters |
| `MAC_MFA_ENCRYPTION_KEY` | Separate base64-encoded 32-byte key, required to activate MAC/MAD |
| `MAC_JWT_SECRET` | Independent random MAC operator signing key; never reuse `JWT_SECRET` |
| `MAC_BOOTSTRAP_TOKEN` | One-time high-entropy initial-owner bootstrap token; remove after bootstrap |
| `MAC_SESSION_TTL_SECONDS` | MAC operator session lifetime; defaults to 28,800 seconds |
| `CORS_ORIGINS` | Comma-separated exact allowed frontend origins |

The MAC/MAD API remains unavailable until `MAC_JWT_SECRET` and `MAC_MFA_ENCRYPTION_KEY` are configured. Initial owner bootstrap additionally requires `MAC_BOOTSTRAP_TOKEN`; remove that token after activation. The web project must set `VITE_ZURI_API_URL` to the API origin and its origin must be listed in `CORS_ORIGINS`.

Do not commit real credentials. Use a dedicated least-privilege MongoDB database user, TLS, and narrowly scoped Atlas network access. Do not use unrestricted `0.0.0.0/0` access merely to make deployment succeed.

## Health

- `GET /health/live` reports process liveness.
- `GET /health/ready` pings MongoDB and returns HTTP 503 while the database is unavailable.
- Startup initializes MongoDB and registers routes; an invalid/missing connection prevents the API from becoming ready.

## Local workspace commands

Run from repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @zuri/api typecheck
corepack pnpm --filter @zuri/api... build
corepack pnpm --filter @zuri/api test
```
