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
| `MFA_ENCRYPTION_KEY` | Base64-encoded 32-byte key, required in production |
| `CORS_ORIGINS` | Comma-separated exact allowed frontend origins |

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
