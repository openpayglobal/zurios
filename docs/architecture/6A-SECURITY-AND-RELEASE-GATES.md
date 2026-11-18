# Zuri OS — 6A Security and Release Gates

## Non-negotiable invariants

1. One global user identity; tenant membership remains separate and scoped.
2. Tenant context is derived from verified server-side identity, never client-supplied tenant identifiers.
3. Tenant-owned reads, writes, exports, search, events and jobs must be tenant-filtered.
4. RBAC and ABAC are enforced server-side; UI visibility is not authorization.
5. Empty organization/location scope grants no resource access.
6. Wildcard permissions are not accepted or interpreted as universal authority.
7. Suspended tenants, users, memberships and revoked sessions cannot authorize requests.
8. Privileged actions record actor, reason, target, outcome and correlation evidence.
9. Audit is append-only through application services; production also requires database-level insert-only credentials and integrity verification.
10. Business ecosystems consume shared identity, tenancy, authorization, audit and configuration services.

## Release gates

### Gate A — Correctness
- Typecheck, build and unit tests pass.
- MongoDB replica-set integration tests pass without skipped required tests.
- Migration and seed behavior is repeatable and recoverable.

### Gate B — Identity and authorization
- Invitation, verification, login, MFA, recovery, refresh, logout and revocation journeys pass.
- All platform endpoints reject unauthenticated, suspended, expired and revoked principals.
- Cross-tenant, cross-organization and cross-location negative tests pass.
- Privilege escalation and separation-of-duties cases are tested.

### Gate C — Data and audit
- Database least-privilege roles enforce tenant data boundaries where supported.
- Audit writes are separated from application mutation credentials.
- Audit retention, integrity, export, access logging and alerting are configured.
- Secrets and sensitive personal data are excluded from logs and API responses.

### Gate D — Operations
- Secret rotation, backup, restore and point-in-time recovery are demonstrated.
- Runbooks cover failed migrations, database outage, token compromise and incident response.
- Health checks, metrics, tracing, alert routing and capacity limits are tested.

### Gate E — Independent acceptance
- Threat model completed and reviewed.
- Dependency, secret and static analysis checks clean or risk accepted.
- Penetration test completed; critical/high issues fixed or formally accepted.
- Platform owner signs the 6A.6 acceptance decision.

ERP, POS and Inventory remain blocked until all gates are evidenced and 6A.6 is formally accepted.
