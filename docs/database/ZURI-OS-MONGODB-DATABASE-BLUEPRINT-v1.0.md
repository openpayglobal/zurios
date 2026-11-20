# Zuri OS — MongoDB Database Blueprint

**Document ID:** ZURI-DATA-001  
**Version:** 1.0  
**Status:** Baseline for implementation review  
**Database technology:** MongoDB only  
**Initial database:** `zuri_os`  
**Owner:** OIPTECH / ODEL Developers

## 1. Purpose and design principles

This blueprint defines the logical MongoDB data model for Zuri OS. It is the authority for collection ownership, scope, indexes, validation, transaction boundaries and migration discipline. It does not imply every collection has already been created.

Principles:
- One MongoDB application database technology; no relational or document-database substitution.
- Explicit tenant and organizational scope for tenant-owned records.
- Embed bounded, aggregate-owned data; reference independently queried or high-cardinality entities.
- Use immutable movement/ledger/audit records for facts that must not be rewritten.
- Use transactions for multi-document financial/inventory invariants.
- Add indexes from known query patterns and verify with explain plans.
- Use schema validation and typed application contracts.
- Never store plaintext secrets, raw payment credentials or unredacted sensitive tokens.

## 2. Naming and common fields

Collection names are lowercase plural snake_case. IDs use MongoDB ObjectId or stable UUID/string IDs consistently per aggregate. Do not mix formats within the same field.

### 2.1 Common document metadata
Tenant-owned document baseline:
```ts
type TenantDocument = {
  _id: ObjectId | string;
  tenantId: string;
  organizationId?: string;
  workspaceId?: string;
  branchId?: string;
  locationId?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  version: number;          // optimistic concurrency where mutable
  status?: string;
  schemaVersion: number;
};
```

Not every collection requires every scope field. Collection contracts must declare required scope. Platform-global documents must not invent a tenant ID; they use explicit platform scope and platform authorization.

### 2.2 Actor envelope
`actorType` is one of `user`, `service`, `agent`, `system`; `actorId` identifies the principal. Store request/correlation IDs for traceability.

### 2.3 Monetary and quantity values
- Store monetary amounts as integer minor units or MongoDB Decimal128, with an explicit currency code and precision policy. Choose one canonical representation per bounded domain; never mix within the same field.
- Avoid JavaScript floating-point arithmetic for financial calculations.
- Store quantities as Decimal128 where fractional units are allowed; include unit code and conversion rule version.
- Store tax/discount/fee components explicitly to support audit and recalculation.

## 3. Scope and ownership model

Platform-global:
- `platform_ecosystems`, `platform_products`, `platform_services`, `platform_operators`, `hosting_providers`, `provider_capabilities`, `platform_policies`, `admin_audit_events`.

Tenant-owned:
- users/memberships scoped through identity model; business, catalogue, stock, sales, finance, procurement, CRM, commerce, HR and documents.

Shared/global reference data:
- currency, country/jurisdiction, unit definitions, tax code templates and localization metadata. Tenant-specific overrides must be versioned and scoped.

Every tenant-owned query must include `tenantId` derived from authenticated membership. Add organization/branch/location constraints when the permission model requires narrower scope. Do not expose a generic unscoped repository method for tenant-owned collections.

## 4. Collection catalogue

### 4.1 Platform and identity

| Collection | Ownership | Purpose |
|---|---|---|
| `tenants` | platform | Tenant identity, lifecycle, plan and status |
| `organizations` | tenant | Legal/operating entities |
| `workspaces` | tenant | Work contexts |
| `branches` | tenant | Branches and operating locations |
| `users` | identity | User profile and authentication state |
| `memberships` | tenant | User-to-tenant/org/workspace/branch relationship |
| `roles` | platform/tenant | Permission bundles with scope |
| `permissions` | platform | Canonical permission catalog |
| `role_assignments` | tenant/platform | Principal-to-role grants and scope |
| `policies` | platform/tenant | ABAC policy definitions and versions |
| `sessions` | identity | Refresh-token/session metadata and revocation |
| `invitations` | tenant | Single-use invitations with hashed token |
| `verification_tokens` | identity | Email/reset tokens hashed at rest |
| `mfa_credentials` | identity | Encrypted MFA secret envelope and key version |
| `service_identities` | platform/tenant | Non-human service/agent principals |
| `entitlements` | platform/tenant | Product/module capabilities and limits |
| `feature_flags` | platform/tenant | Feature release controls |
| `audit_events` | tenant/platform | Append-only audit facts |
| `access_requests` | platform | Public, non-provisioning Zuri OS access enquiries; status and review metadata only |\nAccess requests are platform-level records, not tenant memberships. Public submission must not create users, tenants, workspaces or memberships. The review queue is ordered by `requestedAt` and filtered by status; a successful review decision records an audited outcome but only approves follow-up. It does not grant access. Keep the collection disabled from public intake until the privacy notice, controller, retention schedule and deletion authority are approved. The application creates a unique `requestId` index and a `{status, requestedAt}` queue index.\n

#### Identity and multi-membership invariant

The `users` collection is global to Zuri identity; do not create one user document per tenant. The `memberships` collection models each user-to-tenant relationship and carries independent status, validity window, roles and optional organization/location scopes. A user may have many active memberships. Session records are tenant-bound and must reference the selected membership. Membership revocation invalidates only sessions bound to that membership; it does not delete the global user or unrelated memberships.

Workspace selection challenges are short-lived, purpose-bound and single-use. Index their identifier uniquely and expire them with a TTL index. Listing choices must filter active tenants and memberships within their validity window.

## 4.2 Core business and catalogue

| Collection | Purpose |
|---|---|
| `business_profiles` | Business identity, contact and localization profile |
| `product_categories` | Product category hierarchy |
| `products` | Product master data |
| `product_variants` | Variant-specific SKU/barcode/pricing attributes |
| `units_of_measure` | Unit codes and conversion metadata |
| `price_lists` | Versioned price lists by scope/channel |
| `tax_profiles` | Jurisdiction-specific tax configuration |
| `tax_codes` | Tax rate/code definitions with effective dates |
| `customers` | Customer accounts and consent metadata |
| `suppliers` | Supplier profiles and terms |

### 4.3 Inventory

| Collection | Purpose |
|---|---|
| `stock_locations` | Warehouses, stores and stock points |
| `stock_movements` | Immutable receipts/issues/transfers/adjustments |
| `stock_balances` | Maintained quantity snapshot by item/location/lot |
| `stock_reservations` | Reserved quantities linked to orders |
| `stock_counts` | Physical counts and count lines |
| `stock_lots` | Lot, batch, expiry and traceability metadata |
| `stock_serials` | Serial-number state and location |
| `stock_transfer_orders` | Transfer lifecycle and line state |
| `reorder_rules` | Reorder thresholds and preferred suppliers |

### 4.4 Sales, till and payments

| Collection | Purpose |
|---|---|
| `quotes` | Quotations and expiry |
| `sales_orders` | Confirmed customer orders |
| `sales` | Sale header and source references |
| `sale_lines` | Sale line snapshots, quantities, pricing and tax |
| `receipts` | Issued receipt/invoice number and immutable snapshot |
| `returns` | Linked return and refund authorization |
| `cash_sessions` | Till open/close and expected cash |
| `cash_movements` | Float, payout, deposit and variance facts |
| `payment_intents` | Requested collection/refund workflow |
| `payments` | Provider/cash/bank payment records |
| `payment_attempts` | Provider attempts and normalized outcomes |
| `payment_webhook_events` | Verified provider callback envelope and dedupe |
| `settlements` | Provider settlement batches and references |
| `reconciliation_runs` | Statement-to-ledger matching runs |
| `reconciliation_items` | Match, mismatch, fee and exception details |

### 4.5 Finance

| Collection | Purpose |
|---|---|
| `accounting_books` | Accounting book and entity scope |
| `chart_of_accounts` | Versioned account hierarchy |
| `financial_periods` | Open/closed periods and close approvals |
| `journal_entries` | Immutable posted journal header |
| `journal_lines` | Debit/credit line detail |
| `posting_rules` | Versioned source-to-ledger mapping |
| `account_balances` | Rebuildable reporting snapshot |
| `receivable_items` | Customer balances and due dates |
| `payable_items` | Supplier balances and due dates |
| `bank_accounts` | Masked account metadata; no online banking passwords |
| `bank_statement_imports` | Uploaded/imported statement metadata |
| `tax_returns` | Tax reporting period and reviewed output |

### 4.6 Procurement, CRM, commerce and people

| Collection | Purpose |
|---|---|
| `purchase_requisitions` | Internal request and approval |
| `purchase_orders` | Supplier order and terms snapshot |
| `goods_receipts` | Receiving and discrepancy |
| `supplier_invoices` | Payables source document |
| `supplier_returns` | Supplier return and credit |
| `crm_leads` | Lead pipeline |
| `crm_opportunities` | Opportunity stage/value |
| `crm_activities` | Calls, meetings and follow-ups |
| `support_cases` | Customer service records |
| `commerce_channels` | Storefront/channel configuration |
| `commerce_orders` | Channel order and fulfilment state |
| `fulfilments` | Shipment/pickup and tracking |
| `employees` | Employee master record |
| `departments` | Department/team hierarchy |
| `positions` | Position definitions |
| `work_schedules` | Shift and roster |
| `attendance_records` | Clock-in/out facts |
| `leave_requests` | Leave request and approval |
| `tasks` | Assignments and workflow state |
| `projects` | Project metadata and milestones |

### 4.7 MAC/MAD, runtime configuration and hosting

| Collection | Ownership | Purpose |
|---|---|---|
| `platform_ecosystems` | platform | Ecosystem registry |
| `platform_products` | platform | Product and module catalog |
| `platform_services` | platform | Service registry, owner, dependencies |
| `platform_environments` | platform | Environment/region metadata |
| `platform_operators` | platform | Global operator metadata |
| `hosting_providers` | platform | Provider registry and capabilities |
| `hosting_projects` | platform | Provider project mappings |
| `provider_credentials` | platform | Encrypted credential envelopes only |
| `deployment_operations` | platform | Deployment/promote/rollback workflow |
| `deployment_environment_variables` | platform | Provider variable metadata; no plaintext secrets |
| `runtime_configurations` | platform/service | Versioned non-secret live config |
| `runtime_secrets` | platform/service | Encrypted envelopes and key version |
| `runtime_config_consumers` | platform | Service identity and allowed keys |
| `config_change_requests` | platform | Change proposal, approval and execution state |
| `config_revisions` | platform | Immutable revision metadata |
| `admin_audit_events` | platform | Global administrative audit facts |
| `admin_alerts` | platform | Alert and acknowledgement lifecycle |
| `approvals` | platform/tenant | Approval requests and decisions |

### 4.8 Integration and AI

| Collection | Purpose |
|---|---|
| `integration_connections` | Provider connection metadata and scopes |
| `webhook_endpoints` | Registered endpoint and secret reference |
| `webhook_deliveries` | Delivery attempt state and retry |
| `event_outbox` | Durable outgoing event envelope |
| `event_inbox` | Consumer deduplication and processing state |
| `ai_providers` | Model provider registry |
| `ai_models` | Model metadata and capability |
| `ai_agents` | Agent definitions and service identity |
| `ai_tools` | Tool/capability catalog |
| `ai_policy_grants` | Agent-specific allowed operations |
| `ai_executions` | Execution metadata, policy decisions and outcome |
| `ai_approvals` | Human approvals for agent actions |
| `marketplace_publishers` | Publisher verification |
| `marketplace_apps` | App listing, version and declared permissions |
| `marketplace_installations` | Tenant installation and granted permissions |

## 5. Critical index plan

Index names should be explicit and stable. The following are baseline patterns; validate against real query plans and data volume.

### Platform and identity
- `tenants`: unique `slug`; `status, createdAt`.
- `memberships`: unique `tenantId, userId, scopeType, scopeId`; `tenantId, userId, status`; `tenantId, organizationId, branchId, status`.
- `sessions`: unique `sessionId`; `userId, revokedAt, expiresAt`; TTL on `expiresAt` only if retention and cleanup semantics permit.
- `invitations`: unique `tokenHash`; `tenantId, status, expiresAt`.
- `role_assignments`: `tenantId, principalId, scopeType, scopeId, status`.
- `audit_events`: `tenantId, occurredAt desc`; `tenantId, actorId, occurredAt desc`; `resourceType, resourceId, occurredAt desc`.

### Inventory
- `products`: unique `tenantId, sku`; `tenantId, status, categoryId`.
- `stock_movements`: unique `tenantId, idempotencyKey`; `tenantId, productId, locationId, occurredAt desc`; `tenantId, sourceType, sourceId`.
- `stock_balances`: unique `tenantId, productId, locationId, lotId`; `tenantId, locationId, productId`.
- `stock_reservations`: unique `tenantId, reservationId`; `tenantId, orderId, status`.

### Sales and payments
- `sales`: unique `tenantId, saleNumber`; `tenantId, branchId, createdAt desc`; `tenantId, customerId, createdAt desc`.
- `payments`: unique `tenantId, paymentId`; unique partial `providerId, providerTransactionId`; `tenantId, status, createdAt desc`.
- `payment_webhook_events`: unique `providerId, eventId`; `processingStatus, receivedAt`.
- `cash_sessions`: `tenantId, branchId, tillId, status`.

### Finance
- `journal_entries`: unique `tenantId, bookId, journalNumber`; unique `tenantId, source.type, source.id, source.postingPurpose`; `tenantId, bookId, postedAt desc`.
- `journal_lines`: `tenantId, bookId, accountId, postedAt`; `tenantId, journalEntryId`.
- `financial_periods`: unique `tenantId, bookId, periodCode`; `tenantId, bookId, status, startDate`.

### Platform configuration
- `runtime_configurations`: unique `serviceId, environment, key, version`; `serviceId, environment, active, key`.
- `runtime_secrets`: unique `serviceId, environment, key, version`; never index plaintext or secret value.
- `config_change_requests`: `environment, status, createdAt`; `requestedBy, createdAt`.
- `deployment_operations`: `providerId, projectId, createdAt desc`; `status, updatedAt`.
- `event_outbox`: `status, nextAttemptAt, createdAt`; unique `eventId`.
- `event_inbox`: unique `consumerId, eventId`.

## 6. Example document contracts

### 6.1 Stock movement
```json
{
  "_id": "movement_01J...",
  "tenantId": "tenant_01J...",
  "organizationId": "org_01J...",
  "locationId": "loc_01J...",
  "productId": "product_01J...",
  "movementType": "receipt",
  "quantity": "12.000",
  "unitCode": "EA",
  "source": {"type": "goods_receipt", "id": "grn_01J..."},
  "idempotencyKey": "goods-receipt:grn_01J...:line:1",
  "occurredAt": "2026-01-01T10:00:00.000Z",
  "actor": {"type": "user", "id": "user_01J..."},
  "schemaVersion": 1
}
```

Quantity encoding in production must be a typed Decimal128 value, not a string; this JSON example is illustrative.

### 6.2 Journal entry
```json
{
  "_id": "journal_01J...",
  "tenantId": "tenant_01J...",
  "bookId": "book_01J...",
  "journalNumber": "JV-000001",
  "currency": "UGX",
  "status": "posted",
  "source": {"type": "sale", "id": "sale_01J...", "postingPurpose": "sale-recognition"},
  "totals": {"debitMinor": 150000, "creditMinor": 150000},
  "postedAt": "2026-01-01T10:00:00.000Z",
  "postedBy": "user_01J...",
  "schemaVersion": 1
}
```

Journal lines are separate immutable records linked by journalEntryId. Use Decimal128 or integer minor units consistently; do not use binary floating point.

### 6.3 Runtime configuration metadata
```json
{
  "_id": "runtimecfg_01J...",
  "serviceId": "zuri-api",
  "environment": "preview",
  "key": "FEATURE_REPORT_EXPORT",
  "valueType": "boolean",
  "value": true,
  "version": 3,
  "active": true,
  "updatedAt": "2026-01-01T10:00:00.000Z",
  "updatedBy": "platform-operator-id",
  "schemaVersion": 1
}
```

Secret values are stored only in encrypted envelopes in a separate collection and are never represented in this plaintext example.

## 7. Transaction boundaries

### Sale completion
Within a MongoDB transaction:
1. Reserve or validate stock.
2. Create sale header/lines.
3. Write stock issue movements and update balance snapshots.
4. Create payment allocation or cash receipt record.
5. Create balanced journal entry/lines when payment/sale recognition rules are ready.
6. Create outbox event(s).
7. Persist idempotency result.
Commit only if all required invariants pass. If external payment authorization is involved, use a saga: do not hold a MongoDB transaction open across a provider network call.

### Goods receipt
Within a transaction:
- Validate purchase order and open quantity.
- Create goods receipt and line records.
- Create stock movement and update balance.
- Create supplier liability/receipt event only according to accounting policy.
- Write outbox event and idempotency record.

### Journal posting
Within a transaction:
- Verify book and period open.
- Verify account status and currency.
- Calculate debit/credit totals using exact arithmetic.
- Reject if unequal.
- Create immutable journal header and lines.
- Link source transaction with unique posting-purpose key.
- Write outbox/audit event.
No update/delete route is allowed for posted journal facts.

### Payment webhook
- Verify signature and timestamp outside the business transaction.
- Insert provider event with unique provider/event ID.
- In transaction, claim/transition payment state, apply settlement/refund effects idempotently, create journal/outbox records and persist result.
- Duplicate delivery returns the previously recorded outcome.

### Runtime configuration change
- Validate key against consumer schema.
- Authorize actor and environment scope.
- Write a new immutable revision and active pointer atomically.
- Write audit event and configuration-changed outbox event.
- Invalidate service cache or notify consumers.
- Preserve prior revision for controlled rollback; never log secret plaintext.

## 8. Data validation and migration

- Use MongoDB collection validators for required fields, types, enums and basic invariants.
- Application Zod schemas validate request and command payloads.
- Migration IDs use timestamped sortable format, e.g. `202611190001_create_runtime_config`.
- Migration runner must be idempotent, serialized and recoverable after partial failure.
- Do not create a redundant unique index on MongoDB `_id`; it is already uniquely indexed.
- Migrations must not drop or rewrite production data without backup, dry-run and explicit approval.
- Large migrations use resumable batches, checkpoints and observable progress.
- Rollback is a forward corrective migration when reversing a data transformation is unsafe.

## 9. Retention, privacy and deletion

- Define retention by record category and jurisdiction before production.
- Security audit, ledger, payment and stock movement history must not be deleted by ordinary tenant administrators.
- Personal data deletion/export must preserve legal accounting/audit obligations and use approved anonymization/pseudonymization where appropriate.
- TTL indexes are only for records with explicit expiry semantics (for example short-lived one-time tokens or temporary locks).
- Do not TTL-delete audit or financial source records by default.
- Backups inherit access controls, encryption and retention policy.

## 10. Sharding and scaling

Do not shard the initial MVP pre-emptively. Start with tenant-scoped indexes and measured query plans. If sharding becomes necessary, choose a shard key from observed distribution and access patterns, likely tenant-aware with high cardinality and controlled hotspot risk. Validate unique index constraints and transaction behaviour under the chosen sharding strategy before migration.

## 11. Test data and verification

Required fixtures:
- Two or more tenants with colliding human-readable IDs and independent memberships.
- Multiple organizations/branches and roles.
- Products with fractional and whole units, lots, serials and expiry.
- Sales, returns, cash sessions and payment callback duplicates.
- Balanced and unbalanced journal attempts.
- Concurrent stock issue/transfer attempts.
- Configuration secrets and masked metadata.
- Outbox retries, duplicate events and failed consumers.

Required tests:
- Tenant isolation on every repository/query family.
- Unique index collision and idempotency.
- Transaction rollback on partial sale/receipt/posting.
- Ledger balance and immutability.
- Inventory movement/balance reconciliation.
- Webhook signature/replay and duplicate delivery.
- Configuration scope, encryption and secret non-disclosure.
- Migration repeatability and recovery.

## 12. Open decisions

- Final internal ID strategy (ObjectId vs UUID/string) by aggregate.
- Canonical monetary representation per domain and currency precision policy.
- Uganda-specific tax/e-invoicing data requirements after qualified review.
- Retention schedules and data residency by jurisdiction.
- Production backup frequency, RPO/RTO and restore validation.
- Offline client storage and encryption implementation.
- Search/indexing technology and whether MongoDB Atlas Search is available within the selected plan.

## 13. Acceptance checklist

- [ ] All tenant-owned collections declare tenant and scope requirements.
- [ ] All critical query patterns have appropriate indexes.
- [ ] MongoDB validators and typed application schemas exist.
- [ ] Ledger, stock and payment workflows have explicit transaction/saga boundaries.
- [ ] Idempotency is enforced at database level for retryable operations.
- [ ] Audit, outbox and inbox collections have lifecycle and retention policies.
- [ ] Secrets are encrypted and never returned in ordinary reads.
- [ ] Migrations are sortable, serialized, idempotent and recoverable.
- [ ] Tenant-isolation, financial-integrity and stock-concurrency tests pass.
- [ ] Backup and restore strategy is documented before production.
