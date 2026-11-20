# Zuri OS — Master Product Requirements Document

**Document ID:** ZURI-PRD-001  
**Version:** 1.0  
**Status:** Baseline for implementation review  
**Product owner:** OIPTECH / ODEL Developers  
**Repository:** https://github.com/openpayglobal/zurios  
**Product category:** Modular, multi-tenant Business Operating System  
**Primary launch market:** Uganda, with jurisdiction-configurable international expansion  
**Architecture invariant:** MongoDB-native

## 1. Executive product definition

Zuri OS is a modular Business Operating System that provides organizations with a unified operational environment for managing customers, sales, stock, procurement, finance, people, projects, commerce, integrations, analytics and governed automation.

It is a platform and product family, not a single-purpose accounting or point-of-sale application. Customers activate only the products and capabilities they are entitled to use. The platform provides shared identity, tenancy, authorization, audit, configuration, eventing, reporting and integration services so that business modules work together without creating isolated data silos.

The first release must be a coherent, testable business MVP. It must not attempt to release every vertical application, marketplace feature or AI capability before the operational and financial foundations are reliable.

## 2. Product goals

1. Give businesses a single source of operational truth across sales, stock, procurement, customers and finance.
2. Support one-person businesses, SMEs, multi-branch organizations and enterprise structures through configurable scope.
3. Reduce duplicate entry through connected workflows and controlled integrations.
4. Make financial and stock movements traceable, reconcilable and auditable.
5. Provide modular activation, entitlements, roles, plans and usage limits.
6. Support low-connectivity environments through offline-capable workflows where the data model and conflict rules permit.
7. Enable approved partners and developers to extend the ecosystem safely.
8. Provide global platform governance through MAC/MAD while preserving tenant autonomy.
9. Support Uganda-first configuration for currencies, taxes, payment rails, address conventions and local business workflows without hardcoding jurisdiction rules into core logic.
10. Remain portable across hosting providers and avoid dependence on paid-only capabilities for local development.

## 3. Product principles

- Tenant isolation is mandatory and server-enforced.
- MongoDB is the only application database.
- The ledger is immutable after posting; corrections use reversing or adjusting entries.
- Stock is changed through controlled movements, not arbitrary balance edits.
- Provider callbacks are authenticated, idempotent and reconciled.
- AI is assistive and policy-governed; it does not silently authorize high-impact operations.
- Sensitive configuration is write-only and masked after submission.
- All privileged actions are attributable and auditable.
- User experience must expose the true state: pending, failed, offline, stale, unknown or complete.
- No feature is represented as implemented until code, tests and evidence exist.

## 4. Users, personas and access contexts

### 4.1 User groups
- Platform Owner / Global Administrator: governs Zuri OS ecosystem and MAC.
- Platform Operations / Security Operator: manages approved platform services and incidents.
- Tenant Owner / Business Administrator: configures a business tenant and delegates access.
- Finance Manager / Accountant / Cashier: manages finance, cash and reconciliation within assigned scope.
- Store / Inventory Manager: manages products, locations, stock and purchasing.
- Sales Representative / POS Operator: serves customers and records sales.
- Procurement Officer: manages suppliers, requisitions and purchase orders.
- Customer / Supplier: accesses only explicitly shared portals or documents.
- HR / Workforce Manager and Employee: manages people and workforce workflows.
- Analyst / Auditor: accesses permitted reports and audit evidence.
- Developer / Partner Publisher: uses approved APIs, SDKs and marketplace capabilities.
- AI Agent: a non-human principal with explicit service identity, capability scope, budget and policy.

### 4.2 Scope hierarchy
Platform → ecosystem/product → tenant → organization → workspace → branch/location → resource. Not every customer needs every level. The hierarchy must be configurable while maintaining unambiguous ownership and policy evaluation.

### 4.3 Permission model
Permissions are action-oriented (for example `sales.invoice.create`, `inventory.adjustment.approve`, `ledger.journal.post`). Roles bundle permissions; ABAC conditions constrain them by tenant, organization, branch, resource ownership, amount, status, time, device or risk. Tenant-supplied IDs are never proof of access.

### 4.4 Global identity and workspace access

One person has one global Zuri identity and may belong to multiple tenant workspaces simultaneously. Sign-in authenticates the person independently of workspace selection. After password and required MFA verification, the user chooses one of their active memberships. Each membership has independent roles and organization/location scope. Switching workspace changes the active tenant context without creating a second user or membership. Users without active memberships must be guided to an approved invitation or access-request process; the client must never self-grant tenant access.

## 5. Product catalogue and scope

### 5.1 Platform and shared capabilities
- **Zuri Core:** tenant, organization, workspace, branch, user, role, policy, entitlement and platform configuration.
- **Identity & Access:** login, password security, session management, MFA, invitations, recovery, SSO extension points and service identities.
- **Zuri Documents:** documents, templates, records, attachments, versioning, approvals, retention and access-controlled sharing.
- **Zuri Connect:** integrations, webhooks, event subscriptions, communication adapters and partner connections.
- **Zuri Insight:** dashboards, operational reporting, exports, metric definitions and scheduled reports.
- **Zuri Intelligence:** AI provider/model routing, agents, retrieval, tool governance and human approvals.
- **Zuri Marketplace:** approved extensions, partner apps, connectors, publisher lifecycle, permissions and licensing.
- **Zuri Cloud & Hosting OS:** provider/project inventory, deployments, domains, runtime configuration and hosting orchestration.
- **Zuri Devices OS:** device registration, trusted device policy, assignment, health and remote configuration where supported.
- **MAC/MAD:** global control plane and executive/operational command centre.

### 5.2 Core business applications
- **Zuri Stock:** products, categories, units, variants, barcodes, stock locations, transfers, counts, adjustments, batches/serials, expiry and reorder controls.
- **Zuri Till / Zuri Register:** quotations, orders, POS sales, receipts, discounts, returns, exchanges, cash sessions, tills and shift close.
- **Zuri Ledger:** chart of accounts, journals, posting rules, financial periods, tax accounts, receivables/payables subledger integration, trial balance and statements.
- **Zuri Pay:** payment intent and records, provider adapters, cash/mobile money/card/bank rails as configured, settlement, refunds, fees and reconciliation.
- **Zuri Commerce:** online catalogue, customer cart, orders, fulfilment, shipping, returns, promotions and channel inventory.
- **Zuri CRM:** leads, prospects, contacts, accounts, opportunities, activities, cases and customer history.
- **Zuri Supply:** suppliers, requisitions, purchase orders, receiving, supplier invoices, returns and supplier performance.
- **Zuri People:** employee records, departments, positions, onboarding, offboarding, documents and HR permissions.
- **Zuri Workforce:** schedules, attendance, leave, shifts, tasks, time records and approvals.
- **Zuri Projects:** project portfolio, tasks, milestones, time/cost tracking, assignments and approvals.

### 5.3 Advanced and vertical applications
- **Zuri Manufacturing:** bills of materials, work orders, material issue/return, production stages, yield, scrap and costing.
- **Zuri Hospitality:** venues, tables/rooms, reservations, service orders, POS integration and guest profiles.
- **Zuri Pharmacy:** regulated product catalogue, batch/expiry controls, dispensing workflows, prescription-related records where legally permitted, inventory and audit. Jurisdictional requirements must be assessed before enabling clinical or regulated workflows.
- **Zuri Franchise:** franchise groups, locations, agreements, shared catalogue, royalties/fees, consolidated reporting and delegated controls.
- **Customer/Developer Apps:** tenant-scoped apps, APIs and extensions installed under approved permission grants.

## 6. MVP and release boundaries

### 6.1 Coherent MVP
The first usable MVP includes:
1. Secure login, session lifecycle and tenant membership.
2. Business profile, organization, branch and user/role administration.
3. Product catalogue, stock locations and stock movement ledger.
4. POS sale, receipt, return, cash session and shift close.
5. Payment recording with manual/sandbox adapter until a live provider is approved.
6. Double-entry ledger with balanced journals and financial-period controls.
7. Supplier, purchase order and goods-received workflow.
8. Basic customer records and sales history.
9. Essential operational reports and audit history.
10. MAC/MAD foundational operator workspace, initially limited to registry, health, approvals and configuration metadata.

### 6.2 Explicitly deferred from first MVP
- Production AI agents with authority to move money or alter access controls.
- Fully autonomous deployment or infrastructure mutation.
- All vertical applications at once.
- Marketplace public launch and third-party app installation at scale.
- Production payment processing before provider onboarding, KYC, reconciliation and security approval.
- Regulatory or accounting compliance claims before jurisdiction-specific review and testing.

## 7. Functional requirements

### FR-CORE — Platform
- FR-CORE-001: Create and suspend tenants with lifecycle audit.
- FR-CORE-002: Create organizations, workspaces, branches and locations within an authorized tenant.
- FR-CORE-003: Invite users, accept invitations, deactivate users and revoke sessions.
- FR-CORE-004: Enforce role permissions and ABAC conditions on all API operations.
- FR-CORE-005: Enforce product entitlements and plan limits server-side.
- FR-CORE-006: Record security-sensitive and business-critical actions in audit events.
- FR-CORE-007: Support configurable localization, time zones, currencies and jurisdiction profiles.
- FR-CORE-008: Provide health/readiness and operational status endpoints without exposing secrets.
- FR-CORE-009: Support one global human identity with multiple independent tenant/workspace memberships.
- FR-CORE-010: Authenticate identity before workspace selection; issue sessions bound to the selected tenant and membership.
- FR-CORE-011: Allow workspace switching only after server-side membership revalidation; never create or grant membership as a side effect of switching.
- FR-CORE-012: Provide a safe no-membership state that routes users to approved invitation/access-request processes without revealing other tenants.

### FR-INV — Inventory
- FR-INV-001: Maintain products, variants, units, categories and identifiers.
- FR-INV-002: Record all stock increases/decreases as immutable movement records.
- FR-INV-003: Support transfers, receiving, counts and approved adjustments.
- FR-INV-004: Prevent negative stock where tenant policy prohibits it.
- FR-INV-005: Track lot, serial and expiry where product configuration requires it.
- FR-INV-006: Calculate on-hand, reserved, available and in-transit quantities from authoritative movements/balances.
- FR-INV-007: Prevent duplicate provider or offline sync events from duplicating stock movement.

### FR-POS — Sales and Till
- FR-POS-001: Create and manage quotations and sales orders.
- FR-POS-002: Complete a sale with lines, prices, discounts, tax treatment and payment allocation.
- FR-POS-003: Issue a uniquely numbered receipt/invoice subject to configured numbering rules.
- FR-POS-004: Support cash session opening, float, cash movement, close and variance.
- FR-POS-005: Support returns/refunds through linked original transactions and approval rules.
- FR-POS-006: Enforce price overrides and discounts by permission/threshold.
- FR-POS-007: Support offline capture only with local idempotency and later conflict/reconciliation handling.

### FR-FIN — Finance
- FR-FIN-001: Maintain a versioned chart of accounts per legal entity or accounting book.
- FR-FIN-002: Post journals only when total debits equal total credits.
- FR-FIN-003: Enforce open financial periods and approved posting dates.
- FR-FIN-004: Prevent direct mutation/deletion of posted ledger entries.
- FR-FIN-005: Correct errors using reversal and replacement/adjustment journals.
- FR-FIN-006: Link operational source transactions to ledger postings with idempotency.
- FR-FIN-007: Provide trial balance, general ledger, profit/loss and balance sheet from posted data.
- FR-FIN-008: Record payment fees, refunds, settlements and reconciliation differences explicitly.

### FR-SUP — Procurement
- FR-SUP-001: Maintain supplier profiles and payment terms.
- FR-SUP-002: Create requisitions and purchase orders with approval thresholds.
- FR-SUP-003: Receive goods against purchase orders with partial receiving support.
- FR-SUP-004: Record discrepancies, returns and supplier invoices.
- FR-SUP-005: Prevent duplicate receiving and supplier invoice posting.

### FR-CRM — Customer operations
- FR-CRM-001: Maintain contacts, customer accounts and consent/preferences.
- FR-CRM-002: Link sales, cases and interactions to authorized customer records.
- FR-CRM-003: Enforce consent and purpose restrictions for communications.
- FR-CRM-004: Provide scoped customer portal access only to shared records.

### FR-PEOPLE — People and workforce
- FR-PEOPLE-001: Maintain employee, team, position and department records.
- FR-PEOPLE-002: Restrict HR-sensitive fields to approved roles and scopes.
- FR-PEOPLE-003: Support onboarding/offboarding with access provisioning/revocation.
- FR-PEOPLE-004: Manage schedules, attendance, leave and task assignments.
- FR-PEOPLE-005: Record approvals and changes in audit history.

### FR-MAC — Global administration
- FR-MAC-001: Provide a global administration shell at `/mac`.
- FR-MAC-002: Separate global operators from tenant administrators.
- FR-MAC-003: Display only authorized platform resources and secret metadata.
- FR-MAC-004: Manage provider/project/environment metadata and provider credentials under least privilege.
- FR-MAC-005: Manage deployment-scoped variables with clear redeployment semantics.
- FR-MAC-006: Manage approved live runtime configuration through a separate server-side plane.
- FR-MAC-007: Require approval, dry-run, audit and rollback plan for high-impact operations.
- FR-MAC-008: Show missing or stale telemetry as unknown, not healthy.

### FR-AI — Intelligence
- FR-AI-001: Register providers, models, agents, tools and capability grants.
- FR-AI-002: Bind every agent to service identity, scope, budget and policy.
- FR-AI-003: Require human approval for high-impact or irreversible operations.
- FR-AI-004: Record tool calls, policy decisions, inputs/outputs metadata and execution outcome without leaking secrets.
- FR-AI-005: Respect source permissions during retrieval and response generation.

### FR-MKT — Marketplace and developer ecosystem
- FR-MKT-001: Register publishers and verify their status before publication.
- FR-MKT-002: Declare app permissions, data access, events and external endpoints.
- FR-MKT-003: Require explicit tenant approval for installation and permission grants.
- FR-MKT-004: Support revocation, versioning, sandboxing and audit.
- FR-MKT-005: Provide versioned API contracts and developer documentation.

## 8. Non-functional requirements

### Security
- TLS for all network communication.
- Strong password hashing with modern adaptive algorithm and parameters.
- Short-lived access tokens and rotating/revocable refresh sessions.
- MFA for privileged operators and configurable tenant policies.
- Default-deny RBAC/ABAC, object-level authorization and tenant-isolation tests.
- Encryption at rest; envelope/field encryption for sensitive secrets.
- CSRF protection for cookie-authenticated browser flows; secure, HttpOnly, SameSite cookies where applicable.
- Rate limiting, abuse controls, input validation and safe error responses.
- No secrets in source control, client assets, telemetry or logs.

### Reliability and data integrity
- Idempotency for externally retried or user-retried mutations.
- Transactional consistency for ledger, stock and outbox workflows.
- Durable event delivery with retry, backoff and dead-letter visibility.
- Explicit concurrency control for stock, cash sessions and financial posting.
- Backups and tested restore procedures before production.

### Performance and scalability
- Establish measurable baselines before setting numeric SLOs.
- Index all high-volume tenant-scoped query patterns.
- Use pagination and bounded query sizes.
- Use asynchronous jobs for expensive exports and bulk processing.
- Load-test on the actual available plan before committing capacity claims.

### Accessibility and usability
- Responsive layouts and keyboard operation for critical workflows.
- Accessible labels, focus states, contrast and validation messages.
- Consistent empty/loading/error/offline states.
- Clear confirmation for irreversible operations.

### Portability
- Provider adapters for hosting, payments, messaging and AI.
- Avoid business logic embedded in vendor-specific deployment assumptions.
- Local development must not require paid services.

## 9. Data and integration requirements

- MongoDB collections must include explicit tenant and ownership scope where applicable.
- Use stable internal IDs and unique indexes for external references.
- Use a transactional outbox for reliable event publication.
- Webhooks must validate signatures, timestamps, replay windows and idempotency.
- Provider adapters must normalize status, errors, currencies, fees and settlement references.
- Import/export must include authorization, validation, preview, error report and audit.
- Personal data collection must be minimized and purpose-limited.

## 10. Acceptance criteria for the MVP

The MVP is accepted only when all of the following are demonstrated in an isolated test tenant:

1. A tenant administrator cannot read or modify another tenant's data by guessing IDs or changing request parameters.
2. A cashier can complete a sale, receive payment and issue a receipt within assigned branch scope.
3. The sale creates the correct stock movement and ledger postings exactly once.
4. Every posted journal balances; posted journals cannot be silently edited or deleted.
5. Duplicate payment/webhook delivery does not duplicate settlement or ledger posting.
6. A stock adjustment above configured threshold requires approval.
7. A user whose access is revoked cannot continue using a previously issued refresh token.
8. All sensitive and privileged actions have attributable audit records.
9. Offline-created transactions are reconciled or explicitly rejected with an explainable conflict outcome.
10. Reports reconcile to source transactions and posted ledger data.
11. The system shows service/telemetry unknown when no reliable signal exists.
12. CI runs install, typecheck, lint, tests, OpenAPI checks and build successfully.

## 11. Analytics and success measures

Initial measures (targets to be agreed after baseline):
- Time to complete a sale and close a till.
- Stock variance and duplicate transaction rate.
- Percentage of sales with complete payment/ledger reconciliation.
- Failed or delayed event delivery.
- Authorization denials and cross-tenant test failures.
- User onboarding completion and active use by role.
- API availability and latency at measured workload.
- Support incidents and time to resolution.
- Offline synchronization conflict rate.

Metrics must be tenant-scoped, privacy-aware and never expose another tenant's business data.

## 12. Assumptions, decisions and open items

### Adopted
- MongoDB-only application data layer.
- Modular multi-tenant Business Operating System.
- TypeScript, React/Vite, Fastify/Node.js.
- Uganda-first localization with international configuration.
- MAC/MAD as global administration and operational command centre.
- Zero additional recurring cost unless explicitly approved.

### To be decided through owner review or jurisdictional discovery
- Final legal entity and accounting-book model.
- Exact Uganda tax/VAT/e-invoicing obligations and integrations.
- Approved payment providers, onboarding and live credentials.
- Subscription/pricing tiers and commercial limits.
- Offline client technology and device trust policy.
- Data retention and residency by jurisdiction.
- Production SLOs, hosting topology and capacity budget.
- Vertical module sequencing based on pilot customers.

## 13. Traceability

Each functional requirement must map to:
- One or more user stories.
- API operation(s) and OpenAPI operation IDs.
- MongoDB collection(s), indexes and migrations.
- Permission(s) and ABAC conditions.
- Unit/integration/e2e tests.
- UI workflow(s).
- Audit event(s).
- Release gate and evidence reference.

A feature without this traceability is not accepted as complete.
