# ZURI Ecosystem — Vision, Architecture and Programme Overview

**Document status:** Baseline ecosystem reference  
**Programme owner:** OIPTECH / ODEL Developers  
**Repository:** openpayglobal/zurios  
**Last updated:** 2026-11-20

## 1. Purpose

ZURI is a modular business-technology ecosystem intended to support company operations, connected business services and extensible third-party integrations. The ecosystem is developed as a governed set of products and shared platform capabilities rather than as one tightly coupled application.

The repository is a shared engineering home. Each product must have a clearly defined product boundary, ownership, interfaces, security model, documentation and delivery gates. A product may initially reside in the monorepo while remaining architecturally extractable into its own repository or deployment.

This document establishes the ecosystem-level map. It does not claim that every envisioned product or integration has been implemented.

## 1.1 Canonical programme documents

The complete accessible Zuri OS baseline is indexed in [docs/README.md](./README.md), including the [Master Execution Plan](./project/ZURI-OS-MASTER-EXECUTION-PLAN.md), [Master Product Requirements Document](./product/ZURI-OS-MASTER-PRD-v1.0.md), [Technical Architecture](./architecture/ZURI-OS-TECHNICAL-ARCHITECTURE-v1.0.md), [MongoDB Database Blueprint](./database/ZURI-OS-MONGODB-DATABASE-BLUEPRINT-v1.0.md), [UI/UX Design System](./ux/ZURI-OS-UI-UX-DESIGN-SYSTEM-v1.0.md) and [Implementation Progress Register](./project/ZURI-OS-PROGRESS-REGISTER.md).

## 2. Ecosystem principles

1. **Modularity:** products have explicit boundaries and can evolve independently.
2. **API-first integration:** cross-product communication uses documented, versioned and authenticated contracts.
3. **Tenant isolation:** tenant-owned data and operations are scoped using server-derived identity and authorization context.
4. **Default-deny security:** authentication, role permissions and resource policies are enforced server-side.
5. **Least privilege:** services, operators and integrations receive only the permissions needed for their work.
6. **Auditability:** privileged and security-sensitive actions produce attributable audit records.
7. **Data stewardship:** collection, use, retention, export and deletion are documented and controlled.
8. **Operational evidence:** build, test, deployment and production configuration are separate claims with separate evidence.
9. **Provider isolation:** external services are accessed through adapters so provider changes do not leak across product boundaries.
10. **Governed evolution:** material changes to scope, architecture, data handling or security require documented decisions.

## 3. Product and platform boundaries

### 3.1 Zuri OS

Zuri OS is the broader modular Business Operating System foundation. Shared platform capabilities may include identity, tenant and membership context, authorization primitives, audit facilities, common UI conventions, integration contracts and operational tooling.

A shared capability must have a documented owner and interface. A product must not bypass its own authorization boundary by relying on an undocumented privileged path into another product.

### 3.2 Zuri MeBuMIP

**Zuri MeBuMIP — Zuri Meta Business Management and Integration Platform** is a standalone product owned by Blockchain Innovations LTD. It is designed to manage authorized Facebook, Instagram and WhatsApp business capabilities and expose controlled integrations to Zuri OS and third-party software.

MeBuMIP may initially be developed within this monorepo, but must retain its own frontend/API boundary, product documentation, tenant model and versioned integration interfaces.

Product documentation:
- [Product README](../products/zuri-mebumip/README.md)
- [Implementation roadmap](../products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md)
- [Product architecture](../products/zuri-mebumip/ARCHITECTURE.md)
- [Progress register](../products/zuri-mebumip/PROGRESS.md)
- [Phase 1 production security runbook](../products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md)

### 3.3 Future ecosystem products

Additional ZURI products and shared services must be added to the product catalogue only when their purpose, owner, boundary, dependencies and lifecycle are defined. This overview intentionally does not invent product names, capabilities or delivery commitments that have not been approved.

## 4. MeBuMIP approved objectives — scope baseline

All five objectives are approved and remain in scope:

| ID | Objective | Primary phase | Status |
|---|---|---:|---|
| A | Facebook Pages and Instagram account management | 2 | Not started |
| B | Facebook and Instagram advertising | 3 | Not started |
| C | WhatsApp Business Platform/API | 4 | Not started |
| D | Multi-business Meta management | 5 | Not started |
| E | Zuri OS and third-party integrations | 6 | Not started |

Supporting foundation work in Phase 1 enables these objectives. The table is a scope baseline, not evidence that the integrations are already live.

## 5. Programme phases and gates

| Phase | Scope | Status |
|---:|---|---|
| 0 | Governance and external Meta prerequisites | In progress; Meta setup deferred by the owner |
| 1 | Foundation, security, MAC and MAD | In progress |
| 2 | Facebook and Instagram management | Not started |
| 3 | Advertising | Not started |
| 4 | WhatsApp Business Platform | Not started |
| 5 | Multi-business SaaS | Not started |
| 6 | Zuri OS and third-party integrations | Not started |
| 7 | Production readiness and launch | Not started |

A phase is complete only when its deliverables, automated tests, security checks, operational evidence and formal exit criteria are satisfied. A code commit or successful build alone does not close a phase.

## 6. Shared logical architecture

The following is a logical target architecture. Components become operational only when implemented and verified in their owning workspace.

- **Experience layer:** product-specific web applications and administrative interfaces.
- **Identity and access:** authentication, sessions, tenant membership, platform roles, tenant roles and policy evaluation.
- **Product APIs:** independently versioned APIs with validation, authorization, rate limiting and consistent error contracts.
- **Domain services:** product-specific business workflows and provider adapters.
- **Integration boundary:** authenticated REST APIs, signed webhooks, event contracts and client credentials.
- **Asynchronous processing:** durable jobs, retry policies, idempotency and dead-letter handling where required.
- **Data layer:** MongoDB for the currently approved Zuri foundation; each product defines its own collections, indexes, ownership and retention.
- **Audit and operations:** security audit, health/readiness, structured telemetry, alerting, backups and recovery procedures.

### 6.1 Technology baseline

The current repository foundation uses pnpm workspaces/Turborepo, TypeScript, React/Vite, Fastify/Node.js, MongoDB and GitHub Actions. Vercel is an initial web deployment direction, not a blanket deployment decision for every service.

Technology changes require an architecture decision that records operational impact, migration strategy and compatibility.

## 7. MeBuMIP MAC and MAD governance boundary

- **MAC — Master Admin Console:** privileged control plane. It manages platform configuration, administrators, tenant administration, policy-controlled settings and security operations.
- **MAD — Master Admin Dashboard:** operational monitoring and reporting surface. It presents platform health, tenant and connection status, webhook/API health, usage, incidents and other approved operational metrics.

MAC controls; MAD monitors. MAD is read-only by default. The backend must enforce the boundary even if a frontend control is hidden. Privileged MAC mutations require appropriate platform permissions, step-up authentication where configured, CSRF protection for cookie-authenticated requests and an audit record.

See the [MeBuMIP architecture](../products/zuri-mebumip/ARCHITECTURE.md) for product-specific boundaries and the [progress register](../products/zuri-mebumip/PROGRESS.md) for implementation evidence.

## 8. Security and data governance baseline

- Resolve tenant scope from verified identity and active membership; never trust a client-provided tenant ID as authorization.
- Enforce role permissions and resource-level policy on every protected API operation.
- Keep provider tokens and encryption keys out of browser code, source control and logs.
- Bind OAuth state to the initiating user/session and tenant; enforce strict redirect URI allowlists and single-use expiry.
- Verify webhook signatures against the raw request body, deduplicate events and persist receipts before asynchronous processing.
- Keep secrets in deployment secret management and use separate environment credentials.
- Define data classification, consent, purpose, retention, export and deletion before enabling customer-facing data flows.
- Protect audit records with restricted database roles, tamper evidence, independent immutable retention and periodic verification.
- Maintain backup, restore, incident response and key-recovery procedures.
- Do not claim regulatory certification or Meta approval without formal evidence.

The [Phase 1 production security runbook](../products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md) records current MeBuMIP release gates. Its checklist is not proof that production controls have already been configured.

## 9. External provider and Meta integration governance

Meta-dependent functionality must be implemented against deterministic mocks and contract fixtures until the owner completes the external prerequisites. Before live customer onboarding, the relevant Meta Business Portfolio, developer app, product configuration, permissions, business verification, App Review and any applicable Advanced Access or Tech Provider requirements must be completed.

Each capability must document:
- Required provider products, permissions and access level.
- Customer consent and asset ownership/authorization.
- Token storage, encryption, expiry, refresh and revocation behavior.
- Supported API version and provider error/rate-limit behavior.
- Webhook verification, idempotency, retries and observability.
- Disconnect, data deletion and customer support procedures.

The owner has deferred Meta setup. This is a tracked external dependency, not permission to simulate live integration status.

## 10. API and integration standards

Cross-product and third-party interfaces should:
- Use explicit versioning and documented schemas.
- Authenticate users or service clients and authorize each resource/action.
- Apply tenant scoping, rate limits and idempotency to mutation workflows.
- Use signed webhooks with timestamp/replay controls and delivery retry visibility.
- Avoid exposing internal database models or provider credentials.
- Publish deprecation and compatibility policies.
- Include contract tests and a runnable integration example before general availability.

The MeBuMIP roadmap defines the Phase 6 external integration exit gate.

## 11. Delivery governance and status language

Use these distinct terms accurately:

- **Planned:** documented, not implemented.
- **Implemented:** code exists; testing may still be pending.
- **Tested:** relevant automated or manual tests passed.
- **CI-verified:** the relevant workflow passed on the exact commit.
- **Deployed:** a deployment artifact/environment exists and its identity is known.
- **Production-configured:** required production secrets, provider approvals and infrastructure controls are configured and verified.
- **Complete:** the approved acceptance criteria and phase exit gate are met.

Every material progress report must include:
1. Work completed and exact repository/commit evidence.
2. Tests and CI results, including pending or failed checks.
3. Open defects, dependencies and risks.
4. All five approved objectives and their statuses.
5. All programme phases 0–7 and their statuses.

Do not create a production deployment, merge, release or pull request without the applicable approval.

## 12. Documentation structure and ownership

- docs/ — ecosystem-wide documentation and navigation.
- products/<product>/ — product definition, architecture, roadmap, progress and runbooks.
- .github/workflows/ — automated engineering verification.
- Future docs/adr/, docs/security/, docs/api/, docs/operations/ and docs/compliance/ directories should be added when their documents are authored and reviewed.

The [documentation index](./README.md) is the entry point. Product documents remain authoritative for detailed implementation status; this ecosystem overview is authoritative for shared principles and navigation.

## 13. Current programme position

At the latest recorded checkpoint, MeBuMIP Phase 1 remains **In progress**. The existing implementation includes authentication/session lifecycle, MFA, tenant and platform administrator lifecycle, MAC/MAD surfaces, rate limiting, signed audit events and exports, and MongoDB-backed integration tests.

Outstanding closure gates include independently immutable audit archiving, safe key versioning/rotation and migration, production email configuration, production database least privilege and backup/restore evidence, and deployment-specific HTTPS/CORS/proxy/cookie verification. The repository validation and MeBuMIP Phase 1 workflows passed on commit 0506145297c3547ddc8f81f6130c264a3d803f4e (runs 44733364576 and 44733364512); see the product progress register for exact test summaries. Vercel checks remain blocked by the configured build-rate limit and are not treated as application CI evidence.

No live Meta integration, production deployment, immutable archive provider configuration or Phase 1 closure is claimed here. Consult the [progress register](../products/zuri-mebumip/PROGRESS.md) for the latest evidence-based status.
