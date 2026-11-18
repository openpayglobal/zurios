# Zuri OS API

Fastify-based platform API for Zuri OS. The Vercel project is configured to deploy this workspace package independently from the Vite web application.

## Runtime

- Framework: Fastify 5
- Runtime: Node.js 22.x
- Package manager: pnpm 9.15.4 via Corepack
- Database: MongoDB
- Entrypoint: `src/server.ts`
- Health endpoints: `GET /health/live` and `GET /health/ready`

## Workspace commands

Run these from the repository root:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @zuri/api typecheck
corepack pnpm --filter @zuri/api build
corepack pnpm --filter @zuri/api test
```

## Required Vercel environment

Configure these as encrypted Vercel environment variables before expecting the API runtime to start:

| Variable | Requirement |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | MongoDB connection string for the Zuri OS database |
| `MONGODB_DATABASE` | Database name (recommended: `zuri_os`) |
| `JWT_ISSUER` | Stable HTTPS issuer URL for the API |
| `JWT_AUDIENCE` | API audience identifier |
| `JWT_SECRET` | Random secret of at least 32 characters |
| `MFA_ENCRYPTION_KEY` | Base64-encoded 32-byte key; mandatory in production |
| `CORS_ORIGINS` | Comma-separated exact frontend origins |

Optional variables: `API_HOST`, `API_PORT`, `ACCESS_TOKEN_TTL_SECONDS`, and `SESSION_TTL_SECONDS`.

Do not commit real credentials or place them in source control. Keep MongoDB access restricted to approved network sources; do not open the cluster to all IP addresses as a deployment shortcut.

## Readiness

- `/health/live` reports process liveness.
- `/health/ready` verifies MongoDB connectivity and returns HTTP 503 while the database is unavailable.

A successful Vercel build alone does not mean the API is operational. Runtime verification must include both endpoints after the required environment variables and MongoDB network access have been configured.
