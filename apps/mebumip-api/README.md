# Zuri MeBuMIP API Workspace

Fastify API service for the standalone Zuri MeBuMIP product.

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @zuri/mebumip-api dev
```

Default port: `4100`.

Environment:
- `API_HOST` (default `0.0.0.0`)
- `API_PORT` (default `4100`)
- `NODE_ENV` (default `development`)
- `MONGODB_URI` (required for readiness)
- `MONGODB_DATABASE` (default `zuri_mebumip`)
- `CORS_ORIGINS` (comma-separated exact origins; default `http://localhost:5174`)

Health:
- `GET /health/live` — process liveness.
- `GET /health/ready` — returns ready only when MongoDB is configured and reachable.

No tenant or Meta resource endpoints are exposed yet. Authentication, tenant resolution, authorization, audit middleware, webhook signature verification and rate limits must be implemented before protected API routes are added. Do not deploy as a production business API in this state.
