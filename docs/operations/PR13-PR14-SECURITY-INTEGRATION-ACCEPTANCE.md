# PR #13 / PR #14 Security Integration and Acceptance Plan

**Status:** Draft — engineering integration gate  
**Date:** 2026-11-20  
**Applies to:** `feat/mebumip-phase1-security-hardening` (PR #13) and `feat/zuri-mebumip-foundation` (PR #14)  
**Release effect:** Production release remains blocked until this plan's mandatory gates pass.

## 1. Purpose and non-negotiable rules

The two pull requests are divergent implementation streams, not a safe linear stack. The latest repository comparison reports PR #14 ahead by 435 commits and behind by 197 commits relative to PR #13, with merge base `1b01d0ece95925cad708bb7a113df0a2c59cc105`. The current changed-file inventory records 54 paths on PR #13, 91 on PR #14 and 52 overlapping paths; only two PR #13 changed paths are still absent from PR #14's changed-file set.

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
- [ ] Changed-file inventory reconciled; both remaining PR #13-only paths accounted for.
- [ ] All 52 overlapping paths reviewed semantically.
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

- PR #13 remains open/draft and PR #14 remains open/non-draft; neither has been merged. Both currently have zero unresolved inline review threads.
- Latest source inventory: PR #13 head `52e94d1c6b1a87d516cba9fdd64337463259199f` (54 changed paths); PR #14 head `13f6cfb7a4016f8dae7d517b9a5b80a6590b27ec` (91 changed paths); 52 overlapping changed paths and two PR #13-only paths.
- The two path-only differences have explicit treatment:
  - `apps/mebumip-api/src/audit-service.ts` is functionally integrated into `apps/mebumip-api/src/security.ts`, which now owns the keyring-aware event signer, canonical chain hash, transaction-scoped append, streaming verifier, bounded backfill, signed archive export and offline archive verification.
  - `packages/core-platform/src/idempotency-service.ts` exists on PR #14's tree with equivalent canonical request hashing, transactional mutation, replay detection and conflict handling. It is not a missing runtime implementation; the difference is that this file is not changed by PR #14.
- The tenant-member MongoDB integration test and MeBuMIP Phase 1 production security operations runbook are now present on PR #14. The runbook is indexed in `docs/README.md`.
- First-owner bootstrap commits owner, tenant, membership and the signed audit event in one MongoDB transaction. Session refresh now creates the successor session, revokes the old session and appends the audit event in one transaction. Password reset now consumes the one-time recovery record, updates the password, revokes sessions and appends the audit event in one transaction.
- The audit chain now enforces monotonic sequence, predecessor hash, canonical event hash, keyring-backed HMAC signature and counter consistency. Backfill is dry-run-first, bounded to 5,000 events, and refuses partial/malformed or mixed histories. Verification streams the full event history. Offline archive verification normalizes serialized timestamps and validates event/manifest integrity.
- Latest audit hardening redacts credential-like metadata before signing and fails closed if a signing key is unavailable or required event fields/outcomes are invalid.
- Exact-head full monorepo CI [#44866926607](https://github.com/openpayglobal/zurios/actions/runs/44866926607) and MeBuMIP verification [#44866926541](https://github.com/openpayglobal/zurios/actions/runs/44866926541) were queued when this source snapshot was recorded. They are not passing evidence yet; use the latest PR head and exact run status before accepting.
- Vercel reports deployment-rate-limit failures for both frontend and API projects. No preview deployment on the current source head has been verified.
- The ODEI repository remains unavailable to the connected GitHub integration; its requirements remain an explicit external dependency.
- No production migration, audit backfill apply, public intake activation, deployment or promotion has been performed or authorized by this engineering plan.

## 9. Change log

- 2026-11-20: Initial evidence-based integration and acceptance plan authored from the current PR comparison, changed-file inventory, audit implementation review and CI/deployment status.


### Audit backfill boundedness and provenance hardening (2026-11-21)

A source review of the two divergent audit implementations identified an operational safety issue: the PR #14 backfill planner and apply path materialized the entire audit collection before enforcing the 5,000-record migration limit. It also classified records by hash-field presence without consistently requiring a valid sequence number, so partial chain metadata could be mistaken for migratable legacy data.

The PR #14 branch now:
- Counts total, complete-chain and genuinely legacy records with MongoDB count queries rather than loading the full collection to plan a migration.
- Samples at most 5,001 legacy records for validation and bounds the apply query to 5,001 records.
- Refuses histories containing partial/malformed chain metadata, mixed legacy and chained records, or more than 5,000 legacy records.
- Requires actor, action, target type, correlation ID, valid outcome and timestamp to be present before migration; it no longer invents fallback actor/action/correlation values during backfill.
- Updates only records whose sequence, previous hash and event hash are all absent, then verifies exact update count inside the transaction.
- Adds a MongoDB integration test proving partial chain metadata is rejected without rewriting the event.

The original full-collection chain verification and archive export still necessarily traverse the complete history; a separate streaming-verification change is a follow-up optimization. Backfill remains dry-run-first, requires an explicit apply flag, a backup, approval and a controlled maintenance window. No migration has been run against production data.


The chain verifier was also changed to stream complete chain records in sequence order instead of materializing and sorting the entire audit collection in application memory. It separately counts all incomplete/legacy records, and uses the sparse unique sequence index for the ordered chain cursor. This keeps verification memory bounded while ensuring partial records still cause a failed integrity result. The archive exporter remains intentionally full-output because it must produce the requested archive bundle.


## 8. Implementation checkpoint — security integration work applied on PR #14

**Source heads at checkpoint:** PR #13 `52e94d1c6b1a87d516cba9fdd64337463259199f`; PR #14 `86827ed57885fe6a85de6cd396da29016c97f4c6`. PR #14 remains open and unmerged. At this checkpoint, PR #14 has 91 changed paths; PR #13 has 54; 52 overlap; two PR #13 changed paths remain outside PR #14's changed-file inventory.

The following PR #13 security behavior has been ported or reconciled on PR #14:

- The transactional, predecessor-linked audit writer, chain verifier, bounded dry-run-first backfill, signed archive manifest and offline verifier are implemented in `apps/mebumip-api/src/security.ts`, integrated with PR #14's existing versioned audit keyring rather than copying PR #13's incompatible configuration interface.
- The audit archive preparation service now rejects sequence gaps, invalid event signatures and invalid chain links. The local archive CLI is not an object-store/WORM uploader.
- The operational CLIs are exposed as `audit:backfill`, `audit:archive` and `audit:archive:verify`. Backfill refuses partial chain metadata and mixed histories; ambiguous sequenced legacy records require a reviewed reconciliation, not an automatic rewrite.
- First-owner bootstrap now uses a unique expiring lease and a MongoDB transaction covering the owner, initial tenant, owner membership and audit event. The audit append participates in the caller transaction rather than starting a nested transaction.
- Added MongoDB-backed audit concurrency/tamper/backfill, atomic bootstrap/session lifecycle and tenant-membership/invitation/MFA integration tests.
- API startup now keeps readiness false until the persisted audit chain and sequence counter verify successfully.
- MeBuMIP CI now sets `MONGODB_TEST_URI` and initializes a MongoDB replica set. Both CI workflows advertise the replica-set member as `127.0.0.1:27017`, preventing clients from discovering an unresolvable container hostname.
- Added and indexed the MeBuMIP Phase 1 security operations runbook, aligned to the implemented keyring variable names.

The two remaining changed-path differences are:

1. `apps/mebumip-api/src/audit-service.ts` — its required behavior is now implemented in the existing `security.ts` module. The old file is intentionally not copied as a duplicate service.
2. `packages/core-platform/src/idempotency-service.ts` — the file already exists on PR #14; the PR #13 delta is a narrow parsed-input type assertion, not a separate missing workflow. Confirm the exact diff and typecheck before deciding whether the cast should be retained.

**Verification status:** the MeBuMIP workflow [#44866839352](https://github.com/openpayglobal/zurios/actions/runs/44866839352) passed on the immediately preceding head. Full monorepo CI [#44866845001](https://github.com/openpayglobal/zurios/actions/runs/44866845001) and MeBuMIP verification [#44866845017](https://github.com/openpayglobal/zurios/actions/runs/44866845017) are running on the checkpoint head. Do not mark the exact head verified until both finish successfully.

**Remaining integration work:** review all 52 overlapping paths semantically, reconcile any remaining security behavior not yet covered by tests, and verify the exact candidate against the full regression matrix. Vercel preview verification, production secrets, WORM storage, backup/restore, mail sender verification, legal/privacy approval and production release remain separate blockers.


### Security reconciliation and atomic authentication lifecycle (2026-11-21)

The PR #14 branch now contains the substantive security behavior previously isolated on PR #13 while preserving the global-identity/workspace implementation. The changed-path inventory is 52 overlaps and two path-only differences; the audit service is integrated into `security.ts`, and the core-platform idempotency service is present with equivalent behavior. The tenant-member integration test and Phase 1 security operations runbook have also been restored to PR #14.

The current implementation now commits refresh rotation and password reset as single MongoDB transactions with their audit events. Concurrent refresh attempts have a single winner; a reset transaction cannot consume a token or revoke sessions without also changing the password and writing the audit event. Audit metadata redaction, fail-closed signing-key enforcement and serialized-archive timestamp verification are included. Exact-head CI is pending; these changes must not be marked accepted until both full CI and MeBuMIP verification pass on the same latest commit. Vercel build-rate-limit failures and all production release gates remain open.
