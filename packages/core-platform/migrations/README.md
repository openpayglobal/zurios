# MongoDB migration convention

Migrations are versioned, immutable TypeScript modules. Each migration exports a unique `id`, a description, and an `up(db)` function. The runner records applied IDs in `schema_migrations` and refuses duplicate IDs. Run migrations with a least-privileged deployment identity and back up production data first.

Use MongoDB transactions for multi-document invariants; transactions require a replica set or sharded cluster. Never assume a standalone local MongoDB server supports transactions.
