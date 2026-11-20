# Zuri OS Vercel Deployment Topology

**Status:** In Review  
**Owner:** Zuri OS platform operations  
**Version:** 1.0.0  
**Last updated:** 2026-11-20

## Canonical projects

| Responsibility | Vercel project | Production domain |
|---|---|---|
| Frontend | `zurios` | https://zurios.vercel.app |
| API | `zurios-api` | https://zurios-api.vercel.app |

Retired duplicate projects `web` and `web-ojqo` are no longer part of the deployment topology.

## Project boundaries

- Frontend project builds `apps/web` and publishes the Vite static application.
- API project builds `apps/api` and runs the Fastify service.
- The frontend uses `VITE_API_BASE_URL=https://zurios-api.vercel.app` for API requests.
- API CORS allowlist includes the exact production frontend origin and approved preview origins only.
- Production and preview environment variables are separate. Never copy preview secrets into production automatically.
- MongoDB connection and JWT/MFA secrets are configured only in the API project; they are never exposed to the Vite client.

## Release gates

1. Verify the project, branch, commit and root directory.
2. Run frozen pnpm install, typecheck, tests and build in CI.
3. Confirm API production environment has required secrets and a replica-set/sharded MongoDB topology.
4. Deploy a preview and test health, authentication, workspace selection, CORS and tenant isolation.
5. Promote only a tested production-target deployment.
6. Verify the domain alias, health/readiness, runtime logs and browser smoke tests.
7. Record commit SHA, deployment IDs, test evidence and rollback target.

## Current observed deployment checkpoint

At the 2026-11-20 checkpoint, `zurios` had a READY Vite deployment, but the custom domain alias pointed to a preview deployment. `zurios-api` had a failed deployment due to TypeScript compilation errors in `apps/api` and `packages/core-platform`. Domains were attached and verified, but API health and end-to-end application readiness were not verified. Production environment credentials were not confirmed.

Do not claim production-ready until both projects pass the release gates above.
