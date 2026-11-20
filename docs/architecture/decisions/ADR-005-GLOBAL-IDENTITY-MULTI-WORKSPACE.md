# ADR-005: Global Identity with Multiple Workspace Memberships

**Status:** Accepted for implementation baseline  
**Decision date:** 2026-11-20  
**Decision owner:** Zuri OS product owner  
**Decision area:** Identity, tenancy and workspace context

## Context

The original browser sign-in form required a tenant slug at authentication time and represented the user in one active tenant context. This is insufficient for users who work with more than one business or workspace. It also couples a global credential to one tenant and makes workspace switching look like a separate login identity.

The product owner reiterated that a person may belong to multiple workspaces and should choose the workspace they want to enter after signing in.

## Decision

1. Maintain one global human identity per person.
2. Represent tenant access as independent membership records. One user may have multiple active memberships.
3. Authenticate the user with global credentials and required MFA before revealing workspace choices.
4. Return only the user's active, time-valid memberships.
5. Require an explicit workspace selection. The API verifies the selected tenant and membership before issuing a tenant-bound session.
6. Bind each session/access token to `userId`, `tenantId`, `membershipId` and `sessionId`.
7. Switch workspace through an authenticated API operation that revalidates the target membership and revokes the previous workspace session.
8. Never create a user, tenant or membership as a side effect of sign-in, selection or switching.
9. Treat public access requests and privileged workspace provisioning as separate, auditable workflows.

## Alternatives considered

- **Duplicate user records per tenant:** rejected because identity, MFA, recovery and account lifecycle become fragmented.
- **One token with simultaneous access to every tenant:** rejected because it increases blast radius and makes every request responsible for a more complex ambient context.
- **Client-selected tenant without server membership verification:** rejected because a tenant ID is a selector, not proof of authorization.
- **One tenant permanently bound to the login credential:** rejected because it prevents multi-workspace users from using one identity naturally.

## Security and operational consequences

- Every tenant-owned API operation continues to enforce tenant scope and resource ownership.
- Membership status and validity are rechecked at selection and on authenticated requests.
- Selection challenges are short-lived, purpose-bound, single-use and stored with expiry.
- Workspace lists and selection responses are not cacheable.
- Membership revocation invalidates sessions bound to that membership without deleting the global identity or unrelated memberships.
- Audit records must identify the active user, tenant, membership and action for tenant-scoped operations.
- The public “Request Zuri OS” journey must be reconciled against the full ecosystem requirements before a request/provisioning endpoint is implemented.

## Research references

- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [NIST SP 800-63B-4](https://csrc.nist.gov/pubs/sp/800/63/B/4/final)

## Implementation evidence

- API: identity-first login, membership listing, single-use workspace selection and authenticated switching in PR #13.
- Web: workspace chooser and active workspace switcher in PR #14.
- Integration tests: multiple memberships, empty membership state, unauthorized selection/switch, replay rejection, MFA-before-selection and route-level switching.
- CI evidence is maintained in [the Zuri OS Progress Register](../../project/ZURI-OS-PROGRESS-REGISTER.md).

## Follow-up

The ODEI-Multi-Ecosystem reference repository supplied by the owner was not accessible to the connected GitHub integration at decision time. Reconcile this ADR if that source reveals additional workspace roles, onboarding, federation or provisioning requirements.
