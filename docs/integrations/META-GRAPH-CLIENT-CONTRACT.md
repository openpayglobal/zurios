# Meta Graph API Client Contract

**Status:** Tenant-authorized OAuth and Facebook Page discovery foundation implemented; not a live Meta integration approval  
**Applies to:** Zuri MeBuMIP Objective A and shared Meta provider operations  
**Owner:** Blockchain Innovations LTD

## 1. Scope

The MeBuMIP API now has a reusable Meta Graph transport client in `apps/mebumip-api/src/meta-graph-client.ts`. It is deliberately limited to transport concerns:

- Explicit version pinning on every request.
- HTTPS requests to the official `graph.facebook.com` origin.
- Bearer-token authorization headers; access tokens are rejected in query/body parameters.
- Provider error normalization with code, subcode, type and trace ID.
- Bounded retries for transient GET requests only, including Meta temporary/throttling codes 1, 2, 4, 17 and 341.
- No automatic retry for POST/DELETE operations.
- Retry-After support for rate limits.
- Safe pagination that accepts only the official Graph API host and the same configured version, and strips an embedded access token before replay.
- App Secret Proof (`HMAC-SHA256(accessToken, appSecret)`) when the app is configured to require it; raw app secrets are never sent to Graph API.
- Redirects, cookies, cache and referrers are disabled on outbound requests.
- Token and app-secret redaction in provider error messages.

A dedicated AES-256-GCM Meta token vault, tenant-scoped encrypted connection persistence, audited connection key rotation/disconnect, tenant/user/session-bound OAuth state, authenticated OAuth start/callback routes, code exchange, app/token/scope validation, Page discovery, linked Instagram Business metadata, Page-token encryption, asset reconciliation and Page-token rotation are implemented. This does not yet implement publishing, Page/Instagram management actions, Marketing API operations, WhatsApp or webhook processing. Those remain separate services and acceptance gates.

## 2. Version governance

The constructor requires an explicit version in the form `vN.N`; it has no unversioned/default fallback. Do not hardcode a version in a route or tenant record. The integration configuration must select one Graph API version centrally after checking endpoint compatibility, permissions and the current Meta changelog. Marketing API version selection remains separate.

The 20 November 2026 research snapshot identifies Graph API v27.0 on Meta's landing/versioning pages, while the changelog's latest Graph API row was v26.0. This discrepancy is recorded in [Meta Platform Integration Readiness](./META-PLATFORM-INTEGRATION-READINESS.md). The feature-branch implementation pins v27.0 explicitly; before production, verify every required endpoint against the current changelog and obtain an approved version decision.

## 3. Request contract

- Pass the token only through `accessToken`; the client sets `Authorization: Bearer ...`.
- When a configured app secret is supplied, the client calculates App Secret Proof internally; callers cannot override `access_token` or `appsecret_proof` parameters.
- Pass a relative Graph resource path, e.g. `me/accounts` or `page-id/feed`. Absolute URLs, query fragments, traversal segments and duplicated version prefixes are rejected.
- GET requests may use bounded retries for network failures, HTTP 429/5xx, provider-marked transient errors and Meta temporary/throttling codes 1, 2, 4, 17 and 341.
- POST/DELETE are never automatically retried. Mutating application services must use idempotency keys and an outbox where external effects are involved.
- Form fields are encoded as URL-encoded body parameters. Never put raw access tokens, app secrets or webhook secrets in ordinary Graph resource query/body fields; the Graph client uses the Authorization header and generates appsecret_proof internally. Meta's documented OAuth token-exchange endpoint is a protocol-specific GET that requires client_secret and a temporary code/token in its query; it is sent only to the exact HTTPS Graph origin with redirects disabled, generic errors and no URL logging. Egress/APM access logs must redact client_secret, code and fb_exchange_token.
- Provider errors are normalized and redact access tokens, app secrets and App Secret Proof; raw authorization headers and tokens must never be logged.

## 4. Pagination contract

Use `requestNext(nextUrl, accessToken)` for Graph paging links. It validates HTTPS, the exact Graph API host and the configured version. It ignores any `access_token` parameter embedded in the provider URL and sends the supplied token through the authorization header. Do not follow arbitrary provider-supplied hosts.

## 5. Reliability and operational boundaries

- Per-tenant fairness, distributed rate budgets, queueing and dead-letter handling belong in the provider job layer, not in this low-level client.
- Mutating requests require an application-level idempotency key and explicit permission/step-up checks.
- Retryable GET failures must be bounded and observable by status, provider code, trace ID and tenant-safe correlation ID; do not log tokens or full personal-data payloads.
- API version upgrades require contract tests and a staged release; do not change the configured version merely because a newer version appears on the landing page.
- The client is dependency-injected for deterministic tests. Tests do not call Meta or require live credentials.

## 6. Verification

`meta-graph-client.test.ts` covers explicit versioning, token-header handling, App Secret Proof, credential parameter rejection, traversal/absolute-path rejection, Meta transient/throttle GET retries, malformed 429/5xx retry, no POST/DELETE retry, provider-error redaction and same-host/same-version pagination. `meta-token-vault.test.ts`, `meta-connections.integration.test.ts`, `meta-assets.integration.test.ts`, `meta-routes.integration.test.ts`, `meta-provider.test.ts`, `config.meta.test.ts`, `meta-oauth-state.integration.test.ts` and `rate-limit.test.ts` cover tenant-bound user/Page token encryption, rotation, OAuth state, same-session callback, remote revoke success/failure, Page pagination/reconciliation, local token erasure, route authorization and rate limits.

## 7. Remaining Objective A work

1. Complete Page-level management: Page details/ownership verification, asset-specific capability checks, publishing, media upload, scheduling, comments and inbox.
2. Complete Instagram Business/Creator eligibility and permission validation, insights and publishing workflows. The linked Instagram ID/username is discovered from each Page but account eligibility is not yet accepted.
3. Implement the Meta Business Login HTTP flow for business onboarding and asset selection; the current route exposes standard OAuth only.
4. Implement webhook signature verification, durable inbox, deduplication, replay controls, subscription lifecycle and deauthorization callbacks.
5. Implement token health monitoring, expiry/data-access-expiry jobs, reauthorization UX and scheduled key-rotation orchestration. Transactional key-rotation helpers exist but are not scheduled.
6. Complete frontend connect/disconnect/discovery UX and end-to-end provider smoke tests.
7. Complete Meta App Review, business verification, privacy/data-deletion and Tech Provider approvals before live customer access.

Objectives B–E remain separate phases. Marketing API requires its own version and spend safeguards; WhatsApp requires consent/template/webhook lifecycle; multi-business SaaS and external integrations require their own acceptance suites.


## App Secret Proof and transport controls

The client accepts an app secret only through its server-side constructor options. When configured, it computes `appsecret_proof = HMAC-SHA256(accessToken, appSecret)` and adds the derived proof to each request; callers cannot override `access_token` or `appsecret_proof` through query/body parameters. A provider paging URL has both credential parameters stripped and the proof is regenerated for the current token. Set `requireAppSecretProof: true` when the Meta app has Require App Secret enabled; construction fails if the secret is absent. The raw app secret and access token must remain in a secret manager/token vault, never in browser code, logs, database URLs or query strings.

Requests disable redirects, cookies, caching and referrers. Redirects fail closed so credentials are never forwarded to an unreviewed redirect target. Automatic retries remain GET-only; POST/DELETE operations are never retried because their side effects may not be idempotent.

Official Meta references checked 2026-11-21:
- Graph API documentation currently identifies `v27.0` as the latest version: https://developers.facebook.com/docs/graph-api/
- Meta recommends `appsecret_proof`, an HMAC-SHA256 of the access token using the app secret, for server-side Graph API requests and documents the Require App Secret setting: https://developers.facebook.com/docs/graph-api/guides/secure-requests
- Meta's error-handling guidance documents provider error codes, transient errors and rate-limit recovery: https://developers.facebook.com/docs/graph-api/guides/error-handling


## Configuration-backed factories

`createConfiguredMetaGraphClient()` binds the configured Graph API version and, whenever a Meta app ID is configured, requires the app secret and enables App Secret Proof. `createConfiguredMetaOAuthService()` binds the versioned login URL, code exchange and long-lived-token exchange to the registered redirect URI and optional Business Login config ID. `createConfiguredMetaTokenVault()` parses the dedicated Meta token keyring; `MetaConnectionService` persists only AES-256-GCM envelopes with tenant/connection associated data, and OAuth state is hashed, session-bound and one-time. `getMetaIntegrationReadiness()` reports only presence/version flags and never returns app secrets, webhook verification tokens or key material.

The tenant-authorized OAuth start/callback, code exchange, encrypted user-token persistence, Facebook Page discovery, linked Instagram account metadata, encrypted Page-token storage, asset reconciliation and audited local disconnect are implemented. No live Meta account is connected and no live Page/Instagram mutation is enabled by this work. See [Meta Graph Integration Implementation Contract](./META-GRAPH-INTEGRATION.md) for current route behavior and acceptance gaps.

The client also checks Meta's `facebook-api-version` response header when present and rejects a version mismatch instead of silently accepting a provider-side version change.


## Token vault and OAuth state foundation

- `MetaTokenVault` uses AES-256-GCM with a dedicated `META_TOKEN_ENCRYPTION_KEYRING` and `META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID`. Each envelope contains a format version, key ID, IV, authentication tag and ciphertext; no plaintext token is stored in the envelope.
- Authenticated associated data binds the ciphertext to the tenant ID, connection ID, envelope version and key ID. Moving ciphertext to another tenant/connection fails authentication.
- The vault can decrypt retained old key IDs and re-encrypt under the active key. Config validation rejects reuse of MFA-encryption or audit-signing key material.
- `MetaOAuthStateService` stores only a SHA-256 hash of a random 256-bit state, binds it to tenant/user/session/redirect URI, expires it after five minutes by default, and consumes it with one atomic conditional update. MongoDB has unique state-hash, TTL and context-lookup indexes.
- `meta-provider.ts` supplies config-backed Graph-client/token-vault factories and secret-safe readiness diagnostics. The app ID/secret, explicit Graph version, HTTPS redirect URI and dedicated token key ring remain optional until the owner provisions a Meta app; if an app ID is configured, incomplete settings fail config validation.

The vault, connection persistence service, state store, OAuth HTTP routes and Page discovery are integration-tested against disposable MongoDB. No connected customer account, webhook subscription or live Meta permission is claimed.


## 8. OAuth protocol boundary

The authorization dialog and token exchange are implemented as a server-side service and exposed through tenant-authorized OAuth start/callback routes. Meta's OAuth token endpoint documentation specifies GET query parameters for code and long-lived-token exchange; therefore client_secret, authorization code and fb_exchange_token are necessarily present in the outbound URL to Meta. The service restricts the origin to HTTPS graph.facebook.com, pins the API version, disables redirects/cookies/cache/referrers, applies a timeout, emits generic errors and never logs the URL. Production egress/APM logging must redact these query parameters. Ordinary Graph resource calls continue to carry access tokens in the Authorization header.

