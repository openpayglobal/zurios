# MAC/MAD platform operator security boundary

**Status:** Phase 1 implementation contract  
**Scope:** Global Zuri OS administration; separate from tenant membership authorization.

## Security invariant

A tenant user, tenant administrator, tenant role, tenant membership, or tenant-scoped access token is never a platform operator. MAC/MAD uses a distinct principal, session namespace, permission catalogue, authentication lifecycle and audit stream. No implicit role inheritance or wildcard permission is permitted.

## Principal contract

`PlatformOperatorPrincipal` carries:
- Stable `operatorId` and `sessionId`.
- Exact `mac.*` permission strings granted to the operator.
- A server-verified `mfaVerifiedAt` timestamp.
- Explicit `tenantIds` for operations that target a tenant.
- Optional, approval-referenced and time-bounded elevation.

The current implementation adds a pure default-deny authorization decision function and tests. It is not yet an authentication/session issuer and must not be wired into routes until the backing operator identity, MFA, session revocation and audit persistence are implemented.

## Required collections

| Collection | Purpose | Minimum controls |
|---|---|---|
| `platform_operators` | Global operator identity and lifecycle | Unique normalized email; active/suspended status; password hash; MFA enrollment state |
| `platform_operator_sessions` | Independent MAC sessions | Hashed refresh token; expiry; revocation; last-used; MFA timestamp |
| `platform_operator_challenges` | Short-lived MFA challenges | One-time consumption; strict TTL; attempt limits |
| `platform_operator_role_grants` | Exact permission grants | Grantor, scope, expiry, approval reference |
| `platform_operator_elevations` | Just-in-time privilege elevation | Exact permissions, reason, approver, start/end, one-time execution binding |
| `admin_audit_events` | Global administrative audit | Append-only; actor, action, resource, outcome, correlation ID, IP hash |

All platform-global records use explicit platform ownership. Do not fabricate `tenantId: "platform"` to satisfy tenant collection contracts. Global and tenant audit streams remain distinct.

## Authorization rules

1. Default deny; exact permission match only.
2. MFA must be verified by the server and remain within the configured freshness window for sensitive actions.
3. Tenant-targeted operations require explicit `tenantIds` scope.
4. Elevation is additive only for its exact permission list and must have an approval reference and future expiry.
5. Deployment, rollback, secret rotation, provider credential changes and global policy changes require step-up MFA and approval policy.
6. Two-person approval is required for production-impacting or security-critical operations.
7. Every decision and mutation is correlated and audited. An audit persistence failure must fail closed for privileged mutations.
8. Tenant APIs never accept a platform principal as a substitute for tenant membership, and MAC APIs never accept a tenant principal.

## Delivery gates before activating MAC routes

- [ ] Separate operator enrollment and recovery with owner-controlled bootstrap.
- [ ] Argon2id password verification and rate limiting.
- [ ] TOTP MFA with replay prevention and one-time recovery codes.
- [ ] Independent signed access tokens and refresh-token rotation.
- [ ] Session listing, revocation and global operator suspension.
- [ ] MongoDB indexes and schema validation for all operator collections.
- [ ] Atomic audit persistence for privileged mutations.
- [ ] OpenAPI 3.1 contracts and negative integration tests.
- [ ] Frontend uses authenticated API only; no provider secret reaches the browser.
- [ ] Security review and explicit owner approval before production activation.

## Current implementation status

Implemented in this phase:
- Separate typed global-operator principal.
- Pure default-deny permission evaluator.
- Exact tenant-scope checks.
- Approval-referenced, expiring elevation checks.
- Unit tests for tenant/global separation, MFA, wildcard denial and elevation expiry.

Not implemented by this phase:
- Operator login, MFA enrollment/verification, session storage/revocation, role-grant management, admin audit persistence, MAC HTTP routes, provider adapters or production deployment.