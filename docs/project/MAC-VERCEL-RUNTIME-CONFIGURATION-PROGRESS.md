# MAC-to-Vercel Runtime Configuration — Progress Addendum

**Date:** 2026-11-20  
**Status:** Architecture documented; implementation not yet started  
**Branch:** `feat/mac-runtime-config-vercel-oidc`  
**Base:** PR #15 integration commit `6356bea5cf376b3efe9236d0be4c0ed15ad0f7aa`

## User requirement

The Zuri OS Master Admin Console (MAC) is to be the authoritative source of configuration. Vercel-hosted workloads must consume approved configuration changes without redeployment.

## Verified platform facts

- Repository: `openpayglobal/zurios`, default branch `main`.
- Canonical Vercel projects: `zurios` (Vite frontend) and `zurios-api` (Fastify API), both linked to the repository.
- Vercel team plan observed: Hobby.
- Frontend project environment inventory: empty.
- API environment inventory: preview/branch-scoped values only; the inspected `MONGODB_URI` entry has an empty value. No production API configuration was confirmed.
- Latest frontend deployment observed: READY preview; latest API deployment observed: CANCELED. Prior API deployment records include ERROR states.
- GitHub PR #15 integration candidate head `6356bea5cf376b3efe9236d0be4c0ed15ad0f7aa` passed both CI workflows (Full CI run 44868072045 and MeBuMIP Phase 1 run 44868072059). Vercel checks on that commit failed with the team's build-rate-limit status.
- Existing MAC configuration route is tenant-scoped and limited to `defaultLocale`, `defaultCurrency`, `timezone` and `displayName`. It is not a global runtime secret/configuration registry and is not yet a Vercel workload configuration API.

## Architecture decision

Added ADR-006 and the operations design:

- `docs/architecture/decisions/ADR-006-MAC-CONTROLLED-VERCEL-RUNTIME-CONFIGURATION.md`
- `docs/operations/MAC-VERCEL-RUNTIME-CONFIGURATION.md`

The design distinguishes deployment/build-time Vercel environment variables from live runtime configuration. Existing Vercel deployments do not receive updated environment variables merely because the project variable is edited. Vite `VITE_*` variables are build-time substitutions. To meet the no-redeployment requirement, MAC must expose versioned runtime configuration over authenticated HTTPS; Vercel workloads consume it at runtime. Secret configuration is backend-only. Browser code receives only a public allowlist.

Vercel OIDC is proposed as workload identity, subject to verification against a real token's signature and exact team/project/environment claims before production trust is enabled.

## Work completed in this increment

1. Created branch `feat/mac-runtime-config-vercel-oidc` from the passing PR #15 integration candidate.
2. Added ADR-006 with configuration classes, security model, caching/revision strategy, consequences and acceptance criteria.
3. Added the MAC-to-Vercel runtime configuration operations runbook.
4. Confirmed current Vercel environment inventory without requesting decrypted values.
5. Did not modify Vercel production variables, copy preview secrets, create deployments, promote aliases or touch production data.

## Remaining implementation

1. Add typed, versioned global MAC runtime-configuration records and immutable history.
2. Add dedicated encrypted secret storage/keyring and rotation lifecycle.
3. Add OIDC token signature/claim validation bound to the exact Vercel team, project and environment.
4. Add backend-only configuration retrieval and per-key authorization.
5. Add ETag/revision-aware bounded caching, revocation and outage behavior.
6. Add public-only runtime configuration endpoint for the Vite application.
7. Add MAC UI for edits, approvals, history, rollback and audit evidence.
8. Add unit, API, MongoDB replica-set, tenant-isolation, OIDC and end-to-end tests.
9. Run exact-head CI and deployment validation when Vercel build capacity is available.
10. Configure production infrastructure only with owner-authorized credentials and approvals.

## Release blockers

- Production MongoDB replica-set URI and production JWT/MFA/audit/Meta keyrings are not verified.
- No real Vercel OIDC token fixture has been inspected; token claim contract remains unverified.
- MAC runtime configuration service/UI is not implemented.
- Vercel API production deployment and health/readiness remain unaccepted.
- Vercel team build-rate limit blocks fresh deployment validation.
- No production secret transfer or migration is authorized.

**Status language:** This increment is documentation/architecture work only. It is not an implementation of runtime configuration, not a successful Vercel deployment, and not production acceptance.
