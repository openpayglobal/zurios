# Zuri MeBuMIP API

The versioned API contract is maintained at [docs/api/mebumip-openapi.yaml](../../docs/api/mebumip-openapi.yaml).

Fastify API workspace for Zuri MeBuMIP.

## Local configuration

- `MONGODB_URI`: MongoDB connection URI.
- `MONGODB_DATABASE`: database name (defaults to `zuri_mebumip`).
- `PLATFORM_BOOTSTRAP_TOKEN`: one-time platform owner bootstrap secret, at least 32 characters. Supply through a deployment secret manager; never commit it.
- `MFA_ENCRYPTION_KEY`: optional 32-byte AES-256 key encoded as 64 hexadecimal characters. Required to enable TOTP MFA; keep it in a secret manager and back it up securely.
- `AUDIT_SIGNING_KEY`: legacy HMAC-SHA256 verification key; retain while historical events depend on it.
- `AUDIT_SIGNING_KEYRING`: optional JSON map of key IDs to 32-byte hex keys. A `legacy` entry may contain the original legacy key bytes encoded as even-length hex.
- `AUDIT_SIGNING_ACTIVE_KEY_ID`: selects a non-legacy 32-byte key for new HMAC-SHA256-v2 event signatures and export manifests. Keep all historical keys available for verification and back them up separately from MongoDB.
- `RESEND_API_KEY` and `MAIL_FROM`: required in production for invitation and password-recovery delivery. The sender address must belong to a verified sending domain in Resend. Never commit these values.
- `SESSION_TTL_HOURS`: session lifetime, 1–168 hours (defaults to 24).
- `SESSION_COOKIE_SAME_SITE`: `Strict`, `Lax` (default) or `None`; `None` is appropriate only for cross-site HTTPS deployments.
- `TRUSTED_PROXY_CIDRS`: optional comma-separated proxy IPs/CIDRs. Set only to known reverse proxies so IP-based rate limits do not trust spoofed forwarded headers.
- `CORS_ORIGINS`: comma-separated exact web origins.

The current API contract is documented in [docs/api/mebumip-openapi.yaml](../../docs/api/mebumip-openapi.yaml). Signed audit archive packages can be prepared through `GET /v1/mac/audit-events/archive?fromSequence=N&toSequence=M`; this verifies every event signature and contiguous sequence, then downloads a content-addressed package. It is **prepared, not independently archived**. A concrete immutable-storage provider, retention policy and legal-hold mode still require approval and configuration.

The API binds to `API_HOST` / `API_PORT` (defaults `0.0.0.0:4100`). Configure `CORS_ORIGINS` to the exact frontend origins. Production must terminate TLS, use secure cookies, and configure only trusted proxy CIDRs when deployed behind a reverse proxy. Liveness is available without a database; readiness stays unavailable until MongoDB indexes and route registration succeed.

## Initial owner bootstrap

Configure `PLATFORM_BOOTSTRAP_TOKEN` securely, start the API with MongoDB available, then call:

```http
POST /v1/platform/bootstrap
Content-Type: application/json

{
  "bootstrapToken": "<secret>",
  "email": "platform-owner@example.com",
  "password": "<at-least-12-character-password>",
  "displayName": "Platform Owner",
  "companyName": "Blockchain Innovations LTD",
  "tenantSlug": "blockchain-innovations"
}
```

Bootstrap creates the first platform owner, the company tenant and its tenant-owner membership. The database enforces a single platform-owner record. Subsequent owner creation is refused. Keep the bootstrap secret out of source control and remove it from the deployment environment after successful setup.

## Authentication endpoints

- `POST /v1/auth/login`: returns a short-lived opaque bearer token.
- `GET /v1/auth/me`: returns the authenticated user's platform role and active tenant memberships.
- `POST /v1/auth/logout`: revokes the current bearer session.
- `POST /v1/auth/refresh`: rotates the current bearer token.
- `GET /v1/auth/sessions` and `DELETE /v1/auth/sessions/:sessionId`: list and revoke the authenticated user’s sessions.
- `POST /v1/auth/password/change`: changes password and revokes other sessions.
- `POST /v1/auth/password/recovery`: requests a generic, non-enumerating email recovery message.
- `POST /v1/auth/password/reset`: consumes a hashed, 30-minute, one-time reset token and revokes all sessions.
- `POST /v1/auth/mfa/setup` (with current password) and `/v1/auth/mfa/enable`: configure TOTP MFA. Enrollment confirmation expires after 15 minutes.
- `POST /v1/auth/step-up`: verifies TOTP or consumes one single-use recovery code for a five-minute privileged-action window.
- `POST /v1/auth/mfa/reset`: requires current password plus an unused recovery code, disables the factor and revokes all sessions so the user must re-enroll. MFA enablement returns ten recovery codes once; only their hashes are stored.

Browser sessions are issued as `HttpOnly` session cookies with a separate session-bound CSRF cookie; state-changing cookie-authenticated requests must send `x-csrf-token`. Cookies use `SameSite=Lax`, `Secure` in production, and a bounded max age. The API retains bearer-token compatibility for trusted non-browser clients; production login does not return the bearer token in JSON. Only a SHA-256 session token hash is persisted. Passwords use salted scrypt hashes.

## MAC and MAD endpoints

- `GET /v1/mad/overview`: authenticated platform metrics read; read-only aggregates only.
- `GET /v1/mac/tenants`: platform tenant directory read.
- `GET /v1/mac/tenants/:tenantId/members`: MAC member and pending-invitation directory.
- `POST /v1/mac/tenants/:tenantId/invitations`: MFA-gated email invitation.
- `PATCH /v1/mac/tenants/:tenantId/members/:userId` and `DELETE /v1/mac/tenants/:tenantId/members/:userId`: MFA-gated membership role/status/removal controls; tenant owners are protected.
- `DELETE /v1/mac/tenants/:tenantId/invitations/:invitationId`: MFA-gated invitation revocation.
- `GET /v1/mac/admins`: platform administrator directory read.
- `GET /v1/mac/admin-invitations` and `POST /v1/mac/admin-invitations`: list/create MFA-gated, email-delivered platform administrator invitations.
- `POST /v1/mac/admin-invitations/accept` and `DELETE /v1/mac/admin-invitations/:invitationId`: existing-user acceptance and audited invitation revocation.
- `POST /v1/auth/register-platform-admin`: one-time invited registration for a new platform administrator.
- `GET /v1/mac/settings`: safe runtime configuration status; secret values are never returned.
- `PATCH /v1/mac/admins/:userId`: platform-owner-only role/status updates for existing platform administrators; requires recent MFA step-up. The platform owner is immutable through this route. Suspending an administrator revokes their active sessions.
- `POST /v1/mac/tenants`: create a tenant and assign an existing active user as tenant owner; requires platform tenant-write permission and writes an audit event.
- `GET /v1/mac/audit-events`: latest audit events, with sensitive fields excluded.
- `GET /v1/mac/audit-events/verify`: verifies HMAC signatures on the latest 500 records and reports unsigned/invalid counts.
- `GET /v1/auth/sessions` and `DELETE /v1/auth/sessions/:sessionId`: inspect and revoke active sessions, with device label metadata.
- `GET /v1/mac/audit-events/export`: paginated, bounded audit export with per-record integrity status; exports are not automatically archived.

MAC is the privileged control plane. MAD is a read-only monitoring surface. All routes perform server-side authorization; hiding a UI link is not a security control. Tenant member routes are available under `/v1/tenants/:tenantId/members` and `/v1/tenants/:tenantId/invitations`; invited new users register through `/v1/auth/register`, while existing users accept through `/v1/tenant-invitations/accept`. Membership changes and invitations require recent MFA step-up. Tenant invitations are sent through the configured Resend adapter; raw invitation tokens are never returned by the API. Failed delivery revokes the pending invitation. Password recovery uses the same provider and does not reveal whether an email address exists. CI uses an in-memory test mail sink. Invited users without an account can register through `/v1/auth/register`; existing users can accept the invitation after signing in. A MongoDB-backed fixed-window rate limiter applies stricter policies to bootstrap, login and MFA verification, plus a general API policy. Audit events have no TTL deletion policy and can be paginated using `limit` and `before`.

## Current limitations — not production-ready

This is an implementation foundation, not a complete identity/security programme. Before public launch, add email verification and live Resend credentials and verified sender-domain configuration (the adapter is implemented, but delivery is not active until configured), device metadata and production proxy/origin review, stricter audit immutability/export controls, backup/restore verification, security review and database-backed integration tests. Tenant-specific business and Meta routes remain disabled until every handler resolves tenant scope from the verified principal and enforces tenant permissions.

Never log or return password hashes, bootstrap secrets, access tokens, Meta credentials, message content or raw authorization headers.


## Automated verification

The Phase 1 GitHub Actions workflow provisions an ephemeral MongoDB 7 service and runs the database-backed integration suite together with API typecheck/tests/build and web typecheck/build. CI-only bootstrap, MFA and audit keys are test fixtures, not production credentials. The integration suite covers owner bootstrap/login, MFA enrollment and one-time recovery-code replay prevention, invitation registration and replay rejection, cross-tenant access denial, and audit signature verification.


## Audit-chain maintenance and archive tooling

The audit chain is globally sequenced, predecessor-linked and HMAC-signed. Production must configure either the legacy signing key or the versioned keyring with an active key ID; retain all verification keys required by historical events. The API refuses to append when an unbackfilled legacy history or a missing chain predecessor is detected.

Run the backfill planner first. It is read-only by default:

```sh
pnpm --filter @zuri/mebumip-api audit:backfill
```

After independently verifying a database backup, approving the migration and scheduling a maintenance window, the explicit apply is:

```sh
AUDIT_CHAIN_BACKFILL_APPLY=true pnpm --filter @zuri/mebumip-api audit:backfill
```

The migration is limited to 5,000 valid, genuinely unsequenced legacy events. It refuses mixed histories, partial chain metadata, malformed required audit fields and larger histories; it never fabricates actor identity or event descriptions. Do not run apply automatically at startup or in CI. A larger history requires a separately reviewed migration plan.

After migration, verify the complete chain and counter:

```sh
pnpm --filter @zuri/mebumip-api audit:verify
```

When a clean chain is confirmed, export a signed bundle to a new file and independently verify it:

```sh
AUDIT_ARCHIVE_OUTPUT=/secure/audit-archive.json pnpm --filter @zuri/mebumip-api audit:archive
AUDIT_ARCHIVE_FILE=/secure/audit-archive.json pnpm --filter @zuri/mebumip-api audit:archive:verify
```

The export file is not itself immutable storage. Upload only after verification to a separately administered object-lock/WORM store with retention, legal-hold, versioning, restore testing and signing-key backup controls. No production backfill or archive upload is performed by these commands automatically.
