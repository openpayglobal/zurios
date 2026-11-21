# MAC-to-Vercel Runtime Configuration Operations

**Status:** Proposed; implementation and production acceptance pending  
**Date:** 2026-11-20

## Objective

MAC owns runtime configuration. The two canonical Vercel projects consume it at runtime, so ordinary configuration changes do not trigger builds or deployments.

- Frontend: `zurios` — `https://zurios.vercel.app`
- API: `zurios-api` — `https://zurios-api.vercel.app`
- Repository: `openpayglobal/zurios`

## Important platform boundary

Do not promise live updates by changing Vercel project environment variables. Vercel environment variables are applied to deployments; existing deployments keep their existing environment. Vite `VITE_*` values are build-time substitutions. Neither mechanism provides live mutation of a running deployment.

Use MAC's versioned runtime configuration API for values that must change without redeployment. Keep Vercel project environment variables for deployment/build-time values and automatically provided platform identity only.

## Runtime flow

1. An authorized administrator changes a typed setting in MAC.
2. MAC validates scope, type, allowed values, environment, classification and approval requirements.
3. MAC persists the new immutable revision and its audit/outbox event in one transaction.
4. The running Vercel API authenticates with its Vercel-issued OIDC workload identity and requests only the keys allowed to that project and environment.
5. MAC verifies the JWT signature, issuer, audience, expiry and exact project/team/environment claims before returning configuration.
6. API caches the response for a short bounded period and uses ETag/revision checks to observe changes. Revocation and emergency-disable settings must bypass ordinary stale-cache behavior.
7. Browser clients receive only an explicit public allowlist from a public runtime-config endpoint. No secret is returned to the browser.

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
4. Implement Vercel OIDC verification using a real token fixture; bind trust to team/project/environment.
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
- OIDC claim contract not yet validated with a real Vercel runtime token.
- MAC runtime configuration API and user interface are not yet implemented.
- Vercel API production deployment and health checks are not accepted.
- Production rollout requires owner approval for secret/key provisioning and security review.
