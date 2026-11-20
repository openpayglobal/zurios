# @zuri/core-platform

Shared MongoDB-native platform services for Zuri OS.

Services currently include tenant lifecycle, organizations, locations, memberships, sessions, roles/permissions, ABAC evaluation, audit events and tenant feature flags.

Import these services from API/application adapters. Do not call them directly from untrusted browser code. Derive tenantId from a verified authenticated principal at the server boundary. Service methods do not replace API authentication or authorization middleware.

MongoDB transactions require a replica set or sharded deployment. Validate concurrency, tenant isolation and referential constraints before production use.

## Webhook delivery worker

`@zuri/core-platform` provides the durable webhook queue, leased batch dispatcher, bounded retry/dead-letter handling and replay. Run the API's dedicated worker process with `pnpm --filter @zuri/api webhooks:worker` (or deploy `apps/api/scripts/run-webhook-worker.ts` as a separate long-running process). The worker resolves `env://ZURI_WEBHOOK_SECRET_<NAME>` references from runtime-injected environment secrets and rejects all other reference forms. Configure each secret in the deployment platform's secret manager with at least 32 random characters; do not store secret values in MongoDB or source control. Set `WEBHOOK_WORKER_ID`, `WEBHOOK_WORKER_BATCH_SIZE` and `WEBHOOK_WORKER_POLL_INTERVAL_MS` as needed. This environment resolver is a narrow deployment adapter, not a claim of a particular cloud-vault integration; replace it with the approved provider SDK when the production secret manager is selected.
