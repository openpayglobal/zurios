# ERP, POS and Inventory domain boundaries

The @zuri/domain-contracts package is the shared schema boundary for phases 6B, 6C and 6D. It intentionally contains no persistence, HTTP routes or cross-domain writes yet. Those implementations remain gated by 6A.6 security and operational acceptance.

## Shared command and event invariants

- Every command is tenant-scoped and carries an idempotency key, correlation ID and UTC issue timestamp.
- Every event carries tenant ID, event ID, event type, schema version, occurrence time, correlation ID and idempotency identity.
- Money is represented as integer minor units with an uppercase three-letter currency code; no binary floating-point money.
- Quantity is represented as integer thousandths to avoid binary floating-point quantity drift.
- Domain services must use the shared RBAC/ABAC, audit, idempotency and transactional outbox capabilities.
- Cross-domain communication uses versioned commands/events; a domain never writes another domain's collections.

## Bounded contexts

### 6B — ERP

ERP owns the chart of accounts, fiscal periods, journals, general ledger, accounts payable/receivable, supplier/customer invoices, payment allocations, purchase orders, tax and financial reporting. The current contract package defines fiscal periods, invoice totals and allocation identity in addition to journals and purchase orders. Journal entries must balance debit and credit totals, use a single currency per entry and reference a fiscal period. Posted entries require a timestamp; reversals reference the original entry.

ERP consumes inventory receipt and valuation events and emits purchase-order, invoice and journal events. Inventory remains the source of truth for physical stock.

### 6C — POS

POS owns terminal registration, cashier shifts, carts, sales, tenders, receipts, voids, refunds and offline command synchronization. The current contracts define terminal identity, cash-shift close reconciliation and refund limits in addition to sale/tender reconciliation. Completed sales require captured tenders equal to the sale total. Tax and discounts reconcile to integer minor-unit totals.

POS requests inventory reservations and consumption through commands; it does not decrement stock by writing inventory data directly. It emits sale, refund and tender events for ERP accounting and analytics.

### 6D — Inventory

Inventory owns warehouses, SKU stock ledger, reservations, transfers, receipts, issues, adjustments, stock availability, valuation and replenishment. The current contracts define stock-balance arithmetic, valuation totals and min/reorder/max thresholds. A transfer must identify distinct source and destination warehouses. Adjustments require an auditable reason. Stock ledger entries are append-only; corrections are compensating movements.

Inventory consumes approved ERP purchase receipts and POS reservation/consumption commands. It emits stock received, issued, transferred, adjusted, reserved and consumed events.

## Implementation order

1. Complete 6A.6: execute the ABAC backfill in a controlled window, independent security review, tenant-isolation matrix, backup/restore drill, operational alerts and incident runbooks.
2. Implement Inventory ledger and reservation services first because POS and ERP receipt workflows depend on reliable stock authority.
3. Implement ERP purchasing/AP and double-entry posting against Inventory receipt events.
4. Implement POS checkout/tender/refund flows against Inventory reservation/consumption commands.
5. Add reconciliation, reporting, offline sync, provider integrations and cross-domain end-to-end acceptance.

The schemas currently in the domain-contracts package are the first contract increment. They do not imply that any of these business workflows are production-ready.
