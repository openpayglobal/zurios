# ZURI Ecosystem Documentation

This directory is the authoritative entry point for ecosystem-wide specifications and engineering guidance. Full product documentation is mirrored under `docs/products/`; the product workspace under `products/` remains the implementation source of truth.

## Read first

1. [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) — vision, product boundaries, shared architecture, security principles, governance and programme map.
2. [Zuri MeBuMIP Product README](./products/zuri-mebumip/README.md) — product purpose, owner and workspace.
3. [MeBuMIP Implementation Roadmap](./products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md) — approved objectives A–E, phases 0–7, deliverables and exit criteria.
4. [MeBuMIP Architecture](./products/zuri-mebumip/ARCHITECTURE.md) — standalone product boundary, tenant model, MAC/MAD, Meta adapters, webhooks and integration API.
5. [MeBuMIP Progress Register](./products/zuri-mebumip/PROGRESS.md) — implementation evidence, CI status and remaining gates.
6. [Phase 1 Production Security Runbook](./products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md) — deployment security, email, MFA, audit archiving, database and release controls.

## Canonical documentation catalogue

| Domain | Location | Status / purpose |
|---|---|---|
| Ecosystem overview | [ZURI Ecosystem Overview](./ZURI-ECOSYSTEM-OVERVIEW.md) | Baseline reference |
| Product requirements | product/ | Product catalogue, PRDs, functional requirements and acceptance criteria |
| Architecture | architecture/ | System boundaries, integration patterns, deployment topology and ADRs |
| User experience | ux/ | Design system, navigation, accessibility and screen specifications |
| Data | database/ | MongoDB collection catalogue, schemas, indexes, validation, tenancy and migrations |
| Integrations | [integrations/](./integrations/) | Provider readiness, API version governance, permissions, webhooks and external-service lifecycle |
| APIs and events | [api/](./api/) | API standards, OpenAPI documents, event contracts, webhooks and SDK guidance |
| Security | security/ | Threat model, identity, authorization, secrets, audit and incident response |
| Compliance | [compliance/](./compliance/) | Privacy, retention, jurisdictional requirements and evidence registers |
| Operations | operations/ | Deployment, observability, backup, disaster recovery, support and runbooks |
| Decisions | architecture/decisions/ | Cross-cutting architecture decision records |
| MeBuMIP product | [products/zuri-mebumip/](./products/zuri-mebumip/README.md) | Detailed product-specific documentation |
| CI workflows | [MeBuMIP Phase 1 CI workflow](../.github/workflows/mebumip-phase1.yml) | Automated engineering verification |

## Integrations and external standards

- [Meta Platform Integration Readiness and Version Governance](./integrations/META-PLATFORM-INTEGRATION-READINESS.md) — Graph/Marketing API versioning, Tech Provider/App Review, Pages/Instagram, advertising, WhatsApp, webhooks and multi-business requirements.

## Security engineering standards

- [Key Management and Audit Archiving](./security/KEY-MANAGEMENT-AND-AUDIT-ARCHIVING.md) — MFA key rings, safe migration, audit-signing lifecycle, WORM archive requirements and external standards.
- [Audit Archive Provider Comparison](./security/AUDIT-ARCHIVE-PROVIDER-COMPARISON.md) — immutable-storage provider capabilities and selection considerations.

## Canonical identity and operations specifications

- [Identity and Multi-Workspace Architecture](./architecture/IDENTITY-AND-MULTI-WORKSPACE.md) — one global identity, multiple tenant memberships and tenant-bound sessions.
- [ADR-005: Global Identity with Multiple Workspace Memberships](./architecture/decisions/ADR-005-GLOBAL-IDENTITY-MULTI-WORKSPACE.md) — formal decision and implementation evidence.
- [ADR-006: MAC-Controlled Vercel Runtime Configuration](./architecture/decisions/ADR-006-MAC-CONTROLLED-VERCEL-RUNTIME-CONFIGURATION.md) — MAC as runtime configuration authority; Vercel OIDC workload identity; no-redeployment design and acceptance criteria.
- [Sign-in and Workspace Selection](./ux/SIGN-IN-AND-WORKSPACE-SELECTION.md) — identity-first sign-in, access request, workspace chooser and accessibility.
- [Identity and Workspace API Contracts](./api/IDENTITY-AND-WORKSPACE-CONTRACTS.md) — login, MFA, workspace selection, switching and session contracts.
- [Identity and Membership Data Model](./database/IDENTITY-MEMBERSHIP-DATA-MODEL.md) — users, tenants, memberships, sessions and indexes.
- [Vercel Deployment Topology](./operations/VERCEL-DEPLOYMENT-TOPOLOGY.md) — canonical frontend/API projects, environment boundaries and release gates.
- [MAC-to-Vercel Runtime Configuration Operations](./operations/MAC-VERCEL-RUNTIME-CONFIGURATION.md) — runtime fetch flow, configuration classes, OIDC security, cache/revocation and rollout sequence.
- [MAC/Vercel Runtime Configuration Progress](./project/MAC-VERCEL-RUNTIME-CONFIGURATION-PROGRESS.md) — verified inventory, current implementation state and blockers.
- [PR #13 / PR #14 Security Integration and Acceptance Plan](./operations/PR13-PR14-SECURITY-INTEGRATION-ACCEPTANCE.md) — branch reconciliation, audit-chain invariants, regression matrix and merge/release gates.

## Full Zuri OS baseline specifications

- [Master Execution Plan](./project/ZURI-OS-MASTER-EXECUTION-PLAN.md) — work packages, sequence, governance, acceptance and release gates.
- [Master Product Requirements Document](./product/ZURI-OS-MASTER-PRD-v1.0.md) — product outcomes, users, module catalogue, MVP boundary and requirements.
- [Technical Architecture](./architecture/ZURI-OS-TECHNICAL-ARCHITECTURE-v1.0.md) — modular boundaries, trust zones, APIs, events, data and operations.
- [MongoDB Database Blueprint](./database/ZURI-OS-MONGODB-DATABASE-BLUEPRINT-v1.0.md) — collections, tenancy, indexes, transactions, migrations and governance.
- [UI/UX Design System](./ux/ZURI-OS-UI-UX-DESIGN-SYSTEM-v1.0.md) — app shell, navigation, reusable components, workflows and accessibility.
- [Implementation Progress Register](./project/ZURI-OS-PROGRESS-REGISTER.md) — exact CI evidence, deployment state, blockers and release gates.

## Zuri OS platform foundation and Deliverable 6A

- [Foundation Status](./architecture/FOUNDATION-STATUS.md) — implemented foundation scope, verification evidence and outstanding gates.
- [Deliverable 6A — Platform Foundation](./architecture/DELIVERABLE-6A.md) — foundation scope and deliverables.
- [Deliverable 6A implementation roadmap](./architecture/DELIVERABLE-6A-IMPLEMENTATION-ROADMAP.md) — sequenced implementation plan and acceptance dependencies.
- [Deliverable 6A.1 acceptance criteria](./architecture/DELIVERABLE-6A.1-ACCEPTANCE.md) — testable acceptance conditions.
- [Deliverable 6A.3 platform API](./architecture/DELIVERABLE-6A.3-PLATFORM-API.md) — platform API scope and contracts.
- [Deliverable 6A.3 event contracts](./architecture/6A.3-EVENT-CONTRACTS.md) — event envelope and lifecycle requirements.
- [Deliverable 6A.4 governance and administration](./architecture/DELIVERABLE-6A.4-GOVERNANCE-ADMIN.md) — governance and administrative controls.
- [Security and release gates](./architecture/6A-SECURITY-AND-RELEASE-GATES.md) — security, operational and release acceptance gates.

## Document control

Every authoritative specification should state its owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions and change history. Use explicit statuses: **Draft**, **In Review**, **Approved**, **Superseded** or **Archived**.

## Documentation governance

- Keep this index current whenever a canonical document is added, renamed or moved.
- Keep ecosystem-wide principles in `docs/` and maintain synchronized, complete product-document mirrors under `docs/products/`; the owning product workspace remains the canonical implementation source.
- Record material architecture decisions with context, decision, alternatives, consequences, status and approval.
- Distinguish planned, implemented, tested, CI-verified, deployed and production-configured.
- Preserve all five approved MeBuMIP objectives and programme phases 0–7 unless the product owner explicitly approves a change.
- Never commit credentials, private keys, customer data, live access tokens or secret values.
- Do not claim production readiness, compliance certification, Meta approval or a live integration without evidence.

Product mirrors are maintained using `pnpm docs:sync` and verified using `pnpm docs:check`.
