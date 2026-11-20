# Zuri MeBuMIP API

Fastify API workspace for Zuri MeBuMIP.

## Local configuration

- `MONGODB_URI`: MongoDB connection URI.
- `MONGODB_DATABASE`: database name (defaults to `zuri_mebumip`).
- `PLATFORM_BOOTSTRAP_TOKEN`: one-time platform owner bootstrap secret, at least 32 characters. Supply through a deployment secret manager; never commit it.
- `MFA_ENCRYPTION_KEY`: optional 32-byte AES-256 key encoded as 64 hexadecimal characters. Required to enable TOTP MFA; keep it in a secret manager and back it up securely.
- `SESSION_TTL_HOURS`: bearer session lifetime, 1–168 hours (defaults to 24).
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
- `POST /v1/auth/password/change`: changes password and revokes other sessions.
- `POST /v1/auth/mfa/setup` and `/v1/auth/mfa/enable`: configure TOTP MFA.
- `POST /v1/auth/step-up`: verifies TOTP for a five-minute privileged-action window.

Send `Authorization: Bearer <accessToken>`. Only a SHA-256 token hash is persisted. Passwords use salted scrypt hashes.

## MAC and MAD endpoints

- `GET /v1/mad/overview`: authenticated platform metrics read; read-only aggregates only.
- `GET /v1/mac/tenants`: platform tenant directory read.
- `POST /v1/mac/tenants`: create a tenant and assign an existing active user as tenant owner; requires platform tenant-write permission and writes an audit event.
- `GET /v1/mac/audit-events`: latest audit events, with sensitive fields excluded.

MAC is the privileged control plane. MAD is a read-only monitoring surface. All routes perform server-side authorization; hiding a UI link is not a security control. Tenant member routes are available under `/v1/tenants/:tenantId/members` and `/v1/tenants/:tenantId/invitations`; invitation acceptance is `/v1/tenant-invitations/accept`. Membership changes and invitations require recent MFA step-up. Invitation tokens are returned once by the API for delivery through a trusted mail adapter; automated email delivery is not configured yet. A MongoDB-backed fixed-window rate limiter applies stricter policies to bootstrap, login and MFA verification, plus a general API policy. Audit events have no TTL deletion policy and can be paginated using `limit` and `before`.

## Current limitations — not production-ready

This is an implementation foundation, not a complete identity/security programme. Before public launch, add email verification and password recovery delivery, session device management, MFA recovery codes and factor reset, stricter audit immutability/export controls, backup/restore verification, security review and database-backed integration tests. Tenant-specific business and Meta routes remain disabled until every handler resolves tenant scope from the verified principal and enforces tenant permissions.

Never log or return password hashes, bootstrap secrets, access tokens, Meta credentials, message content or raw authorization headers.
