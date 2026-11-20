# ZURI Ecosystem — Vision, Architecture and Programme Overview

**Document status:** Baseline ecosystem reference (In Review)  
**Programme owner:** Blockchain Innovations LTD  
**Repository:** openpayglobal/zurios  
**Last updated:** 2026-11-20

## 1. Purpose

ZURI is a modular business-technology ecosystem intended to support company operations, connected business services and extensible third-party integrations. It is developed as a governed set of products and shared platform capabilities rather than one tightly coupled application.

The repository is a shared engineering home. Each product must have a defined product boundary, owner, interfaces, security model, documentation and delivery gates. Products may initially reside in the monorepo while remaining architecturally extractable.

This overview maps the ecosystem; it does not claim that every planned product or integration is implemented.

## 2. Ecosystem principles

1. Modularity and explicit product ownership.
2. API-first, versioned and authenticated integration.
3. Tenant isolation derived from server-verified identity and membership.
4. Default-deny authorization and least privilege.
5. Auditable privileged and security-sensitive actions.
6. Data stewardship: purpose, consent, retention, export and deletion.
7. Provider isolation through replaceable adapters.
8. Operational evidence separate from code, test, deployment and production-readiness claims.
9. Governed changes to scope, architecture, security and data handling.

## 3. Product and platform boundaries

### Zuri OS

The shared Business Operating System foundation. Shared capabilities include identity, workspace/tenant membership, authorization, audit, common UI conventions, integration contracts and operational tooling.

### Zuri MeBuMIP

**Zuri Meta Business Management and Integration Platform** is a standalone product owned by Blockchain Innovations LTD. It is designed to manage authorized Facebook, Instagram and WhatsApp business capabilities and expose controlled integrations to Zuri OS and third-party software.

MeBuMIP retains its own frontend/API boundary, product documentation, tenant model and versioned integration interfaces even while developed in this monorepo.

Product documentation:
- [Product README](../products/zuri-mebumip/README.md)
- [Implementation roadmap](../products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md)
- [Architecture](../products/zuri-mebumip/ARCHITECTURE.md)
- [Progress register](../products/zuri-mebumip/PROGRESS.md)
- [Phase 1 production security runbook](../products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md)

### Other ecosystem products

Add future products to the catalogue only after their purpose, owner, boundaries, dependencies and lifecycle are defined. Do not infer additional product names or commitments from the existence of a generic roadmap.

## 4. MeBuMIP approved objectives

| ID | Objective | Primary phase | Status |
|---|---|---:|---|
| A | Facebook Pages and Instagram account management | 2 | Not started |
| B | Facebook and Instagram advertising | 3 | Not started |
| C | WhatsApp Business Platform/API | 4 | Not started |
| D | Multi-business Meta management | 5 | Not started |
| E | Zuri OS and third-party integrations | 6 | Not started |

These objectives are a scope baseline, not evidence that the integrations are live.

## 5. Programme phases

| Phase | Scope | Status |
|---:|---|---|
| 0 | Governance and external Meta prerequisites | In progress; Meta setup deferred by owner |
| 1 | Foundation, security, MAC and MAD | In progress |
| 2 | Facebook and Instagram management | Not started |
| 3 | Advertising | Not started |
| 4 | WhatsApp Business Platform | Not started |
| 5 | Multi-business SaaS | Not started |
| 6 | Zuri OS and third-party integrations | Not started |
| 7 | Production readiness and launch | Not started |

A phase closes only when deliverables, tests, security checks, operational evidence and formal exit criteria are satisfied.

## 6. Shared logical architecture

- Experience: product-specific web applications and administrative interfaces.
- Identity and access: global user identity, sessions, workspace memberships, platform roles, tenant roles and policy evaluation.
- Product APIs: versioned APIs with validation, authorization, rate limiting and consistent errors.
- Domain services: product-owned workflows and provider adapters.
- Integration: authenticated REST APIs, signed webhooks, event contracts and client credentials.
- Asynchronous processing: durable jobs, retries, idempotency and dead-letter handling where required.
- Data: MongoDB for the currently approved Zuri foundation; each product documents collection ownership, indexes and retention.
- Audit and operations: security audit, health/readiness, telemetry, alerts, backups and recovery.

## 7. Identity and workspace model

A person has one Zuri identity and may have active memberships in multiple workspaces. Authentication establishes the person's identity; workspace selection establishes the active tenant context for the current application session. Switching workspaces must not create a second user, mutate membership, or grant access to an unjoined tenant.

Membership is a tenant-scoped relationship with its own status, role assignments and optional organization/location scope. A user may have different roles in different workspaces. Revoking one membership must not delete the global user or unrelated memberships. Session and token claims must bind to the selected tenant and membership; every request revalidates active membership and tenant status.

See [Identity and multi-workspace architecture](./architecture/IDENTITY-AND-MULTI-WORKSPACE.md), [sign-in UX](./ux/SIGN-IN-AND-WORKSPACE-SELECTION.md), [API contract](./api/IDENTITY-AND-WORKSPACE-CONTRACTS.md) and [data model](./database/IDENTITY-MEMBERSHIP-DATA-MODEL.md).

## 8. MeBuMIP MAC and MAD boundary

- MAC — Master Admin Console: privileged control plane for platform configuration, administrators, tenant administration and security operations.
- MAD — Master Admin Dashboard: operational monitoring and reporting surface.

MAC controls; MAD monitors. MAD is read-only by default. Hiding a frontend control is never an authorization boundary. Privileged mutations require server-side permissions, step-up authentication where configured, CSRF protection for cookie-authenticated requests and audit evidence.

## 9. Security and data governance

- Resolve tenant scope from verified identity and active membership; never trust client-supplied tenant IDs as proof of access.
- Enforce role and resource policy on every protected operation.
- Keep provider tokens and encryption keys out of browser code, source control and logs.
- Bind OAuth state to the initiating user/session and workspace; use strict redirect allowlists and single-use expiry.
- Verify webhook signatures over the raw body, deduplicate events and persist receipts before asynchronous processing.
- Use separate environment credentials and deployment secret management.
- Define classification, consent, purpose, retention, export and deletion before customer data flows.
- Protect audit records with restricted database roles, tamper evidence and independently immutable retention.
- Maintain backup, restore, incident response and key-recovery procedures.
- Do not claim regulatory certification or Meta approval without evidence.

## 10. Meta provider governance

Until the owner completes external prerequisites, implement against deterministic mocks and contract fixtures. Live customer onboarding requires the relevant Business Portfolio, developer app, product configuration, permissions, business verification, App Review and applicable access approvals.

Each capability must document permissions, consent, asset ownership, token lifecycle, API version, rate limits, webhook verification, retries, disconnect and deletion procedures. Meta setup is deferred by the owner; this is an external dependency, not permission to simulate live status.

## 11. Delivery status language

- Planned: documented, not implemented.
- Implemented: code exists; tests may be pending.
- Tested: relevant tests passed.
- CI-verified: relevant workflow passed on the exact commit.
- Deployed: a deployment artifact/environment exists and is identified.
- Production-configured: production secrets and controls are configured and verified.
- Complete: approved acceptance criteria and phase exit gate are met.

Every progress report records work/commit evidence, test/CI results, open risks, all five objectives and phases 0–7. Do not claim a deployment or production readiness from a successful build alone.

## 12. Documentation control

- docs/: ecosystem-wide principles and navigation.
- products/<product>/: product requirements, architecture, roadmap, progress and runbooks.
- packages/: shared contracts and libraries.
- apps/: deployable applications and APIs.
- .github/workflows/: engineering verification.

Every authoritative document states owner, status, version, approval date, scope, dependencies, assumptions, unresolved decisions and change history. This overview is the shared ecosystem map; detailed product status remains in each product's progress register.

## 13. Current position and limitations

MeBuMIP Phase 1 remains in progress. Its implementation and test evidence are recorded in the product progress register. Production email configuration, independent immutable audit retention, database least privilege, backup/restore evidence, external security review and deployment-specific HTTPS/CORS/proxy/cookie verification remain separate gates.

No live Meta integration, production migration, immutable archive provider configuration, Phase 1 closure or ecosystem-wide production readiness is claimed here.

## 14. External reference dependency

The product owner supplied [ODEI-Multi-Ecosystem](https://github.com/infoedutechos/ODEI-Multi-Ecosystem) as an additional reference. It was not retrievable through the connected GitHub account during this implementation checkpoint (repository lookup returned 404). Requirements unique to that source are therefore not inferred or copied. Reconcile this section and the product catalogue when repository access is available.
