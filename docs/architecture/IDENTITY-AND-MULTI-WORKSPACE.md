# Identity and Multi-Workspace Architecture

**Status:** In Review  
**Owner:** Zuri OS platform  
**Version:** 1.0.0  
**Last updated:** 2026-11-20

## Decision intent

Zuri uses one global person identity with zero or more workspace memberships. A user may belong to multiple workspaces at the same time. Authentication identifies the person; workspace selection activates one authorized membership as the request context.

## Core entities

- User: global login identity, credentials, verification and global security factors.
- Workspace (tenant): independently governed business/customer boundary.
- Membership: relationship between one user and one tenant, with status, roles and optional organization/location scopes.
- Role and policy: tenant-owned authorization configuration.
- Session: authenticated device/session bound to one user, tenant and membership.
- Organization and location: optional hierarchy/scopes within a tenant.

A user is not duplicated when joining another workspace. Each membership is independently invited, accepted, suspended or revoked.

## Lifecycle

1. User registers or is invited; one global user record is created.
2. A workspace administrator creates a membership for that user in their tenant.
3. The user accepts the invitation; only that membership becomes active.
4. User signs in with global credentials.
5. API returns the user's active workspace choices after credential and required MFA verification.
6. User selects one workspace; server validates tenant and membership and issues a tenant-bound session/token.
7. User switches workspace through a server-authorized operation; the server revalidates membership and issues a new tenant-bound context.
8. Every API request verifies session, tenant, user and membership are still active.

## Security invariants

- Client-supplied tenant IDs are selectors, never authorization proof.
- Selection tokens are short-lived, purpose-bound and single-use.
- Workspace selection requires active membership and active tenant.
- Access tokens include userId, tenantId, membershipId and sessionId.
- Server rechecks the session and membership on protected requests.
- A revoked/suspended membership invalidates its sessions without deleting the global user or other memberships.
- Roles and resource scopes are tenant-specific.
- Workspace switching never copies roles or permissions between tenants.
- No workspace enumeration before valid credentials and required MFA.
- Error responses do not reveal whether an email exists.

## Platform operators

Platform roles are independent from tenant membership. A platform operator may have platform-level permissions while also holding zero or more tenant memberships. Platform-wide administration must use explicit platform permissions and must not be inferred from membership in a tenant named "platform".

## Session strategy

Use tenant-bound access tokens and refresh sessions. Initial login returns a short-lived workspace-selection capability, not a tenant-authorizing access token, until a workspace has been selected. Workspace switching validates the currently authenticated user and target membership, creates a new session, and revokes or rotates the old context according to the session lifecycle policy.

## Failure behavior

- No active workspaces: show an onboarding/request-access path; do not fabricate a default workspace.
- One workspace: the user may select it explicitly or the product may auto-select only if the policy is documented and still server-validated.
- Multiple workspaces: show a workspace chooser with name, role and optional organization context.
- Inactive workspace/membership: refuse selection and refresh the available choices.
- Selection challenge expired/replayed: require sign-in again.
- Workspace switch fails: retain the previous active session and context.

## Acceptance criteria

- One user can hold two or more active memberships.
- Login without a tenant slug returns all active authorized choices only after authentication/MFA.
- Selection creates a token bound to the selected membership.
- Switching changes tenant context without creating a user or membership.
- Cross-tenant resource access is denied even when a client alters tenant IDs.
- Revoking one membership does not revoke access to unrelated active memberships except where global risk policy explicitly requires it.
- Tests cover multiple memberships, no memberships, suspended tenant, revoked membership, replayed selection, session rotation and cross-tenant access.


## External security research references

The multi-tenant identity and session design is informed by the following current primary guidance. These sources are engineering references, not a claim of certification or compliance:

- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html): derive tenant context from verified identity and active membership; enforce tenant scope at every data, cache, storage and asynchronous-work boundary; do not treat client-supplied tenant identifiers as authorization proof.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): protect authentication and recovery paths, use risk-based reauthentication and require step-up authentication for sensitive operations where appropriate.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): use protected session identifiers, server-side invalidation, rotation, expiry and explicit logout; do not rely on browser-close events for revocation.
- [NIST SP 800-63B-4](https://csrc.nist.gov/pubs/sp/800/63/B/4/final), published July 2025: current digital identity guidance for authentication, authenticator management and session lifecycle. Apply the assurance level appropriate to the service risk; do not claim NIST conformance without a formal control assessment.
- [OWASP Authorization Regression Testing Cheat Sheet](https://github.com/OWASP/CheatSheetSeries/blob/master/cheatsheets/Authorization_Regression_Testing_Cheat_Sheet.md): use two or more tenants with distinct seeded records and assert that broad reads, object lookups, list endpoints and mutations never disclose or alter another tenant's records. Treat a single cross-tenant identifier leak as a critical regression.

Implementation follow-up: keep tenant scope in every tenant-owned query and cache key, enforce resource ownership on every access path, and re-establish authorization for delayed/background work. Add cross-tenant denial tests as each product module is activated. Tests should use at least two tenants and include broad list/read, direct-object lookup, update/delete, cache-key separation and background-job reauthorization scenarios.


## Implementation checkpoint — 2026-11-20

The shared Zuri OS API and web application now implement the identity-first workspace flow described here:
- Password authentication does not require a tenant slug in the public browser flow.
- Required MFA is completed before the workspace list is disclosed.
- A short-lived, opaque, hashed and single-use workspace-selection capability binds the authenticated global user to an active membership.
- Workspace switching issues the new tenant-bound session first and conditionally revokes the previous session; failed authorization does not revoke the current session.
- Workspace choices are derived from active memberships and active tenants; role keys and organization/location scopes are loaded from the selected membership rather than copied between workspaces.
- Platform operator grants are independent of tenant memberships. A platform-only operator receives a distinct platform administration context, and the API rechecks the grant on every request and refresh.
- Users without an active tenant membership or platform grant receive a non-provisioning access-request path.

The platform context uses a synthetic `platform` session scope; it is not a tenant and must never be accepted by tenant-scoped data APIs. Tenant routes continue to require a real tenant and active membership. New session contexts are not a substitute for per-route permission checks.
