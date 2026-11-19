# Zuri domain contracts

This package is the versioned contract boundary for ERP (6B), POS (6C) and Inventory (6D). It intentionally contains schemas and shared event names only; domain persistence, API routes and workflows are introduced in their gated implementation phases.

All money is integer minor units with an ISO-style uppercase currency code. Quantities are integer thousandths to avoid binary floating-point quantity drift. Commands carry tenant scope, idempotency key and correlation identity. Domain events carry schema versions and tenant identity.

- ERP: chart-of-accounts metadata, fiscal periods, balanced journal entries, invoices, payment allocations and purchase-order contracts.
- POS: sale lines, completed-sale tender reconciliation and event names.
- Inventory: warehouse, stock movement, stock balance, valuation, reorder policy and reservation contracts; transfers require distinct warehouses and adjustments require an auditable reason.

No domain package may bypass the shared tenant, RBAC/ABAC, audit, idempotency or transactional outbox services.
