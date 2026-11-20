# Zuri OS Documentation

This directory is the authoritative home for approved project specifications and engineering guidance.

## Planned documentation structure

- `product/` — master PRD, product catalogue, functional requirements, workflows, and acceptance criteria
- `architecture/` — technical architecture, system boundaries, integration patterns, ADRs, and deployment topology
- `ux/` — design system, navigation, interaction patterns, accessibility, and screen specifications
- `database/` — MongoDB collection catalogue, schemas, indexes, validation, transactions, tenancy, migrations, and examples
- `api/` — API standards, OpenAPI specifications, event contracts, webhooks, and SDK guidance
- `security/` — threat model, identity, authorization, secrets, audit, incident response, and security controls
- `compliance/` — jurisdictional requirements, fiscalization, privacy, retention, and evidence registers
- `operations/` — deployment, observability, backup, disaster recovery, support, and runbooks
- `decisions/` — approved cross-cutting decisions where appropriate, or architecture ADRs under `architecture/decisions/`

## Canonical ecosystem documents

- [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) — product boundaries, shared principles, programme map and governance.
- [Identity and Multi-Workspace Architecture](./architecture/IDENTITY-AND-MULTI-WORKSPACE.md) — one global identity, many tenant memberships and tenant-bound sessions.
- [Sign-in and Workspace Selection](./ux/SIGN-IN-AND-WORKSPACE-SELECTION.md) — user journey, access request, chooser states and accessibility.
- [Identity and Workspace API Contracts](./api/IDENTITY-AND-WORKSPACE-CONTRACTS.md) — login, MFA, workspace selection, switching and session contracts.
- [Identity and Membership Data Model](./database/IDENTITY-MEMBERSHIP-DATA-MODEL.md) — global users, tenants, memberships, sessions and index requirements.
- [Vercel Deployment Topology](./operations/VERCEL-DEPLOYMENT-TOPOLOGY.md) — canonical frontend/API projects, environment boundaries and release gates.
- [MeBuMIP product documentation](../products/zuri-mebumip/README.md) — approved objectives, roadmap, architecture, progress and operational gates.

## Document control

Each authoritative specification should state its owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions, and change history.

Use explicit status labels: **Draft**, **In Review**, **Approved**, **Superseded**, or **Archived**. A draft must not be represented as an approved implementation requirement.
