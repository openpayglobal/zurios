# Zuri OS — Technical Architecture Specification

**Document ID:** ZURI-ARCH-001  
**Version:** 1.0  
**Status:** Baseline for implementation review  
**Architecture owner:** OIPTECH / ODEL Developers  
**Repository:** https://github.com/openpayglobal/zurios  
**Database:** MongoDB only  
**Primary stack:** TypeScript, React, Vite, Tailwind CSS, Node.js, Fastify

## 1. Architecture objectives

The architecture must deliver a coherent multi-tenant business platform while remaining implementable by a small team with zero additional recurring infrastructure spend. It must protect tenant data, preserve financial and inventory correctness, support modular product activation, and allow provider substitution without rewriting domain logic.

The initial implementation is a **modular monolith with explicit module boundaries**, not a premature fleet of microservices. Deployable boundaries may be extracted only when independent scaling, isolation, release cadence or operational ownership justifies the additional cost and complexity.

## 2. System context

### 2.1 External actors
- Business users, tenant administrators, employees and managers.
- Customers and suppliers using explicitly authorized portals.
- Platform operators using MAC/MAD.
- Approved payment, banking, messaging, tax, shipping and identity providers.
- Approved AI model providers and external tools.
- Developers and marketplace publishers.

### 2.2 Logical architecture
1. **Experience layer:** React/Vite browser application, responsive workspace, future PWA/offline client and approved mini-app channels.
2. **API edge:** Fastify HTTP API, OpenAPI 3.1 contract, authentication, authorization, validation, rate limiting and request correlation.
3. **Application layer:** use-case orchestration, workflow state machines, transaction boundaries and policy enforcement.
4. **Domain modules:** core, inventory, POS, finance, procurement, CRM, commerce, people, workforce, documents, insight, MAC/MAD and extensions.
5. **Platform services:** identity, tenant context, RBAC/ABAC, audit, idempotency, outbox/event bus, configuration, entitlements, notification and provider registry.
6. **Persistence:** MongoDB collections, indexes, validators, transactions and migration registry.
7. **Adapters:** payment, messaging, AI, hosting, shipping, tax, storage and external APIs.
8. **Operations:** CI, deployment, health checks, logs, metrics, backup/restore and incident runbooks.

### 2.3 Trust boundaries
- Browser to API: untrusted client; authenticate and validate every request.
- Tenant to tenant: strict data boundary; never trust client-provided tenant identifiers.
- API to MongoDB: service credential with minimum database privileges.
- API to provider: outbound adapter with scoped secret and explicit timeout/retry policy.
- Webhook to API: untrusted external input; signature, timestamp, replay and idempotency validation.
- AI agent to tools: capability allowlist, scoped identity, policy check, budget and human approval.
- MAC to infrastructure: privileged control plane; MFA, just-in-time elevation, dual approval and audit.

## 3. Repository and package boundaries

Target structure:

```text
apps/
  web/                 React/Vite application shell and feature routes
  api/                 Fastify API composition and HTTP adapters
packages/
  core-platform/       Identity, tenant, policy, audit, idempotency, outbox
  contracts/           Shared schemas, API/event contracts and versioning
  ui/                  Shared design system and accessible components
  domain-inventory/    Inventory domain logic
  domain-sales/        POS and sales domain logic
  domain-finance/      Ledger and finance domain logic
  domain-commerce/     Commerce and order domain logic
  domain-people/       People/workforce domain logic
  provider-sdk/        Provider adapter interfaces and shared helpers
  agent-governance/    Agent policy and tool execution controls
providers/
  payments/
  messaging/
  hosting/
  ai/
  tax/
  shipping/
docs/
  product/
  architecture/
  database/
  ux/
  security/
  operations/
tests/
  fixtures/
  e2e/
infrastructure/
  ci/
  deployment/
  backup/
```

The existing repository may evolve incrementally. Do not create empty packages solely to match this diagram; create them when the first implementation is ready and CI can validate them.

## 4. Runtime topology

### 4.1 Zero-cost development topology
- Local Node.js + pnpm workspace.
- Local MongoDB replica set for transaction-dependent integration tests.
- React/Vite dev server and Fastify API process.
- GitHub Actions for automated validation within available quota.
- Existing Vercel preview projects only when quota permits.
- Synthetic test data only; no real customer financial or personal records.

### 4.2 Initial hosted topology
- Web frontend and API are separate Vercel projects.
- API runs Node.js/Fastify and connects to MongoDB Atlas over TLS.
- Secrets are configured in the hosting provider for the relevant deployment environment.
- Atlas network access must use an approved bounded ingress strategy before production.
- Provider credentials remain server-side.
- Production promotion is a separate owner-approved release action.

### 4.3 Portability
All business modules depend on provider-neutral interfaces. Deployment configuration, storage, payments, messaging and AI providers are adapters. The domain layer must not import Vercel SDKs or provider-specific SDKs directly.

## 5. Application composition and request lifecycle

For every request:
1. Assign or validate a correlation/request ID.
2. Apply body-size, content-type, timeout and rate limits.
3. Validate origin/CSRF requirements for browser session flows.
4. Authenticate the user or service identity.
5. Resolve active tenant and membership from trusted server-side state.
6. Evaluate role permissions and ABAC resource predicates.
7. Validate request schema and idempotency key where required.
8. Execute application use case within an explicit transaction boundary.
9. Persist domain state and outbox events atomically when the operation requires durable event delivery.
10. Write security/business audit metadata.
11. Return a safe response with no secret or internal stack disclosure.

No route may bypass this pipeline without a documented health/public endpoint exception.

## 6. Domain architecture

Each domain module owns its commands, queries, invariants, data access and event contracts. Cross-domain writes must go through application services or versioned events, not ad hoc collection mutation.

### 6.1 Core
Owns tenants, organizations, workspaces, branches, memberships, users, roles, policies, entitlements and platform configuration.

### 6.2 Inventory
Owns products, variants, units, locations, stock movements, balances, reservations, counts, batches and serials. Stock balance is derived/maintained from movement records through idempotent transactions. Every mutation has a source reference and actor.

### 6.3 Sales/POS
Owns quotations, sales orders, sales, receipts, returns, cash sessions, till movements and shift close. A sale completion coordinates inventory reservation/issue, payment allocation and finance posting through a durable workflow.

### 6.4 Finance
Owns chart of accounts, journals, journal lines, periods, posting rules, tax mappings, settlement records and reconciliation. Posted journals are immutable; correction is by reversal/adjustment. Journal posting requires balanced debits and credits.

### 6.5 Procurement
Owns suppliers, requisitions, purchase orders, goods receipts, supplier invoices and supplier returns. Receiving stock and posting payables are separate, linked operations with idempotency and discrepancy handling.

### 6.6 CRM/Commerce/People
Own customer and supplier interaction records, catalogue channels, orders, fulfilment, employee records and workforce operations. Sensitive HR and customer fields have explicit field-level permissions.

### 6.7 MAC/MAD
Own global ecosystem registry, platform operators, providers, project/environment metadata, configuration requests, approvals, deployment operations, platform alerts and administrative audit. MAC is the control plane; MAD is the operational picture and command workspace.

## 7. API design

- Base path: `/v1` for versioned public/business APIs.
- OpenAPI 3.1 is the contract source of truth.
- Use JSON request/response payloads with explicit schemas.
- Use stable error codes and safe error messages.
- Use cursor pagination for unbounded lists.
- Use idempotency keys for payment, posting, webhook, provisioning and other retryable mutations.
- Use optimistic concurrency/version fields for mutable administrative resources.
- Use webhooks/events for asynchronous cross-module workflows.
- Enforce authorization in service layer and route boundary.
- Document authentication, required permissions, tenant scope, request examples, response examples and error cases for every operation.

Logical route groups:
- `/v1/auth/*`
- `/v1/platform/tenants/*`
- `/v1/platform/organizations/*`
- `/v1/platform/memberships/*`
- `/v1/platform/roles/*`
- `/v1/platform/policies/*`
- `/v1/inventory/*`
- `/v1/sales/*`
- `/v1/pos/*`
- `/v1/finance/*`
- `/v1/payments/*`
- `/v1/procurement/*`
- `/v1/crm/*`
- `/v1/commerce/*`
- `/v1/people/*`
- `/v1/reports/*`
- `/v1/admin/*`
- `/v1/integrations/*`
- `/v1/agents/*`

The existing API may expose unprefixed compatibility routes during transition. New routes should be versioned and documented; compatibility routes must have a deprecation plan.

## 8. Identity, tenancy and authorization

### 8.1 Identity
- Passwords stored using a modern adaptive password hash.
- Access tokens short-lived; refresh tokens rotated, hashed at rest and revocable.
- Session records include device/session metadata, created/last-seen/expiry and revocation.
- MFA secret material encrypted with a separate key.
- Invitation, password reset and email verification tokens are single-use, hashed at rest and time-limited.
- Service and agent identities are distinct from human identities.

### 8.2 Tenant resolution
Tenant scope is derived from authenticated identity, membership and requested active context. Client-supplied tenant or organization IDs are only selectors; they are checked against membership before any data access. Queries for tenant-owned data must include the authorized scope predicate.

### 8.3 RBAC and ABAC
- Permission catalog is action-oriented.
- Role assignment is scoped and time-bound where appropriate.
- ABAC evaluates actor, action, resource, environment and contextual attributes.
- Deny overrides allow; absent policy is deny.
- Global platform roles are never inherited by tenant roles.
- High-impact role grants require elevated authorization and audit.

### 8.4 MAC privilege model
- Separate platform owner, platform security admin, platform operations, auditor and read-only observer roles.
- MFA mandatory for privileged operators.
- Just-in-time elevation for high-impact actions.
- Dual approval for production secrets, identity-policy changes, production deployment, destructive resource deletion and financial configuration.
- Break-glass access is time-limited, reason-coded and immediately alerted.

## 9. Data consistency and event architecture

### 9.1 Transaction boundaries
Use MongoDB transactions for operations requiring atomic updates across multiple collections, including ledger posting, stock issue/receipt with corresponding balances, idempotency reservation and outbox insertion. These flows require a replica-set-capable deployment.

### 9.2 Transactional outbox
Domain state and outbox event are committed together. A worker claims events with lease/lock metadata, publishes using an idempotent event ID, and marks delivery. Retries use bounded exponential backoff; exhausted events are visible in a dead-letter state. Consumers deduplicate by event ID.

### 9.3 Event envelope
Every event includes:
- `id`, `type`, `version`, `occurredAt`
- `tenantId` and authorized scope identifiers where applicable
- `aggregateType`, `aggregateId`, `aggregateVersion`
- `correlationId`, `causationId`
- `actorType`, `actorId`
- `data` with schema version
- `sensitivity` and retention metadata

Never place secrets, raw credentials or unnecessary personal data in events.

### 9.4 Sagas and compensations
Long-running flows (payment settlement, order fulfilment, onboarding, deployment) use persisted state machines with explicit timeout, retry, compensation and manual-review states. A compensation is a new business action, not deletion of prior evidence.

## 10. Financial and inventory invariants

### Financial
- Debits equal credits for every posted journal.
- Journal lines reference a valid account, currency and legal/accounting scope.
- Posting is idempotent by source transaction and posting purpose.
- Posted records cannot be edited/deleted.
- Reversal references the original posting and preserves history.
- Financial period close prevents unauthorized backdated postings.
- Currency precision and rounding are explicit by currency and tax rules.

### Inventory
- Every stock change has a movement record.
- Quantity is represented with defined precision and unit conversions.
- Transfers have linked issue and receipt states.
- Reservations cannot exceed available stock unless policy explicitly permits backorder.
- Concurrent mutations use conditional updates/transactions to prevent oversell.
- Lot/serial/expiry controls are enforced when enabled.
- Reconciliation compares calculated movement totals with maintained balances.

## 11. Runtime configuration and secrets

### 11.1 Bootstrap configuration
The API requires secure bootstrap values to start: MongoDB URI/database, JWT issuer/audience/secret, MFA encryption key, environment and CORS policy. These must be supplied via deployment secret management or secure local environment.

### 11.2 Deployment-scoped variables
Vercel variables are consumed by a deployment. Changing them does not mutate already-running deployments; a new deployment is required. MAC must show pending deployment state and record which configuration revision was consumed.

### 11.3 Live runtime configuration
Only approved non-bootstrap settings are stored in MongoDB-backed versioned configuration. Services authenticate with service identity and fetch only their allowed keys. Secret values are encrypted using envelope encryption with a separately provisioned root key. A bounded cache and revision polling provide freshness; emergency revocations must invalidate or fail closed. Browser applications never receive secret values.

### 11.4 Configuration write workflow
Validate schema → authorize scope → preview diff → require approval where applicable → write versioned record → audit → invalidate cache/publish revision event → confirm consumer acknowledgement/freshness. A failed provider synchronization remains pending/failed and is retryable without duplicate changes.

## 12. Provider adapter contracts

Each provider adapter exposes capability discovery and normalized operations. Provider-specific features must be declared, not simulated.

### Payment adapter
Create intent, query status, capture/confirm where supported, refund, verify callback, fetch settlement, reconcile. Must normalize provider transaction IDs, amounts, currency, fee, settlement status and failure reasons.

### Hosting adapter
Discover account/projects, inspect deployment, create preview, read logs, configure environment variables, promote/rollback and map domains only where supported. Deployment-scoped variable changes explicitly require redeployment.

### Messaging adapter
Send transactional message, receive webhook, delivery status, template management and consent enforcement.

### AI adapter
Model metadata, inference, token/cost usage, structured output and supported tool-calling capability. All tools remain under Zuri policy.

## 13. MAC/MAD architecture

Canonical route: `/mac`; MAD is a first-class workspace within MAC.

MAC is responsible for:
- Ecosystem, product, service and entitlement registry.
- Platform operators, roles, policies and approvals.
- Tenants, environments, regions and provider mappings.
- Provider credentials and health metadata.
- Deployment operations and release gates.
- Environment variables, runtime configuration and secret metadata.
- Database, API, webhook and integration inventories.
- AI provider/model/agent governance.
- Security incidents, audit and break-glass.
- Observability, quotas and cost reporting.

MAD summarizes health, deployment status, database/API status, security exceptions, payments/integration failures, agent activity, quotas and pending approvals. Unknown/stale data is never shown as healthy.

## 14. Offline-first design

Offline support is opt-in per workflow. The client maintains an encrypted local queue with:
- Tenant and device binding.
- Client-generated operation ID and idempotency key.
- Creation time and schema version.
- Explicit pending/synced/conflict/rejected state.
- Server acknowledgement and canonical resource reference.

Only low-risk workflows with well-defined merge semantics may be queued. Ledger posting, permission changes, secret changes, settlement and other high-impact operations require server connectivity and fresh authorization. Conflict resolution must be explicit and auditable.

## 15. Security architecture

Threats include cross-tenant access, privilege escalation, credential theft, replay, injection, insecure direct object references, webhook spoofing, malicious marketplace apps, AI prompt/tool injection, secret leakage, supply-chain compromise and denial of service.

Controls:
- Threat model for each major domain.
- Input validation and output encoding.
- Rate limiting, request size limits and timeouts.
- Secure headers and CORS allowlist.
- CSRF protection for cookie-based browser sessions.
- Content Security Policy and dependency review.
- Secret scanning and least-privilege service credentials.
- Audit trails and security alerting.
- Signed webhooks, replay windows and idempotency.
- Tenant isolation and authorization regression suites.
- AI tool allowlists, scoped credentials, human approval and output validation.
- Marketplace publisher review and per-app permissions.
- Backups encrypted and restore tested.

## 16. Observability and operations

- Structured JSON logs with request/correlation IDs.
- Redaction of authorization headers, tokens, secrets and sensitive personal data.
- Health liveness and readiness endpoints; readiness includes actual MongoDB ping.
- Metrics for request count, latency, errors, database operations, outbox lag, queue age and reconciliation exceptions.
- Trace correlation across API, background workers and provider calls.
- Alerts for authentication abuse, privilege changes, outbox backlog, payment mismatch, ledger imbalance, backup failure and deployment health.
- Every dashboard metric has source, freshness, scope and confidence.
- Runbooks for incident triage, credential rotation, restore and rollback.

## 17. CI/CD and release model

CI validates:
1. Frozen pnpm install.
2. Formatting/lint.
3. TypeScript typecheck.
4. OpenAPI 3.1 lint and route drift.
5. Unit and MongoDB-backed integration tests.
6. Build.
7. Fastify liveness/readiness smoke test using CI-only MongoDB.
8. Secret scan and dependency review when available within existing free tooling.

Release:
- Feature branch → PR → review → green CI → merge to integration branch.
- Preview deployment only when quota permits.
- Verify health, logs and migration status.
- Production promotion requires explicit owner approval, rollback plan and release checklist.
- No production deployment is authorized by this architecture document alone.

## 18. Architecture decision register

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | MongoDB-only application database | Adopted |
| ADR-002 | TypeScript-first monorepo | Adopted |
| ADR-003 | Modular monolith first; extract services only when justified | Adopted |
| ADR-004 | Tenant isolation + default-deny RBAC/ABAC | Adopted |
| ADR-005 | Double-entry immutable ledger | Adopted |
| ADR-006 | Transactional outbox for durable event delivery | Adopted |
| ADR-007 | Provider-neutral adapters | Adopted |
| ADR-008 | MAC/MAD as global control plane and operational dashboard | Adopted |
| ADR-009 | Deployment variables and live runtime configuration are distinct planes | Adopted |
| ADR-010 | Zero-additional-cost constraint for initial development | Adopted |

## 19. Architecture acceptance checklist

- [ ] Every domain has a clear owner and data boundary.
- [ ] Tenant scope is derived from trusted identity/membership.
- [ ] RBAC and ABAC are enforced in service/API code.
- [ ] All high-impact mutations are idempotent and auditable.
- [ ] Ledger and inventory invariants are implemented and tested.
- [ ] Outbox delivery is durable, retryable and deduplicated.
- [ ] Secrets are encrypted, masked and not exposed to browser or logs.
- [ ] Runtime configuration has a secure non-circular bootstrap.
- [ ] Provider adapters declare actual capabilities and limitations.
- [ ] Offline workflows have explicit conflict and authorization rules.
- [ ] CI validates contracts, code, data flows and health.
- [ ] Production readiness is evidence-based and separately approved.

## 20. Open engineering decisions

These require measurement, testing or owner approval rather than assumptions:
- Exact SLOs and capacity targets.
- Local encrypted storage technology for offline client.
- Production key custody/KMS when budget is available.
- Backup retention and recovery point/time objectives.
- Uganda-specific tax, e-invoicing and payment-provider requirements.
- Hosting/network ingress strategy compatible with free-tier constraints.
- Whether and when to extract any module into an independent service.
