# Zuri OS — Deliverable 6A.3: Platform API and Service Integration

**Status:** Initial implementation submitted for review; acceptance remains pending.  
**Branch:** feature/6a3-platform-api  
**Baseline:** develop at ae1673104dcc8730723a36b54d9b62a2abcdfb71.

## Architecture contract

All platform routes execute inside a verified principal context. Tenant identity comes from the authenticated session and active membership, never from request-supplied tenant IDs. Tenant-owned collection reads and writes include explicit tenant filters.

ERP, POS, Inventory and future ecosystems consume these shared services. They must not establish independent identity, membership, role, policy, audit or configuration authorities.

## Implemented API surface

| Resource | Read | Write | Server-side control |
|---|---|---|---|
| Current tenant | GET | — | Active verified tenant and exact permission |
| Organizations | GET | POST | Assigned organization scope; root creation requires separate permission |
| Locations | GET | POST | Assigned organization and location scope |
| Memberships | GET | POST | Assigned organization/location scope; core service validates references |
| Roles | GET | POST | Tenant scoped; wildcard permissions rejected by core service |
| Policies | GET | PUT | Tenant scoped; validated policy schema |
| Feature flags | GET | PUT | Tenant scoped |
| Sessions | GET | POST revoke | Own sessions by default; separate all-sessions permission |
| Audit events | GET | — | Tenant scoped; bounded query |

Mutations use Zod validation and emit audit events. Session responses explicitly omit refresh-token hashes and token history.

## Authorization invariants

- Authentication is required for every route in this plugin.
- Exact permission keys are required; wildcard permissions are not interpreted.
- Tenant identity is derived from the authenticated principal.
- Organization and location scopes are enforced on both reads and writes.
- Empty organization/location scope returns no scoped records and grants no scope.
- Cross-tenant references fail closed.
- Privileged root-organization creation requires a distinct permission.
- Session listing/revocation defaults to the caller's own sessions unless a separate all-sessions permission is present.

## API error contract

- Invalid input: 400.
- Missing permission or out-of-scope resource: 403.
- Duplicate/conflicting state: 409.
- Invalid referenced state: 422.
- Unexpected failures: generic 500; internal exception details are not returned.

## Remaining acceptance work

- MongoDB replica-set route integration tests for every success and denial path.
- OpenAPI 3.1 generation, API versioning and schema drift checks.
- Idempotency keys for retryable mutations.
- Transactional outbox and event delivery.
- Request correlation and complete audit coverage for denied/failed privileged mutations.
- Policy simulation and reviewed ABAC operator semantics.
- Independent review of administrative permissions and break-glass controls.
- Review audit actor context and route-specific data minimization.

This increment is not production-ready until all acceptance work is completed and reviewed.
