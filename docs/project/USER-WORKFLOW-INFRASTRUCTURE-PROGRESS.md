# User Workflow and MAC Infrastructure — Progress Register

**Date:** 2026-11-21  
**Branch:** `feat/mac-secrets-user-workflow`  
**Base:** PR #16 head `2087923fd6446e8ae0f2c09b7628101402454fbf`  
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
