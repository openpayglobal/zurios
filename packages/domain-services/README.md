# Zuri domain services

This package implements the first transactional service layer for Inventory (6D), ERP (6B) and POS (6C). All commands are tenant-scoped, idempotent and execute domain writes, audit records and outbox writes in a MongoDB transaction. It is a service foundation, not a production-complete business suite.

## Inventory

- Register tenant-scoped warehouses.
- Record receipts, issues, adjustments and two-leg transfers in an append-only stock ledger.
- Maintain on-hand, reserved and available projections with version checks and non-negative/available-stock invariants.
- Reserve, commit/consume and release stock atomically; reservation and ledger writes are tenant scoped.
- Emit versioned outbox events for stock movements and reservations.

## ERP

- Register chart-of-account entries and non-overlapping fiscal periods.
- Create purchase orders with line-total/tax reconciliation.
- Create invoices with integer minor-unit subtotal/tax/total invariants.
- Allocate invoice payments without overpayment.
- Post balanced journal entries only to active accounts and open fiscal periods; journal posting is immutable and evented.

## POS

- Register terminals and enforce one open cashier shift per terminal.
- Open/close cashier shifts with cash reconciliation.
- Complete tender-reconciled sales, optionally committing the corresponding Inventory reservation in the same MongoDB transaction.
- Process partial refunds with an atomic cumulative-refund cap.
- Accept idempotent, sequenced offline command envelopes.

## Required production work

- Add authenticated Fastify routes, OpenAPI contracts, RBAC/ABAC permissions and audit coverage for every command.
- Add full lot/serial/expiry, inventory costing and replenishment workflows.
- Add supplier/customer master data, AP/AR, tax, credit notes, bank reconciliation, period close and reporting.
- Integrate payment-provider capture/refund, receipts and device authentication.
- Implement ordered offline replay and conflict-resolution UX.
- Add external event secret-manager integration, worker deployment, metrics, alerting and operator runbooks.
- Complete the 6A.6 security, isolation, backup/restore and independent acceptance gates before production use.

All database operations assume a MongoDB replica set. The integration test suite uses MONGODB_TEST_URI and a disposable test database. The cross-domain integration test passed in Actions run #805.
