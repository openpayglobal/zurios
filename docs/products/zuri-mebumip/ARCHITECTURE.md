# Zuri MeBuMIP — Architecture

## 1. Product boundary

Zuri MeBuMIP is a standalone product with its own deployable frontend and API boundary. It may initially live in the Zuri OS pnpm/Turborepo monorepo as an isolated workspace. It must not be implemented as a feature that can only run inside Zuri OS.

External integrations use versioned, authenticated APIs and webhooks. A Zuri OS adapter is one client of those interfaces, not a privileged shortcut around authorization.

## 2. Logical components

- **Web application:** tenant workspace, onboarding, social management, advertising, WhatsApp, integrations and settings.
- **MAC:** master administration console for privileged platform configuration and operations.
- **MAD:** read-oriented operational dashboard and reporting surface.
- **API:** Fastify routes, request validation, authentication and authorization.
- **Tenant and identity service:** tenant membership, roles, invitations, sessions and policy evaluation.
- **Meta integration service:** provider-specific OAuth/login, asset discovery, API clients, token lifecycle and permission scopes.
- **Webhook ingress:** HTTPS endpoints, signature verification, deduplication and durable event intake.
- **Event/worker layer:** asynchronous webhook processing, retries, scheduled publishing and reporting jobs.
- **Audit service:** append-only records for security-sensitive and administrative actions.
- **Integration API:** versioned REST endpoints and outbound webhook subscriptions for Zuri OS and external systems.

## 3. Multi-tenant data model

Every tenant-owned record must carry a server-derived `tenantId`. Never accept a client-supplied tenant identifier as authorization.

Initial collections (subject to detailed schema ADRs):
- `tenants`
- `users` / `memberships`
- `roles` / `roleBindings`
- `metaConnections`
- `metaAssets`
- `oauthStates`
- `webhookEvents`
- `messageConversations` / `messages`
- `publishingJobs`
- `adAccounts` / `campaignReferences`
- `integrationClients` / `webhookSubscriptions`
- `auditEvents`
- `platformSettings` (strictly MAC-only)

Use compound indexes beginning with tenant scope for tenant-owned collections. Enforce unique external identifiers within the appropriate tenant/provider context. Apply retention and deletion policies to customer data and tokens.

## 4. Authorization model

- Default deny.
- Authenticate the user or service first.
- Resolve tenant membership from verified identity/session.
- Check role permission and resource-level policy for every operation.
- Master administration requires explicit platform-level roles and strong authentication.
- Tenant administrators cannot grant platform-level roles.
- Support separation of duties for sensitive MAC operations.
- Log actor, action, target, tenant context, timestamp, outcome and correlation ID.
- Do not log access tokens, secrets, message bodies or unnecessary personal data.

## 5. Credential and OAuth security

- OAuth state must be cryptographically random, short-lived, single-use and bound to the initiating session and tenant.
- Validate redirect URIs against a strict allowlist.
- Exchange authorization codes server-side.
- Encrypt provider tokens with a managed key/envelope-encryption design; store key references, never keys in source control.
- Restrict token access to the Meta integration service.
- Track scopes, expiry, provider asset grants, last validation and revocation state.
- Support disconnect, token revocation where supported, and data cleanup.
- Never expose long-lived tokens to browser JavaScript or external integration clients.

## 6. Webhook processing

- Verify Meta signature against the raw request body and configured app secret.
- Reject invalid signatures and malformed payloads.
- Persist/deduplicate event receipt before acknowledging according to provider requirements.
- Use provider event IDs where available; otherwise compute a stable idempotency fingerprint.
- Process asynchronously with bounded retries and dead-letter visibility.
- Keep tenant routing derived from a verified connection/asset mapping, not from untrusted payload fields alone.
- Record delivery and processing outcomes without leaking message content.

## 7. MAC and MAD boundary

MAC routes require platform-admin permissions, step-up authentication for high-risk changes, CSRF protection where cookie sessions are used, and audit events. MAD queries should be read-only by default and aggregate data with tenant privacy safeguards. Dashboard widgets must not bypass the same authorization layer used by APIs.

## 8. Meta API adapter boundary

Create provider-neutral internal interfaces and a Meta-specific adapter. Pin supported Graph API versions in configuration, centralize version selection, and test API contract changes. Each product capability declares its required permissions. Request only scopes necessary for the enabled feature. Handle rate limits, transient errors, permission loss, unsupported asset types and version retirement explicitly.

## 9. Deployment and configuration

Keep separate development, staging and production environments. Validate configuration at startup. Secrets are injected through deployment secret management and never stored in Git. Provide health/readiness endpoints, structured logs, metrics, tracing/correlation IDs and alerting. Data backups and restoration tests are mandatory before production.

## 10. Architecture decision constraints

- MongoDB remains the approved application database in alignment with the current Zuri OS foundation.
- Do not store raw payment card data.
- Billing provider integration must be isolated behind an adapter.
- No customer asset is connected without explicit customer authorization.
- No live Meta API call is required for local Phase 1 development; use deterministic mocks and contract fixtures.
