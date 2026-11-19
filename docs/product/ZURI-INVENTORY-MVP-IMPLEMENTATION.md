# Zuri Inventory MVP implementation specification

**Status:** Implemented in the feature branch; CI validation pending.  
**Scope:** First tenant-scoped inventory slice of Zuri OS. This is not yet the complete Stock/Warehouse Management System.

## Implemented domain capabilities

- Tenant product catalogue with SKU uniqueness, base unit, lot-tracking flag and explicit negative-stock policy.
- Organization-scoped stock locations (warehouse, store, stockroom, transit and other).
- Lot creation and lot-bound movements for lot-tracked products.
- Immutable stock movement facts for receipts, issues, adjustments and transfers.
- Atomic Decimal128 balance updates in MongoDB transactions.
- Transfer creates paired source and destination movement facts and a transfer-order record in the same transaction.
- Negative stock is denied by default; a product must explicitly allow it.
- Adjustment movements require a reason and a separate approval permission.
- Unit-of-measure mismatch is rejected. Serial tracking is intentionally disabled until the serial registry and per-unit movement controls are implemented.

## Integrity and security controls

- All reads and writes are tenant-scoped.
- Stock-location reads and writes are organization-scoped through the authenticated membership.
- ABAC deny policies are evaluated in addition to exact permission grants.
- Writes require the Idempotency-Key header. Product, stock-location, lot and movement mutations use the shared MongoDB idempotency transaction.
- Stock balance updates, immutable movement records, audit records, outbox events and idempotency result commit atomically.
- Inventory data reads and writes produce audit events.
- Decimal quantities are represented as strings at API boundaries and Decimal128 in MongoDB; JavaScript floating-point arithmetic is not used for balance mutation.
- Product, stock location, lot, movement, balance, reservation, count and transfer indexes are tenant-scoped.

## API surface

| Method | Endpoint | Permission |
|---|---|---|
| GET | /v1/inventory/products | inventory.products.read |
| POST | /v1/inventory/products | inventory.products.create |
| GET | /v1/inventory/locations | inventory.locations.read |
| POST | /v1/inventory/locations | inventory.locations.create |
| POST | /v1/inventory/lots | inventory.lots.create |
| GET | /v1/inventory/balances | inventory.balances.read |
| GET | /v1/inventory/movements | inventory.movements.read |
| POST | /v1/inventory/movements | inventory.movements.create; transfers and adjustments require additional permissions |

All POST mutations require a unique Idempotency-Key header. Transfer requests must provide source and destination stock location IDs; both must belong to organizations the principal can access.

## Deferred capabilities

The following are intentionally not claimed as implemented:

- Stock reservation/commit/release and allocation against sales orders.
- Full stocktake/count sessions, variance approval and reconciliation.
- Serial-number registry, serial scans and unit-level custody.
- Unit-of-measure conversion and alternate pack sizes.
- FIFO/FEFO allocation, expiry alerts, batch recall and quarantine workflows.
- Inventory valuation (FIFO/weighted average), landed cost and COGS integration.
- Purchase orders, goods-received notes and supplier returns.
- Sales/POS integration, customer returns and refunds.
- Warehouse tasks, picking, packing, dispatch, shipment and delivery confirmation.
- Replenishment policies, min/max levels, demand planning and forecasting.
- Inter-tenant stock movement and cross-company consolidation.

## Next delivery sequence

1. Add inventory UI for products, locations, lots, receipts, issues, transfers and balance history.
2. Implement stock reservations and stocktake/count workflows with approval and reconciliation.
3. Add unit conversions, serial tracking, expiry/FEFO and quarantine.
4. Integrate procurement and goods-received notes.
5. Integrate Zuri Till/POS, Zuri Pay and sales returns.
6. Implement inventory valuation, COGS and double-entry Zuri Ledger postings.
7. Complete performance, concurrency, tenant-isolation, backup/restore and operational acceptance.

No inventory deployment or production activation is performed by this feature branch.
