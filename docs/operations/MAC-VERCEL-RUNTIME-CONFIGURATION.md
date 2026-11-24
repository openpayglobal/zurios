# MAC-to-Vercel Runtime Configuration Operations

**Status:** Non-secret runtime-config source implementation present; Production acceptance pending  
**Date:** 2026-11-20

## Objective

MAC owns runtime configuration. The two canonical Vercel projects consume it at runtime, so ordinary configuration changes do not trigger builds or deployments.

- Frontend: `zurios` — `https://zurios.vercel.app` — project ID `prj_aE6LVAFP1VrF5QmeemFYvCQ7xwoR`
- API: `zurios-api` — `https://zurios-api.vercel.app` — project ID `prj_vkIcPCsN1TW3WOturczl3FcWEJkq`
- Vercel team: `openpayglobal-5300s-projects` — team ID `team_Gn7gvUwfzUbCZpxOIRrYK5gD`
- Repository: `openpayglobal/zurios`

## Important platform boundary

Do not promise live updates by changing Vercel project environment variables. Vercel environment variables are applied to deployments; existing deployments keep their existing environment. Vite `VITE_*` values are build-time substitutions. Neither mechanism provides live mutation of a running deployment.

Use MAC's versioned runtime configuration API for values that must change without redeployment. Keep Vercel project environment variables for deployment/build-time values and automatically provided platform identity only.

## Runtime flow

1. An authorized administrator changes a typed setting in MAC.
2. MAC validates scope, type, allowed values, environment, classification and approval requirements.
3. MAC persists the new immutable revision and its audit/outbox event in one transaction.
4. The running Vercel API obtains its short-lived Vercel OIDC token using the supported `@vercel/oidc` helper (or the request-context OIDC token) and requests only keys allowed to that project and environment.
5. MAC verifies the JWT signature against Vercel's JWKS and validates issuer, audience, expiry, subject, `owner_id`, `project_id` and `environment`. Never trust decoded claims without signature verification.
6. API caches the response for a short bounded period and uses ETag/revision checks to observe changes. Revocation and emergency-disable settings must bypass ordinary stale-cache behavior.
7. Browser clients receive only an explicit public allowlist from a public runtime-config endpoint. No secret is returned to the browser.

## Vercel OIDC trust contract

The observed Vercel team slug and project IDs above are the authoritative resource identifiers for this deployment inventory. Vercel documents team issuer mode as `https://oidc.vercel.com/{TEAM_SLUG}`, the default audience as `https://vercel.com/{TEAM_SLUG}`, and the subject pattern as `owner:{TEAM_SLUG}:project:{PROJECT_NAME}:environment:{ENVIRONMENT}`. Tokens also carry `owner_id`, `project_id` and `environment` claims.

For this team, the candidate team issuer/audience are:

- Issuer: `https://oidc.vercel.com/openpayglobal-5300s-projects`
- Audience: `https://vercel.com/openpayglobal-5300s-projects`

Before enabling trust, inspect Vercel project Security settings to confirm team issuer mode, then capture a real token from each intended project/environment and validate the exact claims. Use project IDs (not only mutable project names) and team ID in the policy. Production and Preview must be distinct trust policies. If custom audiences are configured, use a MAC-specific audience and verify it exactly.

Implementation reference: `@vercel/oidc` provides `getVercelOidcToken()` for the workload and `verifyVercelOidcToken()` for server-side verification against Vercel's remote JWKS, with expected owner/project/environment options. Pin and review the package version before use.

## Environment classes

| Class | Examples | Source |
|---|---|---|
| Public runtime | public display settings, support URLs, feature availability | MAC public projection |
| Private runtime | internal feature switches and operational thresholds | MAC authenticated API |
| Secret runtime | provider credentials, signing material | MAC encrypted secret store, backend only |
| Build/deployment | Vite build settings, root directory, build command | Vercel project settings |

## Security requirements

- Separate production and preview namespaces; never promote preview values automatically.
- Do not expose MongoDB URIs, JWT/MFA keys, OAuth client secrets or provider credentials to Vite.
- Use a dedicated encryption keyring for MAC-managed secret values, with key IDs, rotation and recovery procedures.
- Restrict OIDC audience and subject to the exact Vercel team, project and environment. Do not accept an unverified or merely decoded JWT.
- Do not log credentials, authorization headers, query strings containing credentials or decrypted config.
- Audit reads of secrets and all mutations; require least privilege, MFA step-up, change reason and idempotency.
- Fail closed on invalid identity or unauthorized key access.
- Cache only for a bounded interval and define outage behavior explicitly.

## Deployment inventory checkpoint (2026-11-20)

- `zurios` frontend project exists and has a READY deployment; its Vercel environment-variable inventory returned no configured variables.
- `zurios-api` exists. Its observed variables are preview/branch-scoped, not a confirmed production configuration. The MongoDB URI entry returned an empty value; this must be treated as unusable. Do not expose or copy any stored values.
- No confirmed production database, JWT/MFA keyring or provider secret set is available in the observed inventory.
- The latest observed API deployment was CANCELED; prior API deployments include ERROR states. A READY frontend deployment does not establish full application readiness.
- The connected Vercel team is on the Hobby plan and prior deployment attempts were rejected by the account build-rate limit.

## Implementation sequence

1. Merge/reconcile the current security foundation only after exact-head CI and code review.
2. Implement typed, versioned MAC runtime configuration records and immutable history.
3. Implement encrypted secret storage, key rotation and access policies.
4. Implement Vercel OIDC verification using real token fixtures; bind trust to team/project/environment.
5. Implement backend runtime fetch client with ETag, bounded cache, timeout, retry and revocation behavior.
6. Implement a public-only configuration projection for the web application.
7. Add MAC UI for configuration, approvals, history, rollback and audit evidence.
8. Add unit, API, MongoDB replica-set, security and end-to-end tests.
9. Configure Vercel build/deployment variables separately; never copy MAC secrets into browser or deployment variables.
10. Validate both Vercel projects, health/readiness, domain aliases and production smoke tests.

## Rollback

Roll back by creating a new MAC configuration revision from a previously approved revision. Do not rewrite history. Emergency revocation must invalidate cached credentials/configuration. Application code rollback is a separate deployment operation.

## Current blockers

- No verified production configuration or usable production database credential.
- Vercel OIDC issuer mode and real token claims have not yet been verified in either project.
- The non-secret MAC runtime configuration API and administration UI are implemented in source; the encrypted secret lifecycle API/UI remains pending a dedicated encryption KMS/HSM.
- Vercel API production deployment and health checks are not accepted.
- Production rollout requires owner approval for secret/key provisioning and security review.

## Official implementation references

- [Vercel OIDC federation](https://vercel.com/docs/oidc)
- [Vercel OIDC token reference](https://vercel.com/docs/oidc/reference)
- [Connect to your own API with OIDC](https://vercel.com/docs/oidc/api)
- [`@vercel/oidc` token verification](https://github.com/vercel/vercel/blob/main/packages/oidc/docs/functions/verifyVercelOidcToken.md)


## Implementation checkpoint — 2026-11-24

The source now includes the MAC public runtime projection, an OIDC-authenticated internal runtime endpoint, and a MeBuMIP API client that obtains Vercel OIDC identity and refreshes its MAC settings without a deployment. The internal endpoint now fails closed with HTTP 503 until MongoDB initialization has completed.

The Zuri OS API Vercel project has been configured with a Trusted Sources rule that permits the MeBuMIP API Production project to reach only the Zuri OS API Production environment. SSO protection remains enabled. This rule is provider-configured but still requires an actual deployed request to prove the end-to-end path.

The user-session KMS signer is now wired in source for Production: `@vercel/kms` signs access JWTs using issuer `16d2fb82-30b7-4a0d-8c4e-49fb1de92919`; JOSE verifies against the issuer JWKS with strict RS256, issuer and audience checks. Local/Preview remains on HS256. Exact-head CI passed on `e2bcfc52e2d500c8fea91b1315af6672b65c4970` (run `45332099570`).

**Not yet accepted:** live Production signing, live cross-project MAC fetch, API health/readiness, audit KMS signing, encryption KMS/HSM, production Atlas, provider connections, and full public end-user release. Existing Vercel build-rate limits still prevent the required fresh deployment. Configuration changes made in MAC do not require redeployment; source-code and environment-bootstrap changes still do.


### Audit KMS signing source integration — 2026-11-24

The shared audit writer and API audit writer now sign Production audit events with the dedicated Vercel KMS RS256 issuer. The event payload is canonicalized; integrity metadata records issuer, key ID, public-key fingerprint and signature. A JWKS verifier checks the signature and key fingerprint, and Production writes fail closed on signer errors. Exact-head CI run **45337383228** passed on commit **7793244a4612f62b60f4058e9e6348f322d7f6aa**. Live Production signing/verification and key-rotation retention remain unaccepted pending a successful deployment.


### MAC private-settings response hardening — 2026-11-24

The administrative runtime-config endpoint now strips the legacy `privateSettings` field from its response through a dedicated safe projection and regression test. New runtime-config history records no longer copy the legacy private field. Existing database values are retained (not deleted) pending a controlled migration, but are not returned by the admin, public or workload runtime endpoints. This is not yet a secret manager: no encrypted secret CRUD or delivery is enabled until the separate encryption KMS/HSM provider and workload-specific authorization are configured.
