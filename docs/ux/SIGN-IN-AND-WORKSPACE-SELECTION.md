# Sign-in and Workspace Selection

**Status:** In Review  
**Owner:** Zuri OS product and design  
**Version:** 1.0.0  
**Last updated:** 2026-11-20

## Purpose

Provide a consistent entry path for users who may belong to more than one Zuri workspace.

## User journey

1. Open Zuri OS.
2. Choose **Sign in** or **Request Zuri OS access**.
3. Sign in with email and password; complete MFA when enabled.
4. If the account has active memberships, show **Choose your workspace**.
5. User selects a workspace and continues.
6. The application opens in that workspace; its name is visible in the app shell.
7. Workspace switcher allows switching only among the user's active memberships.
8. If the user has no active membership, show a neutral access-request/onboarding state and never show another tenant's private details.

## Workspace chooser

Each item may show:
- Workspace display name and legal/business name where appropriate.
- The user's role in that workspace.
- Optional organization or location context if the API authorizes disclosure.
- Workspace status only for memberships visible to the signed-in user.

The active workspace is visually distinct. Avoid using a tenant ID or slug as the primary label unless no display name is available.

## Access request

The access request form is separate from login. It collects only the minimum information required to route a request and must not create a tenant, user, role, or membership automatically. The API should return a non-enumerating acknowledgement and route the request through an approved workflow. Workspace provisioning and membership assignment remain privileged, auditable operations.

## Interaction states

- Loading: announce that workspaces are being retrieved.
- No memberships: explain that access must be requested or an invitation accepted.
- One membership: still respect the same authorization contract.
- Multiple memberships: allow explicit selection.
- Expired/replayed selection: return to sign-in with a clear retry message.
- Workspace unavailable: refresh choices and preserve no stale tenant context.
- Network failure: preserve entered email, never password, and offer retry.

## Accessibility

- Keyboard navigable workspace cards/selectors.
- Visible focus, semantic buttons and labelled fields.
- Screen-reader announcement when workspace context changes.
- Do not rely on color alone to identify the active workspace.
- Respect reduced-motion settings and responsive layouts.

## Acceptance

The user never has to remember a workspace slug to sign in. A person with two memberships can enter either workspace from the same identity. Switching workspaces does not require creating another account. Request access is not a self-service privilege escalation path.


## Implementation checkpoint — 2026-11-20

The Zuri OS browser now presents a public “Request Zuri OS access” flow separate from sign-in. The form collects email, name, organization and optional context. The public endpoint returns a non-enumerating 202 acknowledgement, applies IP/email rate limits, stores a pending review item and writes an audit event. It does not create a user, tenant, role or membership.

Authenticated users with active membership receive a one-time workspace selection token only after password and any required MFA checks. The chooser includes the platform administration context only when a valid platform operator grant exists. MAC reviewers can mark an access request reviewed, approve or decline it; approval records a decision only and does not automatically provision a tenant or membership.
