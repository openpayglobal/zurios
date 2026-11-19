# MAC/MAD initial operator bootstrap runbook

**Scope:** Preview-only initial global platform operator.  
**Status:** Implemented in the feature branch; not deployed or activated.  
**Security boundary:** This flow is independent of tenant login and tenant JWTs.

## Required environment

Configure these values in the API project's encrypted Preview environment only:

- `MAC_JWT_SECRET`: a cryptographically random value with at least 32 characters. It must be different from `JWT_SECRET`.
- `MAC_BOOTSTRAP_TOKEN`: a one-time high-entropy secret used only to authorize initial bootstrap.
- `MFA_ENCRYPTION_KEY`: the existing base64-encoded 32-byte key. It encrypts TOTP secrets at rest.
- `MAC_SESSION_TTL_SECONDS`: default 28,800 seconds (8 hours).

The web build needs `VITE_ZURI_API_URL` set to the API origin (scheme and host only, no trailing `/v1`). Add the exact web origin to API `CORS_ORIGINS`. Do not put any MAC secret in a Vite variable, browser configuration or client bundle.

## Bootstrap sequence

1. Confirm the API is a non-production Preview deployment and the database is the intended Zuri OS preview database.
2. Generate independent random values for `MAC_JWT_SECRET` and `MAC_BOOTSTRAP_TOKEN` using a trusted password manager or operating-system cryptographic generator.
3. Add both as encrypted Preview environment variables. Never commit, paste into source, or place them in a browser form.
4. Deploy only when the Vercel free-tier quota permits. Environment updates do not change an already-running deployment.
5. Send a TLS-protected POST request to `/v1/mac/auth/bootstrap` with the `x-mac-bootstrap-token` header and JSON containing the owner email, display name and a strong password.
6. The response contains the TOTP enrollment secret exactly once. Transfer it directly into an authenticator app; do not log, screenshot, email or paste it into chat.
7. Send a TLS-protected POST request to `/v1/mac/auth/bootstrap/confirm` with the same bootstrap header and the owner email plus current six-digit authenticator code.
8. Store the returned refresh token in an approved secure credential store. The access token is short-lived.
9. Immediately remove `MAC_BOOTSTRAP_TOKEN` from the Preview environment and redeploy when quota allows. Login and refresh use `MAC_JWT_SECRET` and `MFA_ENCRYPTION_KEY`; they do not require the bootstrap token.
10. Verify login, refresh rotation, logout and revoked-session rejection. Confirm audit records are written to `admin_audit_events`.

## API operations

| Endpoint | Purpose | Authentication |
|---|---|---|
| `POST /v1/mac/auth/bootstrap` | One-time first operator creation | Bootstrap header |
| `POST /v1/mac/auth/bootstrap/confirm` | Activate first operator with TOTP | Bootstrap header + TOTP |
| `POST /v1/mac/auth/login` | Password + TOTP login | Public endpoint, rate-limited |
| `POST /v1/mac/auth/refresh` | Rotate opaque refresh token | Refresh token + session ID |
| `POST /v1/mac/auth/logout` | Revoke current session | MAC access token |
| `GET /v1/mac/auth/me` | Current operator identity | MAC access token |
| `GET /v1/mac/overview` | Platform counts and integration status | `mac.overview.read` |
| `GET /v1/mac/tenants` | Paginated tenant inventory | `mac.tenants.read` |
| `GET /v1/mac/audit` | Global admin audit events | `mac.audit.read` |

## Recovery and incident handling

- If the bootstrap token is lost before activation, rotate it in Preview environment settings. Do not bypass the one-time bootstrap-owner index.
- If the TOTP enrollment secret is lost before activation, use a controlled database operator procedure to remove the pending bootstrap record only after verifying the environment and audit trail; never delete an active operator to restart bootstrap.
- If the owner loses the authenticator after activation, do not disable MFA through a tenant account. A separate audited recovery procedure and two-person authorization must be implemented before production use.
- Revoke affected sessions and rotate the independent MAC signing secret if compromise is suspected.
- Keep Atlas ingress restricted to a verified, affordable network path before any production use. The existing unrestricted Atlas ingress is a production blocker.

## Current limitations

- The API currently supports one initial bootstrap owner; multi-operator invitation, grant approval, suspension and recovery workflows are not yet implemented.
- MAC read APIs are implemented; runtime configuration writes, provider changes, deployments, rollbacks and other high-impact mutations remain disabled.
- The MAC frontend reads authenticated overview, tenant and audit data. It keeps tokens in React memory only; reloading the tab requires a new sign-in.
- No live deployment, production promotion, paid Vercel feature or new recurring cost is authorized by this runbook.
