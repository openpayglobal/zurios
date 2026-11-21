# ADR-006: MAC-Controlled Runtime Configuration for Vercel

**Status:** Proposed for implementation  
**Owner:** Zuri OS platform engineering  
**Date:** 2026-11-20  
**Decision scope:** Zuri OS MAC, API, web runtime and the canonical Vercel projects

## Context

Zuri OS requires the Master Admin Console (MAC) to be the authoritative control plane for configuration. Vercel hosts the web and API workloads. Configuration changes made by authorized administrators must take effect without rebuilding or redeploying those workloads.

Vercel project environment variables are deployment inputs. Updating a project environment variable does not mutate the environment of an already-running deployment. Build-time variables (including Vite `VITE_*`) are compiled into browser assets and cannot be changed in place. Therefore, treating Vercel environment variables as a live configuration database cannot satisfy the no-redeployment requirement.

## Decision

1. MAC is the source of truth for versioned runtime configuration. Configuration is stored with scope, classification, schema version, monotonically increasing revision, actor, timestamps and audit evidence.
2. Vercel deployments consume runtime configuration over authenticated HTTPS. They do not receive configuration by copying MAC values into Vercel's deployment environment.
3. Vercel OIDC is the preferred workload identity. The API validates token signature, issuer, audience, expiry and exact project/team/environment claims. No long-lived MAC service token is embedded in Vercel environment variables. The exact claim contract must be verified against a real Vercel-issued token before enabling the trust policy.
4. The API is the only consumer allowed to retrieve secret values. Browser clients receive a strictly allowlisted public projection; secret and internal configuration keys are never serialized to the browser.
5. Runtime configuration responses are versioned and support ETag/If-None-Match. Workloads cache only for a bounded, documented interval; a revision change invalidates the cache. A stale cache must never bypass an authorization or emergency-disable decision.
6. Every read of secret configuration and every configuration mutation is attributable and audited. Writes require MAC platform permissions, MFA step-up for sensitive operations, reason, idempotency and transactional audit/outbox writes.
7. Configuration changes are validated against typed schemas and environment policy before persistence. Unknown keys, arbitrary code, arbitrary URLs, and client-selected secret scopes are rejected.
8. Rollback creates a new revision from a prior approved version; history is append-only. Secret values are encrypted at rest using a dedicated keyring and are never included in logs, audit metadata, API errors or change diffs.

## Configuration classes

| Class | Examples | Delivery |
|---|---|---|
| Public runtime | public API origin, support links, enabled public features | MAC public projection to browser at runtime |
| Private runtime | provider toggles, internal service endpoints, operational thresholds | Authenticated API runtime fetch |
| Secret runtime | provider credentials, signing material, integration secrets | Authenticated backend-only fetch; envelope encryption; least privilege |
| Deployment/build | Vite build settings, build commands, framework/root directory | Vercel project configuration; change may require a new deployment |

Never store database credentials, JWT signing keys, MFA encryption keys or provider secrets in browser-visible configuration or Edge Config.

## Security and availability

- Bind workload identity to the exact Vercel team, project, deployment environment and approved service audience.
- Fail closed for missing, malformed, expired or untrusted workload identity.
- Separate preview and production configuration namespaces; preview cannot read production values.
- Enforce tenant/platform scope and per-key access policy on every request.
- Return only requested keys the workload is authorized to read; redact values from observability.
- Use bounded caching, revision checks, request timeouts and circuit breakers. On a control-plane outage, retain only the last known-good non-secret configuration for a short bounded grace period. Secret refresh failure must not silently fall back to expired or revoked credentials.
- Support immediate key revocation and revision invalidation.
- Keep a break-glass procedure requiring independent authorization and audit.

## Consequences

- Authorized runtime changes can take effect without redeployment.
- Vercel environment variables remain appropriate for immutable deployment/build settings and platform-provided identity, not as the live source of truth.
- MAC/API implementation, OIDC claim verification, encrypted secret storage, runtime client/cache, public configuration projection, audit trails and tests are required before production activation.
- No production secret migration or Vercel environment mutation is authorized by this ADR.

## Acceptance criteria

1. A MAC administrator can create, validate, approve, update and roll back versioned configuration.
2. A running Vercel API deployment observes a non-secret configuration revision change without redeployment.
3. A running API deployment retrieves an authorized secret without exposing it to the browser, logs or audit metadata.
4. A Vercel deployment from another project, team or environment is denied.
5. Preview workloads cannot read production configuration.
6. Invalid OIDC claims, revoked keys, stale revisions, unauthorized keys and malformed values are rejected.
7. Public configuration contains only schema-approved non-secret fields.
8. Integration tests prove audit atomicity, ETag behavior, bounded cache refresh, revocation and tenant isolation.
9. Vercel project environment variables are not populated with copied MAC secrets.
10. Production acceptance requires a verified real Vercel OIDC token claim fixture and owner-approved security review.
