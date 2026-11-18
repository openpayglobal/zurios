# Deliverable 6A — Core Platform Services

**Branch:** `feature/6a-core-platform-services`  
**Status:** Initial implementation committed; integration verification required.

## Implemented service foundations
1. Tenant provisioning and lifecycle status.
2. Organization hierarchy and location creation.
3. Global user records and tenant-scoped memberships.
4. Opaque refresh-token issuance, rotation and revocation primitives.
5. Tenant-scoped role creation and permission resolution.
6. ABAC policy evaluation with deny-overrides and default-deny.
7. Append-only audit-event writer.
8. Tenant-scoped feature flags.
9. MongoDB index initialization, migration ledger and idempotent seed convention.
10. Initial ABAC automated test.

## Security invariants
- Global identity is separate from tenant membership.
- Tenant-owned records carry `tenantId`.
- Tenant scope must be derived from a verified principal at the API boundary, never trusted from request input.
- Revoking a membership also revokes its active sessions.
- Refresh tokens are high-entropy opaque values; only SHA-256 digests are persisted.
- ABAC explicit denies override allows; absence of a matching allow denies access.
- Missing feature flags are disabled.
- Audit events are append-only through service interfaces; production tamper evidence still requires database and operational controls.

## Not yet production-ready
- Login, MFA, verification, account recovery, rate limits and abuse controls.
- Atomic refresh rotation and replay-family revocation under concurrency; use MongoDB transactions or a single-document conditional rotation design and test races.
- Persisted policy authoring and a richer, reviewed policy expression language.
- Cross-collection referential integrity and comprehensive tenant-isolation integration tests.
- Migration discovery/registration, rollback policy and deployment orchestration.
- Database-level audit writer permissions, cryptographic chaining, retention, export and alerting.
- CI and deployment pass evidence.

## Design system
The web shell has been advanced to a midnight-navy and cyan enterprise dashboard with persistent navigation, modular service cards, governance cues, restrained gradients and responsive layouts. This is the initial shared Zuri OS design language; component tokens and light-theme support are the next UI refinement.
