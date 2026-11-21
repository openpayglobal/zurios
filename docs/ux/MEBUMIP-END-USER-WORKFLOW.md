# Zuri MeBuMIP End-User Workflow and Activation Plan

**Owner:** Blockchain Innovations LTD  
**Product:** Zuri MeBuMIP  
**Status:** Approved objectives A–E; detailed end-user journey proposed for implementation  
**Version:** 1.0.0  
**Date:** 2026-11-21

## 1. Product workflow versus administration

The end-user product workflow is separate from MAC and MAD.

- Customer users operate their own business workspace and connected Meta assets.
- MAC governs the platform: configuration, tenants, administrators, permissions, provider credentials, approvals, security and audit.
- MAD is an operational monitoring surface: tenant activity, connection health, messaging/API usage, ads, webhooks, failures, revenue and alerts.
- MAC and MAD are not the customer workspace and must not replace it.

## 2. Customer journey

1. **Discover and request access.** A prospective business user visits the product, reads the privacy notice, and requests access or accepts an invitation. The request is non-enumerating and does not create a workspace or grant permissions.
2. **Identity and verification.** The invited user accepts a single-use invitation, sets a strong password, verifies email, and enrolls MFA when required.
3. **Sign in and choose workspace.** Authentication and required MFA complete before the API reveals active memberships. The user chooses one authorized workspace. A person with multiple memberships can switch only among those memberships.
4. **Business profile.** A tenant owner/admin completes legal/display name, business type, region/time zone, contact details and policy acknowledgements. Changes are validated and audited.
5. **Connect Meta portfolio.** The user starts Meta OAuth / Embedded Signup from the workspace, reviews requested scopes, authenticates with Meta and selects only the businesses/assets they are authorized to manage. The platform stores encrypted access/refresh material server-side, records granted scopes and expiry, and never asks for a Meta password.
6. **Select assets and roles.** The user maps Facebook Pages, Instagram Professional accounts, ad accounts and (later) WhatsApp Business Accounts to the correct workspace. The platform records asset ownership, delegated access, permissions and connection health.
7. **Complete product setup.** The user invites teammates and assigns least-privilege roles. The system presents phase-aware checklists for social publishing, advertising and WhatsApp. A feature is marked connected only after provider verification and a successful API check.
8. **Operate the workspace.** Phase 2 supports Page/Instagram publishing, scheduling, inbox/comments and insights; Phase 3 supports campaigns, audiences, budgets, reporting and conversion measurement; Phase 4 supports WhatsApp onboarding, templates, messaging and webhook delivery.
9. **Manage multiple businesses.** Phase 5 allows a user to access multiple business workspaces through one identity. Every connection, query, action, audit record and usage measure is tenant-bound. Switching workspaces invalidates the previous tenant context.
10. **Integrate external systems.** Phase 6 exposes versioned APIs, scoped developer credentials, outbound webhooks and the Zuri OS adapter.
11. **Support and monitor.** Customers see their own integration status and activity. MAD receives platform-level operational aggregates; MAC handles governance, incidents, configuration and privileged approvals.

## 3. Required application surfaces

- Public access request and invitation acceptance.
- Identity, email verification, password recovery and MFA.
- Workspace chooser and secure workspace switcher.
- Customer workspace home / onboarding checklist.
- Business profile and team/membership management.
- Meta connection wizard with consent and scopes.
- Asset inventory and asset-to-workspace mapping.
- Social publishing/inbox/insights (A).
- Ads management/reporting and spend approvals (B).
- WhatsApp onboarding/messaging/templates (C).
- Multi-business workspace switcher and tenant isolation (D).
- API keys, webhooks, developer documentation and Zuri OS integration (E).
- Separate MAC and MAD surfaces.

## 4. Current implementation evidence and activation gaps

### Existing code in the integration candidate

- `apps/web/src/App.tsx` contains identity-first sign-in, MFA challenge, workspace selection, workspace switching, logout and a public access-request form.
- The access-request form is conditional on `GET /auth/public-config` returning `accessRequestsEnabled: true`.
- `apps/api/src/config.ts` defaults `ACCESS_REQUESTS_ENABLED` to `false`; production also requires an approved HTTPS privacy notice URL.
- `apps/api/src/platform/auth-routes.ts` implements non-enumerating access request intake and membership-safe workspace selection.
- `apps/web/src/App.tsx` includes a MAC access-request review surface. Review approval explicitly does not provision a tenant or membership.
- `apps/mebumip-web/src/App.tsx` is currently a platform administration shell. Meta connections and external API integration sections are placeholders; it does not yet provide the end-user business workspace journey.
- `apps/mebumip-api/src/admin.ts` exposes MAC/MAD endpoints. Its platform settings endpoint is read-only and explicitly states runtime configuration is managed outside the deployment secret manager.
- `apps/mebumip-api/src/auth.ts` implements invited-user registration, login, password recovery, MFA, sessions and membership invitations; there is not yet a complete customer onboarding / Meta OAuth API.

### Why users may not see the workflow active

1. PR #15's integration candidate is not the deployed production application.
2. PR #16 is documentation/architecture only and remains a draft.
3. Public access requests default to disabled and require an approved privacy notice before production activation.
4. The MeBuMIP web application currently renders MAC/MAD administration rather than a customer workspace onboarding surface.
5. Meta connection screens are placeholders because no verified Meta app/portfolio credentials and review prerequisites have been configured.
6. Vercel deployment checks are blocked by the team deployment-rate limit; therefore source changes have not been deployed and cannot appear in the live UI.

## 5. Phase alignment

| Objective | Approved phase | Customer-facing outcome |
|---|---:|---|
| A — Facebook Pages and Instagram management | 2 | Connect assets, publish/schedule, manage inbox/comments and view insights |
| B — Facebook and Instagram advertising | 3 | Connect ad accounts, manage campaigns/audiences/budgets and report |
| C — WhatsApp Business Platform/API | 4 | Embedded Signup, WABA/phone setup, templates, messaging and webhooks |
| D — Multi-business Meta management | 5 | One identity, multiple isolated business workspaces, delegated roles |
| E — Zuri OS / external software integrations | 6 | Versioned APIs, outbound webhooks, developer access and Zuri OS adapter |

Phases 0–1 are the platform prerequisites. Phase 7 is the combined production-readiness and launch gate. The five approved objectives remain in scope.

## 6. Activation acceptance criteria

- A new prospective user can request access without tenant enumeration or automatic provisioning.
- An invited user can accept an invitation, set credentials, verify identity and enroll MFA.
- A user with one or multiple memberships can enter and switch workspaces without cross-tenant access.
- Each tenant owner can complete a business profile and invite teammates with scoped roles.
- Meta connection flow is a real OAuth/Embedded Signup integration, not a simulated connected badge.
- The user can see connection scopes, expiry, health, revoke and reconnect.
- Every data read/write and provider action is tenant-scoped and audited.
- MAC/MAD routes remain separate from customer routes and permissions.
- UI states distinguish implemented, configured, connected, blocked and planned features.
- CI, tenant-isolation/security tests and deployment smoke tests pass before public launch.

## 7. Immediate implementation order

1. Ship the Phase 1 identity/access/workspace flow from the integration candidate after semantic reconciliation and security acceptance.
2. Make public access requests a MAC-controlled, versioned runtime setting; do not enable publicly until privacy notice and rate-limit requirements pass.
3. Add customer workspace onboarding and business profile APIs/UI.
4. Add team invitation and role management to the customer workspace.
5. Add Meta OAuth/Embedded Signup and connection lifecycle behind real provider prerequisites.
6. Add asset discovery and workspace mapping; keep A/B/C feature gates tied to their approved phases.
7. Add tenant-aware MAD metrics and MAC configuration/secret lifecycle.
8. Complete end-to-end tests and deploy only after Vercel build capacity and production gates are clear.


## Implementation checkpoint — 2026-11-21

The current implementation branch now adds a first customer workspace onboarding surface in `apps/mebumip-web/src/CustomerWorkspace.tsx`, backed by tenant-scoped API routes in `apps/mebumip-api/src/customer-workflow.ts`:

- Read onboarding progress and redacted connection metadata for an authorized tenant.
- Save a business profile with membership permission checks and an audit event in the same MongoDB transaction.
- List tenant members and pending invitations using the existing tenant-member API.
- Invite teammates only after MFA step-up, using least-privilege tenant roles and the existing email invitation service.
- Expose a Meta connect action that fails closed with an explicit not-configured response until real Meta provider credentials and OAuth callback configuration exist.

This is the beginning of the end-user workflow, not completion of all A–E product functionality. Social publishing, ads, WhatsApp, Meta OAuth/asset discovery, multiple-business provisioning and external developer integrations remain phase-gated work.


## Vercel deployment wiring — 2026-11-21

The MeBuMIP frontend and API now have dedicated Vercel projects, verified project domains and Node 22 settings. The frontend's API fallback points to the verified MeBuMIP API project domain. The API's production CORS default points to the verified frontend domain; development keeps the localhost origin. Preview deployments remain SSO-protected; production deployments are intended to be publicly accessible.

The projects are not live yet. The API requires production MongoDB replica-set, MFA encryption, audit-signing and Resend email configuration before a production deployment can pass startup validation. The customer workflow source is therefore implemented but not yet live for end users.
