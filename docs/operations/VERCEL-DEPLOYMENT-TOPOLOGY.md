# Zuri OS Vercel Deployment Topology

**Status:** In Review  
**Owner:** Zuri OS platform operations  
**Version:** 1.0.0  
**Last updated:** 2026-11-21

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

## Environment templates

- [API environment template](../../apps/api/.env.example) documents required local variables without containing credentials.
- [Web environment template](../../apps/web/.env.example) documents the public API origin.
- Production secrets must be configured directly in Vercel's production environment. Never commit real values or copy branch-scoped preview credentials into production.
- Configure exact CORS origins; do not use wildcard origins for credentialed requests.

## Release gates

1. Verify the project, branch, commit and root directory.
2. Run frozen pnpm install, typecheck, tests and build in CI.
3. Confirm API production environment has required secrets and a replica-set/sharded MongoDB topology.
4. Deploy a preview and test health, authentication, workspace selection, CORS and tenant isolation.
5. Promote only a tested production-target deployment.
6. Verify the domain alias, health/readiness, runtime logs and browser smoke tests.
7. Record commit SHA, deployment IDs, test evidence and rollback target.

## Current observed deployment checkpoint (2026-11-21)

The Vercel team/project inspection confirms the two retained projects are `zurios` and `zurios-api`.

- The production frontend deployment is READY on `main` commit `e98e1b8f322149a36823bdba99d087f96a8b5a69`. This is not the current implementation branch and must not be described as the latest Zuri OS release.
- The latest confirmed feature-branch frontend preview was READY at `3af246254863768f6531bab354f8eea89b805566`. This is an older checkpoint; current branch head deployments have not been found because Vercel is returning `build-rate-limit`.
- The API production deployment is in ERROR on old branch `fix/vercel-pnpm-node22`, commit `9678ff8b2a9474575fbf330a7e7d47cbf32817dd`. Its build log shows TypeScript cannot resolve `@zuri/core-platform` from the API workspace. The current feature branch has since changed the workspace package export and passes GitHub monorepo typecheck/build, but no current-head Vercel deployment is available to confirm the fix end-to-end.
- The current feature-branch Vercel checks for both projects are failing with a deployment `build-rate-limit` response. Do not retry deployment creation repeatedly while the platform is rate-limiting builds.
- Environment-variable inventory was inspected without decrypting values: `zurios-api` has preview-only variables scoped to the old `fix/vercel-pnpm-node22` branch; there are no production environment variables reported for that project. The `zurios` frontend project currently reports no project environment variables. No production secrets were read or created.
- Required production variables and external dependencies remain owner-controlled: MongoDB replica-set URI/database, JWT issuer/audience/secret, MFA encryption key or keyring, audit signing key/keyring, exact CORS origins, mail-provider credentials/sender, and approved runtime settings. Never promote old branch-scoped preview secrets into production.

No current feature-branch production promotion, API health check, or end-to-end browser smoke test has been completed. The release remains blocked until the current API/frontend commit deploys successfully, production variables are configured by the owner, health/readiness and authentication/workspace flows pass, and rollback evidence is recorded.

Do not claim production-ready until both projects pass the release gates above.
