# Zuri OS — Deliverable 6A.1
## Core Platform Services: completion, verification and acceptance

**Parent programme:** Deliverable 6A — Core Platform Services  
**Implementation branch:** `feature/6a-core-platform-services`  
**Status:** Hardening changes submitted for CI; not accepted as production-ready until all gates below have evidence.

## Objective
Complete the shared platform services before authentication expansion, platform API integration, governance dashboards, design-system rollout, or business ecosystems. ERP, POS and Inventory must consume these services; they must not introduce their own tenant, identity, authorization or audit authorities.

## Architectural invariants
1. Global users are platform identities. Tenant memberships are separate, tenant-scoped records.
2. Every tenant-owned document and tenant-scoped query carries tenant scope derived from a verified server-side principal.
3. Organization and location relationships resolve inside the same tenant.
4. Roles and policies are tenant-scoped. No implicit wildcard role or default allow exists.
5. Sessions are bound to an active user, active tenant and active membership.
6. Refresh tokens are opaque high-entropy values; only digests are stored. Rotation is atomic compare-and-swap. Random invalid tokens must not revoke sessions; proven reuse of a consumed token revokes its family.
7. Membership revocation and user/tenant suspension must prevent future session use. Revocation propagation must be tested.
8. ABAC is deny-overrides and default-deny. The current evaluator supports equality predicates only; unsupported operators must never be interpreted as allow.
9. Audit metadata is redacted for common credential/secret fields. Application-level append-only behavior is not database-enforced immutability.
10. Missing feature flags are disabled. Feature evaluation includes tenant and environment scope.
11. Migrations are ordered and recorded. Failed/interrupted migrations require explicit recovery; partial work is never silently rerun.
12. No business module is approved until the platform acceptance gate is signed off.

## Service acceptance matrix
| Service | Required acceptance evidence |
|---|---|
| Tenant management | Provision, activate, suspend, close; invalid transitions and duplicate slugs rejected |
| Organization management | Parent belongs to same tenant and is active; unique tenant code; hierarchy path correctness |
| Location management | Organization and parent location belong to same tenant; unique organization/location code |
| User management | Global email uniqueness and normalization; status lifecycle; suspended/locked users cannot establish sessions |
| Membership management | Active user and tenant required; org/location/role references tenant-valid; one active membership per tenant/user; revocation invalidates sessions |
| Session management | Secure token entropy; digest-only storage; expiry; atomic rotation; invalid-token behavior; replay-family revocation; logout/revocation |
| RBAC | Tenant-scoped roles; inactive roles ignored; deterministic permission union; no wildcard by default |
| ABAC | Equality-only predicates; deny-overrides; default-deny; conditions require matching environment; malformed/unsupported policy rejected |
| Audit | Actor required; sensitive metadata redacted; immutable write interface; actor/correlation traceability |
| Feature flags | Tenant-scoped key; absent flag disabled; environment/rule behavior deterministic |
| MongoDB indexes | Global user uniqueness; tenant-scoped uniqueness for tenant records; TTL only for expirable sessions; index migration verified |
| Migrations | Ordered IDs; duplicate rejection; concurrent-run protection; failed state and documented recovery |
| Seeds | Idempotent; demo-only; no wildcard privileged role; safe for repeated execution |
| API tenant scope | Tenant principal comes from verified authentication; body/query tenant IDs cannot override it |
| Integration tests | Two-tenant fixtures prove cross-tenant reads/writes, references, roles, sessions and audit isolation are denied |

## Required test suites
- Unit tests for schema validation, state transitions, permission resolution, ABAC decisions, token hashing/rotation and metadata redaction.
- MongoDB integration tests against a replica-set test instance for unique indexes, transaction behavior, TTL and concurrent refresh rotation.
- API tests with two tenants, users, memberships, organizations, locations and roles.
- Negative tests for tenant ID spoofing, cross-tenant references, inactive memberships, suspended users, revoked sessions, unknown permissions, malformed policies and missing feature flags.
- Migration tests for first run, repeat run, duplicate IDs, concurrent execution, partial failure and manual recovery.
- Seed tests proving idempotency and least privilege.

## Release gates
**Gate A — Service correctness:** all core service unit tests and package typechecks pass.  
**Gate B — Database correctness:** replica-set integration tests pass, required indexes are verified, and migration/seed behavior is repeatable.  
**Gate C — Tenant isolation:** cross-tenant negative tests pass for every tenant-owned collection and API route.  
**Gate D — Identity and authorization:** no unauthenticated or inactive principal accesses tenant resources; RBAC and ABAC both apply.  
**Gate E — Audit and operations:** sensitive values are redacted; audit retention, backup, access controls and integrity monitoring are documented and tested.  
**Gate F — Review and release:** CI is green, security review is complete, PR review is approved, and release is explicitly authorized. Green CI alone is not production acceptance.

## Known remaining work
- Complete authentication, MFA, recovery and identity verification in 6A.2.
- Wire shared services to API routes, authentication middleware and request-scoped principal in 6A.3.
- Add MongoDB replica-set integration tests and race-condition tests; added session tests are unit-level behavior tests.
- Add DB-level audit write permissions, cryptographic integrity evidence, export/retention controls and alerting.
- Add policy administration and reviewed policy language; current ABAC supports equality predicates only.
- Add transactional revocation across membership/session collections or document and test the selected consistency model.
- Add migration discovery, operational recovery command and deployment lock management.
- Complete governance dashboards and shared design system in 6A.4–6A.5.
- Complete independent security and tenant-isolation verification in 6A.6.

## Business-module prohibition
Do not begin ERP (6B), POS (6C), or Inventory (6D) as deployable modules before Gates A–F are accepted. Domain design may be documented in parallel, but module execution must depend on shared platform contracts.
