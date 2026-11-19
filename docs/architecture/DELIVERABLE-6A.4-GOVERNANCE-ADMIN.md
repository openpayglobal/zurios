# Zuri OS — Deliverable 6A.4 Governance and Administration Workspace

**Status:** Implementation in progress on feature/6a4-governance-admin. This branch depends on the unmerged 6A.3 PR #3 and must not be merged independently of that dependency.

## 1. Purpose and authority model

The administration workspace is the governed control surface for the single Zuri OS platform. It is not a separate administration application with its own users, tenant model or permission engine.

All screens and operations consume the shared platform identity, tenant, organization, membership, RBAC, ABAC, audit, event, configuration and design-system services.

Two authority planes are distinct:
- **Tenant administration:** actions limited to the authenticated tenant and the actor's organization/location scope.
- **Platform operations:** cross-tenant lifecycle and platform-wide actions require a separate platform-operator grant. A tenant role cannot imply platform-wide authority.

Platform operator grants are provisioned through a controlled bootstrap process; the administration UI cannot grant its own platform-wide authority.

## 2. Workspace modules

1. Platform overview: tenant-local KPIs, service readiness, pending approvals, audit/security activity and outbox/event delivery health.
2. Tenant directory and lifecycle: platform-operator-only cross-tenant list, provision, activate, suspend and close workflows.
3. Organization and location administration: hierarchy, status and scope validation.
4. Identity and membership: tenant-scoped user directory, invitations, membership status, role assignment and session/device controls.
5. Access governance: role catalogue, permission review, ABAC policy simulation, policy change requests and approvals.
6. Approval centre: pending, approved, rejected, expired and executed requests; requester/approver separation.
7. Break-glass: reason-bound, scoped, short-lived emergency grants requiring independent approval and automatic expiry.
8. Audit centre: tenant-scoped search, filters, event detail, correlation tracing and controlled export.
9. Configuration: tenant configuration and feature flags with change history and approval for high-impact changes.

## 3. Security invariants

- Every request is authenticated and revalidated against current database state.
- Every tenant operation derives tenantId from the authenticated principal.
- Platform-wide routes require a distinct platform operator permission source.
- Server-side RBAC and ABAC checks are mandatory; hiding UI controls is not authorization.
- Sensitive actions require a reason and idempotency key.
- Approval requester and approver must be different identities.
- Approval execution uses an allowlisted action registry; arbitrary code or MongoDB updates are never accepted as approval payloads.
- Approval creation, approval decision, action execution, audit and outbox event are transactionally committed.
- Break-glass permissions are narrow, time-limited, scope-limited and automatically excluded after expiry.
- Break-glass activity is explicitly marked in audit metadata.
- Role assignment cannot grant permissions beyond the actor's authority without a separately granted privileged permission.
- Audit export is permission-checked, tenant-filtered, bounded and itself audited.
- No raw passwords, MFA secrets, invitation tokens, refresh tokens or recovery codes appear in audit metadata or events.

## 4. Approval workflow

1. Authorized requester submits an allowlisted action, target, structured change payload and reason (minimum 20 characters).
2. The API validates target ownership, action-specific permission and schema.
3. Request is stored as pending with expiry, requester, correlation ID and immutable request payload.
4. A different authorized approver reviews target, reason and proposed change.
5. Approver approves or rejects; self-approval is prohibited.
6. Approval and the allowlisted action execute in one MongoDB transaction. A failed action leaves the approval pending/failed according to the defined retry policy; it must not partially apply.
7. Audit and outbox events record the full lifecycle without copying sensitive payloads.
8. Expired requests cannot be approved or executed.

Initial allowlisted tenant actions:
- membership.suspend
- membership.reactivate
- membership.revoke
- policy.apply
- feature_flag.set
- break_glass.grant

Platform-operator-only actions:
- tenant.activate
- tenant.suspend
- tenant.close

## 5. Break-glass controls

- A grant must name the target user, tenant, explicit permissions, explicit organization/location scope, reason and expiry.
- Maximum duration: 60 minutes.
- Requester and approver must differ.
- No wildcard permissions or unbounded tenant scope.
- Active grants are checked from MongoDB on every authenticated request; expired/revoked grants contribute no permissions.
- Manual revocation is immediate.
- Every action performed under emergency permissions is identified in audit metadata and security-event monitoring.
- Grant issuance and revocation are audited and published as events.

## 6. Data collections and indexes

- platform_operator_grants
- approval_requests
- break_glass_grants
- tenant_config
- admin_action_history (only if an event/audit projection is justified; the canonical audit_events collection remains authoritative)

All tenant-owned records include tenantId. Platform-wide records use an explicit platform scope and cannot be queried through tenant-only APIs.

## 7. API surface

- GET /v1/platform/admin/overview
- GET /v1/platform/admin/tenants (platform operator)
- POST /v1/platform/admin/tenants (platform operator)
- POST /v1/platform/admin/tenants/{tenantId}/lifecycle-requests (platform operator)
- GET /v1/platform/admin/approvals
- POST /v1/platform/admin/approvals
- POST /v1/platform/admin/approvals/{requestId}/approve
- POST /v1/platform/admin/approvals/{requestId}/reject
- GET /v1/platform/admin/users
- POST /v1/platform/admin/users/invitations
- POST /v1/platform/admin/memberships/{membershipId}/lifecycle-requests
- POST /v1/platform/admin/policies/simulate
- GET /v1/platform/admin/audit-events
- POST /v1/platform/admin/audit-exports
- GET /v1/platform/admin/break-glass
- POST /v1/platform/admin/break-glass/{grantId}/revoke
- GET/PUT /v1/platform/admin/configuration

Every mutation requires Idempotency-Key. Sensitive operations require a reason and approval. OpenAPI contract and request-schema drift checks must be updated with each route.

## 8. Acceptance evidence

- Route integration tests for every module, success, denial, self-approval, expired approval, cross-tenant reference and privilege escalation.
- MongoDB replica-set transaction tests for approval + execution + audit + outbox atomicity.
- Break-glass expiry/revocation and scope tests.
- Tenant-admin versus platform-operator separation tests.
- Audit export scoping, size bounds and audit-of-export tests.
- Responsive, keyboard-accessible workspace screens and role-aware presentation.
- No UI-only authorization assumptions.
- CI typecheck, OpenAPI lint/schema drift, test and build all pass.

## 9. Explicit implementation boundary

This deliverable does not claim that an external email provider is connected. Invitation delivery must use a configured notification adapter; the API must not return raw invitation tokens in production. Platform operator grants require controlled bootstrap and cannot be self-issued by tenant administrators.
