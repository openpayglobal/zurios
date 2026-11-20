# Identity and Workspace API Contracts

**Status:** In Review  
**Owner:** Zuri OS API  
**Version:** 1.0.0  
**Last updated:** 2026-11-20

## Contract principles

The API authenticates a global user and authorizes one workspace context at a time. Tenant IDs supplied by clients are validated selectors, never authorization evidence. All mutation endpoints require schema validation, rate limiting, audit events and idempotency where appropriate.

## Intended authentication flow

### POST /auth/login

Request: `{ "email": "...", "password": "..." }`

Response after password and required MFA:
- `workspaceSelectionRequired: true`
- short-lived `selectionToken`
- `workspaces: [{ tenantId, slug, displayName, membershipId, roleKeys }]`

No access or refresh token is issued until selection. The response is no-store and returned only after successful credential verification and MFA where enabled.

### POST /auth/mfa/verify

Consumes a single-use MFA challenge. For the workspace-neutral login flow, success returns the same short-lived workspace selection response; it does not silently bind the user to an arbitrary tenant.

### POST /auth/workspace/select

Request: `{ "selectionToken": "...", "tenantId": "..." }`

Server validates token purpose, expiry and single use; active user; active target tenant; and active membership belonging to that user. On success it issues a tenant-bound session and access token.

### GET /auth/me

Returns the active principal for the current tenant-bound session: user, tenant, membership, role keys, permission keys and scoped organization/location identifiers. It must not return other tenants' private data through this endpoint.

### GET /auth/workspaces

Returns only the authenticated user's active memberships and the corresponding active tenant display metadata. Requires a valid active session.

### POST /auth/workspace/switch

Request: `{ "tenantId": "..." }`

Requires the current authenticated session. The server verifies the target membership and tenant, issues a new tenant-bound session and revokes the prior session after successful issuance. Failed switching leaves the old session intact.

### POST /auth/refresh and POST /auth/logout

Refresh rotates the current session's refresh token and preserves the same tenant/membership binding. Logout revokes only the current session unless a separately authorized global logout is requested.

## Error contract

- 400 INVALID_REQUEST
- 401 AUTHENTICATION_FAILED
- 403 WORKSPACE_ACCESS_DENIED
- 409 WORKSPACE_SELECTION_REPLAYED or WORKSPACE_CONTEXT_CONFLICT
- 429 RATE_LIMITED
- 500 INTERNAL_SERVER_ERROR (generic response; details only in protected logs)

Do not distinguish unknown email from wrong password. Do not return a list of workspaces before authentication and required MFA.

## Compatibility

A temporary optional tenantSlug may be accepted for existing trusted clients during migration, but the public browser flow must not require it. Remove the compatibility path only after clients and integration tests migrate. Keep API contract and OpenAPI specification synchronized.
