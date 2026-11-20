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

Latest verified head commit: `9ac593036ca913f8185ec0c3a08318d98c128ffe`

- [Full monorepo CI run 44788969224](https://github.com/openpayglobal/zurios/actions/runs/44788969224) — **passed**.
- [MeBuMIP Phase 1 verification run 44788970413](https://github.com/openpayglobal/zurios/actions/runs/44788970413) — **passed**.
- Full CI passed MongoDB replica-set startup, both OpenAPI 3.1 validations, route-drift validation, product-document mirror consistency, monorepo typecheck, tests and build.
- MeBuMIP verification passed dependency installation, API typecheck/tests/build, web typecheck and web build; the workflow completed successfully.
- The public access-request routes consume validated `AuthConfig` values supplied by API startup rather than reading `process.env` independently. Tests cover enabled and disabled configurations, including hidden privacy URL and HTTP 503 when disabled.
- `pnpm docs:sync` and `pnpm docs:check` maintain the five mirrored MeBuMIP product documents; CI executes the check.
- PR #14 is open, non-draft and reported mergeable at this verification checkpoint. Review threads should be rechecked before merge.
- Regression coverage asserts that a public access request does not create a user, tenant or membership and that public auth configuration and request responses are not cached.
- These runs verify the exact head commit above. They do not establish a Vercel deployment, production configuration or production release.

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

**Ecosystem documentation index expansion (2026-11-20):** audited the complete `docs/` tree (33 files) against `docs/README.md`. Added direct index entries for all previously unlisted platform foundation/Deliverable 6A specifications, event contracts, acceptance criteria, governance/release gates and the audit archive provider comparison. The authoritative index now exposes these engineering documents without requiring users to discover paths manually. CI verification for this documentation-only update is running; do not treat it as verified until the exact resulting commit's workflow succeeds.

**Pull-request integration risk review (2026-11-20):** PR #13 (draft API/security hardening) and PR #14 (foundation/product integration) are both open and currently reported mergeable, with no unresolved inline review threads at this inspection. Their changed-file sets overlap in 38 paths, including API authentication, MeBuMIP API configuration/services, web application panels, CI workflows and shared documentation. This is a material integration dependency: do not merge either PR independently or assume GitHub's mergeable flag proves semantic compatibility. Reconcile the overlapping implementations against the latest branch heads, preserve PR #13's additional security controls where not already superseded, then run the full CI and security acceptance suite on the combined candidate before merging. PR #13 remains draft; no merge or production action was taken.

**External standards and Meta version research refresh (2026-11-20):** rechecked official Meta, NIST and OWASP primary sources. The Meta Graph API landing page and Platform Versioning guide now identify v27.0 as latest, while the versions changelog still lists v26.0 as its latest Graph API table entry and v25.0 for Marketing API; the docs explicitly record this source synchronization discrepancy and require endpoint-level compatibility verification instead of hardcoding a version. Updated the security engineering reference set to include NIST SP 800-63-4 / SP 800-63B-4 and OWASP ASVS 5.0.0. These are design/test references, not certification or compliance claims. Official references: https://developers.facebook.com/docs/graph-api/ ; https://developers.facebook.com/docs/graph-api/guides/versioning ; https://developers.facebook.com/docs/graph-api/changelog/versions/ ; https://www.nist.gov/publications/nist-sp-800-63-4-digital-identity-guidelines ; https://csrc.nist.gov/pubs/sp/800/63/B/4/final ; https://asvs.owasp.org/ .

**Vercel API build diagnosis and tenant-document type correction (2026-11-20):** inspected actual Vercel deployment metadata and build events rather than attributing all failures to build-rate limits. A recent PR preview build on commit `d03c91a5e669427e6299747fb96833afa51464c2` failed in `packages/core-platform/src/tenant-service.ts` because the inferred provisioning object did not satisfy MongoDB's `OptionalId<TenantDocument>` shape (required tenant fields were inferred optional). Corrected the service to retain the runtime Zod validation while explicitly typing the validated input and persisted `TenantDocument`; this is commit `97fff94ba949068992f75ad93fd3c909a0adb7e9`. Full monorepo CI run [44790014410](https://github.com/openpayglobal/zurios/actions/runs/44790014410) passed OpenAPI validation, route drift, documentation mirror checks, typecheck, tests and build on that fix commit. MeBuMIP run [44790014662](https://github.com/openpayglobal/zurios/actions/runs/44790014662) passed API typecheck/tests/build and web typecheck/build; workflow cleanup was still running at last inspection. Added explicit integration assertions for tenant slug, legal/display names, locale, currency and timezone defaults in commit `1d5d077660e1361aa51819b13c20a6d3d30877bc`; exact-head full CI and MeBuMIP workflows are running and must pass before this regression addition is marked verified.

**Vercel deployment blockers distinguished (2026-11-20):** the current production API deployment `dpl_GnYxjtsWgTVxhMJkRH55vYoHDjQm` on older branch `fix/vercel-pnpm-node22` is `ERROR` with `module_not_found` for `@zuri/core-platform`; a newer feature-branch preview deployment on commit `d03c91a5e669427e6299747fb96833afa51464c2` failed on the tenant-document typing error described above. The frontend production deployment is `READY` but still serves older main commit `e98e1b8f322149a36823bdba99d087f96a8b5a69`. Vercel has not yet returned a deployment for the corrected commit `97fff94...` or regression-test commit `1d5d077...`; no production deployment or promotion is claimed. Recheck after Vercel processes the new commit, then investigate any remaining workspace-resolution or project-root configuration issue independently.

**Tenant provisioning type regression verification (2026-11-20):** the explicit `TenantDocument` type boundary and expanded MongoDB replica-set assertions for tenant slug, legal/display names, locale, currency and timezone defaults are committed in `1d5d077660e1361aa51819b13c20a6d3d30877bc`. Full monorepo CI [44790130954](https://github.com/openpayglobal/zurios/actions/runs/44790130954) completed successfully on that exact commit, including OpenAPI checks, route drift, docs mirror check, typecheck, tests and build. The API typecheck, tests and build also passed in MeBuMIP run [44790131002](https://github.com/openpayglobal/zurios/actions/runs/44790131002); its web checks were still progressing at the time of the update. The subsequent documentation/progress commit is `56ad23efd08dbb970c1cd5bb3cd1e4e29f2686fe`; its exact-head CI and MeBuMIP workflows are running separately. This verifies the source correction in CI, not yet a Vercel preview deployment.


**Latest exact-head verification and integration checkpoint (2026-11-20):** PR #14 head is now `0152eb2e790e551ce5a7dee82789660a664a9d2c`. Both required GitHub Actions workflows have completed successfully on this exact commit: [Full monorepo CI #44790417888](https://github.com/openpayglobal/zurios/actions/runs/44790417888) and [MeBuMIP Phase 1 verification #44790417922](https://github.com/openpayglobal/zurios/actions/runs/44790417922). Full CI passed MongoDB replica-set setup, both OpenAPI 3.1 validations, route-drift validation, documentation mirror consistency, monorepo typecheck, tests and build. MeBuMIP verification passed API typecheck/tests/build and web typecheck/build. The root Node engine is constrained to `>=22.12.0 <23` to prevent Vercel from selecting Node 26 when project settings specify Node 22. PR #14 remains open, non-draft and mergeable; PR #13 remains open and draft at head `52e94d1c6b1a87d516cba9fdd64337463259199f`. Latest inline review-thread checks returned zero threads on both PRs. The PR heads are not yet integrated: the previously audited 38 overlapping paths remain an explicit reconciliation gate, and no merge was performed.

**Deployment access recheck (2026-11-20):** an exact-SHA preview/deployment inspection for `0152eb2e790e551ce5a7dee82789660a664a9d2c` was attempted, but the connected Vercel API returned HTTP 403 `forbidden` on deployment listing. This is an authorization/access failure, not a build result. The earlier recorded Vercel build-rate-limit checks and older production API `module_not_found` failure remain distinct historical signals; neither can be declared resolved from GitHub CI. No successful latest-commit Vercel preview, API health check, alias verification, production configuration or promotion is established. A Vercel team operator must restore authorized deployment visibility/build capacity or provide an authorized CLI session before deployment can be verified. Keep production release blocked.


**Current branch-overlap reinspection and audit-chain reconciliation gate (2026-11-20):** refreshed the complete changed-file lists from both open pull requests: PR #13 changes 54 paths, PR #14 changes 73 paths, and the current intersection is **39 paths** (the earlier 38-path figure was from a prior snapshot). Focused source inspection found a semantic audit-integrity difference that must be resolved before integration: PR #13's `apps/mebumip-api/src/audit-service.ts` allocates sequence numbers and appends events in MongoDB transactions, links each event to its predecessor hash, signs the canonical event hash with a versioned key ID, verifies chain continuity/signatures and provides dry-run-first bounded legacy backfill. PR #14's `apps/mebumip-api/src/security.ts` contains versioned event signing and sequence allocation, but its inspected append path increments the counter and inserts the event without the same transaction-scoped predecessor-hash chain. This must not be treated as equivalent. Preserve and reconcile PR #13's stronger transactional, predecessor-linked chain while retaining PR #14's keyring rotation, export-manifest, platform-admin, password-recovery, CSRF and access-request work; add regression tests for concurrent appends, rollback, tampering, key rotation and legacy compatibility on the combined candidate. Cookie/CSRF code exists on both branches but differs and also requires a deliberate combined review. No branch merge was performed.

**Progress-register commit CI (2026-11-20):** the register update commit `947967863d1fbf7ab2a6b1fc5da171264ccd8c8e` passed [Full monorepo CI #44791315639](https://github.com/openpayglobal/zurios/actions/runs/44791315639), [MeBuMIP Phase 1 verification #44791315402](https://github.com/openpayglobal/zurios/actions/runs/44791315402), and the duplicate push-triggered MeBuMIP run [#44791303955](https://github.com/openpayglobal/zurios/actions/runs/44791303955). The GitHub commit status nevertheless reports Vercel deployment checks failed for both projects with the explicit message `Deployment rate limited — retry in 24 hours`; this is separate from successful CI and remains a release blocker.


**Final verification of latest register/risk update (2026-11-20):** commit `7ca6aa31d49c59c1582ba8d434a447736a59144f` completed successfully in [Full monorepo CI #44791610085](https://github.com/openpayglobal/zurios/actions/runs/44791610085) and [MeBuMIP Phase 1 verification #44791610046](https://github.com/openpayglobal/zurios/actions/runs/44791610046). Full CI completed OpenAPI validation, route drift, docs mirror check, typecheck, tests and build; MeBuMIP completed API typecheck/tests/build and web typecheck/build. Duplicate push-triggered MeBuMIP run [#44791596306](https://github.com/openpayglobal/zurios/actions/runs/44791596306) also passed. The current branch head's code and documentation changes are therefore CI-verified. This does not clear Vercel's separate build-rate-limit statuses, the 403 deployment-inspection restriction, production API module-resolution history, or the audit-chain integration gate.


**Workspace membership validity enforcement (2026-11-20):** focused authorization review found that the PR #14 branch's workspace listing, workspace selection, workspace switching, tenant-specific password login and tenant-bound MFA completion accepted memberships based on `status: active` without enforcing optional `validFrom`/`validUntil` bounds. Added a shared active-membership-window filter to all five paths in `apps/api/src/platform/auth-service.ts` (fix commit `5b8a2b7df156c2e2969672949575775071063b08`). Expanded `apps/api/src/platform/auth.integration.test.ts` to create expired and future-dated memberships, verify neither appears in workspace choices, reject selection of either, reject expired tenant-specific login, and verify a rejected switch to an expired membership does not revoke the user's existing valid session (test commits `9c1ef265c666f3f226091561d950ce9405d86893` and `48dbc319ffee4db8360473dfb61e3fe576ab2321`). Exact latest code/test commit `48dbc319ffee4db8360473dfb61e3fe576ab2321` passed [Full monorepo CI #44792188614](https://github.com/openpayglobal/zurios/actions/runs/44792188614) and [MeBuMIP Phase 1 verification #44792188600](https://github.com/openpayglobal/zurios/actions/runs/44792188600). Full CI completed typecheck, tests and build; MeBuMIP completed API typecheck/tests/build and web typecheck/build. This correction closes the time-validity gap in those API paths. It does not resolve the separate PR #13/#14 audit-chain reconciliation or Vercel deployment-rate-limit blockers.


**Security-branch unique-file inventory (2026-11-20):** a full changed-path comparison shows 15 PR #13-only changed paths in addition to the 39 overlaps. They include the MeBuMIP audit-chain backfill/export/verification CLIs and backfill tests; auth-lifecycle and tenant-member integration tests; the Phase 1 security operations runbook; and changes to core-platform ABAC, audit, feature-flag, idempotency, membership, organization and RBAC services. These core-platform files exist in PR #14 but have different branch contents; the PR #13 changes therefore require semantic diff/reconciliation rather than assuming the paths are missing or identical. The MeBuMIP backfill CLI and auth-lifecycle integration test files are absent from PR #14's current tree. Integration acceptance must preserve the dry-run-first legacy audit backfill, archive verification, concurrent/atomic bootstrap and refresh-replay tests, invitation delivery/revocation behavior, and the additional core-platform authorization/idempotency changes. No independent PR merge or silent omission of these security-branch-only changes is acceptable.
