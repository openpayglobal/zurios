# Zuri OS — Deliverable 6A Implementation Roadmap
## Verified Core Platform before business ecosystems

**Programme owner:** Zuri OS  
**Repository:** `openpayglobal/zurios`  
**Working branch:** `feature/6a3-platform-api`  
**Status:** 6A.1/6A.2 merged to `develop`; 6A.3 initial API implementation submitted for review; 6A overall is not yet accepted.

## Governing architecture

Zuri OS is one multi-tenant operating platform with multiple business ecosystems. ERP, POS, Inventory and future modules share one platform control plane. They must not create separate identity stores, tenant authorities, organization trees, permission engines, audit systems, or configuration authorities.

The following services are platform-owned and shared:
- Tenant lifecycle and tenant context.
- Global user identity and identity verification.
- Tenant membership and organization/location scope.
- Authentication, sessions and MFA.
- RBAC roles, permissions and ABAC policy evaluation.
- Audit and security events.
- Platform configuration, tenant configuration and feature flags.
- Shared API gateway/middleware, event contracts and service interfaces.
- Shared design system and administrative governance.

Each business ecosystem owns only its domain data, workflows, business rules and user experiences, while inheriting the platform controls.

## Delivery sequence and gates

| Milestone | Scope | Exit evidence | Dependency |
|---|---|---|---|
| 6A.1 | Complete and verify core services | Unit, replica-set integration, lifecycle, isolation and migration tests; service acceptance report | Current |
| 6A.2 | Authentication, MFA and identity lifecycle | Secure login, verification, MFA, recovery, session controls and abuse protections | 6A.1 |
| 6A.3 | Platform API and service integration | Verified-principal middleware, scoped APIs, shared service adapters, OpenAPI and event contracts | 6A.1–6A.2 |
| 6A.4 | Administration and governance dashboards | Governed operator workflows with authorization, approvals and audit trails | 6A.3 |
| 6A.5 | Shared Zuri OS design system | Documented tokens, reusable accessible components, responsive shell and theme support | 6A.3; 6A.4 informs screens |
| 6A.6 | Security, isolation and integration testing | Independent security review, cross-tenant suite, operational readiness and signed acceptance | 6A.1–6A.5 |
| 6B | ERP foundation | ERP consumes platform identity, tenancy, authorization, audit and configuration | 6A accepted |
| 6C | POS foundation | POS consumes the same shared platform services | 6A accepted |
| 6D | Inventory foundation | Inventory consumes the same shared platform services | 6A accepted |

## 6A.1 — Core service completion and verification

Complete tenant, organization, location, user, membership, session, RBAC, ABAC, audit, feature-flag, migration, index and seed services.

Required work:
- Validate schemas, lifecycle transitions, referential scope and uniqueness.
- Verify global identity versus tenant membership separation.
- Verify session creation requires active tenant, user and membership.
- Verify rotation is atomic and replay detection is tested under concurrency.
- Verify user, membership and tenant revocation semantics.
- Verify tenant-owned indexes and global identity indexes.
- Verify policy evaluation is default-deny and deny-overrides; unsupported operators fail closed.
- Verify audit actor attribution and secret redaction.
- Verify migration failure and recovery behavior.
- Verify seeds are idempotent and least-privileged.
- Verify real MongoDB replica-set behavior and two-tenant negative cases.

Exit: signed service-by-service acceptance matrix; no critical correctness or tenant-isolation defects.

## 6A.2 — Authentication, MFA and identity lifecycle

Deliver:
- Password registration/invitation acceptance, Argon2id password hashing and password policy.
- Email and phone verification challenges with expiry, one-time use and abuse controls.
- Login by verified identity with tenant/membership resolution.
- TOTP MFA enrollment, confirmation, challenge and disablement controls.
- Hashed single-use recovery codes and recovery rotation.
- Step-up authentication for sensitive operations.
- Short-lived signed access tokens and opaque rotating refresh tokens.
- Session/device listing, individual revocation, global logout and risk-aware revocation.
- Password reset, password change, credential compromise response and account recovery.
- Account states: invited, pending verification, active, suspended, locked and deactivated.
- Login throttling, progressive delay, rate limits, enumeration resistance, suspicious-attempt logging and operational alerts.
- Secure cookie/transport policy, CSRF protection where cookie authentication is used, secure CORS and token storage guidance.
- Administrative identity lifecycle actions protected by elevated permissions and audit events.

Exit: end-to-end identity journeys and negative tests pass; MFA/recovery cannot be bypassed; inactive identities cannot retain access.

## 6A.3 — Platform API and service integration

Deliver:
- Fastify plugins for authentication, request context, tenant context and authorization.
- Verified principal derived from signed credentials and active database state, never request-supplied tenant IDs.
- Shared authorization guard applying RBAC and ABAC consistently.
- Tenant-scoped repository/query helpers and resource ownership checks.
- Platform routes for tenants, organizations, locations, users, memberships, roles, policies, sessions, audit and configuration.
- Input/output validation, consistent error envelopes and safe error handling.
- OpenAPI 3.1 contracts, API versioning and generated client types.
- Request/correlation IDs, structured logging and trace propagation.
- Idempotency for retryable state-changing operations.
- Transactional outbox/event delivery patterns for cross-service lifecycle events.
- Background job identity and permission model.
- API integration tests for every route, including cross-tenant denial and inactive-principal denial.

Exit: all platform APIs use shared middleware and contracts; no business API may bypass tenant and permission checks.

## 6A.4 — Administration and governance dashboards

Deliver a governed administration workspace:
- Platform overview, health, service status and operational alerts.
- Tenant directory, provisioning, suspension and lifecycle history.
- Organization and location hierarchy management.
- User directory, invitations, verification and status management.
- Membership, role and permission assignment with scope visibility.
- Policy management with validation, simulation and approval workflow.
- Session/device monitoring, logout and revocation.
- Audit search, filtering, export and event detail.
- Feature flags and configuration management with environment/tenant scope.
- Administrative approvals, separation of duties, break-glass access and reason capture.
- Every privileged action records actor, reason, target, outcome and correlation ID.

Exit: all dashboard actions are permission-checked server-side, audited and tested; UI hiding alone is never authorization.

## 6A.5 — Shared Zuri OS design system

Preserve the established midnight-navy/cyan enterprise direction and build reusable implementation standards:
- Design tokens for color, typography, spacing, radius, elevation, borders, focus and motion.
- Semantic color roles and light/dark themes.
- Application shell, navigation, breadcrumbs, workspace switcher and command/search patterns.
- Buttons, icon buttons, links, inputs, selects, comboboxes, forms, validation, dialogs, drawers, menus and toasts.
- Data tables, filters, pagination, bulk actions, empty/loading/error states and detail panels.
- Cards, metric tiles, charts, status indicators, timelines and audit event views.
- Responsive desktop, tablet and mobile behavior.
- Keyboard navigation, focus management, screen-reader labels, contrast and WCAG 2.2 AA target.
- Localization-ready text, number/date/currency formatting and RTL readiness.
- Component documentation, visual regression and accessibility tests.

Exit: shared components are used by the platform shell and governance screens; no module invents its own incompatible design language.

## 6A.6 — Security, isolation and integration acceptance

Deliver independent verification across:
- Threat model and trust boundaries (STRIDE).
- Authentication, MFA, session fixation, token replay, CSRF, XSS, injection and account recovery.
- Tenant isolation for every tenant-owned collection, endpoint, background job, export, search and event consumer.
- Object-level authorization and cross-tenant reference validation.
- RBAC/ABAC conflict, policy change, privilege escalation and administrative abuse.
- Secret management, encryption in transit/at rest, key rotation and data minimization.
- Audit integrity, privileged write separation, retention, export and alerting.
- Rate limiting, denial-of-service resilience and abuse monitoring.
- Dependency/SBOM scanning, secret scanning, static analysis and vulnerability remediation.
- Backup/restore, point-in-time recovery, disaster recovery and operational runbooks.
- Logging, metrics, tracing, health checks, incident response and security alert routing.
- Penetration testing and independent review of critical controls.

Exit: all critical/high findings resolved or formally risk-accepted by authorized owners; automated gates green; signed platform readiness decision.

## 6B–6D — Business ecosystem enablement

Only after 6A.6 acceptance:
- ERP begins with shared master data references, finance/operations foundations, workflow and reporting contracts.
- POS begins with shared identity, location, permissions, pricing/tax/payment integration and offline-safe transaction patterns.
- Inventory begins with shared item/catalog, locations, stock ledger, movement, valuation and reconciliation foundations.

These are separate domain bounded contexts. They may own their own collections and APIs, but they inherit the same platform controls and must not duplicate platform authorities.

## Release governance

- Each milestone is a separately reviewable pull request or controlled set of pull requests.
- Every exit criterion must have test evidence and named review ownership.
- CI success is necessary but not sufficient for security or production acceptance.
- No merge to the protected integration branch without review and required checks.
- No deployment promotion without environment configuration, secrets, database migration plan, rollback/forward-fix plan and smoke tests.
- No 6B/6C/6D production implementation before 6A.6 sign-off.

## Current known constraints

- The current shell is an initial dashboard implementation, not the completed shared design system.
- The current ABAC evaluator is equality-only and must remain fail-closed until a reviewed policy language is implemented.
- Audit redaction is application-level; database-level immutability, integrity chaining, retention and export controls remain outstanding.
- Membership/session revocation spans multiple documents; production consistency and failure recovery require transaction or equivalent tested design.
- API authentication and route-level integration remain separate deliverables.
- The current repository's GitHub visibility must be confirmed by its owner before proprietary development continues; the connected GitHub metadata currently reports it as public.


## Execution update — 18 November 2026

- Deliverable 6A core services and identity foundations are merged into `develop` at merge commit `ae1673104dcc8730723a36b54d9b62a2abcdfb71`.
- CI runs associated with the merge commit completed successfully; this confirms configured automated checks only, not production acceptance.
- 6A.3 work is in `feature/6a3-platform-api`: shared platform API routes for tenant, organization, location, membership, roles, policies, feature flags, sessions and audit-event reads; exact permission enforcement; organization-scope propagation into authenticated principals; and route contract documentation.
- 6A.3 remains pending full route-level replica-set integration tests, OpenAPI 3.1, idempotency, transactional outbox and independent security review.
- The repository's GitHub API metadata currently reports visibility as public. This is a blocking confidentiality discrepancy for proprietary development and must be corrected by an owner through repository Settings before sensitive source or secrets are added.
- The connected GitHub integration used for this work exposes repository read/write operations but does not expose a repository-visibility mutation operation in this session. No visibility change has been made.
