# Zuri MeBuMIP API

Fastify API workspace for Zuri MeBuMIP.

## Local configuration

- `MONGODB_URI`: MongoDB connection URI.
- `MONGODB_DATABASE`: database name (defaults to `zuri_mebumip`).
- `PLATFORM_BOOTSTRAP_TOKEN`: one-time platform owner bootstrap secret, at least 32 characters. Supply through a deployment secret manager; never commit it.
- `MFA_ENCRYPTION_KEY`: optional 32-byte AES-256 key encoded as 64 hexadecimal characters. Required to enable TOTP MFA; keep it in a secret manager and back it up securely.
- `AUDIT_SIGNING_KEY`: at least 32 characters; required in production. HMAC-SHA256 signs newly created audit events. Keep it in a secret manager and back it up separately from MongoDB.
- `RESEND_API_KEY` and `MAIL_FROM`: required in production for invitation and password-recovery delivery. The sender address must belong to a verified sending domain in Resend. Never commit these values.
- `SESSION_TTL_HOURS`: session lifetime, 1–168 hours (defaults to 24).
- `SESSION_COOKIE_SAME_SITE`: `Strict`, `Lax` (default) or `None`; `None` is appropriate only for cross-site HTTPS deployments.
- `TRUSTED_PROXY_CIDRS`: optional comma-separated proxy IPs/CIDRs. Set only to known reverse proxies so IP-based rate limits do not trust spoofed forwarded headers.
- `CORS_ORIGINS`: comma-separated exact web origins.

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
- `POST /v1/auth/step-up`: verifies TOTP or consumes one single-use recovery code for a five-minute privileged-action window.\n- `POST /v1/auth/mfa/reset`: requires current password plus an unused recovery code, disables the factor and revokes all sessions so the user must re-enroll. MFA enablement returns ten recovery codes once; only their hashes are stored.

Browser sessions are issued as `HttpOnly` session cookies with a separate session-bound CSRF cookie; state-changing cookie-authenticated requests must send `x-csrf-token`. Cookies use `SameSite=Lax`, `Secure` in production, and a bounded max age. The API retains bearer-token compatibility for trusted non-browser clients; production login does not return the bearer token in JSON. Only a SHA-256 session token hash is persisted. Passwords use salted scrypt hashes.

## MAC and MAD endpoints

- `GET /v1/mad/overview`: authenticated platform metrics read; read-only aggregates only.
- `GET /v1/mac/tenants`: platform tenant directory read.
- `GET /v1/mac/admins`: platform administrator directory read.
- `PATCH /v1/mac/admins/:userId`: platform-owner-only role/status updates for existing platform administrators; requires recent MFA step-up. The platform owner is immutable through this route. Suspending an administrator revokes their active sessions.
- `POST /v1/mac/tenants`: create a tenant and assign an existing active user as tenant owner; requires platform tenant-write permission and writes an audit event.
- `GET /v1/mac/audit-events`: latest audit events, with sensitive fields excluded.
- `GET /v1/mac/audit-events/verify`: verifies HMAC signatures on the latest 500 records and reports unsigned/invalid counts.
- `GET /v1/mac/audit-events/export`: paginated, bounded audit export with per-record integrity status; exports are not automatically archived.

MAC is the privileged control plane. MAD is a read-only monitoring surface. All routes perform server-side authorization; hiding a UI link is not a security control. Tenant member routes are available under `/v1/tenants/:tenantId/members` and `/v1/tenants/:tenantId/invitations`; invited new users register through `/v1/auth/register`, while existing users accept through `/v1/tenant-invitations/accept`. Membership changes and invitations require recent MFA step-up. Tenant invitations are sent through the configured Resend adapter; raw invitation tokens are never returned by the API. Failed delivery revokes the pending invitation. Password recovery uses the same provider and does not reveal whether an email address exists. CI uses an in-memory test mail sink. Invited users without an account can register through `/v1/auth/register`; existing users can accept the invitation after signing in. A MongoDB-backed fixed-window rate limiter applies stricter policies to bootstrap, login and MFA verification, plus a general API policy. Audit events have no TTL deletion policy and can be paginated using `limit` and `before`.

## Current limitations — not production-ready

This is an implementation foundation, not a complete identity/security programme. Before public launch, add email verification and live Resend credentials and verified sender-domain configuration (the adapter is implemented, but delivery is not active until configured), device metadata and production proxy/origin review, stricter audit immutability/export controls, backup/restore verification, security review and database-backed integration tests. Tenant-specific business and Meta routes remain disabled until every handler resolves tenant scope from the verified principal and enforces tenant permissions.

Never log or return password hashes, bootstrap secrets, access tokens, Meta credentials, message content or raw authorization headers.


## Automated verification

The Phase 1 GitHub Actions workflow provisions an ephemeral MongoDB 7 service and runs the database-backed integration suite together with API typecheck/tests/build and web typecheck/build. CI-only bootstrap, MFA and audit keys are test fixtures, not production credentials. The integration suite covers owner bootstrap/login, MFA enrollment and one-time recovery-code replay prevention, invitation registration and replay rejection, cross-tenant access denial, and audit signature verification.
