# Zuri MeBuMIP — Progress Register

**Last updated:** 2026-11-19  
**Product owner:** Blockchain Innovations LTD  
**Status vocabulary:** Not started · In progress · Blocked · Complete

## Programme summary

- Product definition: **Complete** — name, owner, standalone model, all five objectives and MAC/MAD requirement recorded.
- Repository foundation: **In progress** — product documentation, isolated React/Vite MAC/MAD web shell and Fastify API bootstrap committed on a feature branch.
- Phase 1 security primitives: **In progress** — separate platform/tenant RBAC maps, active-membership tenant checks, opaque token/hash utilities, scrypt password hashing/verification, one-time platform-owner bootstrap, bearer login/me/logout, protected MAC tenant/audit reads, audited tenant provisioning, read-only MAD aggregates, constrained audit-event builder, MongoDB foundation indexes and security tests added.
- API authentication/session lifecycle: **In progress** — bearer login, session inventory/rotation/revocation, password change and TOTP step-up committed; password recovery delivery, MFA recovery codes and device management remain.
- Live Meta configuration: **Deferred by owner** — Business Portfolio and developer app will be created later.
- Production readiness: **Not started**.

## Five-objective progress

| ID | Objective | Planned phase | Status | Current evidence / next deliverable |
|---|---|---:|---|---|
| A | Manage company/customer Facebook Pages and Instagram Professional accounts | 2 | Not started | Define authorization and asset connection contracts; implement against test fixtures |
| B | Run and report Facebook/Instagram advertising | 3 | Not started | Define ad account, campaign, spend guardrail and reporting contracts |
| C | Connect WhatsApp Business Platform/API | 4 | Not started | Design Embedded Signup, WABA, phone-number, template, messaging and webhook lifecycle |
| D | Multi-business Meta management platform | 5 | Not started | Define tenant onboarding, tenant isolation, delegated roles and usage controls |
| E | Integrate Facebook, Instagram and WhatsApp into company software | 6 | Not started | Define versioned external API, webhook contract and Zuri OS adapter |

## Phase progress

| Phase | Name | Status | Exit gate |
|---:|---|---|---|
| 0 | External prerequisites & product governance | In progress (Meta setup deferred) | Meta account/app checklist ready; owner later completes external setup |
| 1 | Standalone platform foundation | In progress | Product docs, frontend shell, API bootstrap, RBAC/tenant-scope primitives, audit-event builder, MongoDB indexes and initial security tests committed; next: owner bootstrap, login/logout, session inventory/rotation/per-session revocation, password change, password-reauthenticated encrypted TOTP MFA, invited-user registration, tenant invitation/member lifecycle, MongoDB-backed rate limiting, MFA-gated privileged mutations, audited MAC tenant provisioning, paginated audit reads, live MAD aggregates, connected MAC tenant/audit panels, API verification workflow and unit tests committed; remaining: mail-delivered invitation/password recovery, MFA recovery codes, audit immutability/archive, database integration tests, security review and confirmed successful CI |
| 2 | Facebook & Instagram | Not started | Tested supported asset and publishing/messaging capabilities |
| 3 | Advertising | Not started | Tested campaign lifecycle and spend controls |
| 4 | WhatsApp | Not started | Tested WABA onboarding, messaging and webhooks |
| 5 | Multi-business SaaS | Not started | Cross-tenant isolation and customer onboarding verified |
| 6 | Unified integrations | Not started | External client integration verified |
| 7 | Production readiness & launch | Not started | Meta approvals and security/compliance release gates passed |

## MAC and MAD progress

| Component | Planned phase | Status | Acceptance requirement |
|---|---:|---|---|
| MAC — Master Admin Console | 1 | In progress (UI shell + authorization foundation) | Navigation and module placeholders created; backend authentication, read-only tenant/audit views, audited tenant provisioning, MFA step-up, session management and tenant invitation/member lifecycle routes implemented; platform administrator lifecycle, settings mutations and complete audit immutability/export remain |
| MAD — Master Admin Dashboard | 1 | In progress (UI shell) | Operational overview, five objectives and phase roadmap rendered with clearly labelled placeholder values; authenticated read-only MongoDB aggregate service now exists and frontend reads it; live API/webhook health telemetry, usage/revenue billing metrics and alerting remain |
| MAC/MAD shared authorization | 1 | In progress (RBAC primitives) | Separate platform roles and tenant roles; default-deny checks and tenant isolation tests committed; MAC/MAD reads, tenant provisioning and tenant membership routes enforce server-side role checks; sensitive mutations require recent TOTP step-up; broader tenant integration and negative authorization tests remain |

## Change control

Any scope reduction, phase reordering, data-model change, new Meta permission, or security exception must be documented with rationale, impact and approval. The five objectives remain in scope unless the product owner explicitly changes them.


## Latest implementation log

**Authentication and administration milestone:** committed to `feat/zuri-mebumip-foundation`.

- Added one-time platform-owner bootstrap, creating Blockchain Innovations LTD's initial tenant and assigning the owner membership.
- Added scrypt password hashes, bearer login, current-session identity lookup and logout revocation. Only session token hashes are stored.
- Added server-authorized MAC tenant directory and audit-event read endpoints.
- Added audited MAC tenant provisioning for an existing active user.
- Added MAD read-only database aggregates for tenant/user/session counts and Meta/webhook status counts.
- Added a partial unique MongoDB index enforcing one platform-owner account.
- Added API setup and endpoint documentation.

**Verification:** no build, typecheck, database integration test or automated test suite has yet been run. These commits are implementation work, not a production release. Authentication abuse controls, invitations, recovery, step-up/MFA, immutable audit retention and tenant-scoped business routes remain open.


## Phase 1 remaining-work implementation log

**Latest implementation scope completed on branch `feat/zuri-mebumip-foundation`:**

1. **Tenant invitations and membership lifecycle — In progress.** Added tenant member/invitation listing, invitation creation with a 72-hour expiry, hashed one-time invitation tokens, invited-user registration, authenticated acceptance requiring the invitee's email to match, role/status updates, member removal and invitation revocation. Tenant-owner membership cannot be changed or removed through these routes. Invitation email delivery is not configured; the API returns the token once for a trusted mail adapter. Invited new users can register with the invitation token; existing users can accept after sign-in. Email delivery remains external.
2. **Distributed rate limiting — Foundation implemented.** Added MongoDB-backed fixed-window counters shared by API instances, TTL cleanup, dedicated bootstrap/login/MFA policies, general API limits and standard rate-limit response headers. The current client key is based on request IP and route; production proxy trust and abuse monitoring must be configured/reviewed.
3. **Session lifecycle and recovery — Partially implemented.** Added session inventory, per-session revocation, bearer token rotation and authenticated password change that revokes other sessions and clears current step-up state. Email recovery remains pending mail-provider integration. Email-based password reset, email verification and recovery delivery remain blocked on a configured mail provider.
4. **MFA and privileged step-up — Foundation implemented.** Added TOTP enrollment (requiring password reauthentication), AES-256-GCM encryption of MFA secrets using `MFA_ENCRYPTION_KEY`, 15-minute enrollment expiry and five-minute step-up verification. MAC tenant creation and tenant membership/invitation mutations require recent step-up. MFA recovery codes, factor reset and owner lockout recovery remain.
5. **Audit logging and retention — In progress.** Added denied bootstrap/login and MFA attempt events plus session, tenant and membership lifecycle events. MAC audit reads are paginated. No TTL deletion is configured for audit events. Cryptographic tamper-evidence, restricted database write roles, archive/export and retention governance remain.
6. **Tenant-scoped API routes — Foundation implemented.** Member and invitation routes require active membership in the exact tenant, role permissions and step-up for sensitive mutations. Meta business/resource routes remain disabled until provider credentials, consent and webhook controls are implemented.
7. **Tests and verification — In progress.** Added unit tests for TOTP encryption/verification, rate-limit key properties and tenant permission isolation. Added a GitHub Actions workflow for API typecheck/tests/build and web typecheck/build. No successful CI result has been confirmed yet.
8. **MAC/MAD frontend wiring — Foundation implemented.** Added login/logout UI, live MAD aggregate panel, MAC tenant directory and audit-event panels. Browser bearer tokens are held in session storage for this development foundation; production should move to a secure HttpOnly-cookie/BFF pattern.

**Verification limitations:** The GitHub Actions workflow is committed but its result has not been confirmed. The latest available combined commit status showed Vercel build checks failing due to Vercel build-rate limits; that is not a TypeScript/test result. A local build could not be run in this execution environment because GitHub network access was unavailable. Do not treat the implementation as production verified.


**Additional Phase 1 follow-through:** invited new users can now register using a one-time invitation token; existing accounts can accept invitations after sign-in. MFA enrollment requires current-password reauthentication, enrollment confirmation expires after 15 minutes, and dedicated rate limits cover registration and MFA setup/enable/step-up.


**Latest code additions:** invited-user self-registration, per-session inventory/revocation, password reauthentication before MFA enrollment, MFA setup expiry, and corrected dedicated rate limits for MFA enrollment/step-up. The MAC/MAD web workspace now signs in against the API and reads live dashboard aggregates, tenant directory records and audit events. Expired browser sessions are cleared when the API returns 401.

**Verification status:** a GitHub Actions workflow is committed for API typecheck, tests and build plus web typecheck and build. The latest queried commit had no reported status checks; earlier Vercel checks on an earlier commit failed because the Vercel project hit build-rate limits. No local test/build result is available from this environment.


**Final review note for this implementation pass:** invited-user registration and existing-user invitation acceptance are both available. MFA enrollment now requires password reauthentication and an expiring confirmation window. Session inventory and per-session revocation are available. Source formatting for the registration route and shared token hashing imports was corrected during review. These changes have not yet passed a confirmed remote build or test run.


**MFA recovery implementation follow-through (2026-11-20):** MFA enablement now creates ten high-entropy one-time recovery codes, returns them once, and stores only SHA-256 hashes. Step-up accepts either TOTP or a recovery code; recovery-code consumption uses an atomic database update so a code cannot be replayed. A factor-reset endpoint requires the current password and an unused recovery code, removes the enrolled factor, and revokes all active sessions. Added unit coverage for recovery-code generation, uniqueness, normalization and bounds. The factor-reset flow is an account recovery mechanism, not a support-agent bypass. This change still requires remote CI verification and database-backed route tests.


**MAC administrator lifecycle follow-through (2026-11-20):** added protected administrator directory and a platform-owner-only role/status update endpoint for existing platform administrators. Changes require recent MFA step-up, are audited, protect the platform-owner account, and revoke active sessions when an administrator is suspended. Suspended platform administrators no longer receive platform-role permissions on subsequent requests. The MAC now has a connected administrator directory screen. Creation/invitation of new platform administrators and interactive role/suspension controls in the UI remain outstanding.


## Phase 1 closure-gate snapshot — 2026-11-20

| Gate | Status | Evidence / blocker |
|---|---|---|
| Trusted email delivery | Blocked on provider configuration | No mail provider or SMTP/API credentials have been selected/configured. Invitation delivery and password recovery must remain disabled until a trusted provider and secret-managed configuration are supplied. |
| MFA recovery and factor reset | Implementation added; verification pending | Ten one-time codes are generated on MFA enable; only hashes are stored; recovery-code step-up consumes atomically; reset requires password plus unused code and revokes sessions. Unit tests added for generation/normalization. Database-backed route tests and CI remain pending. |
| Audit immutability/archive | In progress | Existing append-style audit writes and pagination remain. Hash-chain/tamper evidence, restrictive DB roles, signed archive/export and retention governance are not implemented. |
| Database-backed integration tests | Foundation implemented; CI passed | MongoDB-backed Fastify test covers cross-tenant denial, invitation creation/registration/replay, membership and audit persistence, single-use MFA recovery and factor reset/session revocation. Broader bootstrap/login/session lifecycle and exhaustive tenant-isolation matrix remain. |
| API/web verification | GitHub Actions passed; deployment checks blocked | Dedicated MeBuMIP workflow passed API typecheck/tests/build and web typecheck/build. Full monorepo CI passed OpenAPI validation, route-drift check, typecheck, tests and build. Vercel deployment checks still fail due to the project's build-rate limit; no deployment was performed. |
| MAC administrator lifecycle | Partially implemented | Added administrator directory and MFA-gated, audited role/status update API; owner account is protected; suspension revokes sessions and removes platform-role access. Admin creation/invitation and interactive role/suspension controls remain. |
| Production session/security architecture | Not complete | Current browser bearer token remains in sessionStorage. Production needs HttpOnly Secure SameSite cookie/BFF, CSRF/origin policy, proxy trust review, device/session metadata, recovery delivery, secrets rotation and deployment security review. |

**Phase 1 decision:** remain **In progress**. No closure or production-readiness claim is authorized until all seven gates are evidenced as complete.


## Phase 1 implementation continuation — 2026-11-20

**MongoDB-backed security workflow coverage added on `feat/mebumip-phase1-security-hardening`:**

- Added a real MongoDB integration test that creates isolated tenant fixtures and exercises the Fastify invitation/member endpoints against persisted users, memberships, sessions, invitations and audit events.
- Verified the exact-tenant boundary: a valid owner session for Tenant A receives `403` when reading Tenant B's member directory.
- Verified invitation creation, invited-user registration, membership persistence, accepted-invitation state, audit persistence and rejection of registration replay.
- Extended the same database-backed test to consume an MFA recovery code for step-up, reject reuse of that code, reset the factor with a second unused code plus the current password, and verify active-session revocation and removal of stored recovery hashes.
- Updated the dedicated Phase 1 GitHub Actions workflow to start a MongoDB 7 replica set and provide `MONGODB_TEST_URI`; the integration test is skipped only when that URI is absent, and is enabled in this workflow.
- Recovery codes and factor reset were already implemented in the merged Phase 1 foundation; this increment adds route-level database evidence rather than claiming that the feature was newly implemented.

**Verification state:** implementation committed to the new branch; remote workflow results still need to be observed. Trusted email provider integration, audit tamper-evidence/archive, secure production browser session architecture, backup/restore, independent security review and production deployment remain open. Phase 1 remains **In progress**.

**Objective traceability:** objectives A–E remain intentionally deferred to their planned Meta integration phases; no Meta credentials or live integrations were introduced by this security-hardening increment.


**Verified CI evidence — 2026-11-20, PR #13 head `918433d8c5763fbbdae4523e01170e7fe18e25e4`:**

- MeBuMIP Phase 1 verification run #203 passed: https://github.com/openpayglobal/zurios/actions/runs/44707839261
- Full monorepo CI run #1227 passed: https://github.com/openpayglobal/zurios/actions/runs/44707839188
- The MongoDB replica set now advertises the runner-mapped `127.0.0.1:27017` address, avoiding unresolvable container hostnames.
- Atomic recovery-code consumption/reset uses a MongoDB update pipeline and filters on the correctly scoped `$$codeHash` variable; the route-level test confirms successful one-time consumption, replay rejection and factor reset.
- The monorepo CI additionally caught and fixed literal escaped newlines in `packages/core-platform/src/location-service.ts` and a nested-schema parsing bug in the OpenAPI drift checker. OpenAPI drift validation now passes with 30 paths, 19 idempotent mutations and 19 shared Zod request schemas.

**Release status remains unchanged:** PR #13 is open and unmerged. Vercel checks remain rate-limited; trusted email provider configuration, audit immutability/archive controls, secure production browser sessions, backup/restore drill and independent security review remain outstanding. No production deployment or migration has been run.


**Bootstrap and authentication lifecycle hardening — 2026-11-20:**

- Added a unique, expiring MongoDB bootstrap lease so simultaneous first-owner bootstrap requests cannot both pass the preflight owner count. The existing partial unique platform-owner index remains the final invariant; completed bootstrap state is persisted and a stale in-progress lease can be reclaimed.
- Added MongoDB-backed acceptance coverage for simultaneous bootstrap requests (exactly one owner creation), invalid bootstrap secrets, owner membership creation, failed and successful login, authenticated identity, session inventory, per-session revocation, token rotation/replay denial, password change revocation, logout and audit actions.
- These are route-level integration tests against an isolated MongoDB database in the Phase 1 replica-set workflow; they do not exercise production credentials or deployment configuration.
- The bootstrap lease is an application-level concurrency guard, not a substitute for the unique owner index or a transactional deployment environment.

**Verification:** the new integration test and bootstrap guard are committed to `feat/mebumip-phase1-security-hardening`. The latest Actions run must pass before this increment is treated as verified. Phase 1 remains **In progress**; production mail delivery, independent immutable archive/WORM storage, deployment-specific cookie/session hardening, backup/restore and independent security review remain release gates.
