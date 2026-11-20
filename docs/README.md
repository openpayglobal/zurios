# ZURI Ecosystem Documentation

This directory is the authoritative entry point for approved ecosystem-wide specifications and engineering guidance. It connects Zuri OS platform documentation with product-specific documentation. Detailed MeBuMIP implementation records remain in the product workspace and are linked below.

## Read first

1. [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) — vision, product boundaries, shared architecture, security principles, governance and programme map.
2. [Zuri MeBuMIP Product README](../products/zuri-mebumip/README.md) — product purpose, owner and workspace.
3. [MeBuMIP Implementation Roadmap](../products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md) — all five approved objectives, phases 0–7, deliverables and exit criteria.
4. [MeBuMIP Architecture](../products/zuri-mebumip/ARCHITECTURE.md) — standalone product boundary, tenant model, MAC/MAD, Meta adapters, webhooks and integration API.
5. [MeBuMIP Progress Register](../products/zuri-mebumip/PROGRESS.md) — current implementation evidence, CI status and remaining gates.
6. [Phase 1 Production Security Runbook](../products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md) — deployment security, email, MFA, audit archiving, database and release controls.

## Canonical documentation catalogue

| Domain | Location | Status / purpose |
|---|---|---|
| Ecosystem overview | [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) | Baseline reference |
| Product requirements | product/ | Product catalogue, PRDs, functional requirements and acceptance criteria; expand as products are approved |
| Architecture | architecture/ | System boundaries, integration patterns, deployment topology and architecture decision records |
| User experience | ux/ | Design system, navigation, accessibility and screen specifications |
| Data | database/ | MongoDB collection catalogue, schemas, indexes, validation, tenancy and migrations |
| Integrations | [integrations/](./integrations/) | Provider readiness, API version governance, permissions, webhooks, data handling and external-service lifecycle; includes the Meta Platform Integration Readiness standard |
| APIs and events | [api/](./api/) | API standards, OpenAPI documents, event contracts, webhooks and SDK guidance; includes [Zuri OS Platform API](./api/openapi.yaml) and [MeBuMIP API](./api/mebumip-openapi.yaml) |
| Security | security/ | Threat model, identity, authorization, secrets, audit and incident response |
| Compliance | [compliance/](./compliance/) | Privacy, retention, jurisdictional requirements and evidence registers; includes the [Public Access Request Privacy and Retention draft](./compliance/ACCESS-REQUEST-PRIVACY-AND-RETENTION.md) |
| Operations | operations/ | Deployment, observability, backup, disaster recovery, support and runbooks |
| Decisions | decisions/ | Cross-cutting approved decisions; architecture ADRs may live under architecture/decisions/ |
| MeBuMIP product | [products/zuri-mebumip/](../products/zuri-mebumip/README.md) | Detailed product-specific documentation |
| CI workflows | [MeBuMIP Phase 1 CI workflow](../.github/workflows/mebumip-phase1.yml) | Automated engineering verification |

## Meta integration readiness

- [Meta Platform Integration Readiness and Version Governance](./integrations/META-PLATFORM-INTEGRATION-READINESS.md) — Graph/Marketing API versioning, Tech Provider/App Review, Pages/Instagram, advertising, WhatsApp, webhooks and multi-business requirements.

## Security engineering standards

- [Key Management and Audit Archiving](./security/KEY-MANAGEMENT-AND-AUDIT-ARCHIVING.md) — MFA key rings, safe migration, audit-signing lifecycle, WORM archive requirements and external standards.

## Canonical identity and operations specifications

- [Identity and Multi-Workspace Architecture](./architecture/IDENTITY-AND-MULTI-WORKSPACE.md) — one global identity, multiple tenant memberships and tenant-bound sessions.
- [ADR-005: Global Identity with Multiple Workspace Memberships](./architecture/decisions/ADR-005-GLOBAL-IDENTITY-MULTI-WORKSPACE.md) — formal decision, alternatives, consequences and implementation evidence.
- [Sign-in and Workspace Selection](./ux/SIGN-IN-AND-WORKSPACE-SELECTION.md) — identity-first sign-in, access request, workspace chooser and accessibility.
- [Identity and Workspace API Contracts](./api/IDENTITY-AND-WORKSPACE-CONTRACTS.md) — login, MFA, workspace selection, switching and session contracts.
- [Identity and Membership Data Model](./database/IDENTITY-MEMBERSHIP-DATA-MODEL.md) — users, tenants, memberships, sessions and indexes.
- [Vercel Deployment Topology](./operations/VERCEL-DEPLOYMENT-TOPOLOGY.md) — canonical frontend/API projects, environment boundaries and release gates.

## Full Zuri OS baseline specifications

- [Master Execution Plan](./project/ZURI-OS-MASTER-EXECUTION-PLAN.md) — work packages, sequence, governance, acceptance and release gates.
- [Master Product Requirements Document](./product/ZURI-OS-MASTER-PRD-v1.0.md) — product outcomes, users, module catalogue, MVP boundary and requirements.
- [Technical Architecture](./architecture/ZURI-OS-TECHNICAL-ARCHITECTURE-v1.0.md) — modular boundaries, trust zones, APIs, events, data and operations.
- [MongoDB Database Blueprint](./database/ZURI-OS-MONGODB-DATABASE-BLUEPRINT-v1.0.md) — collections, tenancy, indexes, transactions, migrations and governance.
- [UI/UX Design System](./ux/ZURI-OS-UI-UX-DESIGN-SYSTEM-v1.0.md) — app shell, navigation, reusable components, workflows and accessibility.
- [Implementation Progress Register](./project/ZURI-OS-PROGRESS-REGISTER.md) — exact CI evidence, deployment state, blockers and release gates.

## Document control

Every authoritative specification should state its owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions and change history.

Use explicit document status labels: **Draft**, **In Review**, **Approved**, **Superseded** or **Archived**. A draft must not be represented as an approved implementation requirement.

## Documentation governance

- Keep this index current whenever a canonical document is added, renamed or moved.
- Keep ecosystem-wide principles in docs/ and product-specific implementation detail in the owning product workspace.
- Record material architecture decisions with context, decision, alternatives, consequences, status and approval.
- Distinguish planned, implemented, tested, CI-verified, deployed and production-configured.
- Preserve all five approved MeBuMIP objectives and programme phases 0–7 unless the product owner explicitly approves a change.
- Never commit credentials, private keys, customer data, live access tokens or secret values.
- Do not claim production readiness, compliance certification, Meta approval or a live integration without evidence.

## Suggested document additions

Create or expand domain documents as the relevant product scope and decisions are approved. Do not create empty documents that imply completed design work. The ecosystem overview and MeBuMIP product documents linked above are the current baseline; future PRDs, API specifications, threat models, data catalogues, ADRs and operational runbooks should be added here as they are authored and reviewed.
