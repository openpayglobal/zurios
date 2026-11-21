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


**PR #13 / PR #14 integration acceptance plan (2026-11-20):** added [PR13-PR14-SECURITY-INTEGRATION-ACCEPTANCE.md](../operations/PR13-PR14-SECURITY-INTEGRATION-ACCEPTANCE.md) and indexed it in [docs/README.md](../README.md). The plan records the divergent branch history, the 39 overlapping paths, capabilities that must be preserved from each PR, mandatory semantic reconciliation for audit-chain/keyring, cookies/CSRF, identity/workspace and core-platform services, and a concrete concurrency/rollback/tampering/tenant-isolation regression matrix. It explicitly prohibits blind merging, production migration/backfill apply, public-intake activation or deployment without separate approvals. Documentation commit `bc44a513f68b1ae4a517b563ff5b0cb4bb236d75` created the plan; index commit `4f9e0731685a3d8d09eb60401042d147f0a71ec8` indexed it. Exact-head CI for the index commit has not yet been observed; do not mark this documentation increment CI-verified until the corresponding workflows complete.


**Cookie CSRF Origin hardening (2026-11-20):** source review found that the PR #14 MeBuMIP API checked the CSRF cookie/header and token-derived value for unsafe cookie-authenticated requests but did not enforce the request Origin. Updated `apps/mebumip-api/src/auth.ts` to require an explicit exact-match Origin in configured `corsOrigins` for unsafe cookie-authenticated requests. Updated the MongoDB-backed integration test to reject missing and hostile Origin values, accept the configured development Origin, and include Origin in the subsequent MFA cookie step-up. Commits: `7141cd02c4ba445e2bbfb7f7b338dd2ab1906030`, `7377310f2c915add94b87b1b47739696486bf3aa`, `57206a26311d9b9ff455984f8f8fc6e2f34f2c49`. Verification subsequently completed successfully on code/test head `0fc31fb9d91c2bd3be27cb227871c5bb5629257a`: full monorepo CI run [44865289761](https://github.com/openpayglobal/zurios/actions/runs/44865289761) passed (replica-set startup, OpenAPI validation, route drift, docs mirror check, typecheck, tests and build), and MeBuMIP Phase 1 run [44865289773](https://github.com/openpayglobal/zurios/actions/runs/44865289773) passed (API typecheck/tests/build and web typecheck/build). These runs verify the code/test changes; this progress-register-only follow-up commit itself must not be described as tested until its triggered checks complete. The integration acceptance plan now records this hardening and its release verification gate.


**Vercel API build hardening and latest verification (2026-11-20):** inspecting the API preview revealed deployment-only TypeScript failures in core-platform writers. Explicit persisted-document types were added to organization, location, membership, user, role, session and audit-event writers; organization/location persistence invariants were added to the core-platform service test suite. A subsequent Vercel build exposed `Object.hasOwn` library-surface incompatibility in ABAC/feature flags; production code and test now use `Object.prototype.hasOwnProperty.call`. The integration acceptance plan records the exact findings and fixes. Latest code/test head `8baf3f4af27d17ed815695c3d8df7cc03ea1a0af` passed full monorepo CI [44865838762](https://github.com/openpayglobal/zurios/actions/runs/44865838762) and MeBuMIP Phase 1 [44865838697](https://github.com/openpayglobal/zurios/actions/runs/44865838697). Vercel preview attempts after the type fixes were blocked by `build-rate-limit`; the previous API deployment at `180c395` had failed on `Object.hasOwn`, so the latest API changes are not yet Vercel-verified. The frontend preview was READY at `0fc31fb`, but that does not verify the current branch head. Do not claim current deployment success.


**Latest documentation-head verification (2026-11-20):** PR #14 documentation head `39e69e780bbaa08caca5596cf45201a5731a375d` passed exact-head [full monorepo CI #44865952478](https://github.com/openpayglobal/zurios/actions/runs/44865952478) and [MeBuMIP Phase 1 #44865952423](https://github.com/openpayglobal/zurios/actions/runs/44865952423). PR #14 remains open/non-draft/mergeable and PR #13 remains open/draft; neither is merged and neither has unresolved inline review threads. Current Vercel commit statuses for both projects still report `build-rate-limit`; there is no preview deployment for this latest head. Production is not released.


**Audit backfill boundedness/provenance fix (2026-11-21):** source review identified unbounded full-collection materialization in the backfill plan/apply path and insufficient distinction between truly unsequenced legacy events and partially populated chain records. The PR #14 implementation now uses counts, bounded 5,001-record samples, strict legacy-field filters, and refuses malformed/partial or mixed histories and over-limit migrations before applying. It no longer invents missing actor/action/correlation values during migration. A MongoDB integration regression test verifies partial chain records are rejected without mutation. Code commits: `ff432f408ff7680f8fabcb8624b3e52a9556f1c1`, `6c816ab6be8cb3eb5351b2675c72b3a765b5c888`, `075c0ea41589ddd0b880f4e403c3ef5668486d64`. CI exposed strict TypeScript issues in the new migration code and an audit archive test fixture; those are corrected in the latter two commits. Exact-head workflows for `075c0ea41589ddd0b880f4e403c3ef5668486d64` are queued/running; do not mark this change verified until they pass. The full-chain verifier/export still traverse the complete audit history and need a separate streaming/scalability pass. No production backfill was run.


**Streaming audit verification (2026-11-21):** the chain verifier now streams fully shaped records in sequence order, counts all partial/legacy records separately, and checks the sequence counter. This removes full-collection materialization/sort in application memory while preserving fail-closed handling of incomplete chain data. The archive export remains a deliberate full materialization operation. Current code/test head: `a13b5c0f23bcd7aa6bb4e762821f9ac7651d919b`; exact-head GitHub workflows are pending. A previous CI attempt identified strict TypeScript errors in the initial bounded-backfill patch; fixes were applied in subsequent commits, and final acceptance awaits successful current-head workflows.


## 2026-11-21 — PR #13 / PR #14 security reconciliation checkpoint

This section supersedes earlier changed-path counts in this register. A fresh inventory now records PR #13 at 54 changed paths and PR #14 at 91 changed paths, with 52 overlapping paths and two PR #13-only path differences. PR #13 remains open/draft; PR #14 remains open/non-draft. Neither has been merged. Both currently have zero unresolved inline review threads.

### Previously unique PR #13 work accounted for on PR #14

- `apps/mebumip-api/src/audit-service.ts`: its transactional audit-chain, backfill, verification and archive responsibilities are integrated into `apps/mebumip-api/src/security.ts`; PR #14 has one canonical security/audit module rather than a duplicate audit service file.
- `packages/core-platform/src/idempotency-service.ts`: the file exists on PR #14's tree and its canonical request hashing, transactional mutation, replay detection and conflict behavior were compared with PR #13. It is not missing functionality; it is not a changed path in PR #14.
- The MeBuMIP tenant-member MongoDB integration test and the Phase 1 production security operations runbook are now present on PR #14 and the runbook is indexed in `docs/README.md`.

### Security and lifecycle implementation now on PR #14

- Audit events are sequence-ordered, predecessor-linked, canonically hashed and signed through the versioned key ring. Sequence allocation, predecessor lookup, counter update and event insert are transaction-scoped.
- Chain verification streams the full audit history, validates the sequence counter and fails on missing/partial/legacy records or invalid signatures. Backfill is dry-run-first, bounded to 5,000 records and refuses malformed, partial or mixed histories.
- Signed archive export and offline verification are available. Serialized JSON timestamps are normalized before event signature verification. The runbook documents independent immutable/WORM retention as a separate production control; local export does not claim WORM acceptance.
- Audit event creation redacts credential-like metadata before signing and fails closed on invalid required fields/outcomes or unavailable signing keys.
- First-owner bootstrap commits owner, tenant, membership and the signed bootstrap event in one MongoDB transaction under the bootstrap lease.
- Session refresh now inserts the successor, revokes the previous session and appends the rotation audit event in one transaction. Concurrent refresh attempts have a single winner.
- Password recovery uses hashed, expiring, one-time records. Password reset consumes the record, updates the password, revokes sessions and appends the audit event in one transaction.
- Existing identity/workspace validity enforcement, CSRF exact-Origin validation, access-request safeguards and platform authorization behavior remain on the branch.

### Verification and release state

- Code/test head before the documentation follow-up: `13f6cfb7a4016f8dae7d517b9a5b80a6590b27ec`.
- Full monorepo CI [#44866926607](https://github.com/openpayglobal/zurios/actions/runs/44866926607) and MeBuMIP verification [#44866926541](https://github.com/openpayglobal/zurios/actions/runs/44866926541) were queued when inspected. They are not passing evidence yet. The plan update commit `207cebb21599eab88e6ac002a9dcea11777a4209` and this register update must also pass their exact-head checks.
- Vercel frontend/API contexts continue to report deployment-rate-limit failures; there is no current-head preview deployment verification.
- No production audit backfill apply, ABAC backfill apply, public access-request activation, production deployment or promotion has been performed.
- The ODEI repository remains inaccessible to the connected GitHub integration; do not claim its requirements are satisfied.

**Release assessment:** implementation has materially advanced and PR #14 now contains the main security behaviors that were previously isolated on PR #13. It is not yet production-ready. Exact-head CI, current Vercel preview verification, remaining semantic review of overlapping paths, privacy/legal approvals, production secret/database controls, immutable archive proof and independent security review remain release gates.


**Vercel environment and deployment inventory (2026-11-21):** `zurios` production is READY but remains on old `main` commit `e98e1b8f322149a36823bdba99d087f96a8b5a69`; the latest confirmed frontend feature preview is an older READY checkpoint at `3af246254863768f6531bab354f8eea89b805566`. `zurios-api` production is ERROR on old `fix/vercel-pnpm-node22` commit `9678ff8b2a9474575fbf330a7e7d47cbf32817dd`, with TypeScript unable to resolve `@zuri/core-platform`. Current feature branch deployment attempts are blocked by Vercel `build-rate-limit`. Environment inventory was read without decrypting values: API variables are preview-only and branch-scoped to the old fix branch; no API production variables are present, and the frontend project reports no project environment variables. No secrets were read, created or copied to production. Details and release gates are recorded in `docs/operations/VERCEL-DEPLOYMENT-TOPOLOGY.md`.

**Request-auth membership validity hardening (2026-11-21):** a second-layer review found that the request authentication middleware fetched active memberships without applying `validFrom`/`validUntil` constraints in its query. The permission resolver already enforced the window, but the middleware now also rejects future-dated and expired memberships at the principal-resolution boundary. Route-level integration coverage exercises an existing token before expiry, after expiry, before a future start time, and after validity is restored. Code/test commits: `eeccc2ceea7e95d417f7cb2aeb0eca016a27e7ba` and `138ff6275473f9ed22c819958ea1051fa5f5040a`. Exact-head CI is running; acceptance remains pending until it passes.


**Operational reliability follow-up (2026-11-21):** audit backfill now batches up to 5,000 validated hash-chain updates into one ordered MongoDB `bulkWrite` within the transaction and verifies matched/modified counts. A 5,001-record regression test proves oversized histories are rejected without mutation. The core-platform idempotency callback contract now explicitly accounts for MongoDB transaction callback retries; callers must keep callbacks database-only and use the outbox for external effects. The concurrency test asserts committed state/replay outcomes rather than a non-guaranteed callback invocation count. The repository now has a workspace lockfile covering all five workspaces; CI workflows are being moved to frozen installs and Node 24-compatible action runtimes. Current code/test changes are undergoing exact-head CI.


## 2026-11-21 — Latest full-platform verification and audit migration gate

This checkpoint supersedes the previous 52-overlap/2-path-only inventory. Current PR metadata reports PR #13 at 54 changed paths and PR #14 at 97 changed paths, with 53 overlaps and one PR #13-only path. The remaining path-only apps/mebumip-api/src/audit-service.ts is not missing runtime behavior: its transaction append, chain verification, dry-run backfill and archive functions are integrated into PR #14's apps/mebumip-api/src/security.ts. PR #13 remains draft/open; PR #14 remains open/non-draft. Neither is merged.

### Additional security/data-migration clarification

- The regular audit backfill handles genuinely unsequenced legacy events only. Historical events that already have a sequence but lack complete predecessor/event hashes are classified as malformed/partial and refused. This matters because earlier MeBuMIP builds allocated sequence numbers before chain hashes existed. The runbook now requires a separate approved migration that verifies each original signature with the historical key, preserves the original signature as signed provenance, proves sequence continuity and only then adds chain links. No automatic renumbering or blind apply is allowed. The integration test covers both partial-chain and sequence-only legacy records.
- Audit event metadata redaction is applied before chain hashing and signing, so the stored metadata, event hash and HMAC cover the same sanitized payload. A regression assertion verifies credential-like fields are redacted while chain verification remains valid.
- Session refresh and password reset are transaction-scoped with their audit append. Refresh is single-winner under concurrent requests; password reset atomically consumes the one-time recovery record, changes the password, revokes sessions and records the audit event.

### Full-suite corrections

- A full CI run found the MeBuMIP workflow used frozen-lockfile installation even though the repository has no committed pnpm-lock.yaml; changed the workflow to pnpm install --no-frozen-lockfile (consistent with the repository's current install policy).
- The migration integration test expected only 0001_core_indexes even though the registry now runs 0001_core_indexes, 0002_identity_workspace_selection and 0003_audit_archive_receipts; corrected the expected migration list.
- The idempotency/outbox concurrency test no longer asserts that an in-memory callback counter executes exactly once. MongoDB may retry transaction callbacks; the contract now documents that callbacks must keep effects inside the provided session and external effects must use the outbox. The test retains the exactly-once committed resource/outbox assertions.
- Earlier CI exposed and corrected the invalid explicit unique _id index creation; MongoDB owns that index automatically.

### Deployment evidence

- Latest frontend preview inspected: READY at commit 08d21ddfdd945553b747be6ac2282290b5654b47, not the current PR head.
- Latest API preview on the feature branch inspected: ERROR at older commit 180c3954e8df54f9be8dfdc93703bc6d60e28300; no current-head API preview has been verified. The latest API deployment on the separate integration branch was CANCELED as an unaffected-project deployment, not a successful API build.
- Current GitHub Vercel contexts report Deployment rate limited — retry in 24 hours for both frontend and API. The Vercel projects report Node 22.x; the frontend preview build completed successfully with the root engine constrained to Node 22.

### Current verification status

- Source head recorded before this progress update: 16c5faa29ba960403536a2597e782a90c6ae490a.
- Full monorepo CI #44867572223 and MeBuMIP verification #44867572218 were queued; prior MeBuMIP run #44867568082 was in progress. These are not passing evidence. The plan update and this register update require exact-head CI as well.
- Objectives A–E (Facebook/Instagram asset management, advertising, WhatsApp, multi-business SaaS and unified external integrations) remain planned for phases 2–6 and are not yet implemented. Phase 1 foundation remains in progress. Live Meta setup is still deferred by the product owner; mocked/contract-driven integration work can proceed without live credentials.
- Production readiness remains open: legal/privacy and data deletion approval, production secret/key management, least-privilege DB roles, independent WORM archive proof, backup/restore drill, mail sender verification, independent security review, API preview and browser end-to-end tests remain required.


**Critical mutation/audit atomicity hardening (2026-11-21):** introduced `withAuditTransaction` over the keyring-aware predecessor-linked audit append. MeBuMIP tenant provisioning, member/invitation lifecycle, platform-admin lifecycle and suspension/session revocation, auth session lifecycle, invited registration, password change/recovery, MFA lifecycle and logout now commit state and audit events in one MongoDB transaction. Email delivery remains outside transactions and its success/failure lifecycle is recorded separately. Added a replica-set rollback regression proving a domain write and audit counter both roll back when signing fails. Code and integration tests are pending exact-head verification.


## 2026-11-21 — Verified security integration checkpoint

**Exact PR #14 source/test head:** `f542bddb1af2358491fcdf2de2b52c087bdfa09a`.

- [Full monorepo CI #44868067358](https://github.com/openpayglobal/zurios/actions/runs/44868067358) passed OpenAPI validation, route drift, documentation mirrors, typecheck, tests and build. Test suites reported 31 passed, 0 failed, 0 skipped.
- [MeBuMIP Phase 1 #44868067363](https://github.com/openpayglobal/zurios/actions/runs/44868067363) passed API typecheck, 31 API tests (31 passed, 0 failed, 0 skipped), API build, web typecheck and web build.
- Audit append now allocates sequence, reads predecessor, writes signed hash-linked event and advances counter in one majority transaction. The shared `withAuditTransaction` helper couples platform/tenant control-plane mutations with their audit records. The chain verifier checks the full persisted history and counter; API readiness fails closed if MongoDB is not a replica set/sharded topology or if the chain does not verify.
- First-owner bootstrap is lease-protected and transactionally creates the platform owner, first tenant, owner membership and audit event. Refresh/password reset, tenant/member/admin operations and invitation lifecycle have transactional audit coupling where applicable.
- Membership validity is enforced through workspace listing, selection, switching, tenant-specific login, MFA completion and principal resolution. Invitation delivery failures conditionally revoke only still-pending invitations; email subjects strip CR/LF.
- Production CORS validation now requires HTTPS-only origins. Audit diagnostics expose full-chain verification separately from individual event signatures.
- Audit backfill remains dry-run-first and bounded; partial/mixed or sequence-only pre-chain records are refused for separate signature-preserving reconciliation. Signed local archive export/offline verification exists; no object-store/WORM adapter is configured.
- Root `pnpm-lock.yaml` is committed; both workflows use frozen lockfile installs. `MONGODB_TEST_URI` is passed through Turbo and MongoDB CI uses an initialized replica set.
- Vercel preview inspection returned HTTP 403; no local Vercel CLI/token/session is available. Current-head deployment readiness is therefore unverified.

**Current branch inventory:** PR #13 has 54 changed paths, PR #14 has 97, with 53 overlaps and one PR #13-only audit-service path whose behavior is integrated into PR #14's keyring-aware security module. PR #13 remains open/draft; PR #14 remains open/non-draft and unmerged. Production readiness is not established.


**Audit export and credential-abuse controls (2026-11-21):** privileged audit exports now fail closed when the manifest is unsigned, emit a chain audit event with exported sequence range/count/algorithm, and set no-store. Password change and MFA reset have dedicated stricter per-IP rate limits with policy unit coverage. Exact-head workflows for the latest policy/test commit are running; the preceding transactional audit integration checkpoint `f542bddb1af2358491fcdf2de2b52c087bdfa09a` passed full CI [44868067358](https://github.com/openpayglobal/zurios/actions/runs/44868067358) and MeBuMIP verification [44868067363](https://github.com/openpayglobal/zurios/actions/runs/44868067363).


**Latest continuation checkpoint (2026-11-21):** MeBuMIP critical state changes now use atomic domain-write/audit transactions; audit appends validate the immediate predecessor; audit backfill apply requires the dedicated operator-only `AUDIT_MIGRATION_MONGODB_URI`; export actions are signed and audited. The Meta Graph v27.0 transport client, App Secret Proof, version pinning, tenant-bound AES-256-GCM token-vault primitive and config factories are implemented as groundwork only. [MeBuMIP Phase 1 run 44869148588](https://github.com/openpayglobal/zurios/actions/runs/44869148588) passed on code/test checkpoint `4c882549ace78a5eec7da206aee7fa8c0cf824a1`; [full CI 44869148599](https://github.com/openpayglobal/zurios/actions/runs/44869148599) is still running. The runbook now requires separate maintenance credentials for backfill and an append-only runtime audit role. Production Vercel, owner secrets, WORM archive and ODEI access remain blockers.


**Meta OAuth API continuation (2026-11-20):** Registered tenant-authorized OAuth start/callback, tenant-scoped connection list and MFA-protected disconnect routes. OAuth state is hashed, single-use and bound to the initiating tenant/user/session/callback/scopes; callback validates the original session and permissions, checks token identity/scopes twice (short-lived and long-lived exchange), and stores only AES-256-GCM ciphertext. Disconnect attempts Meta remote permission revocation, always clears local ciphertext, and records `succeeded`/`failed`/`not_attempted`. Added dedicated OAuth rate limits, MongoDB-backed route integration tests, MeBuMIP OpenAPI paths and [Meta Graph Integration Contract](../integrations/META-GRAPH-INTEGRATION.md). The Phase 1 route-test checkpoint `5edf3cfb8302a1f3ea13304c25a47d142b1a288c` passed ([run 44873115938](https://github.com/openpayglobal/zurios/actions/runs/44873115938)); later remote-revocation changes are still under exact-head CI. No live Meta account connected. Page/Instagram asset discovery and operations, webhooks, Marketing API, WhatsApp, Business Login route, frontend UX, app review and production acceptance remain outstanding.


**Verification update (2026-11-20):** [Full monorepo CI #44873715186](https://github.com/openpayglobal/zurios/actions/runs/44873715186) and [MeBuMIP Phase 1 #44873715155](https://github.com/openpayglobal/zurios/actions/runs/44873715155) both passed on `b5584fab2dd0effc0ebf490972cb051fde132bb9`. The full run passed OpenAPI 3.1 validation for both specifications, OpenAPI route-drift, product-doc mirror checks, monorepo typecheck/tests/build; Phase 1 passed API/web typecheck/tests/build with a MongoDB replica set. The latest head after the additional no-store/referrer and query-log redaction hardening is `5aa381cf5a66dd65d4b1ee2a78b03ed934dc4c1e`; its exact-head runs were still in progress at the time of this entry.
