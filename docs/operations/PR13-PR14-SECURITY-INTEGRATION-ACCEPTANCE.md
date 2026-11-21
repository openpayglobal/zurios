# PR #13 / PR #14 Security Integration and Acceptance Plan

**Status:** Draft — engineering integration gate  
**Date:** 2026-11-20  
**Applies to:** `feat/mebumip-phase1-security-hardening` (PR #13) and `feat/zuri-mebumip-foundation` (PR #14)  
**Release effect:** Production release remains blocked until this plan's mandatory gates pass.

## 1. Purpose and non-negotiable rules

The two pull requests are divergent implementation streams, not a safe linear stack. The latest repository comparison reports 197 commits ahead on the PR #14 side and 366 commits ahead on the PR #13 side, with merge base `1b01d0ece95925cad708bb7a113df0a2c59cc105`. The changed-file inventory records 54 paths on PR #13, 73 on PR #14 and 39 overlapping paths.

Do not merge either pull request into the other or into the release branch merely because GitHub reports it mergeable. Git mergeability does not prove semantic equivalence, authorization correctness, audit integrity or runtime compatibility.

The integration candidate must:
- Preserve all unique behavior from both branches unless a documented, tested replacement is approved.
- Reconcile every overlapping implementation by behavior and invariant, not by choosing one branch wholesale.
- Keep production migrations, legacy backfill apply, public access-request activation and production deployment disabled until their separate approvals and release gates are satisfied.
- Be built on a new integration branch; do not force-push either source branch.
- Run the complete monorepo and MeBuMIP workflows on the exact integration candidate before requesting review.

## 2. Required capabilities to preserve

### PR #13 security capabilities

- Transaction-scoped audit append with monotonic sequence allocation, predecessor hash, canonical event hash and versioned HMAC signature.
- Chain verification, tamper detection and dry-run-first bounded legacy audit backfill.
- Signed archive export and offline archive verification.
- Atomic first-owner bootstrap and bootstrap recovery, including replica-set concurrency behavior.
- One-time refresh-token consumption and concurrent replay rejection.
- Invitation email delivery, failure revocation and token non-disclosure.
- One-time password recovery with hashed, expiring tokens and session revocation.
- HttpOnly production cookies, Secure/SameSite controls, CSRF validation and exact Origin checks.
- MongoDB-backed auth lifecycle, tenant-member, audit backfill, cookie and CSRF regression tests.
- Core-platform ABAC, audit, feature flag, idempotency, membership, organization and RBAC changes.

### PR #14 capabilities to preserve

- Global identity and multiple independent workspace memberships.
- Identity-first sign-in, MFA before workspace disclosure, single-use workspace-selection capability and tenant-bound sessions.
- Membership-validity enforcement for listing, selection, switching, tenant-specific login and MFA completion.
- Workspace switch session rotation/revocation and unauthorized-target rejection.
- Keyring-aware event signing, key identifiers/rotation support and signed export-manifest behavior.
- Platform-admin separation and permission-gated platform operations.
- Public access-request intake, disabled by default, non-provisioning, rate-limited, non-enumerating and permission-gated review.
- Password recovery, CSRF/cookie behavior and access-request configuration safeguards.
- Ecosystem documentation, API/web contracts, CI workflows and product documentation mirrors.

## 3. Mandatory semantic reconciliation

| Area | Required integration invariant | Acceptance evidence |
|---|---|---|
| Audit append | Sequence allocation, predecessor read, event insert and counter update are one MongoDB transaction; no gaps or duplicate sequence under concurrent writers | Parallel append test; unique sequence assertion; transaction rollback test |
| Audit integrity | Canonical event hash covers immutable event fields; predecessor hash links the chain; signature key ID resolves to an approved key | Valid chain verifies; altered event, deleted event, reordered event and altered predecessor all fail |
| Key rotation | New events use active key ID; historical keys remain available for verification; unknown/revoked key IDs fail closed | Rotation test spanning old/new keys; unknown-key and invalid-signature tests |
| Legacy backfill | Dry-run by default, bounded transaction size, idempotent and refuses ambiguous/mixed histories; never applies implicitly at startup | Dry-run has no writes; repeated dry-run stable; explicit apply fixture; mixed-history rejection |
| Archive export | Export manifest and event signatures are independently verifiable offline; export does not silently rewrite source history | Export/verify round trip; manifest/event tamper rejection; missing-key failure |
| Bootstrap | Owner, tenant, membership and bootstrap audit event commit atomically | Concurrent first-owner creation; forced rollback leaves no partial owner/tenant/audit state |
| Refresh and sessions | Refresh tokens are single-use under concurrency; replay revokes or rejects according to documented policy; workspace switching cannot retain old tenant authority | Concurrent refresh race; replay test; switch revokes prior context |
| Cookie/CSRF | Cookie and bearer modes have explicit policy; unsafe cookie-authenticated requests require valid CSRF and exact allowed Origin; logout invalidates the session | Cookie-only identity; missing/invalid CSRF; hostile Origin; successful logout; post-logout denial |
| Workspace membership | Active status and validFrom/validUntil are enforced consistently in every membership-authorized path | Future/expired membership denied across list, select, switch, login and MFA completion |
| Authorization | Tenant/resource identity is derived from verified session context; all tenant-owned reads/writes are tenant-scoped; ABAC remains default-deny | Cross-tenant matrix, explicit deny precedence and missing-policy denial |
| Invitations/email | Invitation secrets are not returned to callers; delivery failure revokes invitation; expiry and replay are rejected | Test sink delivery, failure/revocation, expiry and replay tests |
| Password recovery | Generic response avoids account enumeration; token is hashed, expiring, one-time; successful reset revokes sessions | Existing/non-existing account response parity; expiry/replay; session invalidation |
| Public access request | Intake is disabled by default; request approval does not provision identity, tenant, workspace or membership | Disabled 503; non-enumerating response; no-store/rate-limit; approval has no provisioning side effect |
| Configuration | Runtime config is parsed and validated once and injected; no route reads secrets independently from process environment | Startup validation tests and typed-config route tests |

## 4. Integration sequence

1. Freeze and record the exact source SHAs of PR #13 and PR #14. Re-fetch branch heads immediately before creating the integration branch.
2. Create a new branch from the agreed release base. Preserve both source branches unchanged.
3. Bring in unique files and behavior from both PRs. Record every path as retained, reconciled, replaced with evidence, or intentionally deferred with owner approval.
4. Resolve audit-service/security.ts into one canonical service. Prefer the transactional predecessor-linked chain while integrating keyring resolution and signed archive-manifest requirements.
5. Reconcile cookie, CSRF, auth lifecycle and workspace-session behavior against the invariants in section 3.
6. Reconcile core-platform service differences individually; do not discard ABAC, idempotency, audit or membership behavior based on superficial similarity.
7. Add the acceptance tests in section 5 before removing or superseding old tests.
8. Run format/lint (where configured), docs mirror check, OpenAPI validation and route drift, monorepo typecheck/tests/build, then the MeBuMIP API and web typecheck/tests/build.
9. Run targeted concurrency, rollback, tampering, tenant-isolation and lifecycle tests repeatedly where nondeterminism is possible.
10. Review the final diff against both source branches and verify no unique security file or test was silently omitted.
11. Publish the evidence and exact candidate SHA. Keep both source PRs open until reviewers approve the integration plan and the candidate.
12. Merge only through the repository's required review and branch-protection process. Do not deploy or apply production migrations as part of branch integration.

## 5. Required regression test matrix

- **Audit concurrency:** many concurrent writers produce a strictly ordered, unique sequence with correct predecessor hashes.
- **Audit rollback:** injected failure after counter allocation or event insert rolls back all chain state.
- **Audit tampering:** mutation, deletion, reordering, duplicate sequence, broken predecessor and invalid signature are rejected.
- **Key rotation:** old events remain verifiable with retained keys; new events use the active key; missing/unknown key fails closed.
- **Backfill:** default invocation is read-only; bounded batch and idempotency hold; ambiguous history refuses apply.
- **Archive:** signed export verifies offline and detects manifest/event alteration.
- **Bootstrap:** concurrent initialization produces exactly one owner/tenant/membership set and one consistent audit event.
- **Refresh:** two concurrent uses of one refresh token cannot both succeed.
- **Workspace authorization:** no membership, inactive membership, future membership, expired membership and cross-tenant selection/switch all deny.
- **Session isolation:** workspace switch invalidates the previous tenant-bound session context.
- **Cookie/CSRF:** cookie issuance, CSRF requirement, Origin allowlist, logout and post-logout denial pass in real Fastify integration tests.
- **Invitations:** delivery, failure revocation, expiry, replay and secret non-disclosure pass.
- **Password reset:** enumeration parity, expiry, replay and session revocation pass.
- **Public access request:** disabled default, privacy URL validation, rate limits, non-enumeration, no-store, reviewer authorization and no auto-provisioning pass.
- **ABAC:** missing policy denies, explicit deny overrides allow, tenant and platform contexts remain separate.
- **API compatibility:** OpenAPI 3.1 and route drift checks pass; documented auth/session contracts match runtime behavior.

## 6. Evidence required before merge

- [ ] Exact source SHAs and merge-base recorded.
- [ ] Changed-file inventory reconciled; all 15 PR #13-only paths accounted for.
- [ ] All 39 overlapping paths reviewed semantically.
- [ ] Canonical audit-chain design approved and tests pass.
- [ ] Cookie/CSRF and auth lifecycle behavior reviewed and tests pass.
- [ ] Core-platform ABAC/idempotency/audit/membership changes reconciled.
- [ ] Monorepo CI passes on exact integration SHA.
- [ ] MeBuMIP Phase 1 workflow passes on exact integration SHA.
- [ ] No unresolved high/critical security finding or unreviewed destructive migration.
- [ ] Reviewer approval and branch-protection requirements satisfied.

## 7. Separate production release gates

Passing the integration tests is not production acceptance. The following remain independent gates:
- Vercel deployment capacity and authorized deployment inspection; successful current-commit frontend and API deployments.
- Production MongoDB replica-set/sharded topology, backups, least-privilege credentials and restore drill.
- Production JWT/MFA/audit signing keys, key custody, rotation and recovery procedures.
- Verified mail sender, delivery retry/outbox monitoring and domain authentication.
- Independent immutable/WORM archive bucket, retention lock, restore/verification drill and separation of duties.
- Privacy controller, approved notice, retention/deletion schedule and access-request review ownership.
- Browser end-to-end tests, accessibility review, observability, alerting, incident and rollback runbooks.
- Owner approval for production configuration, migrations, access-request enablement and release promotion.
- External ODEI repository requirements must be retrieved and reconciled before claiming that its requirements are fulfilled.

### Follow-up hardening applied on PR #14 branch (2026-11-20)

A concrete cookie-CSRF gap identified during source review was corrected on the PR #14 branch:
- Unsafe cookie-authenticated requests now require an explicit `Origin` header whose value exactly matches the configured `corsOrigins` allowlist, in addition to the existing CSRF cookie/header/session-token checks.
- The MongoDB-backed integration test now rejects missing Origin and hostile Origin values and exercises the accepted configured development origin. The subsequent MFA cookie step-up test also supplies that trusted Origin.
- Commits: `7141cd02c4ba445e2bbfb7f7b338dd2ab1906030` (enforcement), `7377310f2c915add94b87b1b47739696486bf3aa` (negative/positive tests), `57206a26311d9b9ff455984f8f8fc6e2f34f2c49` (trusted Origin in MFA cookie flow).
- This change is not yet reported as CI-verified. The integration test requires the workflow's MongoDB service; passing GitHub CI must be observed on the exact final commit before considering the fix accepted.

### Vercel API build findings and hardening (2026-11-20)

The API preview was inspected directly, exposing additional type-checking failures that the earlier GitHub workflow did not reproduce:
- `TS2345` in `packages/core-platform/src/organization-service.ts` and then `location-service.ts`: schema-spread values were inferred with optional required business fields when passed to MongoDB collection inserts. Both writers now construct explicit `OrganizationDocument` and `LocationDocument` values field-by-field.
- The same persistence-boundary hardening was applied to membership, user, role, session and audit-event writers using their corresponding document types. This makes required persisted fields explicit rather than relying on widened Zod object spreads.
- Added core-platform service-invariant tests for organization and location creation, including required identifiers, audit actor fields and default timezone.
- The next API build exposed `TS2550` for `Object.hasOwn` in ABAC. Production code and the new invariant test now use `Object.prototype.hasOwnProperty.call` for compatibility with the deployment type-checker's selected library surface.
- The preview at commit `180c3954e8df54f9be8dfdc93703bc6d60e28300` failed on the `Object.hasOwn` type error. Subsequent preview builds for later commits were blocked by Vercel's `build-rate-limit` response before the latest changes could be revalidated on Vercel.
- GitHub verification passed on exact code/test head `8baf3f4af27d17ed815695c3d8df7cc03ea1a0af`: full CI [44865838762](https://github.com/openpayglobal/zurios/actions/runs/44865838762) and MeBuMIP Phase 1 [44865838697](https://github.com/openpayglobal/zurios/actions/runs/44865838697). These do not substitute for a successful Vercel build; keep API deployment acceptance open.

## 8. Current evidence and status

- PR #13 and PR #14 remain separate, open and unmerged.
- Latest documented branch comparison is divergent; it is not a safe fast-forward integration.
- PR #13's transactional predecessor-linked audit service and backfill are not semantically equivalent to PR #14's inspected append implementation.
- PR #14's global identity, workspace validity, access-request and platform features must be retained.
- The exact code checkpoint `7ca6aa31d49c59c1582ba8d434a447736a59144f` passed full CI run [44791610085](https://github.com/openpayglobal/zurios/actions/runs/44791610085) and MeBuMIP run [44791610046](https://github.com/openpayglobal/zurios/actions/runs/44791610046).
- Vercel reports build-rate-limit failures for both projects. This is not a successful deployment.
- The ODEI repository remains unavailable to the connected GitHub integration; its requirements are an explicit external dependency.
- No production migration, audit backfill apply, public intake activation, deployment or promotion is authorized by this engineering plan.

## 9. Change log

- 2026-11-20: Initial evidence-based integration and acceptance plan authored from the current PR comparison, changed-file inventory, audit implementation review and CI/deployment status.
