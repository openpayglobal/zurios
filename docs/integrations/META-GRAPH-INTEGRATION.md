# Meta Graph integration — implementation contract

**Status:** OAuth and encrypted connection lifecycle foundation implemented; Facebook Page and Instagram asset operations are not yet accepted or production-enabled.

## Current request flow

1. A signed-in tenant owner or tenant administrator starts `POST /v1/tenants/{tenantId}/meta/oauth/start`. The caller must have `meta:connections:write` and a live MFA step-up.
2. The API allowlists the requested permissions, pins the configured Graph API version and constructs the provider authorization URL. The one-time state is random, expires after five minutes by default, and is persisted only as SHA-256.
3. The state record binds the exact tenant, user, session, callback URI and sorted requested scopes. The callback first checks the same authenticated user/session and current tenant permission. It consumes the state atomically before calling Meta.
4. The authorization code is exchanged, the user token is debug-validated against the configured app ID, and all requested permissions must be granted. The service then exchanges for a long-lived token and validates the identity/permissions again.
5. The token is encrypted with AES-256-GCM using the dedicated Meta keyring. Authenticated associated data binds the envelope to the tenant ID and connection ID. The database record stores only the ciphertext.
6. The API returns a token-free connection summary. Listing is tenant-scoped. Revocation requires a recent MFA step-up, clears ciphertext and commits with its audit event in one transaction.

## API routes

| Method | Route | Required permission | Additional control |
|---|---|---|---|
| POST | `/v1/tenants/{tenantId}/meta/oauth/start` | `meta:connections:write` | Recent MFA step-up; dedicated OAuth initiation rate limit |
| GET | `/v1/meta/oauth/callback` | Original tenant's `meta:connections:write` | Same user and session as initiation; state single-use; recent MFA step-up |
| GET | `/v1/tenants/{tenantId}/meta/connections` | `meta:connections:read` | Tenant isolation |
| DELETE | `/v1/tenants/{tenantId}/meta/connections/{connectionId}` | `meta:connections:write` | Recent MFA step-up; token cleared transactionally |

The authoritative machine-readable contract is [MeBuMIP OpenAPI](../api/mebumip-openapi.yaml).

## Configuration and key separation

The Meta routes are not registered unless all required provider and token-vault configuration is valid:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` — HTTPS outside local development; HTTP is permitted only for explicit loopback development configuration.
- `META_GRAPH_API_VERSION` — explicit version, never an unpinned default.
- `META_TOKEN_ENCRYPTION_KEYRING` — JSON object of key IDs to 32-byte hex keys.
- `META_TOKEN_ENCRYPTION_ACTIVE_KEY_ID` — must name a non-legacy key in that ring.
- Optional `META_LOGIN_CONFIG_ID` for a separately configured Meta Business Login flow.

Meta token keys must be different from MFA encryption keys and audit signing keys. Retain old Meta keys while ciphertext encrypted under them remains in storage; rotate stored connection envelopes before removing an old key. Do not put the keyring in source control or a client bundle.

## Security properties and operational boundaries

- OAuth state is hashed at rest, short-lived, one-time and bound to the initiating authenticated session.
- Redirect URI is fixed by server configuration; it is not caller-controlled.
- Requested permissions are allowlisted and stored with the state. The callback validates the exact requested set, not a caller-supplied callback scope list.
- OAuth initiation and callback have dedicated database-backed rate-limit windows.
- Provider fetches use the pinned Graph version, no redirects, omitted credentials/cookies, no-store caching and no referrer. App Secret Proof is required for Graph API requests.
- Provider errors are normalized; tokens and app secrets are not returned in API payloads or application warning logs.
- Access-token ciphertext is tenant/connection-bound using AES-256-GCM authenticated associated data.
- Connection create/revoke and OAuth state create/consume are audited transactionally.
- No token is exposed through connection list, create or revoke responses.

## Not yet implemented or accepted

This foundation does **not** mean the following features are complete:

- Facebook Page discovery and Page-to-business association.
- Instagram Business/Creator account discovery and eligibility validation.
- Page publishing, media upload, scheduling, comments and inbox management.
- Meta webhooks, signature verification, event deduplication, replay protection and subscription lifecycle.
- Token health monitoring, scheduled expiry/data-access-expiry handling, reauthorization UX and automated key rotation operations.
- Marketing API campaign/ad-account management.
- WhatsApp Business API onboarding, templates, messaging or webhook processing.
- Meta App Review, business verification, privacy policy/data-deletion workflows, permissions approval and production security review.
- End-to-end frontend connect/disconnect experience and production provider smoke tests.

These remain gated on Meta developer configuration, approved permissions, privacy/legal review, operational monitoring and explicit production authorization. No live Meta account has been connected by this implementation.

## Verification evidence required for acceptance

- Route integration tests prove same-session callback binding, tenant isolation, step-up enforcement, single-use state, exact permission validation, encrypted storage, token non-disclosure, revocation and audit integrity.
- Unit tests cover Graph transport, OAuth token validation, App Secret Proof and key-vault behavior.
- CI must pass at the exact branch head, including API tests, monorepo typecheck/tests/build and OpenAPI 3.1 validation.
- Before production: complete Meta App Review and legal prerequisites; set production secrets in the secret manager; register exact callback URLs; test against a dedicated Meta test app/business; validate Page/Instagram permissions and webhooks; review retention/deletion and incident procedures; obtain owner approval.
