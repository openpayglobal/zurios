# Identity and Membership Data Model

**Status:** In Review  
**Owner:** Zuri OS data platform  
**Version:** 1.0.0  
**Last updated:** 2026-11-20

## Collections

### users

One document per person across Zuri. Holds normalized email, display name, credential hash, account status, verification and global MFA/recovery state. Do not store one user per workspace.

### tenants

One document per workspace/business boundary. Holds tenantId, slug, legal/display names, status, locale, currency and timezone.

### memberships

One document per user-to-tenant relationship. Unique active/invited membership per tenant and user. Holds membershipId, tenantId, userId, status, roleIds, organizationIds and locationIds. Invitations are single-use and expiring.

### sessions

Tenant-bound session document with sessionId, userId, tenantId, membershipId, refresh-token hash/history, token-family identifier, expiry and revocation metadata.

### roles and policies

Tenant-scoped role and policy documents. Never copy permissions across tenants during switching.

## Required indexes

- users.emailNormalized unique.
- tenants.tenantId unique and tenants.slug unique.
- memberships.tenantId + memberships.membershipId unique.
- memberships.tenantId + memberships.userId unique according to the lifecycle policy (including invited/active/suspended states where duplicate memberships must be blocked).
- memberships.userId + status for workspace listing.
- sessions.tenantId + sessionId unique.
- sessions.userId + status/expiry for session inventory and revocation.
- Auth challenge identifier unique with expiry/TTL cleanup; single-use state is enforced by atomic conditional update, not TTL alone.

## Integrity and lifecycle

A membership must reference an existing user and tenant. Membership acceptance changes only that membership and uses a transaction for membership activation, invitation consumption, audit and outbox writes. Revoking a membership revokes sessions bound to that membership. Removing a tenant must be a separately governed lifecycle operation and must not cascade-delete a global user or memberships in other tenants.

## Privacy

Workspace listing reveals only tenant names and roles for memberships belonging to the authenticated user. Avoid exposing internal database identifiers in UI where a friendly display label is available. Retention and deletion follow the ecosystem data-governance policy.
