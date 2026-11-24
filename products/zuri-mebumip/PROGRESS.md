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
| Database-backed integration tests | Not started | Need MongoDB-backed tests for bootstrap/login/session, invitation acceptance/replay, MFA gates and cross-tenant denial. |
| API/web verification | Not verified | CI workflow is committed. Latest observed commit checks are Vercel failures caused by the project's build-rate limit; no passing GitHub Actions typecheck/test/build evidence was retrieved. Local verification remains unavailable in this environment. |
| MAC administrator lifecycle | Partially implemented | Added administrator directory and MFA-gated, audited role/status update API; owner account is protected; suspension revokes sessions and removes platform-role access. Admin creation/invitation remain; interactive role/suspension controls are now connected and MFA-gated. |
| Production session/security architecture | Not complete | HttpOnly/Secure production cookie and session-bound CSRF foundations are implemented. Remaining: proxy trust and origin review, deployment topology/SameSite validation, device/session metadata, BFF deployment decision, secrets rotation and production security review. |

**Phase 1 decision:** remain **In progress**. No closure or production-readiness claim is authorized until all seven gates are evidenced as complete.


**Audit integrity follow-through (2026-11-20):** all new events created through the shared audit-event builder now carry an HMAC-SHA256 signature when `AUDIT_SIGNING_KEY` is configured. Production configuration now requires this key. Added MAC endpoints to verify the latest 500 records and export bounded pages with per-record integrity status. Unit tests cover signature verification and tamper detection. Existing historical records remain unsigned; exports are not yet copied to immutable object storage or independently archived. Production must keep the signing key outside MongoDB and back it up securely.


**Database integration test milestone (2026-11-20):** added an opt-in MongoDB-backed API integration test covering platform bootstrap/login, TOTP enrollment, one-time MFA recovery-code consumption and replay rejection, tenant invitation registration and replay rejection, cross-tenant membership denial, and HMAC audit signature verification. Updated the Phase 1 GitHub Actions workflow to provision an ephemeral MongoDB 7 service and provide test-only environment keys. The first MongoDB-enabled GitHub Actions run passed the integration suite (15 tests, 15 passed, 0 failed, 0 skipped) together with API typecheck/build and web typecheck/build.


**Trusted email delivery implementation (2026-11-20):** added a Resend-backed mail adapter with an in-memory test sink, production-required `RESEND_API_KEY` and verified `MAIL_FROM` configuration, invitation delivery with raw tokens removed from API responses, and fail-closed invitation revocation when delivery fails. Added non-enumerating password recovery request and 30-minute one-time password reset endpoints; reset revokes all sessions. Recovery and invitation endpoints receive dedicated abuse limits. MongoDB integration coverage now exercises invitation delivery, registration/replay rejection, password recovery/reset/replay rejection, and successful sign-in with the recovered password. Live delivery remains blocked until the owner configures a Resend API key and verified sender domain in the deployment secret manager.


**Production browser-session hardening (2026-11-20):** added `HttpOnly` session cookies, a session-bound HMAC CSRF token cookie, mandatory CSRF header validation for cookie-authenticated state-changing requests, secure cookies in production, cookie rotation on refresh and clearing on logout/password reset/MFA reset. Production login/refresh no longer return bearer tokens in JSON; bearer support remains for trusted non-browser clients. MAC/MAD browser requests now use credentialed cookies and no longer persist access tokens in `sessionStorage`. Added MongoDB integration assertions for cookie authentication and CSRF rejection/acceptance. Reverse-proxy trust, exact production origins, HTTPS, SameSite/deployment topology and browser end-to-end testing still require deployment review.


**Session deployment hardening follow-through (2026-11-20):** cookie SameSite policy is configurable (`Strict`, `Lax`, `None`) and the API now trusts reverse-proxy client IP headers only for explicitly configured `TRUSTED_PROXY_CIDRS`. Session records capture a bounded user-agent and a one-way IP hash; the session inventory exposes device label metadata without exposing IP addresses or token material. Production still requires HTTPS, exact CORS origins, appropriate SameSite selection and a verified proxy topology.


**MAC control-screen follow-through (2026-11-20):** the MAC administrator screen now supports MFA step-up and interactive role/suspension changes; the session screen lists active sessions and supports per-session revocation; the platform settings screen now reads safe runtime configuration status without exposing secrets; the audit screen supports signature verification and bounded export. Integration tests now also assert session inventory/device metadata and MAC runtime settings/audit verification/export endpoints. The settings screen is deliberately read-only for deployment secrets; runtime mutation controls remain separately governed.


**Sequenced audit and signed export follow-through (2026-11-20):** all platform, authentication and tenant-membership audit writes now pass through a shared append service that allocates monotonically increasing sequence numbers in MongoDB and signs each event with HMAC-SHA256. A unique sparse sequence index prevents duplicate sequence values. The MAC verification endpoint reports sequence gaps as well as invalid/unsigned records; paginated exports include a signed manifest over event IDs, sequence values and event signatures. The MAC audit screen now downloads the export JSON. This detects tampering and missing sequence records in the verified window but does not make MongoDB immutable; independent WORM/object-lock archive storage, restricted DB roles, backup retention and full-history verification remain required.


## Latest implementation checkpoint — 2026-11-20

- **Email:** Resend adapter, tenant invitation email, non-enumerating password recovery, one-time 30-minute reset token, session revocation on reset, fail-closed invitation delivery and test mail sink implemented. Live delivery is **blocked only on deployment configuration**: verified sender domain, `RESEND_API_KEY`, and `MAIL_FROM` in a secret manager.
- **MFA:** one-time recovery codes, atomic consumption, password-plus-recovery factor reset and session revocation implemented; route behavior covered in MongoDB integration tests.
- **Audit:** HMAC-SHA256 event signatures, MongoDB monotonic sequence allocation, unique sequence index, sequence-gap detection, bounded export and signed export manifest implemented. Browser MAC can download export JSON. **Independent immutable archive/WORM storage and restricted database roles remain outstanding.**
- **Database tests:** ephemeral MongoDB 7 in CI. Integration coverage includes bootstrap/login, HttpOnly cookie and CSRF checks, TOTP/recovery, invitation registration/replay, password recovery/reset/replay, cross-tenant denial, session inventory, runtime settings, audit verification/export and deleted-sequence detection.
- **Verification:** latest confirmed fully green commit before the newest manifest/cookie/UI additions is `68e3f61`; API typecheck, API tests (15 passed, 0 failed, 0 skipped), API build, web typecheck and web build all passed. Newer commits are queued/running in GitHub Actions and must be confirmed before treating the latest tree as verified.
- **MAC/MAD:** MAC administrator list and MFA-gated role/suspension actions, session inventory/revocation, safe runtime configuration status, audit verification/export/download; MAD remains read-only live aggregate data. Platform administrator creation/invitations and settings mutation workflows remain.
- **Production session:** browser no longer stores bearer tokens; cookie auth is HttpOnly, CSRF-protected, SameSite-configurable and Secure in production. Session inventory includes device user-agent labels and a hashed IP. Exact CORS origins, TLS, trusted proxy CIDRs, cookie deployment topology and end-to-end browser testing require environment review.

**Phase 1 remains open.** Do not start Phase 2 as a substitute for closing Phase 1 security and release gates. No Meta credentials are configured; all five objectives remain approved and in scope.


**Platform administrator invitation lifecycle follow-through (2026-11-20):** MAC platform owners can now create 48-hour administrator invitations after MFA step-up. Invitations are delivered through the configured email adapter; raw tokens are never returned to API callers. Invited new users can register through `/v1/auth/register-platform-admin`; existing users can accept through `/v1/mac/admin-invitations/accept`; pending invitations can be listed and revoked through MAC endpoints. Role assignment is limited to platform admin/operator/auditor; platform owner remains protected. All invitation creation, delivery failure, acceptance and revocation actions use sequenced signed audit events. MAC now includes invite and revoke controls. Database integration coverage exercises new-admin registration, existing-user acceptance and invitation revocation; awaiting the current CI result.


**Platform administrator onboarding UI follow-through (2026-11-20):** the sign-in panel now supports invited platform administrator registration for new users using the emailed one-time token; authenticated existing users can accept an administrator invitation from the same panel. MAC owners can send, list and revoke pending invitations. New platform administrator registration and existing-user acceptance are covered by the MongoDB integration suite; final UI build verification is pending the newest CI run.


**MAC tenant membership control follow-through (2026-11-20):** added platform-scoped tenant member and invitation endpoints so the MAC can administer tenants even when the platform administrator is not a member of that tenant. The MAC can list members and pending invitations, send tenant invitations, change member roles/status, remove memberships, and revoke invitations. Tenant-owner memberships are protected; every mutation requires platform tenant-write permission plus recent MFA step-up and emits a sequenced signed audit event. The tenant directory UI now includes member/invitation management. MongoDB integration tests cover MAC tenant membership listing, invitation send/revoke and member role update.


**Latest CI verification checkpoint (2026-11-20):** GitHub Actions run `44688509838` on commit `f118e9e` completed successfully: API typecheck, API tests, API build, web typecheck and web build all passed. API tests reported 15 passed, 0 failed, 0 skipped, including the MongoDB 7 integration suite. The test suite now also covers MAC tenant member listing, email invitation and revocation, membership role update, protected tenant/platform owner accounts, platform administrator invitation/registration/acceptance/revocation, and audit sequence-gap detection. A subsequent run is validating the final audit export cursor/pagination changes and latest docs/UI commits.


## Updated Phase 1 closure assessment — 2026-11-20

| Closure gate | Assessment | Remaining action |
|---|---|---|
| Trusted email delivery | Adapter and flows implemented; not live | Owner must verify a sending domain and configure `RESEND_API_KEY` plus `MAIL_FROM` in deployment secrets. Production startup intentionally fails closed without them. |
| MFA recovery and factor reset | Implemented and integration-tested | Operational recovery/runbook and key backup review. |
| Audit immutability and archive | Tamper-evident sequence/signature and signed exports implemented | Configure independent immutable/WORM archive storage, restricted database roles, backup retention and full-history archive verification. |
| Database-backed integration tests | Passed | Keep the MongoDB 7 CI service and extend coverage as endpoints evolve. |
| API/web typecheck, tests and builds | Passed on latest code commit `98561ed` | Re-run after further code changes; Vercel deployment checks remain rate-limited and are not used as CI evidence. |
| MAC administrator lifecycle and control screens | Implemented and integration-tested across administrator and tenant member/invitation workflows | Production UX/accessibility review; deployment-specific configuration and any additional settings mutation policy. |
| Production session/security architecture | HttpOnly cookies, CSRF, SameSite, secure production cookies, trusted proxy allowlist and session inventory implemented | Verify HTTPS, exact production CORS origins, trusted proxy CIDRs, cross-site cookie topology, secrets rotation and end-to-end browser security in the chosen deployment. |

**Verified CI run:** GitHub Actions run `44688590085` completed successfully on commit `98561ed5e23d5864243f1302f74f978063408673`. All five gates passed: API typecheck, API tests, API build, web typecheck and web build. Test summary: **15 passed, 0 failed, 0 skipped**. The MongoDB-backed integration test passed, including platform-admin onboarding, MAC tenant controls, session/CSRF behavior, password recovery, tenant isolation, audit sequence-gap detection and stable export pagination.

**Phase 1 remains In progress, not closed.** The external email credentials/sender domain and independent immutable archive are owner/deployment dependencies; production security review remains necessary. No production deployment or Meta integration is claimed.


**Platform administrator authorization regression coverage (2026-11-20):** expanded the MongoDB-backed integration test to verify that a platform administrator's role can be changed by the platform owner, suspension revokes existing sessions, reactivation permits a fresh login, an auditor can read MAD metrics and audit records, and an auditor cannot perform platform-administrator mutations. This closes a meaningful negative/positive authorization coverage gap in the existing MAC administrator lifecycle. The new test is committed; its GitHub Actions result is pending and must pass before this coverage is considered verified.

**Phase 1 operational security runbook (2026-11-20):** added `PHASE1-PRODUCTION-SECURITY-RUNBOOK.md` and linked it from the product README. It records production secret inventory, HTTPS/CORS/proxy/cookie/CSRF checks, trusted email acceptance, MFA recovery operations, MongoDB least privilege and backup/restore evidence, independent immutable audit archiving, and release approval gates. It explicitly warns that the current single-key audit/MFA configuration must not be rotated by simply replacing environment variables; key-versioning and migration support are required first. The runbook is a closure-control artifact, not evidence that production infrastructure or WORM storage is configured.

**Verification follow-through:** the expanded administrator regression test was corrected to suspend the same invited member whose session is asserted. The code and runbook/documentation changes are committed. A fresh GitHub Actions result for these latest commits has not yet been retrieved; only the earlier successful run is confirmed. Vercel status failures remain attributable to the configured build-rate limit and are not treated as application test results.


**Ecosystem documentation consolidation (2026-11-20):** added a canonical ecosystem documentation entry point under docs/README.md and a cross-ecosystem reference at docs/ZURI-ECOSYSTEM-OVERVIEW.md. The overview records the Zuri OS / MeBuMIP product boundary, shared architecture principles, security and integration governance, MAC/MAD separation, all five approved objectives A–E, and all programme phases 0–7 with their current statuses. The repository root README now points to the ecosystem documentation index and the product's authoritative roadmap, architecture, progress register and Phase 1 security runbook. The docs index preserves the existing planned documentation taxonomy (product, architecture, UX, database, API, security, compliance, operations and decisions) and links to the currently authored product documents. This is documentation/navigation work; it does not claim that future product specifications, Meta integrations, production controls or Phase 1 closure are complete.


**CI and defect-remediation checkpoint (2026-11-20):** the new repository validation workflow passed on commit 0506145297c3547ddc8f81f6130c264a3d803f4e (run 44733364576). OpenAPI lint and the corrected route-drift check passed; the route check verified 30 paths, 19 idempotent mutations and 19 shared Zod request schemas. Repository typecheck, test and build steps all completed successfully. Across the three workspace test summaries, 44 tests were reported: 37 passed, 7 skipped and 0 failed. The MeBuMIP Phase 1 workflow also passed on the same commit (run 44733364512): API typecheck, 15 API tests (15 passed, 0 failed, 0 skipped), API build, web typecheck and web build all succeeded.

The route-drift checker was corrected to identify the outer schema properties block rather than accidentally matching nested object properties. The same verification pass exposed invalid literal escaped newline tokens in packages/core-platform/src/location-service.ts; those were replaced with real line breaks without changing the active-child or active-membership deactivation guards. The OpenAPI info metadata now uses the proprietary license identifier LicenseRef-Proprietary. Vercel status checks continue to fail because of the configured Vercel build-rate limit; they are not application CI failures and no deployment is claimed.

**Ecosystem documentation checkpoint (2026-11-20):** docs/README.md is now the central documentation index; docs/ZURI-ECOSYSTEM-OVERVIEW.md records ecosystem boundaries, shared architecture, security and integration governance, MAC/MAD responsibilities, all approved objectives A–E and all programme phases 0–7. The root README and MeBuMIP README link to the ecosystem index. Product-specific roadmap, architecture, progress and security runbook remain linked as the detailed MeBuMIP sources of truth.


**Versioned MFA encryption and key migration implementation (2026-11-20):** added AES-256-GCM ciphertext envelopes carrying a version and key ID, an active-key selector, retained-key decryption, and backward compatibility for legacy unversioned ciphertext. Production config validates the JSON key ring and active key reference. Added unit coverage for active/previous keys, legacy ciphertext, unknown key IDs, malformed payloads and authentication-tag tampering. Added `mfa:rekey`, a dry-run-first migration utility that reports counts only, verifies decryption and re-encryption before conditional update, and requires both `MFA_REKEY_APPLY=true` and `MFA_REKEY_BACKUP_CONFIRMED=true` before writes. The utility has not been run against production data; no keys have been rotated. CI verification is pending for these changes.

**Global security research and documentation (2026-11-20):** added `docs/security/KEY-MANAGEMENT-AND-AUDIT-ARCHIVING.md`, grounded in OWASP Secrets Management and ASVS, NIST SP 800-57, AWS S3 Object Lock documentation and Meta API versioning references. It distinguishes current implementation from future requirements, documents safe MFA key rotation, blocks audit-key rotation until versioned verification exists, and specifies independent WORM archive requirements. AWS S3 is described as a candidate example only; no provider or retention duration has been selected.


**Documentation integrity check (2026-11-20):** the docs index was checked against the repository tree. It links to 21 relative resources; one workflow-directory link was not directly resolvable as a file and has been replaced with the concrete MeBuMIP Phase 1 workflow file. The docs tree contains 31 files at this checkpoint. Re-run link validation whenever canonical documents are added or moved.


**Zuri OS global identity and multi-workspace implementation (2026-11-20):** implemented password-first login without a required workspace slug, workspace-neutral MFA challenges, hashed one-time workspace selection tokens, active membership/tenant filtering, authenticated workspace listing, and tenant-bound workspace switching with conditional old-session revocation. Added a reserved platform control-plane session for independently granted platform operators, including operators with no tenant memberships; platform grants are rechecked by middleware and refresh. The existing Zuri OS browser chooser/switcher was connected to the API. Added public non-enumerating Zuri OS access request intake with rate limiting and audit events, plus MAC access-request review actions that do not auto-provision users, tenants or memberships. Added integration coverage for multiple tenant memberships, MFA-before-workspace-disclosure, one-time selection/replay, switching, platform-only sessions, MAC access and no-workspace access requests. The route-drift check initially identified the new MAC access-request paths as missing from OpenAPI; the contract has been updated. Latest CI is pending for the complete implementation.


**Integrated identity and access-request verification (2026-11-20):** repository CI passed on commit `2b14df547a17280d3b89cce75e8fd22391a4995c` (run 44744095076): OpenAPI lint, route drift, monorepo typecheck, tests and build all succeeded. Route drift validated 32 paths, 20 idempotent mutations and 20 shared Zod request schemas. The three monorepo test suites reported 48 tests total: 41 passed, 7 skipped, 0 failed. MeBuMIP Phase 1 CI passed on commit `2b826c7ebc1cabafa7ab361731f746e7980102fe` (run 44744111379): API typecheck/tests/build and web typecheck/build all succeeded. A further platform-grant revocation integration assertion and its authentication error mapping were added after these runs; a fresh full-repository CI result is still required for that final change.


**Versioned audit-signing key ring (2026-11-20):** added optional `AUDIT_SIGNING_KEYRING` and `AUDIT_SIGNING_ACTIVE_KEY_ID` configuration, HMAC-SHA256-v2 event and export-manifest signatures with key IDs bound into signed payloads, historical HMAC-SHA256 verification using the retained legacy key, and configuration conflict/shape validation. Added tests for active-key signing, old-key verification, key-ID tampering and export-manifest key IDs. MAC runtime settings now expose only whether key rings are configured and the active key identifiers, never key values. Production key rotation has not been configured or run.


**Meta platform global research baseline (2026-11-20):** added `docs/integrations/META-PLATFORM-INTEGRATION-READINESS.md` and indexed it in `docs/README.md`. The document records the current official Meta Graph API and Marketing API version observations, separates their version schedules, and defines Tech Provider/App Review gates, least-privilege permissions, Pages/Instagram lifecycle, advertising spend controls, WhatsApp opt-in/templates/webhooks, event reliability and tenant isolation. This is a readiness specification, not implementation evidence. Objectives A–D remain not started; Meta setup remains deferred by the owner.

**Audit export signer compile correction (2026-11-20):** CI had reported duplicate exported `signAuditExport` implementations in `apps/mebumip-api/src/security.ts`. Removed the duplicate legacy implementation while preserving the version-aware signer and the single manifest verifier. The failing run predates this fix; verification is pending on the subsequent commit.


## Programme status snapshot — 20 November 2026

### Five approved objectives

| Objective | Scope | Phase | Status |
|---|---|---:|---|
| A | Facebook Pages and Instagram account management | 2 | Not started |
| B | Facebook and Instagram advertising | 3 | Not started |
| C | WhatsApp Business Platform/API | 4 | Not started |
| D | Multi-business Meta management | 5 | Not started |
| E | Zuri OS and third-party integrations | 6 | Not started |

### Programme phases

| Phase | Status |
|---|---|
| 0 — Governance and Meta prerequisites | In progress; Meta setup deferred by owner |
| 1 — Foundation, security, MAC and MAD | In progress |
| 2 — Facebook and Instagram | Not started |
| 3 — Advertising | Not started |
| 4 — WhatsApp | Not started |
| 5 — Multi-business SaaS | Not started |
| 6 — External integrations | Not started |
| 7 — Production readiness and launch | Not started |

### Latest verified code checkpoint

- Repository: `openpayglobal/zurios`
- Branch: `feat/zuri-mebumip-foundation`
- Code fix: `75fb1201dfb8dba7e4c4ca611e057f1ff82fe7b8` removed the duplicate audit export signer reported by CI.
- Repository CI run [44744980971](https://github.com/openpayglobal/zurios/actions/runs/44744980971): OpenAPI contract validation, route drift, monorepo typecheck, tests and build all passed. This run tested the code-fix commit; later commits in this checkpoint add documentation only.
- MeBuMIP Phase 1 run [44744971467](https://github.com/openpayglobal/zurios/actions/runs/44744971467): API typecheck, API tests, API build, web typecheck and web build all passed.
- A subsequent MeBuMIP run [44744981017](https://github.com/openpayglobal/zurios/actions/runs/44744981017) has completed API typecheck, API tests, API build, web typecheck and web build successfully; final container cleanup was still running when this register was updated.
- Earlier failing runs on pre-fix commits are retained as history and must not be mistaken for the latest code status.

### Remaining Phase 1 closure gates

- Configure and verify the production mail sender and secrets.
- Exercise MFA key migration on a restorable non-production database; verify backup and rollback; do not rotate live keys without owner approval and evidence.
- Select and configure an independent immutable/WORM audit archive, retention policy, IAM boundary, retry/outbox and full-history reconciliation.
- Complete production HTTPS, CORS, trusted proxy, cookie topology, secrets custody/rotation and recovery runbook verification.
- Complete final MAC/MAD authorization and operational policy review.
- Verify deployment topology and production observability; no production deployment is claimed.

### Current boundaries

No live Meta app credentials, business portfolio, Tech Provider verification, App Review/Advanced Access approval, webhook subscription or customer Meta connection is configured or claimed. The Meta readiness specification in `docs/integrations/` informs future phases but does not change their approved status. Phase 1 remains in progress and the programme is not production-ready.


**Latest full-repository verification (2026-11-20):** CI passed on commit `b65cda422aaa18158cc00bf8774b7bf54d65870e` (run 44745084612). OpenAPI 3.1 validation, route drift (32 paths, 20 idempotent mutations, 20 shared Zod request schemas), monorepo typecheck, all tests and build passed. Test suites reported 49 tests: 42 passed, 7 skipped, 0 failed. MeBuMIP Phase 1 verification also passed on the same commit (run 44745084508): API typecheck, API tests, API build, web typecheck and web build all passed.

**Audit key-ring verification (2026-11-20):** MeBuMIP now supports HMAC-SHA256-v2 with active key IDs for new events and export manifests, retained legacy verification, tamper-resistant key-ID binding and export-manifest verification. The security suite covers the versioned signing path. The successful MeBuMIP Phase 1 run above includes these changes. No production audit key ring has been configured or rotated.

**Documentation correction (2026-11-20):** the Phase 1 security runbook key settings table now has one actual row per setting; the earlier escaped newline rendering defect is corrected. The global documentation index includes the Meta Platform Integration Readiness standard and the Key Management/Audit Archiving standard.


**Provider-neutral audit archive pipeline (2026-11-20):** added a bounded (maximum 1,000 events), contiguous-sequence archive package builder that verifies every event signature, creates a signed export manifest, computes a SHA-256 content address and emits a deterministic object key. Added an immutable-storage sink contract requiring provider version IDs and confirmed retention mode/date/legal hold, plus idempotent receipt persistence in `auditArchiveReceipts` and migration indexes. Tests cover content addressing, sequence gaps, tampered/unsigned events, storage retention mismatch and receipt persistence. No concrete provider adapter or production archive has been configured; owner approval of provider, retention and legal-hold policy remains required.


**MAC archive preparation workflow (2026-11-20):** integrated the provider-neutral archive package builder into `GET /v1/mac/audit-events/archive`. The endpoint is restricted to platform audit-read permission, requires an explicit contiguous sequence range of at most 1,000 events, verifies every event signature, downloads the signed manifest and event batch, and returns SHA-256/object-key/status headers. The MAC audit panel now has a “Prepare archive batch” action. The package clearly reports `prepared_not_archived`; no claim is made that it has reached independent WORM storage. Added a separate MeBuMIP OpenAPI contract at `docs/api/mebumip-openapi.yaml` and integration coverage for the download endpoint.


**Immutable archive preparation and provider-neutral retention contract (2026-11-20):** added the MAC archive package download endpoint, CORS exposure for digest/object-key/status headers, and an audit event recording every archive preparation. The provider-neutral sink contract now expresses guarantees rather than AWS-specific Governance/Compliance terminology: overwrite prevention, delete prevention through retention, explicit administrative-bypass resistance, verified retain-until date and legal hold. A separate official-source comparison covers Amazon S3 Object Lock, Azure Blob immutable storage and Google Cloud Storage Bucket Lock. Provider and retention remain unselected pending governance approval.

**Latest verification (2026-11-20):** full repository run 44746548613 passed both OpenAPI lint steps, route drift, monorepo typecheck, all tests and build; the three workspace suites reported 52 tests (45 passed, 7 skipped, 0 failed). MeBuMIP Phase 1 run 44746548651 passed API typecheck, all 23 API tests, API build, web typecheck and web build. Both runs were in runner cleanup at the time of this note; all validation steps had succeeded.


**Additional access-control and archive regression coverage (2026-11-20):** added integration assertions for access-request rate limiting (three pending submissions per email/IP hour with a non-enumerating acknowledgement), idempotent MAC review replay without duplicate provisioning, and archive preparation rejection of invalid ranges and sequence gaps. On commit `d22b5a705d751595070533367a6b189677fca147`, both OpenAPI lint steps, route drift, typecheck and test steps passed in repository CI run 44747048754; the build was still running. MeBuMIP Phase 1 run 44747048522 passed API typecheck, API tests, API build and web typecheck; the web build was still running.


**Latest complete verification (2026-11-20):** repository CI run 44747048754 passed both OpenAPI 3.1 lint checks, route drift (32 paths, 20 idempotent mutations, 20 shared Zod request schemas), monorepo typecheck, tests and build. The three workspace test suites reported 52 tests (45 passed, 7 skipped, 0 failed). MeBuMIP Phase 1 run 44747048522 passed API typecheck, all 23 API tests (23 passed, 0 skipped, 0 failed), API build, web typecheck and web build. No outstanding code-check failures remain on commit `d22b5a705d751595070533367a6b189677fca147`.


**External architecture reference check (2026-11-20):** attempted to inspect the previously referenced `infoedutechos/ODEI-Multi-Ecos` GitHub repository. The public GitHub API returned 404 and public search returned no result, so its contents could not be verified or incorporated. No architecture or requirements have been inferred from its name. If this repository is private or the URL has changed, repository access or an exported copy is needed before its specific requirements can be reconciled with the ecosystem docs.


**Access-request privacy governance (2026-11-20):** added a Draft privacy and retention requirements document under `docs/compliance/`, indexed it in the ecosystem docs hub, and updated the public request form to state purpose limitation, non-provisioning behavior and the requirement for an approved public privacy notice before production enablement. No retention period or jurisdiction-specific lawful basis has been invented; those remain owner/legal review gates.


**Public access-request production gate (2026-11-20):** public access requests now default to disabled. The public auth configuration endpoint exposes only the enablement flag and privacy-notice URL; the browser hides the request action when disabled and links the approved notice when configured. Production configuration refuses to enable the endpoint without an HTTPS privacy-notice URL. Integration tests explicitly enable the endpoint in the test environment. This prevents an unreviewed privacy workflow from being enabled accidentally in production.


**Public access-request privacy gate verification (2026-11-20):** added `GET /auth/public-config`, browser gating of the Request Zuri OS action, an optional HTTPS privacy-notice link, and a production config rule that refuses to enable public intake without the notice URL. Access requests default to disabled. Integration coverage verifies enabled/disabled public configuration, notice URL exposure, 503 behavior when disabled, non-enumerating rate limits and no account/tenant provisioning. Repository CI run 44748329176 passed both OpenAPI lint checks, route drift, typecheck, tests and build. Test totals: 52 (45 passed, 7 skipped, 0 failed). MeBuMIP Phase 1 run 44748328927 passed all API and web checks; all 23 API tests passed.


## Runtime module-resolution correction — 2026-11-22 UTC

The first READY Zuri OS API Preview was runtime-tested using the protected Vercel URL fetch path. Both `GET /health/live` and `GET /health/ready` initially returned HTTP 500 / `FUNCTION_INVOCATION_FAILED`. Vercel runtime logs isolated the cause: Node attempted to load `@zuri/core-platform/src/index.ts` from the production function bundle, but the workspace package exposed TypeScript source instead of executable JavaScript.

Corrected the package contract:

- `packages/core-platform/package.json` now exports `dist/index.js` for ESM runtime and `dist/index.d.ts` for TypeScript consumers.
- Added `packages/core-platform/tsconfig.build.json` to emit JavaScript, source maps and declaration files from the package source.
- `apps/api` build now compiles `@zuri/core-platform` before compiling the API, so direct Vercel builds cannot omit the shared package artifact.
- Exact-head repository CI runs `44989291690` and `44989287142` both passed on commit `ae406d569ad3cc1d5eb266ca5cfca70469d46d1e` (OpenAPI validation, route drift, docs mirror, typecheck, tests and build).
- Independently ran the API build in an isolated Vercel sandbox and imported `@zuri/core-platform` from the compiled API runtime; Node resolved the package and exposed 53 exports successfully.

**Deployment gate:** the corrected source has not yet been deployed. Vercel rejected the next API deployment request with HTTP 402 `api-deployments-free-per-day`, retry-after 86,400 seconds. The previous READY deployment therefore still has the runtime module-resolution error and must not be treated as healthy. Repeat deployment, `/health/live`, `/health/ready`, and authenticated login acceptance after the limit resets. Preview SSO has not been disabled; the temporary manual bypass used during diagnosis was revoked.


## Runtime export regression test and current CI — 2026-11-22 UTC

Added `apps/api/src/platform/core-platform-runtime.test.ts` to guard the compiled workspace package contract. The test imports the package through the same Node ESM resolution path used by the deployed API and asserts the event publisher, outbox worker, idempotent mutation, outbox writer and approval-request exports exist. This catches a future regression back to exporting raw TypeScript source.

Exact-head GitHub Actions runs `44989687455` and `44989683049` both passed on `4d12a6bf95c34db9e15f6cf289890e373f373138`: OpenAPI 3.1 validation for both APIs, route drift, product documentation mirror check, typecheck, tests and build. The API runtime import regression test is included in the API test suite.

The latest API deployment `dpl_z8JPqXF4i9qexDNig1LGEYqXCCFW` was built from the prior source commit and is still unhealthy at runtime. The fix is committed and CI-verified, but Vercel's deployment API again returned HTTP 402 `api-deployments-free-per-day` with retry-after 86,400 seconds. No live login is claimed until the corrected commit is deployed and both health endpoints pass. The Zuri OS web Preview is HTTP 200 / READY and remains SSO-protected.


## Health semantics and MAC workload-identity transport — 2026-11-22 UTC

- Zuri OS API now registers `/health/live` and `/health/ready` before Atlas initialization and keeps the HTTP service available when MongoDB cannot connect. Liveness remains HTTP 200; readiness returns HTTP 503 with a non-secret database state. A Vercel sandbox smoke test with a deliberately unavailable local MongoDB verified both responses and confirmed that the process remains running.
- MeBuMIP's MAC runtime-config client now sends its short-lived Vercel OIDC token both as the application `Authorization: Bearer` credential and as Vercel's `x-vercel-trusted-oidc-idp-token` Deployment Protection trusted-source proof. A unit test asserts both headers are present.
- Exact-head GitHub CI runs `44989972867` and `44989968679` passed on `746ec6dd7b378df2a2c4657cc44b9f1fa1a36a00` (both OpenAPI contracts, route drift, docs mirror, typecheck, tests and build).
- **Still requires Vercel owner security configuration:** the Zuri OS API project must explicitly trust the MeBuMIP API project as a Trusted Source for the intended Production-to-Production call. This is a cross-project Deployment Protection access-control grant and has not been added without owner authorization. Existing SSO protection remains enabled.
- MAC can currently update non-secret runtime configuration (approved API/browser origins and public settings) without redeploy when the runtime-config consumer can reach it. Secret values remain unavailable from MAC pending an encryption KMS/HSM and secure bootstrap design; database bootstrap credentials remain deployment-scoped. Do not describe the complete secret-vault/no-redeploy requirement as finished.


## Demo autofill password/hash consistency — 2026-11-22 UTC

Verified the exact branch-scoped `VITE_DEMO_PASSWORD` against the three stored Argon2id password hashes retrieved from the isolated `zuri_demo` database. All three checks returned `passwordMatches: true` for standard member, multi-workspace member and unassigned identity. The check ran in an ephemeral Vercel sandbox; the password was passed as a transient environment variable and was not printed or committed. This verifies the autofill password is synchronized with the seeded demo accounts; live API login still awaits a corrected API Preview deployment.


## MAC workload secret delivery allowlist hardening — 2026-11-24

- Replaced broad service-wide secret delivery with explicit secret-ID allowlists for each Production workload. MeBuMIP API receives only mail, MFA and audit-signing secrets; Zuri OS API receives only its JWT and MFA keys.
- Both the Zuri OS API's own refresh and the internal MAC workload endpoint use the shared allowlisted vault reader. MongoDB selection also requires Production environment, authorized service and non-revoked state.
- Regression tests cover both workload allowlists. Full CI passed on implementation commit `c82b76a1dc985fa892c76a1c5dd6f0ee83603d23` (run `45369507739`) and docs head `3c68434c3f226698da41436f9cbd2ee6e513a224` (run `45369769377`).
- Deployment/live acceptance remains blocked by Vercel's build-rate limit and external AWS/Production provisioning. No Production secret delivery is claimed.


## MeBuMIP MAC runtime snapshot validation — 2026-11-24

- The runtime-config client now validates MAC snapshots before applying them: safe revision, exact service identity, exact HTTPS API/browser origins, unique browser origins, recognized secret-access state and only approved MeBuMIP secret IDs with string values.
- Blocked secret delivery cannot contain secret values. Invalid or unexpected snapshots are rejected before process configuration changes.
- Added regression tests for valid snapshots, malformed revisions, unsafe/duplicate origins, unknown secret IDs, invalid values and blocked-delivery behavior.
- Client commit `b89e6d5b4f75bfa91a60ac9d0871be97d00e36df`; tests commit `3ecb381816c443f06044d8ab4063b0a9ba4d305e`; exact-head CI run **45373177245** passed all validations, typecheck, tests and build.
- Live deployment acceptance remains blocked by Vercel deployment access/quota and outstanding AWS/Production provisioning.


## MeBuMIP MAC identity-destination hardening — 2026-11-24

- Closed a credential-forwarding trust-boundary gap: the MeBuMIP API now validates `MAC_RUNTIME_CONFIG_URL` before obtaining/sending its short-lived Vercel OIDC identity. The destination is pinned to the approved MAC HTTPS host and exact internal runtime-config path; alternate hosts, HTTP, ports, credentials, path changes, query strings and fragments are rejected.
- Runtime-config bearer headers reject empty and CR/LF-injected tokens.
- Added regression tests for approved destination acceptance and malicious/malformed destination rejection, plus token-header validation.
- Implementation commit: `64b87a53f7d5c4daa05ad14025841192a5e69b95`; test commit: `bcb7fa406ec665c7c9744cc7c9040325b8dc1bac`.
- Initial CI exposed an over-broad CR/LF character-class check that rejected ordinary token strings; corrected the expression and changed the regression test to inject actual CR/LF bytes. Final exact-head push CI run **45386574943** and PR CI run **45386581584** both passed install, replica-set setup, both OpenAPI validations, route-drift validation, documentation mirror validation, typecheck, tests and build on `178d6af4f474cf75660c7b8704abbc34d99205fe`.
- This is a source-level control-plane security fix. It does not constitute deployed OIDC/MAC acceptance; Vercel deployment checks remain blocked by `build-rate-limit`.


## MeBuMIP workload identity request hardening — 2026-11-24

- Removed the ability for an inbound HTTP request header to supply the OIDC token used by the MeBuMIP API when calling MAC. The API now obtains its workload identity inside the Vercel function through `@vercel/oidc`; caller-controlled request headers are not identity credentials.
- MAC runtime-config requests now explicitly disable caching and reject HTTP redirects, preventing an identity-bearing request from following an unexpected redirect.
- Added a regression test asserting `cache: no-store` and `redirect: error` on MAC runtime-config requests.
- Implementation commits: `1ef37a815762de42ca31d72fa89680277b36de34`, `3b0bddc1865116fdbd03ebc96eca64ea43ea5bb8`; request-policy/test commits: `3ce2a6ec7263a0861e2553edd86fd704c910bb1a`, `cc89ed6fb90646cc8eb0112ba2e416f52067d043`.
- Exact-head push CI run `45388310743` and PR CI run `45388317050` both passed install, Mongo replica-set setup, both OpenAPI validations, route-drift validation, documentation mirror validation, typecheck, tests and build on `cc89ed6fb90646cc8eb0112ba2e416f52067d043`.
- This verifies source and CI only. Live Vercel deployment and Production MAC/OIDC/AWS acceptance remain blocked by Vercel `build-rate-limit` and unprovisioned Production dependencies.
