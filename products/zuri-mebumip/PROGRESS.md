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
