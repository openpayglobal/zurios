# Zuri OS — Whole-Ecosystem Implementation Roadmap

**Roadmap baseline:** `main` baseline `cf863dc5bc19e6e84114d21e863f329df393c9e6`; current implementation branch `feature/6b-6d-services-reliability`, surfaced through PR #11 (stacked on PRs #8–#10). PRs #8, #9, #10 and #11 remain open and unmerged.

**Status vocabulary**
- **Implemented in source:** code or contract exists in the repository; this does not imply acceptance.
- **CI verified:** the named automated checks passed on the cited commit.
- **Acceptance pending:** functional, security, operational or independent evidence remains.
- **Not started:** no accepted implementation exists in the inspected baseline.
- **Blocked:** work depends on an earlier platform or domain contract.

This roadmap is deliberately explicit about the difference between code presence, automated verification and production acceptance.

## 1. Current progress ledger

| Workstream | Current evidence | Status |
|---|---|---|
| 6A.1 Shared platform core | MongoDB repositories, tenant/org/location/membership/user/session services, indexes, RBAC/ABAC, audit, migration and feature-flag services; replica-set integration now executes | CI verified in run #681; isolation and production acceptance pending |
| 6A.2 Identity and access | Password/JWT authentication, MFA, recovery-code and refresh/session lifecycle; route integration covers login, refresh/replay, MFA enroll/confirm/verify/disable, invitations, membership invitations, email verification, password reset, `/auth/me` and logout | Auth route integration passed in run #681; threat-model, abuse-case and independent security acceptance pending |
| 6A.3 Platform API and reliability | Versioned API, idempotency, transaction-backed audit/outbox, consumer receipts, transient poll retry, durable webhook queue, HMAC-signed HTTPS delivery worker with bounded retry/dead-letter and replay | CI run #817 passed the full pipeline; expanded Inventory/POS/ERP API route suites passed in #841/#863. Provider secret resolver, deployed worker and operational acceptance remain open |
| 6A.3 CI and reliability repair | PR #8 adds committed pnpm v9 lockfile and frozen installs, fixes Turbo env propagation, initializes MongoDB with runner-reachable replica-set address, removes invalid `_id` index creation, fixes refresh-replay HTTP mapping and outbox/audit assertions, and enforces default-deny ABAC with policy provisioning/backfill | Full workflow run #698 passed with MongoDB integration tests and default-deny policy tests executing; PR not merged |
| 6A.4 Governance/admin | Tenant/platform admin routes, approvals, break-glass, audit export, configuration and web workspace; integration suite now covers all 21 tenant/platform admin endpoints, including invite resend, approval rejection, policy simulation, audit exports and lifecycle workflows | CI verified in run #705; external provider workflows, UX/accessibility and independent security acceptance pending |
| 6A.5 Shared design system | Initial `@zuri/design-system` workspace package with semantic dark/light tokens, shared React primitives, admin-shell integration and SSR component tests | CI verified in run #679 with frozen lockfile; visual regression, keyboard testing, complete patterns and independent WCAG 2.2 AA review pending |
| 6A.6 Security, isolation and operations | Default-deny ABAC; scoped policy provisioning; conflict-safe, per-policy transactional backfill; threat-model, tenant-isolation and operational acceptance documentation | Backfill service and disposable-replica-set tests passed in #805. Production backfill remains blocked because no production MongoDB credential is configured in the connected Vercel API project; independent review, isolation matrix, backup/restore, alerts/runbooks and release sign-off remain outstanding |
| 6B ERP | Transactional services and authenticated, organization-scoped APIs for chart of accounts, fiscal periods, purchase orders, invoices, payment allocation and balanced journal posting; goods receipt now posts stock ledger movements in the same transaction | Core ERP APIs and integration tests passed in #863. Atomic goods receipt implementation is present; its latest replica-set test is being rerun after correcting an outbox-count assertion. Tax rules, full AP/AR lifecycle, supplier approvals, reporting and UI remain open |
| 6C POS | Authenticated, scoped APIs for terminal registration, cashier shifts, tender-reconciled sales, refunds and offline command intake | Service and API integration tests passed in #863. Provider payment capture, receipt delivery, device authentication, ordered offline replay and UI remain open |
| 6D Inventory | Transactional stock movement ledger, scoped warehouse APIs, balances, transfer legs, reservation, release, consumption and procurement goods receipt | Inventory API and MongoDB replica-set integration passed in #841; goods receipt now uses the same transaction for purchase-order updates and stock-ledger movements. Costing, lot/serial traceability, replenishment and UI remain open |
| CRM | Organization-scoped accounts, contacts, leads, opportunities, versioned pipeline stages, activities and consent evidence | Service and authenticated API integration tests passed in #886; campaigns, customer support, imports and marketing automation remain open |
| HR | Organization-scoped employee directory, leave requests and requester/approver-separated decisions | Service and API integration tests passed in #934; attendance, onboarding/offboarding, shifts, performance, training and employee self-service remain open |
| Payroll | Reconciled externally calculated payroll drafts and maker/checker approval | Service and API integration tests passed in #934; statutory calculations, jurisdictional legal review, payslips, provider disbursement and payroll accounting remain open |
| Payments | Provider-configured payment intents, injected signature verification for provider events, captured-payment invoice reconciliation and bounded refund requests | Service and API integration tests passed in #954; live provider adapter, webhook ingress, settlement, refund execution and chargeback operations remain open |
| Commerce | Organization-scoped catalog and reservation-backed orders priced from server catalog data | Service tests passed in #975; API routes and integration tests are present; storefront, cart, fulfillment, shipping, returns and customer UI remain open |
| Assets and maintenance | Asset register, straight-line depreciation inputs, work orders and version-checked completion | Contracts, services, scoped API routes and integration tests are present; latest typecheck and route-drift checks passed in #1039; full pipeline acceptance pending |
| Projects and professional services | Projects, tasks, employee time entries and independent timesheet approval | Contracts, services, scoped API routes and integration tests are present; latest typecheck and route-drift checks passed in #1039; full pipeline acceptance pending |
| Procurement receiving | Approved PO partial/final receipt with atomic stock ledger posting and cumulative received quantities | Implemented and contract/typecheck checked; latest full test run exposed an overstrict outbox-count assertion, corrected for rerun; supplier onboarding, RFQ/quotes, three-way match and returns remain open |

### Latest CI outcome and corrections

The original linked failure was the OpenAPI route-drift parser truncating component properties after nested schemas. The parser now validates the 19 shared request schemas. The following pipeline defects were then discovered by enabling the database integration tests instead of allowing them to skip:

1. Turbo strict environment filtering did not pass `MONGODB_TEST_URI` to workspace test tasks. Added it to `globalEnv`.
2. MongoDB's default replica-set member advertised its ephemeral container hostname, which the GitHub runner could not resolve. CI now initializes the replica set with `127.0.0.1:27017`.
3. The migration runner attempted to recreate MongoDB's built-in unique `_id` index with an invalid option. It now relies on the default unique index.
4. The outbox integration test expected one event despite deliberately creating two transactional events.
5. Refresh-token reuse correctly revoked the session family but was mapped to HTTP 500; it now returns the generic authentication failure (401).

[Actions run #681](https://github.com/openpayglobal/zurios/actions/runs/44557432014) passed frozen-lockfile installation, MongoDB 7.0 replica-set startup, OpenAPI lint, route/schema drift, monorepo typecheck, all configured tests and build. The 16 API tests passed with zero skips; the new auth HTTP lifecycle test and the platform/admin integration suites ran against MongoDB. [Run #679](https://github.com/openpayglobal/zurios/actions/runs/44557264189) also passed the design-system branch with database-backed core/admin/platform integration tests and design-system SSR tests.

Run #698 verifies default-deny ABAC for platform API and tenant/platform administration; run #705 adds full coverage of all 21 admin endpoints, including the previously uncovered approval-rejection route, now protected by the same ABAC check. Test fixtures seed explicit user-scoped policies to exercise permitted workflows. The rollout utility is dry-run by default and requires `ABAC_BACKFILL_APPLY=true` to persist the idempotent migration. Run #705 passed the full frozen-lockfile, replica-set, OpenAPI, drift, typecheck, database-backed test and build pipeline. Run #709 then expanded the versioned platform API route suite to exercise all 16 route families; all 16 API tests passed with zero skips. This is CI evidence, not proof that the backfill has been executed in production or that production is ready. Vercel deployments are currently blocked by the account's free-tier daily deployment quota; the web preview for PR #8's earlier head did reach READY.


Recent domain increments after the original run #805 have been independently checked in the following Actions runs: #817 (platform pipeline), #841 (Inventory API), #863 (ERP/POS/Inventory API suite), #886 (CRM), #934 (HR/Payroll), #954 (Payments) and #975 (Commerce service layer). The assets, project management and procurement-receipt additions are being validated in the current run sequence; the latest successful stage on run #1039 was OpenAPI lint, route drift and typecheck, while its test stage failed only on a goods-receipt outbox-count assertion that has since been corrected. See the branch Actions history for the rerun; do not infer production acceptance from these CI runs.

## 2. Delivery sequence and dependency gates

```text
6A.1 Core platform ─┐
6A.2 Identity ──────┼─> 6A.3 API/reliability ─> 6A.4 Governance ─> 6A.5 Design system
                    │                                              │
                    └──────────────────────────────────────────────┴─> 6A.6 independent acceptance
                                                                         │
                      ┌──────────────────────────────────────────────────┘
                      v
                 6B ERP core
                      │
                      ├──────────────┐
                      v              v
                 6D Inventory <──> 6C POS
                      │              │
                      └──────┬───────┘
                             v
              Payments, CRM, HR/Payroll, Commerce,
              Procurement, Supply Chain, Analytics,
              Integrations and Industry Packs
```

The requested workstream labels 6B ERP, 6C POS and 6D Inventory are retained. The dependency note is important: POS must integrate against Inventory's item, price, reservation and stock-movement contracts. Inventory's core contracts and event semantics must therefore be agreed before POS is accepted, even if the UI workstreams proceed in parallel.

## 3. 6A — Shared platform completion

### 6A.1 Core platform

Complete and accept:
- tenant lifecycle, tenant context and data partitioning;
- organization hierarchy and location hierarchy;
- global user identity and tenant memberships;
- role catalogue, permission registry, RBAC and ABAC policy engine;
- feature flags and configuration;
- canonical audit event service and append-only retention/export controls;
- migrations, index management, backup/restore and data repair procedures;
- platform event registry, schema versioning and correlation IDs.

**Acceptance evidence:** service unit tests; replica-set integration tests; cross-tenant negative tests; index/migration tests; backup/restore exercise; independent architecture review.

### 6A.2 Identity and access

Complete and accept:
- registration/invitation, activation, login, MFA enrollment and verification;
- recovery codes, password reset, refresh-token rotation and session revocation;
- brute-force/rate limits, credential stuffing protections and abuse telemetry;
- secure cookie/header strategy, CSRF/CORS controls and session fixation protections;
- signing-key rotation, secret management and operator bootstrap;
- account lifecycle, device/session inventory and notification hooks.

**Acceptance evidence:** positive and negative auth tests; replay/rotation/revocation tests; MFA brute-force and recovery tests; security review; key rotation drill.

### 6A.3 API, idempotency, outbox and event delivery

Complete and accept:
- route inventory and OpenAPI coverage for every public route;
- generated/validated request and response schemas, compatibility policy and deprecation windows;
- idempotency for every retryable mutation, including concurrent duplicate requests and changed-payload conflicts;
- transactional domain + audit + outbox + idempotency result writes;
- worker leases, retry/backoff, dead-letter queue, replay and consumer receipts;
- authenticated external transport adapters (webhooks/broker/email/SMS as appropriate);
- event schema registry, consumer registry, per-tenant delivery policy and replay authorization;
- metrics, tracing, alerting, retention and operational runbooks.

**Acceptance evidence:** replica-set fault-injection tests; crash/restart and lease-expiry tests; duplicate-delivery tests; event contract compatibility tests; dead-letter replay audit tests; external adapter contract tests.

**Current boundary:** the existing implementation documents and implements internal MongoDB event-stream delivery and at-least-once semantics. Do not describe this as an external broker integration or exactly-once delivery.

### 6A.4 Governance and administration

Complete and accept:
- tenant and platform-operator authority separation;
- role/permission administration and ABAC simulation;
- approvals with requester/approver separation and transactional execution;
- scoped, expiring break-glass access and emergency revocation;
- user invitations, membership lifecycle and session controls;
- audit search, correlation, export and tamper-evidence controls;
- tenant configuration and feature-flag governance;
- notification adapter, delivery status and failure handling;
- accessible, responsive admin workflows with route-level authorization tests.

### 6A.5 Shared design system

**Initial implementation now present on `feature/6a5-shared-design-system`:** a separately versioned `@zuri/design-system` workspace package, semantic CSS tokens with dark/light theme variables, reduced-motion support, focus-visible styling, and shared Button, TextField, SelectField, Badge, Card, Alert and EmptyState primitives. The web shell imports the package stylesheet and delegates its common Button, Input, Panel and Status wrappers to the shared primitives. Server-rendered component tests cover button semantics, labelled and validated fields, select fields, badges, cards, alerts and empty states; the package typecheck and monorepo build passed in Actions run #640. Visual regression, keyboard-flow testing, complete form/table/dialog patterns and independent WCAG 2.2 AA review remain open.

Continue and accept the package by completing:
- design tokens: color, typography, spacing, density, elevation, motion and breakpoints;
- primitives: button, input, select, checkbox, radio, switch, dialog, drawer, tabs, menu, tooltip, table, pagination, badge, alert and toast;
- patterns: data table, search/filter toolbar, form layout, empty/loading/error states, confirmation, audit timeline and approval panel;
- themes, light/dark modes, localization and currency/date/number formatting;
- keyboard navigation, focus management, semantic HTML and WCAG 2.2 AA target;
- visual regression, component tests and documented usage examples.

### 6A.6 Security, isolation, operations and independent acceptance

No business module is production-enabled until:
- tenant-isolation matrix covers every read, write, aggregate, export, event and background job;
- authorization matrix covers tenant admin, scoped staff, platform operator, service account and denied-by-default;
- secrets, encryption, key rotation and data retention are reviewed;
- audit integrity, privileged action coverage and break-glass evidence are independently reviewed;
- SLOs, health/readiness, metrics, tracing, logs, alerts and on-call runbooks exist;
- MongoDB backup/restore, point-in-time recovery strategy and disaster-recovery exercise pass;
- load, soak, concurrency and failure-mode tests pass;
- accessibility, privacy, legal/regulatory and threat-model reviews are signed off;
- release checklist and rollback plan are approved.

## 4. 6B — ERP core

Build ERP as bounded contexts over shared platform identity, tenant, organization, location, policy, audit, event and design-system services.

### 6B.1 Finance and accounting
- chart of accounts, accounting periods, journals and posting rules;
- immutable double-entry general ledger with balanced debit/credit invariant;
- accounts payable, accounts receivable, customer/vendor balances;
- invoices, credit notes, debit notes, payment allocations and statements;
- tax configuration, withholding and tax reporting adapters;
- budgets, cost centres, departments, projects and financial dimensions;
- bank/cash accounts, bank statement import, matching and reconciliation;
- multi-currency, FX rates, realized/unrealized gains/losses and period close;
- approval limits, segregation of duties, audit trail and financial close controls.

### 6B.2 Procurement and supplier management
- supplier master, onboarding, due diligence and terms;
- purchase requisitions, approvals, RFQs, quotations and purchase orders;
- goods receipt, supplier invoice matching and purchase returns;
- contract, price list, lead-time and supplier performance management;
- three-way match (PO, receipt, invoice), tolerance and exception queues.

### 6B.3 Sales, order and service operations
- quotations, sales orders, fulfillment, delivery and returns;
- customer pricing, discounts, credit limits and payment terms;
- recurring billing/subscriptions where required;
- service orders, work orders and service-level tracking.

### ERP acceptance gates
- every posted journal balances and is immutable; corrections use reversals;
- accounting period locks and close/reopen approvals work;
- tenant and organization scope is enforced on every financial record;
- invoice/tax/payment reconciliation is deterministic and auditable;
- concurrency and duplicate posting tests pass;
- no financial report is based on unposted or unbalanced records.

## 5. 6C — Point of Sale

Build POS as a resilient store/terminal application that consumes shared catalog, pricing, tax, customer, inventory and payment contracts.

- store, terminal, cashier, role and device registration;
- cashier shifts, till opening/closing, cash float and cash movements;
- product search, barcode scan, variants, units and price lists;
- cart, promotions, discounts, coupons, tax calculation and rounding rules;
- cash, card, bank transfer and configured mobile-money tenders;
- split tender, partial payment, change, refunds and void controls;
- receipts, invoice/ledger posting and customer purchase history;
- returns/exchanges with reason, supervisor approval and stock disposition;
- offline-first transaction queue, secure local storage, idempotent sync and conflict handling;
- terminal health, remote configuration, audit and device revocation.

**POS acceptance:** offline/online replay cannot duplicate sales or payments; totals reconcile exactly to tender and accounting postings; refunds reverse the correct original tender and stock movement; device and cashier scope are enforced; receipt and tax evidence is retained.

## 6. 6D — Inventory and warehouse

Build inventory as an auditable stock ledger; current on-hand is a projection, not the source of truth.

- item/SKU master, variants, barcode/GTIN, bundles and kits;
- units of measure, conversions, packaging and product attributes;
- warehouses, bins, zones, stores and stock ownership;
- receipts, put-away, picks, packing, dispatch and delivery confirmation;
- transfers, reservations, allocations, backorders and replenishment;
- adjustments, cycle counts, stocktakes and variance approvals;
- lot/batch, serial number, expiry and FEFO/FIFO picking;
- costing methods (weighted average/FIFO as configured), landed costs and valuation;
- reorder points, min/max, safety stock and demand forecasting inputs;
- returns, quarantine, damaged/expired stock and recalls;
- inventory event stream and ERP/POS reconciliation.

**Inventory acceptance:** every quantity change has an immutable movement record; stock cannot go negative unless an explicit policy allows it; reservations and concurrent picks are atomic; valuation reconciles to the general ledger; transfers preserve in-transit balances; batch/serial/expiry traceability works end-to-end.

## 7. Additional ecosystem domains (no omission)

These domains follow the shared platform and ERP/POS/Inventory contracts. Each remains its own bounded context with versioned APIs, events, audit, permissions, tests and operational ownership.

| Domain | Capabilities |
|---|---|
| CRM and customer experience | leads, accounts, contacts, opportunities, pipeline, activities, campaigns, support cases, customer consent and 360-degree history |
| HR and people operations | employee records, departments, positions, onboarding/offboarding, attendance, leave, shifts, performance, training and employee self-service |
| Payroll and benefits | salary structures, statutory deductions, payslips, approvals, payroll runs, bank/mobile-money disbursement and accounting integration; jurisdiction-specific rules require legal review |
| E-commerce and omnichannel | storefront/catalog publishing, carts, checkout, promotions, orders, fulfillment, click-and-collect and returns |
| Payments and reconciliation | payment intents, provider adapters, callbacks/webhooks, settlement, fees, chargebacks, refunds, reconciliation and idempotent posting |
| Supply chain and logistics | demand/supply planning, shipment, carrier, route, delivery proof, freight, customs data and supplier collaboration |
| Manufacturing and production | BOM, routing, work centres, production orders, material issue/return, WIP, quality checks, scrap and costing |
| Projects and professional services | project budgets, tasks, time sheets, resource allocation, milestones, expenses, billing and profitability |
| Assets and maintenance | asset register, depreciation integration, preventive/corrective maintenance, work orders, warranties and lifecycle |
| Fleet and field operations | vehicles, drivers, fuel, maintenance, dispatch, GPS/provider integrations and field-service work orders |
| Documents and records | document metadata, versioning, access policy, retention, legal hold, signatures and audit evidence |
| Workflow and automation | governed workflow definitions, approvals, timers, retries, human tasks, rules and event-triggered automation |
| Analytics and BI | operational dashboards, governed metrics, dimensional reporting, exports, data quality and tenant-safe analytics |
| Integration and developer platform | API keys, OAuth clients, webhooks, connectors, import/export, schema registry, rate limits, sandbox and partner portal |
| Industry packs | configurable workflows and terminology for retail, wholesale, distribution, hospitality, services, education and manufacturing |
| Localization | locale, timezone, currency, language, numbering, fiscal calendars and country-specific tax/payroll/payment adapters |

## 8. Cross-cutting quality gates for every module

Every domain increment must ship all of the following together:
1. domain model, invariants and architecture decision record;
2. tenant-owned collections and compound indexes with explicit tenant keys;
3. migration/seed/rollback strategy;
4. service layer and transaction boundaries;
5. API routes, Zod schemas, OpenAPI contract and compatibility tests;
6. RBAC/ABAC permission catalogue and negative authorization tests;
7. audit events and versioned outbox event contracts;
8. idempotency and concurrency/failure tests for retryable writes;
9. UI screens using the shared design system, with accessibility tests;
10. observability, alerts, runbooks, retention and recovery procedures;
11. unit, integration, replica-set, contract, end-to-end and load tests;
12. independent acceptance and release/rollback evidence.

## 9. Immediate execution backlog

1. Complete the current CI rerun for assets, projects, procurement receiving and the expanded domain API integration suite; fix every failing test rather than weakening product invariants.
2. Add independent tests for payment-provider signature adapters, provider webhook ingress, refund execution and settlement reconciliation before enabling live payments.
3. Complete domain API slices and end-to-end workflows for procurement, commerce fulfillment/returns, project billing, asset depreciation posting, analytics, integrations and workflow automation.
4. Add missing UI workflows using the shared design system, including accessibility and keyboard-flow acceptance.
5. Finish 6A.3 external secret-provider integration, deployed webhook worker, delivery observability and operational runbooks.
6. Execute production ABAC dry-run only after protected production MongoDB credentials and verified backups are configured; review conflicts before any apply.
7. Complete 6A.6 isolation matrix, backup/restore drill, independent security review and release sign-off.
8. Repair Vercel deployment checks and merge PRs #8–#11 in dependency order only after all required checks and the production ABAC migration/release gates are satisfied.

## 10. Release policy

- `main` is releasable; work on short-lived feature branches and reviewed pull requests.
- Never bypass failed CI, security review, tenant-isolation tests or protected branch rules.
- A green GitHub Actions job is necessary but not sufficient for production acceptance.
- No module is marked complete until code, tests, operational controls, documentation and independent acceptance evidence all exist.
- No credentials, customer records, live payment secrets or production data are committed.


### 7.1 Operational analytics — initial API and dashboard increment

The feature branch now includes an initial read-only operational analytics endpoint and web workspace:
- `GET /v1/analytics/operational` accepts an organization ID and explicit ISO-8601 date bounds; the tenant is derived from the authenticated principal.
- The API requires `analytics.report.read`, verifies the active organization and applies the normal organization-scoped ABAC decision before querying.
- The service uses a fixed allowlist of operational counts (invoices/open invoices, purchase orders, employees/active employees, assets/active assets, open maintenance work orders, projects/active projects, CRM accounts/open opportunities, pending payment intents and payroll runs). It does not accept caller-provided MongoDB filters or aggregation pipelines.
- The web workspace renders the metrics for the selected organization and period.
- Replica-set integration tests cover tenant, organization and date-window isolation, plus API permission denial for an organization outside the caller's membership.

**Explicit limitations:** this is an operational count dashboard, not a financial BI warehouse or statutory report. It does not yet calculate revenue, cash flow, margin, tax, inventory valuation or payroll statutory totals; it does not yet include POS sales because POS records need a verified organization linkage through terminal/location before they can be aggregated safely. A CSV export for the allowlisted metrics is now available through the protected API and web workspace. Scheduled reports, saved definitions, dimensional drill-down, data freshness SLAs and dashboard accessibility acceptance remain open.


### 7.2 Supply chain and logistics — initial shipment lifecycle

The branch now includes an initial shipment lifecycle service and authenticated API:
- Create planned shipments between two active locations in the same tenant and organization, and require the referenced purchase order, commerce order or inventory transfer to belong to that same tenant/organization.
- List shipments only in organizations authorized for the caller.
- Advance shipments through guarded states: planned → dispatched → in transit/delayed → delivered, with cancellation allowed only before terminal completion.
- Require proof-of-delivery reference when marking a shipment delivered.
- Enforce optimistic version checks and idempotent mutations; shipment state, audit event and outbox event commit in one MongoDB transaction.
- Replica-set service tests cover location-scope rejection, replay, state transitions, missing delivery evidence and terminal-state protection; API tests cover create, dispatch, deliver and scoped listing.

**Explicit limitations:** carrier master/onboarding, carrier API adapters, tracking webhooks/polling, route planning, freight cost/tax, customs documentation, shipment legs, partial delivery, returns and delivery exception workflows remain open. The current tracking number is recorded but is not yet verified with an external carrier.
