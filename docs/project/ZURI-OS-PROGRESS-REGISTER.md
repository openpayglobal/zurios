# Zuri OS — Implementation Progress Register

**Status:** In progress  
**Owner:** Zuri OS programme / platform engineering  
**Last updated:** 2026-11-20  
**Source branches:** `feat/zuri-mebumip-foundation` (PR #14), `feat/mebumip-phase1-security-hardening` (PR #13)

## 1. Executive status

The identity-first, multi-workspace sign-in foundation is implemented and CI-verified. One global user identity can have multiple active tenant memberships. Sign-in verifies the user first; after required MFA, the API returns the user's authorized active workspace choices. Selecting a workspace issues a tenant- and membership-bound session. Switching workspace revalidates membership and revokes the previous session.

The public **Request Zuri OS** flow is now present in the PR #14 source branch. It is deliberately separate from the workspace chooser: a request is a human-reviewed platform-access enquiry and does not create an identity, tenant, workspace or membership. The public request feature is disabled by default and production enablement requires an HTTPS privacy-notice URL. The request queue and review API are permission-gated and audited. Approval means approval for follow-up only; provisioning and membership assignment remain separate operations.

The canonical ecosystem, product, architecture, UX, database, API and deployment documents are indexed under `docs/`, including ADR-005 for the global identity/multi-workspace decision, access-request privacy requirements and safe API/web `.env.example` templates. This register distinguishes source/CI evidence from Vercel deployment and production readiness.

## 2. Current delivery evidence

| Area | Status | Evidence |
|---|---|---|
| Ecosystem and product documentation | Implemented; CI-verified | Master execution plan, PRD, technical architecture, database blueprint, UX design system and ecosystem overview indexed in `docs/README.md` |
| Global identity and multiple memberships | Implemented; CI-verified | Identity-first login; authorized workspace choices disclosed only after credentials and required MFA |
| Workspace selection | Implemented; CI-verified | Short-lived, purpose-bound, single-use selection token; server validates active user, tenant and membership before issuing a session |
| Workspace switching | Implemented; CI-verified | Authenticated endpoint validates target membership, issues new tenant-bound session and revokes previous session |
| Membership validity and lookup | Implemented; CI-verified | Time-valid membership filtering and indexed user/status workspace lookup |
| Frontend workspace chooser | Implemented; CI-verified | Post-login chooser and active-workspace switcher |
| Public “Request Zuri OS” workflow | Implemented; CI-verified on PR #14 | Public form, non-enumerating 202 response, rate limiting, feature flag disabled by default, HTTPS privacy-notice requirement in production, platform review queue, audit/outbox; approval does not provision |
| Access-request privacy and retention | Draft; owner/legal decision required | `docs/compliance/ACCESS-REQUEST-PRIVACY-AND-RETENTION.md`; no production retention period is invented; legal controller and notice require confirmation |
| Multi-workspace and access-request integration coverage | Implemented; CI-verified on PR #14 | MongoDB replica-set integration suite covers multiple memberships, selection/replay/switch, no-user-creation on request, feature-flag off, rate-limit acknowledgement, privileged review and no membership auto-creation |
| Production deployment | Blocked | Latest Vercel build/deployment state remains subject to team build-rate limit; aliases must be rechecked before release |
| Production API configuration | Blocked | Production secrets and approved privacy notice/retention decisions must be configured by the owner; preview-only secrets are not copied to production |

## 3. CI verification

### PR #14 — Zuri OS foundation branch

Latest verified head commit: `6d9397477653b12db6b2ab31e09df458fa127852`

- [Full monorepo CI run 44788627097](https://github.com/openpayglobal/zurios/actions/runs/44749796324) — passed.
- [MeBuMIP Phase 1 verification run 44788626980](https://github.com/openpayglobal/zurios/actions/runs/44749797548) — passed.
- Full CI steps passed: MongoDB replica-set startup, both OpenAPI 3.1 validations, route-drift validation, product-document mirror consistency, monorepo typecheck, tests and build.
- MeBuMIP verification steps passed: API typecheck/tests/build and web typecheck/build.
- The public access-request routes now consume the validated `AuthConfig` values supplied by API startup rather than reading `process.env` independently. Tests cover enabled and disabled configurations, including hidden privacy URL and HTTP 503 when disabled.
- `pnpm docs:sync` and `pnpm docs:check` maintain the five mirrored MeBuMIP product documents; CI executes the check.
- PR #14 is open, non-draft and reported mergeable at the time of verification. It has no unresolved review threads in the GitHub review-thread query.
- Additional regression coverage asserts that a public access request does not create a user, tenant or membership and that public auth configuration and request responses are not cached.

### PR #13 — API/security branch

Head commit at this verification: `52e94d1c6b1a87d516cba9fdd64337463259199f`

- [Full monorepo CI run 44742226521](https://github.com/openpayglobal/zurios/actions/runs/44742226521) — passed.
- [MeBuMIP Phase 1 verification run 44742226473](https://github.com/openpayglobal/zurios/actions/runs/44742226473) — passed.

These CI results apply to the exact named commit. They verify source, type, contract, test and build checks; they do not prove Vercel has deployed the commit or that production credentials are configured. The full MeBuMIP documentation set is now mirrored under `docs/products/zuri-mebumip/` and indexed by `docs/README.md`.

## 4. Canonical Vercel topology

| Role | Project | Intended domain |
|---|---|---|
| Frontend | `zurios` | https://zurios.vercel.app |
| API | `zurios-api` | https://zurios-api.vercel.app |

Duplicate projects `web` and `web-ojqo` have been deleted by the owner and are retired.

### Observed state

- The previously inspected `zurios.vercel.app` alias pointed to an older preview deployment, not a verified production deployment of the current source.
- The `zurios-api.vercel.app` domain was attached and verified, but the previously inspected alias lookup returned 404 because there was no READY API deployment to receive the alias.
- Vercel's GitHub commit checks currently report `build-rate-limit` for both `zurios` and `zurios-api`. A fresh Vercel API inspection on 2026-11-20 also returned HTTP 403 `forbidden` for deployment listing and alias lookup. This is an account permission/quota blocker, not evidence that the deployments are healthy or unhealthy. No authorized CLI fallback is available in the connected environment. Recheck with a Vercel team operator after build capacity and access are restored; do not infer deployment success from GitHub CI.

### Environment configuration

- Frontend project environment-variable list was previously empty; the frontend has a public API URL fallback to `https://zurios-api.vercel.app`.
- API production environment was previously observed with no configured variables.
- Existing API secrets were preview-only and branch-scoped. They must not be copied into production or broadened to other branches.
- Production API startup requires at minimum `MONGODB_URI`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_SECRET`, `MFA_ENCRYPTION_KEY`, `NODE_ENV=production`, `MONGODB_DATABASE` and an exact `CORS_ORIGINS` allowlist.
- Public access requests must remain disabled until the approved HTTPS privacy notice and owner-approved retention/controller decisions are in place. Configure `ACCESS_REQUESTS_ENABLED=true` only after those release gates; do not set this flag merely to make the button visible.

## 5. External ecosystem reference

The owner supplied [ODEI-Multi-Ecosystem](https://github.com/infoedutechos/ODEI-Multi-Ecosystem). The connected GitHub account previously returned 404 for that repository, so its private or inaccessible contents have not been assumed. The current Zuri OS documentation has been assembled from accessible Zuri repository specifications and explicit owner requirements.

To reconcile ODEI-specific product modules, workflows, user roles, workspace onboarding and acceptance criteria, repository access must be granted to the connected GitHub integration or the reference repository must be made accessible.

## 6. Remaining work and release gates

1. Reconcile the complete ODEI ecosystem product catalogue and requirements once access is granted.
2. Obtain legal/product-owner approval for the public access-request privacy notice, data controller, retention schedule, deletion authority and requester communication workflow.
3. Add end-to-end browser tests for sign-in, MFA, no-workspace state, multiple-workspace selection, switching, expired/replayed selection, public access request and logout.
4. Configure production API environment variables using owner-provided secrets and least-privilege database credentials.
5. Recheck Vercel build capacity and project/domain settings; do not create paid recurring spend unless explicitly approved.
6. Deploy and verify the latest frontend and API commits; confirm both aliases, API health/readiness, CORS, authentication, workspace isolation and runtime logs.
7. Keep public access requests disabled until privacy and retention gates are approved and implemented.
8. Promote to production only after the end-to-end release gate passes and the owner approves.

## 7. Status language

- **Implemented:** code exists.
- **CI-verified:** the named workflow passed on the exact commit.
- **Deployed:** a Vercel deployment artifact exists.
- **Production-configured:** production secrets and infrastructure controls are configured and verified.
- **Complete:** all approved acceptance criteria and release gates pass.

At this checkpoint, the identity-first multi-workspace foundation and PR #14 public access-request workflow are **CI-verified** on their recorded commits. The Zuri OS production deployment and production public-access enablement are **not complete**.
