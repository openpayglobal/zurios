# User Workflow and MAC Infrastructure — Progress Register

**Date:** 2026-11-21  
**Branch:** `feat/mac-secrets-user-workflow-v2`  
**Base:** `integration/pr13-pr14-security-reconciliation` (PR #18)  
**Status:** Workflow gap diagnosed; customer onboarding API/UI started; control-plane workload identity provisioned; Meta and infrastructure secret activation remain blocked.

## Confirmed user workflow decisions

Recovered from prior project discussions:

- The owner is Blockchain Innovations LTD.
- Zuri MeBuMIP is standalone and integrates with Zuri OS.
- MAC and MAD are separate, mandatory administration surfaces.
- All five approved objectives A–E remain in scope.
- A: Facebook Pages and Instagram management — Phase 2.
- B: Facebook/Instagram advertising — Phase 3.
- C: WhatsApp Business Platform/API — Phase 4.
- D: multi-business Meta management — Phase 5.
- E: external software/Zuri OS integrations — Phase 6.
- The previously discussed end-user journey was proposed workflow scope, while A–E, phases, standalone-plus-integration architecture and MAC/MAD were explicitly approved. This register turns that workflow into an implementation/acceptance plan without claiming the detailed screens were already approved or implemented.

## Why the workflow is not visible/active

1. PR #15's integration candidate contains identity-first login, MFA, workspace selection/switching, and public access request intake/review, but the candidate is not the production deployment.
2. Public access requests default to disabled in `apps/api/src/config.ts`; they also require an approved HTTPS privacy notice URL before production activation.
3. The current `apps/mebumip-web/src/App.tsx` is a MAC/MAD administration shell, not a customer workspace portal. Meta connection and API integration areas are placeholder screens.
4. `apps/mebumip-api/src/admin.ts` exposes a read-only MAC settings endpoint and explicitly says runtime settings are managed outside the deployment secret manager.
5. There is no complete customer onboarding/business profile API or real Meta OAuth/Embedded Signup connection lifecycle in the current MeBuMIP API.
6. The Vercel deployment checks have been blocked by the team's free daily deployment limit; therefore, repository changes cannot appear on the live domains until a deployment succeeds.

## Work completed in this increment

9. Added tenant-scoped `GET /v1/workspace/onboarding`, audited/transactional business-profile update and a fail-closed Meta connect endpoint.
10. Added `tenantOnboarding` unique index.
11. Added `apps/mebumip-web/src/CustomerWorkspace.tsx` and a Customer workspace navigation entry.
12. Added customer team listing and MFA-step-up-protected invitation UI using existing tenant member routes.
13. Added corresponding MeBuMIP OpenAPI paths.
14. Profile updates and audit append share one MongoDB transaction; connection response projection is allowlisted to avoid exposing provider token fields.

1. Created `feat/mac-secrets-user-workflow` from PR #16's latest head.
2. Added `docs/ux/MEBUMIP-END-USER-WORKFLOW.md` with the complete proposed customer journey, required app surfaces, phase mapping and activation acceptance.
3. Added `docs/operations/MAC-INFRASTRUCTURE-AND-SECRETS-MANAGEMENT.md` with lifecycle and external provisioning boundaries.
4. Created Vercel KMS issuer `5653e1ff-fd71-4a0d-8720-380cdfcaf2c4`, named `Zuri OS MAC Runtime Workload Identity`.
5. KMS generated and activated an RS256 signing key. The project grant is restricted to API project `prj_vkIcPCsN1TW3WOturczl3FcWEJkq`, team `team_Gn7gvUwfzUbCZpxOIRrYK5gD`, Production environment only.
6. Issuer claims are constrained to `service=zurios-api` and `config_scope=runtime:read`.
7. Verified the team previously had zero KMS issuers and zero Edge Config stores.
8. Did not request, decrypt, expose or copy any Vercel environment variable or provider secret.

## Important distinction about generated keys

The Vercel KMS issuer key is a workload-identity signing key for Vercel-to-MAC authentication. It is not the application's user-session JWT keyring, MFA encryption keyring or audit-signing keyring.

Vercel KMS `signJWT` can mint short-lived service tokens from the API deployment's OIDC token. It does not provide general symmetric encrypt/decrypt for stored MFA/provider secrets. MAC needs an approved encryption KMS/HSM before it can safely store arbitrary secret values encrypted at rest.

## Infrastructure inventory and blockers

| Resource | Current state | Next action |
|---|---|---|
| Vercel workload identity | KMS issuer/key created, production API project grant only | Implement `@vercel/oidc` + `@vercel/kms` runtime signer and MAC verifier |
| Application JWT signing keyring | Existing app uses environment-based HS256 | Migrate compatibly to managed signing and versioned key IDs |
| MFA encryption keyring | Existing environment-based keyring support; no MAC-managed lifecycle | Add encryption KMS/HSM and key rotation/re-encryption |
| Audit signing keyring | Existing env-based HMAC keyring and signed audit archive | Integrate key custody/rotation without invalidating historical audit signatures |
| MongoDB production connection | No usable production replica-set URI confirmed | Provider-authorized cluster provisioning, topology validation, secure registration |
| API origins | Existing Vercel domains known; no MAC-owned verified-origin registry | Discover/verify domains and create exact HTTPS allowlist |
| Live provider credentials | No verified live Meta app/portfolio credentials | Provider OAuth/consent and Meta prerequisites; encrypted server-side storage |
| Customer onboarding | Not implemented in MeBuMIP web/API | Build tenant-scoped onboarding API/UI |
| Meta OAuth/asset setup | Placeholder only | Implement OAuth, scope validation, asset inventory and revoke lifecycle when credentials exist |

## Next implementation sequence

1. Add MAC infrastructure inventory and configuration API, with platform-owner authorization, recent MFA step-up, idempotency, audit and secret redaction.
2. Integrate the Vercel KMS issuer from the API runtime and validate tokens in MAC against the issuer's JWKS, exact project/team/environment and claims.
3. Implement encrypted secret storage only after an encryption KMS/HSM is available; do not treat KMS JWT signing as encryption.
4. Add MAC keyring lifecycle UI: generate, stage, approve, activate, rotate, retire, revoke and verify.
5. Add MongoDB provider provisioning connector only after provider credentials/authorization are available; otherwise securely register and validate a provider-issued URI.
6. Add verified API-origin inventory and exact CORS allowlist.
7. Continue customer onboarding/business profile API and UI; expose access request workflow only with approved privacy notice.
8. Complete team membership role management, invitation revocation/resend and user-facing invitation acceptance journey in the customer workspace.
9. Add real Meta OAuth/Embedded Signup and asset selection behind verified Meta app prerequisites.
10. Run exact-head CI, integration/security tests and deployment smoke tests.

## Release status

- No production environment variables were changed.
- No live provider credential was created or fabricated.
- No production database was provisioned.
- No deployment was created or promoted.
- The KMS workload identity resource is created but not yet consumed by application code.
- PR #16 remains a draft architecture checkpoint; this branch is the next implementation increment.


## Central Zuri OS MAC inventory surface — 2026-11-21

- Added `GET /platform/admin/infrastructure` to the Zuri OS API. It is guarded by the existing platform permission gate and returns only non-secret metadata.
- Added the MAC navigation item and Infrastructure & Secrets screen in `apps/web/src/App.tsx`.
- The screen displays Vercel KMS issuer/key IDs, database topology checks, existing environment bootstrap state, API origin inventory and provider readiness. It never returns database URIs, JWT secrets, private keys or provider credentials.
- Added the route to the Zuri OS OpenAPI contract.
- The same inventory is mirrored as a read-only MeBuMIP infrastructure view; the central Zuri OS MAC is the governance authority.

## KMS issuer inventory

Three active RS256 KMS issuers have been created for the `zurios-api` Production project only:

| Purpose | Issuer ID | Active key ID |
|---|---|---|
| MAC runtime workload identity | `5653e1ff-fd71-4a0d-8720-380cdfcaf2c4` | `75899278-1e19-4444-bec0-141dc4d17eb0` |
| User session JWT signing | `16d2fb82-30b7-4a0d-8c4e-49fb1de92919` | `2900b63b-5eed-4689-8726-b05a4618967f` |
| Audit event signing | `55210f93-c052-45a5-aeb8-e083ed0d5dce` | `da6060ee-9fda-4389-a652-281c256be6d2` |

Vercel KMS keeps the private signing keys. The user-session issuer is ready for a compatible RS256 migration; the audit issuer can sign event digests with the KMS message-signing API. Neither has been wired into application runtime yet, so the MAC correctly reports them as provisioned/pending integration.

## MongoDB Atlas provisioning dependency

A MongoDB Atlas connector is available but not yet connected. Once the owner connects the Atlas account, the cluster, database user, network allowlist and replica-set topology can be provisioned and validated against the Zuri OS requirements. Until then, no production MongoDB URI can be safely fabricated or activated.



## Invitation registration gap fixed — 2026-11-21

The first customer invitation UI exposed a missing backend capability: the existing tenant invitation acceptance route only accepted already-authenticated users, and the API had no customer registration route. Added `POST /v1/auth/register`:

- Requires the single-use invitation token, matching invited email, display name and 12+ character password.
- Creates the user and tenant membership, consumes the invitation, marks email verified by possession of the emailed one-time token, and appends the audit event in one MongoDB transaction.
- Rejects expired/revoked/used invitations, invalid roles, inactive tenants and duplicate accounts.
- Existing users continue through sign-in followed by `POST /v1/tenant-invitations/accept`.
- Added the registration contract to MeBuMIP OpenAPI.

This closes the invitation-to-customer-account entry path. Password recovery and MFA enrollment remain in the existing auth surface; mandatory MFA enforcement for privileged tenant roles remains a separate acceptance gate.


## MeBuMIP Vercel deployment foundation provisioned — 2026-11-21

Created two additional Vercel projects under the existing team and linked them to `openpayglobal/zurios`:

| Project | Project ID | Root | Runtime | Verified project domain |
|---|---|---|---|---|
| `zuri-mebumip` | `prj_ywOZfmePHpz6Gdjm7BBSAdjLDEU2` | `apps/mebumip-web` | Vite / Node 22 | `https://zuri-mebumip-openpayglobal-5300s-projects.vercel.app` |
| `zuri-mebumip-api` | `prj_7Ud5L31qXeLoFeguYm75Gje3sZDJ` | `apps/mebumip-api` | Fastify / Node 22 | `https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app` |

Both projects use the monorepo root dependencies (`sourceFilesOutsideRootDirectory=true`) and preview-only SSO protection, so production deployments are intended to be publicly reachable while preview deployments remain protected. The API project has team OIDC token generation enabled.

The MeBuMIP frontend API fallback now points to the verified API project domain. Production CORS defaults to the verified frontend project domain; development retains localhost. The MeBuMIP API project has a separate KMS workload-identity issuer, scoped to its Production environment only:

- Issuer: `501ff21c-7c24-4e9e-b23e-789256cd6edd`
- Active key: `5d401897-e851-438f-a56c-b28453aff756`
- Project grant: `prj_7Ud5L31qXeLoFeguYm75Gje3sZDJ`
- Claims: `service=zuri-mebumip-api`, `config_scope=runtime:read`

No deployments have been created; both projects have no latest deployment and are not live. Production deployment remains blocked until a MongoDB replica-set URI, MFA encryption key, audit key migration, and Resend delivery credentials are available. The Atlas connector is suggested but still requires owner connection.


## Public activation / Vercel access checkpoint — 2026-11-21

- Corrected the Zuri OS frontend API fallback from the nonexistent `zurios-api.vercel.app` to the Vercel project domain `https://zurios-api-openpayglobal-5300s-projects.vercel.app`.
- Corrected MeBuMIP frontend API fallbacks to the verified project domain `https://zuri-mebumip-api-openpayglobal-5300s-projects.vercel.app`.
- Added production CORS defaults for the verified Zuri OS and MeBuMIP frontend project domains while retaining localhost only in development.
- Confirmed the existing Zuri OS projects still have SSO protection set to `all_except_custom_domains`. Their Vercel default domains are therefore protected from public end users. The frontend's latest deployment is READY but has no production target; the API's latest deployment is ERROR and has no production target.
- The new MeBuMIP projects are configured for preview-only SSO, but neither has a deployment yet.
- No public production access policy was changed. Making the existing Zuri OS default production URLs public requires changing SSO protection to preview-only, or assigning a verified custom domain. This is held for owner approval.


## Live MAC runtime configuration implemented — 2026-11-21

The central Zuri OS API now has a versioned MongoDB-backed runtime configuration store and the MAC has controls for approved origins and public settings:

- `GET /platform/admin/runtime-config` and `PUT /platform/admin/runtime-config` provide permission-gated read/update operations, idempotency, immutable history and audit evidence.
- `GET /platform/public/runtime-config` returns only the public projection and supports ETag/304 responses.
- `GET /platform/internal/runtime-config` validates Vercel team OIDC issuer, audience, owner, project ID, exact project subject and Production environment before returning service-scoped configuration.
- Fastify CORS now reads the approved browser-origin list from MAC's runtime registry, with a five-second cache and deployment bootstrap fallback.
- Public access-request feature flag and privacy notice URL are now read from MAC runtime settings, so authorized changes do not require redeployment.
- MAC UI can edit the two approved API origins, the verified browser-origin allowlist, privacy notice URL and access-request flag. Custom domains are rejected until Vercel ownership verification is added to the verified-domain registry.
- Unit tests cover exact HTTPS origin validation, rejection of unverified domains, de-duplication and safe defaults.

The internal endpoint intentionally returns no secret values yet. MongoDB bootstrap URI, MFA encryption, provider credentials and other secrets remain blocked until an encryption KMS/HSM and secure bootstrap path are available. The live non-secret runtime-config and origin updates are implemented; the full secret-fetch lifecycle is not yet complete.


## Runtime configuration consumers connected — 2026-11-21

- Zuri OS web now bootstraps from its stable API URL, then resolves the current Zuri OS API origin from the public MAC runtime-config endpoint and refreshes the pointer on a bounded 30-second cache. A MAC API-origin update is picked up without rebuilding the Vite bundle.
- MeBuMIP web now resolves its API origin from the same public MAC runtime-config endpoint; its previous direct localhost fallback has been removed from application request paths.
- MeBuMIP API now obtains a short-lived Vercel OIDC token using `@vercel/oidc`, fetches the project-scoped internal MAC runtime configuration, and refreshes its CORS origin cache without redeployment. If MAC is temporarily unavailable, it retains the last known-good list and uses the bootstrap origin list.
- Central MAC verifies the OIDC signature using Vercel's team JWKS and enforces exact owner ID, project ID, subject and Production environment. The MeBuMIP API project has team OIDC enabled.

Live token verification and end-to-end runtime fetch remain pending because the central Zuri OS API's Vercel SSO protection currently intercepts its default domain. A public production endpoint or verified custom domain is required before the MeBuMIP API can reach the internal runtime-config endpoint.


## Previously agreed Zuri OS user journey — verification

The original user journey is present in the current integration source and is now explicitly tracked:

| Step | Expected behavior | Source status |
|---|---|---|
| Sign in to Zuri OS | Global email/password identity | Implemented |
| MFA | Complete MFA before workspace disclosure when enabled | Implemented |
| Resolve memberships | Return only active, valid memberships for the identity | Implemented |
| Choose workspace | Show only authorized workspaces when multiple memberships exist | Implemented |
| Establish session | Bind session to user, tenant and membership | Implemented |
| Switch workspace | Switch only to another authorized membership without duplicate identity | Implemented |
| No active membership | Offer “Request Zuri OS access” separately from workspace joining | Implemented; public toggle currently off pending privacy notice |
| Access request review | MAC privileged reviewer approves/rejects; request alone never creates membership or grants access | Implemented |
| Join an existing workspace | Requires authorized administrator invitation/assignment | Implemented |
| Revalidate access | Protected requests re-check session, membership and tenant status | Implemented |

The UI already contains the “Choose your workspace” screen, workspace switcher and “Request Zuri OS access” flow. The reason this was not visible in the live product is deployment/access state, not absence of the workflow in source: PR #15 remains the integration base, PR #18 is still a draft implementation PR, the existing Zuri OS Vercel projects have no production deployment target, their default domains are SSO-protected, and public access requests remain disabled until an approved HTTPS privacy notice is saved in MAC.

This is separate from MeBuMIP's customer workspace workflow, which is also implemented in PR #18 but not yet deployed.


### Access-request visibility correction

The sign-in screen and the no-membership workspace chooser now always display the “Request Zuri OS access” entry. It is enabled only when MAC has a published HTTPS privacy notice and the administrator turns on the runtime access-request flag. When disabled, the UI explains the exact prerequisite instead of silently hiding the workflow.


## Demo identities and sign-in auto-fill — 2026-11-21

Implemented in PR #18 source:

- Added `apps/api/scripts/seed-demo-accounts.ts` and `pnpm --filter @zuri/api demo:seed`.
- The seeder requires an explicit enable flag, a dedicated `zuri_demo*` database name, a MongoDB URI and a 16+ character demo password. It refuses production execution and refuses to modify identities/tenants not created by the demo seeder.
- Added three synthetic scenarios: standard member (one workspace), multi-workspace member (two workspaces) and active identity with no membership.
- Seeded users are created through the existing single-use invitation acceptance/password-hashing path. Re-running rotates the demo password hash and revokes existing sessions; the no-membership identity is reconciled to zero active memberships.
- No platform-operator grants, privileged wildcard roles, MFA bypasses, real provider connections or production identities are created.
- Added a sign-in demo selector. It only fills the email/password fields; it does not submit the form or bypass the ordinary login, MFA, rate-limit or membership checks.
- Auto-fill is hidden unless explicitly enabled for local development or a Vercel Preview build. It additionally requires a preview-only `VITE_DEMO_PASSWORD` of at least 16 characters and `VITE_VERCEL_ENV=preview` for Vercel Preview. Do not configure any demo variables in Production.
- Added `docs/operations/ZURI-OS-DEMO-ACCOUNTS.md` with setup, isolation, rotation and acceptance guidance.

**Verification status — passed:** exact-head GitHub Actions run `44919771589` passed typecheck, tests and build. The new MongoDB replica-set integration test executes the seeder twice against an isolated ephemeral `zuri_demo_test_*` database, verifies all three password hashes and membership counts, and exercises standard-member, multi-workspace and no-membership login results. The test drops its database afterward. No persistent demo database was provisioned and no credentials were created for a live Preview deployment.
