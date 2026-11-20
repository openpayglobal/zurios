# Zuri MeBuMIP API

Fastify API workspace for Zuri MeBuMIP.

## Local configuration

- `MONGODB_URI`: MongoDB connection URI.
- `MONGODB_DATABASE`: database name (defaults to `zuri_mebumip`).
- `PLATFORM_BOOTSTRAP_TOKEN`: one-time platform owner bootstrap secret, at least 32 characters. Supply through a deployment secret manager; never commit it.
- `MFA_ENCRYPTION_KEY`: 32-byte AES-256 key encoded as 64 hexadecimal characters; required in production and must be stored/backed up in a secret manager.
- `RESEND_API_KEY` and `MAIL_FROM`: trusted email provider credentials and verified sender address; both are mandatory in production. Invitation tokens are delivered by email and are never returned by the API. The test environment uses an in-memory sink only.
- `MONGODB_TEST_URI`: optional MongoDB replica-set URI for database-backed API integration tests. The Phase 1 GitHub Actions workflow configures this automatically.
- `SESSION_TTL_HOURS`: session lifetime, 1–168 hours (defaults to 24).
- `SESSION_COOKIE_SAME_SITE`: `strict`, `lax` (default) or `none`; `none` requires Secure cookies.
- `SESSION_COOKIE_DOMAIN`: optional cookie domain for a shared first-party deployment.
- `CORS_ORIGINS`: comma-separated exact web origins.

The API binds to `API_HOST` / `API_PORT` (defaults `0.0.0.0:4100`). Liveness is available without a database; readiness stays unavailable until MongoDB indexes and route registration succeed.

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
- `POST /v1/auth/password/recovery`: sends a short-lived, one-time reset token to the account email without revealing whether an address exists.
- `POST /v1/auth/password/reset`: consumes the token once, changes the password, revokes all active sessions and records an audit event.
- `POST /v1/auth/mfa/setup` (with current password) and `/v1/auth/mfa/enable`: configure TOTP MFA. Enrollment confirmation expires after 15 minutes.
- `POST /v1/auth/step-up`: verifies TOTP or consumes one single-use recovery code for a five-minute privileged-action window.
- `POST /v1/auth/mfa/reset`: requires current password plus an unused recovery code, disables the factor and revokes all sessions so the user must re-enroll. MFA enablement returns ten recovery codes once; only their hashes are stored.

In development/test the API returns a bearer token for local tooling. In production it returns no bearer token: the session is held in an HttpOnly cookie, paired with a separate CSRF cookie and `x-csrf-token` header on unsafe cookie-authenticated requests. Cookie-authenticated state changes also require an exact configured HTTPS Origin. Bearer clients remain supported for non-browser integrations. Only SHA-256 token and CSRF hashes are persisted. Passwords use salted scrypt hashes.

## MAC and MAD endpoints

- `GET /v1/mad/overview`: authenticated platform metrics read; read-only aggregates only.
- `GET /v1/mac/tenants`: platform tenant directory read.
- `GET /v1/mac/admins`: platform administrator directory read.
- `PATCH /v1/mac/admins/:userId`: platform-owner-only role/status updates for existing platform administrators; requires recent MFA step-up. The platform owner is immutable through this route. Suspending an administrator revokes their active sessions.
- `POST /v1/mac/tenants`: create a tenant and assign an existing active user as tenant owner; requires platform tenant-write permission and writes an audit event.
- `GET /v1/mac/audit-events`: latest audit events, with sensitive fields excluded.

MAC is the privileged control plane. MAD is a read-only monitoring surface. All routes perform server-side authorization; hiding a UI link is not a security control. Tenant member routes are available under `/v1/tenants/:tenantId/members` and `/v1/tenants/:tenantId/invitations`; invited new users register through `/v1/auth/register`, while existing users accept through `/v1/tenant-invitations/accept`. Membership changes and invitations require recent MFA step-up. Invitation tokens are hashed at rest and delivered only to the requested recipient through the configured Resend adapter; when delivery is unavailable the invitation is revoked and the API fails closed with 503. Password recovery uses the same provider, a 30-minute token lifetime and single-use database consumption. The test environment uses a non-network mail sink. Invited users without an account can register through `/v1/auth/register`; existing users can accept the invitation after signing in. A MongoDB-backed fixed-window rate limiter applies stricter policies to bootstrap, login and MFA verification, plus a general API policy. Audit events have no TTL deletion policy and can be paginated using `limit` and `before`.

## Current limitations — not production-ready

This is an implementation foundation, not a complete identity/security programme. MFA recovery codes and factor reset are implemented and covered by both unit tests and the new MongoDB-backed route test. Before public launch, configure and verify the production sender domain and credentials, add email verification, session device metadata, stricter audit immutability/export controls, backup/restore verification and independent security review. The MongoDB-backed integration test covers tenant isolation, invitation acceptance/replay, audit persistence and MFA recovery/reset; broader auth lifecycle and exhaustive cross-tenant matrix coverage remain required. Tenant-specific business and Meta routes remain disabled until every handler resolves tenant scope from the verified principal and enforces tenant permissions.

Never log or return password hashes, bootstrap secrets, access tokens, Meta credentials, message content or raw authorization headers.
