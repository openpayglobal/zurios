# Zuri OS — Implementation Progress Register

**Status:** In progress  
**Owner:** Zuri OS programme / platform engineering  
**Last updated:** 2026-11-20  
**Source branches:** `feat/zuri-mebumip-foundation` (PR #14), `feat/mebumip-phase1-security-hardening` (PR #13)

## 1. Executive status

The identity-first, multi-workspace sign-in foundation is implemented and CI-verified. One global user identity can have multiple active tenant memberships. Sign-in verifies the user first; workspace selection then issues a tenant- and membership-bound session. Switching workspace revalidates membership and revokes the prior session.

The canonical ecosystem, product, architecture, UX, database, API and deployment documents are now indexed under `docs/`, including ADR-005 for the global identity/multi-workspace decision and safe API/web `.env.example` templates. This register distinguishes source/CI evidence from Vercel deployment and production readiness.

## 2. Current delivery evidence

| Area | Status | Evidence |
|---|---|---|
| Ecosystem and product documentation | Implemented; CI-verified | Master execution plan, PRD, technical architecture, database blueprint, UX design system and ecosystem overview indexed in `docs/README.md` |
| Global identity and multiple memberships | Implemented; CI-verified | API login no longer requires a workspace slug; workspace choices are returned only after credentials and required MFA |
| Workspace selection | Implemented; CI-verified | Short-lived, purpose-bound, single-use selection token; server validates active user, tenant and membership before issuing a session |
| Workspace switching | Implemented; CI-verified | Authenticated endpoint validates target membership, issues new tenant-bound session and revokes previous session |
| Membership validity and lookup | Implemented; CI-verified | Time-valid membership filtering and indexed user/status workspace lookup |
| Frontend workspace chooser | Implemented; CI-verified | Post-login workspace chooser and active workspace switcher |
| Multi-workspace integration coverage | Implemented; CI-verified | MongoDB replica-set test covers two memberships, listing, selection, replay rejection and switching |
| Public “Request Zuri OS” workflow | Not yet verified/implemented in current source branch | The current `apps/web/src/App.tsx` contains sign-in and workspace selection but no “Request Zuri OS” screen or matching public API route. Do not invent the workflow until the owner-supplied ecosystem reference is accessible and requirements are reconciled |
| Production deployment | Blocked | Vercel build-rate-limit; no current READY deployment for the new commits |
| Production API configuration | Blocked | No production API environment variables are configured; preview-only variables exist on a separate branch and are not copied to production |

## 3. CI verification

### PR #14 — frontend/foundation branch

Head commit: `62862b5e8f43aaf5fd614ef0d230975981e1166c`

- [Full monorepo CI run 44740817921](https://github.com/openpayglobal/zurios/actions/runs/44740817921) — passed.
- [MeBuMIP Phase 1 verification run 44740817965](https://github.com/openpayglobal/zurios/actions/runs/44740817965) — passed.
- API typecheck/tests/build and web typecheck/build all completed successfully.

### PR #13 — API/security branch

Head commit at verification: `1991c29efe2d3c224dc2589ede66cfaa9baa89f6`

- [Full monorepo CI run 44741920316](https://github.com/openpayglobal/zurios/actions/runs/44741920316) — passed.
- [MeBuMIP Phase 1 verification run 44741920500](https://github.com/openpayglobal/zurios/actions/runs/44741920500) — passed.
- OpenAPI validation, route drift, TypeScript typecheck, MongoDB replica-set tests, API build and web build all passed.

These are CI results for the named commits. They do not prove that Vercel has deployed those commits or that production credentials are configured.

## 4. Canonical Vercel topology

| Role | Project | Intended domain |
|---|---|---|
| Frontend | `zurios` | https://zurios.vercel.app |
| API | `zurios-api` | https://zurios-api.vercel.app |

Duplicate projects `web` and `web-ojqo` have been deleted by the owner and are retired.

### Observed state

- `zurios.vercel.app` is attached to project `zurios`, but its current alias points to preview deployment `dpl_82rBQghGvGDWsGNsh6RbWYVd2HfF`, not a verified production deployment of the latest branch.
- `zurios-api.vercel.app` is attached to project `zurios-api` and domain verification reports `verified: true`. Alias lookup currently returns 404 because there is no READY API deployment to receive the alias.
- Latest inspected API deployment `dpl_CbXqfQxe2j6d7eHHXSdU4zHUAkzD` is in ERROR. Its earlier TypeScript failures have been corrected in the current branch and passed GitHub CI.
- Vercel build checks currently return the team's build-rate-limit response. No deployment has been created or promoted from the latest commits.

### Environment configuration

- Frontend project environment-variable list is empty. The frontend code now has a public API URL fallback to `https://zurios-api.vercel.app`; it is not a secret.
- API production environment has no configured variables.
- Existing API secrets are preview-only and scoped to branch `fix/vercel-pnpm-node22`. They are not copied into production or broadened to all preview branches.
- Production API startup requires at minimum `MONGODB_URI`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `NODE_ENV=production`, `MONGODB_DATABASE` and an exact `CORS_ORIGINS` allowlist. Secret values must be supplied/configured by the owner; placeholders are not acceptable.

## 5. External ecosystem reference

The owner supplied [ODEI-Multi-Ecosystem](https://github.com/infoedutechos/ODEI-Multi-Ecosystem). The connected GitHub account returned 404 for that repository, so its private or inaccessible contents have not been assumed. The current Zuri OS documentation has been assembled from accessible Zuri repository specifications and the explicit multi-workspace requirement.

To reconcile ODEI-specific product modules, workflows, user roles, workspace onboarding and acceptance criteria, repository access must be granted to the connected GitHub integration or the reference repository must be made accessible.

## 6. Remaining work and release gates

1. Reconcile the complete ODEI ecosystem product catalogue and requirements once access is granted.
2. Confirm the intended “Request Zuri OS” journey (new tenant request, existing workspace membership request, invitation, or a combination) and implement its public request, approval, notification and audit workflow without self-granting access.
3. Add end-to-end browser tests for sign-in, MFA, no-workspace state, multi-workspace selection, switching, expired/replayed selection and logout.
4. Configure production API environment variables using owner-provided secrets and least-privilege database credentials.
5. Wait for or resolve the Vercel build-rate-limit constraint without creating paid recurring spend unless explicitly approved.
6. Deploy and verify the latest frontend and API commits; confirm both aliases, API health/readiness, CORS, authentication, workspace isolation and runtime logs.
7. Promote to production only after the end-to-end release gate passes and the owner approves.

## 7. Status language

- **Implemented:** code exists.
- **CI-verified:** the named workflow passed on the exact commit.
- **Deployed:** a Vercel deployment artifact exists.
- **Production-configured:** production secrets and infrastructure controls are configured and verified.
- **Complete:** all approved acceptance criteria and release gates pass.

At this checkpoint, the identity-first multi-workspace foundation is **CI-verified**. The Zuri OS production deployment and public access-request journey are **not complete**.
