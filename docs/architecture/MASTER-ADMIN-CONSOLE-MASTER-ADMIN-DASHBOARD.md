# Zuri OS Master Admin Console (MAC) and Master Admin Dashboard (MAD)

**Status:** Adopted platform architecture requirement; implementation must be delivered in controlled increments.  
**Scope:** Global Zuri OS ecosystem control plane, including first-party products, platform services, tenants, environments, infrastructure providers, and approved external integrations.

## 1. Foundational decision

Zuri OS has two related but distinct global administration surfaces:

- **Master Admin Console (MAC):** the authoritative management, configuration, policy, and execution interface for the entire Zuri OS ecosystem.
- **Master Admin Dashboard (MAD):** the executive operational command centre for observing ecosystem condition, activity, risk, capacity, service health, and decisions requiring attention.

MAC is the control plane. MAD is the operational picture and command surface. MAD may initiate approved workflows, but it does not bypass MAC policies, authorization, approvals, or audit controls.\n\n**Canonical web entry point:** `https://zurios.vercel.app/mac`. This route is the entry point for the MAC experience and its integrated MAD dashboard. MAD is a first-class workspace/view within the MAC shell; it does not use a separate public administration URL unless a future route decision explicitly establishes one.

These are global platform capabilities, not ordinary tenant-admin screens. Tenant administrators remain restricted to their own tenant and authorized resources.

## 2. MAC management domains

MAC is the single administrative entry point for the following domains:

1. Ecosystem registry, products, modules, services, versions, lifecycle and feature entitlements.
2. Tenant, organization, workspace, environment and regional configuration.
3. Identity, SSO, MFA, sessions, global administrators, RBAC, ABAC and policy administration.
4. Hosting and cloud-provider registry, credentials, capability discovery, projects and resource inventories.
5. Deployment orchestration, previews, production releases, approvals, rollbacks and release gates.
6. Domains, DNS, certificates, TLS and routing.
7. Database infrastructure, MongoDB clusters, database users, connection health, backups, restore and disaster recovery.
8. API registry, API versions, OpenAPI contracts, gateways, rate limits, service credentials and webhooks.
9. Environment variables, runtime configuration, secret vault, rotation and provider synchronisation.
10. Payments, financial providers, settlement configuration and reconciliation controls.
11. Integrations, connectors, marketplace applications and external-provider permissions.
12. AI providers, models, agents, tool permissions, budgets, policies and human-approval thresholds.
13. Security posture, audit, compliance, incident management and vulnerability remediation.
14. Observability, logs, traces, metrics, alerting, service-level objectives and cost allocation.
15. Global settings, localization, currencies, feature flags, notifications, support and platform communications.

Provider adapters are required. Vercel is the initial hosting provider, not the permanent or exclusive provider. The architecture must allow additional approved providers without changing the MAC domain model.

## 3. MAD executive and operational views

MAD presents a consolidated, current operational picture:

- Ecosystem availability and service-health map.
- Product, module, tenant and environment status.
- Deployment pipeline, release history, failed builds, rollbacks and change windows.
- Hosting-provider, project, domain, DNS and certificate status.
- MongoDB health, connection saturation, replication, backups and recovery readiness.
- API health, latency, error rates, contract status and traffic.
- Security posture, privileged access, policy violations, open incidents and audit exceptions.
- Payments and integration health, failed webhooks and reconciliation exceptions.
- AI agent activity, tool execution, policy denials, escalations and spending.
- Capacity, resource consumption, costs, quotas and forecast risks.
- Pending approvals, critical alerts, maintenance windows and executive decisions.

Every metric must identify its source, freshness, scope and confidence. Missing telemetry must be shown as unknown, not healthy.

## 4. Environment and secrets management

MAC includes a dedicated **Environment & Secrets Management** workspace. It manages configuration across products, projects, providers, tenants, regions and deployment environments.

### 4.1 Required capabilities

- Create, update, validate, version, deprecate and rotate configuration entries.
- Classify entries as public configuration, sensitive configuration, secret, credential, key material or deployment-only value.
- Bind values to a product, project, service, environment, region and provider.
- Select deployment targets: development, preview, production and approved custom environments.
- Support branch-specific preview values.
- Discover and reconcile variables already configured in Vercel.
- Synchronize deployment-scoped variables through the provider adapter.
- Display key names, classifications, target scopes, version, last-updated time and synchronization state without revealing secret values.
- Validate required variables against each service's configuration schema before deployment.
- Detect missing, duplicate, stale, conflicting and unused variables.
- Support controlled rotation, rollback to an approved prior version and expiry notifications.
- Record actor, reason, approval, target, provider response and result in immutable audit events.
- Provide dry-run and change-diff views before applying configuration.
- Prevent secret values from appearing in browser payloads, logs, telemetry, error messages, analytics or audit metadata.

### 4.2 Two distinct configuration planes

The product must not misrepresent Vercel's native environment-variable behaviour.

**A. Deployment environment variables**

These are managed through the hosting provider's environment-variable API and are available to a subsequent deployment. Changing a Vercel project environment variable does not mutate the process environment of an already-running deployment. MAC must show the change as pending application until a new deployment has consumed it.

The MAC workflow is:

1. Authorize the operator and target scope.
2. Validate the variable name, type, value and target environment.
3. Show a masked change preview and impact assessment.
4. Obtain the required approval for sensitive or production changes.
5. Write the variable to the provider using the provider adapter.
6. Verify provider acceptance and reconcile metadata.
7. Mark the change as awaiting deployment.
8. Trigger or schedule a preview/production deployment under the applicable release policy.
9. Verify the deployment consumed the intended configuration version.
10. Record completion or failure in MAD and the audit ledger.

**B. Live runtime configuration**

This plane provides the requested ability to change approved runtime settings without rebuilding or redeploying the application.

- Runtime values are stored in a dedicated encrypted configuration service, backed initially by MongoDB-native collections.
- Services retrieve configuration server-side through an authenticated runtime configuration provider.
- A configuration revision/version is assigned to each accepted change.
- Services refresh configuration at request boundaries or through a bounded cache with explicit freshness guarantees. Critical security revocations must support immediate invalidation or fail-closed behaviour.
- Secret values are never returned to browser clients.
- The runtime provider enforces service identity, project/environment scope, tenant boundaries, key-level permissions and audit.
- Configuration consumers must declare a schema, allowed keys, types, defaults, refresh policy and whether restart/redeployment is required.
- Changes to live configuration are distinguishable from deployment variables in the UI and API.

**Important boundary:** not every infrastructure value can safely become a database-backed runtime setting. The initial MongoDB connection URI, the configuration encryption root key or KMS identity, and other bootstrap dependencies must be available before the runtime configuration service can be reached. They require secure bootstrap provisioning and a controlled rotation procedure. MAC must not create a circular dependency by storing the only credentials needed to unlock its own configuration store inside that same locked store.

### 4.3 Initial bootstrap values

For the current Fastify API, initial deployment requires:

- `NODE_ENV`
- `MONGODB_URI`
- `MONGODB_DATABASE`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_SECRET` (minimum 32 characters)
- `MFA_ENCRYPTION_KEY` (base64-encoded 32-byte key in production)
- `CORS_ORIGINS`

The MongoDB URI must identify an approved Zuri OS database. Use a dedicated least-privilege database user, TLS and a network path with a bounded trust perimeter. Do not make an unrestricted Atlas network rule a default deployment workaround.

The Vercel integration credential must be stored as a secret in the credential vault or provisioned through an approved OAuth/OIDC integration. It must not be exposed to the browser or written to logs. Its permissions should be limited to the projects and operations MAC is authorized to manage.

## 5. Provider integration architecture

Define a provider-neutral contract, with a Vercel adapter as the first implementation. The contract should cover:

- Authentication and credential health.
- Account/team and project discovery.
- Environment-variable list/create/update/delete and metadata reconciliation.
- Deployment creation, status, build logs, runtime logs and events.
- Deployment promotion, rollback and alias assignment.
- Project settings, framework, build configuration and runtime version.
- Domain, DNS, certificate and routing operations where supported.
- Quotas, provider capabilities and known plan limitations.

Each operation must return a normalized result with provider request ID, resource reference, status, timestamp and safe error details. Provider-specific limitations must be surfaced rather than silently emulated.

## 6. Security and governance controls

- Separate global platform administration from tenant administration.
- Enforce RBAC and ABAC on every MAC/MAD API request, not only in the UI.
- Use default-deny permissions and explicit resource scopes.
- Require MFA for privileged platform operators.
- Apply just-in-time elevation and short-lived credentials where supported.
- Use dual control for high-impact production changes, secret-root rotation, identity-policy changes and destructive infrastructure operations.
- Use encrypted-at-rest secret storage with envelope encryption and versioned key identifiers; prefer a managed KMS/HSM for production key custody.
- Store fingerprints and metadata for secret comparison; never log or return plaintext secrets after submission.
- Maintain append-only audit records for all administrative reads of sensitive metadata and all changes/executions.
- Use idempotency keys, concurrency control and approval expiry for administrative operations.
- Require dry-run, blast-radius preview, rollback plan and health checks for high-risk changes.
- Separate break-glass access, require reason and time limit, and alert MAD immediately.
- Keep provider credentials and runtime secrets isolated by environment and project; prohibit preview-to-production credential reuse unless explicitly approved.

## 7. MongoDB-native data model

The initial logical collections are:

| Collection | Purpose |
|---|---|
| `platform_ecosystems` | Ecosystem and product registry |
| `platform_services` | Service registry, owners, dependencies and health contracts |
| `platform_environments` | Environment and region registry |
| `hosting_providers` | Provider registry, capabilities and connection state |
| `hosting_projects` | Provider project mapping and deployment configuration |
| `provider_credentials` | Encrypted provider credentials and rotation metadata |
| `deployment_environment_variables` | Provider variable metadata, scope and sync status; no plaintext secret values |
| `runtime_configurations` | Versioned non-secret runtime configuration |
| `runtime_secrets` | Encrypted runtime secret envelopes and key-version metadata |
| `runtime_config_consumers` | Service identity, allowed keys, schema and refresh policy |
| `config_change_requests` | Proposed changes, approvals, validation and execution state |
| `config_revisions` | Immutable configuration revision metadata |
| `deployment_operations` | Deployment, promotion and rollback operation records |
| `admin_audit_events` | Append-only global administrative audit events |
| `admin_alerts` | MAD alerts, acknowledgements and escalation state |

All records must include explicit scope identifiers and lifecycle timestamps. Unique indexes, tenant/platform boundaries, retention and TTL policies must be defined before implementation. Secret-bearing collections must use strict schema validation and field-level encryption or envelope encryption; database encryption at rest alone is not sufficient.

## 8. API surface to implement

The API must be versioned and permission-guarded. Initial route groups:

- `/platform/admin/ecosystems`
- `/platform/admin/services`
- `/platform/admin/environments`
- `/platform/admin/providers`
- `/platform/admin/hosting/projects`
- `/platform/admin/hosting/deployments`
- `/platform/admin/hosting/rollbacks`
- `/platform/admin/config/variables`
- `/platform/admin/config/runtime`
- `/platform/admin/config/secrets`
- `/platform/admin/config/rotations`
- `/platform/admin/approvals`
- `/platform/admin/audit`
- `/platform/admin/alerts`
- `/platform/admin/overview`

Read endpoints return metadata by default. A secret's plaintext may only be accepted on a write operation over TLS and must never be returned by a read endpoint. Every write operation must have authorization, validation, idempotency, audit and explicit result state.

## 9. Release and acceptance gates

1. Global MAC/MAD authorization cannot be bypassed by tenant roles.
2. A tenant administrator cannot discover or mutate another tenant's configuration or provider credentials.
3. Secret values are masked and cannot be read back through ordinary list/get APIs.
4. Vercel environment-variable changes are clearly marked as requiring a new deployment to affect an existing deployment.
5. Runtime configuration changes can be applied without redeployment and are observable by the target service within the declared freshness bound.
6. Bootstrap configuration remains recoverable without circular dependency.
7. Every production secret change has a traceable approval and rotation record.
8. Provider failures and partial synchronizations are visible and retryable without duplicate writes.
9. Deployments cannot be promoted without the required tests, health checks and release approvals.
10. MAD shows stale or missing telemetry as unknown, never as healthy.
11. All admin APIs have OpenAPI 3.1 contracts, authorization tests, MongoDB integration tests, idempotency tests and audit assertions.
12. No secret is committed to Git, embedded in frontend assets or printed in CI/Vercel logs.

## 10. Current API deployment relationship

The API remains a separately deployable Fastify service using the native Vercel Fastify framework detection and the existing `apps/api/src/server.ts` entrypoint. The root pnpm workspace lockfile remains authoritative. The deployment project must build the API and its `@zuri/core-platform` workspace dependency from the monorepo root.

A successful CI smoke test against a CI-only MongoDB replica set is not evidence that the production API is connected to MongoDB Atlas. Live deployment readiness requires an approved Atlas cluster, secure network access and all required production bootstrap variables. No production deployment may be represented as ready until `/health/ready` confirms the production database connection.
