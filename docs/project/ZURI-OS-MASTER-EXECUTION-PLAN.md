# Zuri OS — Master Project Execution Plan

**Document ID:** ZURI-PMO-EXEC-001  
**Version:** 1.0  
**Status:** Active implementation baseline  
**Owner:** OIPTECH / ODEL Developers  
**Repository:** https://github.com/openpayglobal/zurios  
**Primary delivery model:** Zero-additional-cost, phased modular MVP  
**Database invariant:** MongoDB is the sole application database  
**Canonical administration route:** https://zurios.vercel.app/mac

## 1. Purpose and authority

This plan governs implementation of the complete Zuri OS Business Operating System. It converts the approved product scope into sequenced, testable engineering increments. It is subordinate to approved product decisions and architecture decision records (ADRs), and is the working control document for engineering, quality, security, release and operational readiness.

This plan does not claim that planned capabilities already exist. Every capability must be tracked as specified, designed, in development, implemented, tested, or production-verified.

## 2. Product outcome

Zuri OS is a modular, multi-tenant Business Operating System for organizations and businesses. It combines operational applications, finance, commerce, people, inventory, analytics, integrations, AI-assisted work, and platform administration within one governed ecosystem.

The product must support:
- Small businesses through multi-branch and enterprise organizations.
- Uganda-first localization and payment/provider configuration, with additional jurisdictions supported through configuration.
- Modular subscriptions, licensing, feature entitlements and independent product activation.
- Tenant, organization, workspace, branch, location and user contexts.
- Browser-first use, responsive interfaces and offline-capable workflows where justified.
- First-party products, approved partner integrations and developer/customer applications.
- Provider-neutral architecture with Vercel as an initial deployment target, not a permanent lock-in.

## 3. Non-negotiable engineering constraints

1. MongoDB is the only application database. Do not introduce PostgreSQL, MySQL, Firebase/Firestore or another operational database.
2. TypeScript-first monorepo; React, Vite and Tailwind for the web application; Node.js/Fastify for APIs.
3. Tenant isolation is enforced server-side on every tenant-owned read and write.
4. RBAC and ABAC are default-deny and are enforced at API/service boundaries, not only in UI navigation.
5. Financial operations use an immutable double-entry ledger, idempotency, atomicity and reconciliation.
6. Secrets never enter source control, browser bundles, logs, analytics or ordinary audit payloads.
7. Every privileged action is attributable, authorized, auditable and, where required, approval-gated.
8. External callbacks and provider responses are untrusted until authenticated and validated.
9. No compliance certification, provider capability, deployment status or production readiness may be claimed without evidence.
10. Zero additional recurring cost is a project constraint. Do not enable paid add-ons, plan upgrades, paid APIs or billable infrastructure without explicit owner approval.

## 4. Delivery lifecycle and gates

Every feature moves through the following states:

| State | Exit evidence |
|---|---|
| Specified | User story, acceptance criteria, business rules and exclusions approved |
| Designed | API, data, security, UX and failure behaviour documented |
| In development | Branch and implementation owner recorded |
| Implemented | Code and migrations committed; feature flag and configuration documented |
| Tested | Unit, integration, authorization, tenant-isolation and relevant end-to-end tests pass |
| Production-verified | Deployed to approved production environment and live operational checks pass |

A feature cannot skip the security, data-integrity or acceptance gates because it is visually complete.

## 5. Execution order and work packages

### WP-01 — Product requirements and governance

**Deliverable:** Master Product Requirements Document (PRD).

Scope:
- Product vision, target users, personas, jobs-to-be-done and market/use-case boundaries.
- Business model, packaging, entitlements, plans, limits and monetization assumptions.
- Product taxonomy, modules, dependencies and lifecycle.
- Functional requirements, non-functional requirements, user journeys and exception paths.
- Uganda-first regulatory discovery register; no unsupported legal/compliance claims.
- Success metrics, assumptions, risks, exclusions and acceptance criteria.

Exit gate: all major product domains have traceable requirements and acceptance criteria.

### WP-02 — Technical architecture

**Deliverable:** Technical Architecture Specification and ADR register.

Scope:
- Monorepo boundaries, frontend, API, shared packages and provider adapters.
- Modular monolith-first service boundaries, extraction criteria and event contracts.
- Identity, sessions, SSO extension points, RBAC/ABAC and tenant context.
- API versioning, OpenAPI 3.1, validation, error model, pagination and idempotency.
- Event/outbox patterns, background work and retry/dead-letter policy.
- Security boundaries, threat model, key management and audit.
- Offline synchronization and conflict-resolution architecture.
- Observability, backup/restore, disaster recovery and portability.

Exit gate: every service boundary and cross-cutting invariant is documented and reviewed.

### WP-03 — UI/UX and design system

**Deliverable:** Product design system and application interaction specification.

Scope:
- Responsive app shell, global navigation, tenant/organization context and workspace switcher.
- Design tokens, typography, spacing, accessible components and interaction states.
- Tables, filters, forms, command palette, notifications, approvals and activity timelines.
- Dashboard widgets with source, freshness and permission-aware visibility.
- Light/dark themes, localization, currencies and accessible contrast.
- Loading, empty, error, offline, retry and permission-denied states.

Exit gate: critical journeys have reviewed screen specifications and accessible reusable components.

### WP-04 — MongoDB data blueprint

**Deliverable:** MongoDB Database Blueprint and migration/index plan.

Scope:
- Collection catalogue, document shapes, ownership and lifecycle.
- Tenant and organization partitioning, references and embedding decisions.
- Validation schemas, unique/compound/TTL indexes and query patterns.
- Transaction boundaries and replica-set requirements.
- Migration registry, migration safety and rollback/recovery strategy.
- Retention, archival, deletion, export and data residency controls.
- Synthetic seed fixtures and test data strategy.

Exit gate: every implemented domain has reviewed schema, index and migration coverage.

### WP-05 — Repository and engineering foundation

**Deliverable:** stable GitHub engineering baseline.

Scope:
- pnpm workspace and Turborepo consistency.
- Node.js and package-manager version pinning.
- CI: frozen install, lint, typecheck, tests, build, OpenAPI validation and MongoDB-backed tests.
- Branch/PR rules, code ownership, release tags and change log.
- Environment templates with placeholders only; secret scanning.
- Reproducible local setup and developer onboarding.

Exit gate: clean checkout installs reproducibly and all mandatory CI jobs pass.

### WP-06 — Platform foundation

**Deliverable:** Zuri Core platform services.

Implementation increments:
1. Application bootstrap, configuration validation and health/readiness.
2. MongoDB connection lifecycle, indexes and migrations.
3. Identity, login, password security, sessions, refresh rotation, logout and recovery.
4. MFA enrollment, verification and privileged-access requirements.
5. Tenant, organization, workspace, branch and membership lifecycle.
6. RBAC roles, permission catalog, ABAC policy evaluation and scope enforcement.
7. Audit event model and append-only application writer.
8. Idempotency records and transactional outbox/event delivery.
9. Feature flags, entitlements, notification primitives and service registry.
10. OpenAPI 3.1 contracts, rate limiting and abuse controls.

Exit gate: authorization, tenant isolation, session revocation, audit, idempotency and outbox integration tests pass.

### WP-07 — Business applications MVP

Deliver in dependency order, with modules independently feature-flagged:

**Wave A — operational foundation**
- Zuri Core workspace, business profile, locations, users and permissions.
- Zuri Stock: product catalogue, categories, units, variants, stock locations and movements.
- Zuri Till / Zuri Register: sales, quotes, receipts, returns and cash sessions.
- Zuri Ledger: chart of accounts, journals, posting rules, trial balance and financial periods.

**Wave B — customer and supplier operations**
- Zuri CRM: leads, contacts, customers, opportunities and service history.
- Zuri Supply: suppliers, purchase requests, purchase orders, goods received and supplier bills.
- Zuri Pay: payment intents, payment records, provider adapters, settlement and reconciliation.
- Zuri Commerce: catalogue publication, orders, fulfilment and returns.

**Wave C — people and management**
- Zuri People: employee records, teams, roles and onboarding.
- Zuri Workforce: schedules, attendance, leave and task assignments.
- Zuri Insight: operational reports, dashboards and exports.
- Zuri Documents and Projects: records, approvals, tasks and collaboration.

**Wave D — vertical and advanced applications**
- Manufacturing, hospitality, pharmacy, franchise and sector-specific packs.
- Devices OS, Cloud & Hosting OS and customer/developer application hosting orchestration.
- Marketplace and partner ecosystem.

Financial and inventory correctness gates apply to every relevant workflow. A POS sale must reconcile stock, payment, tax treatment and ledger postings through explicit, tested business rules.

### WP-08 — MAC/MAD and platform operations

**Deliverable:** Master Admin Console and integrated Master Admin Dashboard.

Canonical route: `/mac`.

MAC domains:
- Ecosystem/product/service registry and entitlements.
- Tenants, environments, regions and configuration.
- Global identity, roles, policies and privileged operators.
- Provider registry, credentials and capability discovery.
- Projects, deployments, releases, domains and certificates.
- MongoDB connection metadata, health, backup and restore operations.
- API registry, contracts, webhooks and service credentials.
- Environment & Secrets Management.
- AI provider/model/agent governance and budgets.
- Security incidents, audit, alerts and approvals.
- Observability, quotas and cost visibility.

MAD views:
- Ecosystem health and service status.
- Deployment and release status.
- Database and API health.
- Security alerts and privileged activity.
- Payments/integration exceptions.
- Agent actions and escalations.
- Quotas, usage and pending approvals.

Environment management must distinguish two planes:
1. Deployment variables managed through the hosting provider. Vercel environment-variable changes apply to subsequent deployments, not already-running deployments.
2. Approved live runtime configuration retrieved server-side from the Zuri configuration service. This can update without redeployment only for explicitly declared runtime-safe settings.

Bootstrap secrets (database URI, configuration encryption root key and provider credentials needed to access the configuration service) remain outside the runtime store or are securely provisioned through a non-circular bootstrap mechanism. Secret values are write-only after submission and are never returned to browser clients.

Exit gate: global-admin authorization, MFA, approvals, audit, secret masking, configuration scoping and provider synchronization tests pass.

### WP-09 — AI, marketplace and ecosystem

**Deliverable:** governed intelligence and extensibility platform.

Scope:
- Provider-neutral AI model registry and policy-based model routing.
- Agent registry, tool/capability catalog, scoped credentials and execution traces.
- Human approval for financial, identity, security, external communication and destructive actions.
- Budgets, rate limits, data handling rules and prompt/tool injection controls.
- Retrieval and knowledge sources with access-control trimming and provenance.
- Marketplace listings, publisher verification, app permissions, installation and revocation.
- Connector SDK, webhooks, event subscriptions and partner API lifecycle.
- Developer portal, API keys, sandbox/test fixtures and versioned SDKs.

Exit gate: agents cannot exceed explicit scopes; all tool actions are auditable and revocable; marketplace permissions are least-privilege.

### WP-10 — Quality, security and release

**Deliverable:** verified release candidate and operations handbook.

Scope:
- Unit, integration, contract, end-to-end and regression suites.
- Tenant-isolation, privilege-escalation and access-control tests.
- Financial ledger invariants, duplicate callback and reconciliation tests.
- Inventory concurrency and stock-consistency tests.
- Secret scanning, dependency review, static analysis and threat-model verification.
- Load/performance tests sized to the actual available infrastructure.
- Backup restore and disaster-recovery exercise.
- Operational dashboards, incident playbooks, runbooks and release checklist.
- Staged preview rollout and production acceptance only after owner approval.

Exit gate: all critical defects resolved, release evidence recorded, backup/restore tested and production security review approved.

## 6. Initial MVP boundary

The first usable MVP is not every vertical application. It is the smallest coherent business system that can be operated safely:

1. Secure identity and tenant administration.
2. Business profile, organizations, branches and permissions.
3. Product catalogue and inventory movements.
4. POS sales, receipts, returns and cash sessions.
5. Payment recording and reconciliation using a sandbox/manual adapter until a provider is approved.
6. Double-entry ledger with balanced posting and period controls.
7. Basic reports and audit history.
8. MAC/MAD foundational administration and configuration metadata.

The MVP must be end-to-end usable for a controlled test business before vertical applications and marketplace expansion are prioritized.

## 7. Zero-additional-cost delivery policy

- Use existing GitHub, Vercel and MongoDB Atlas allocations only within their actual quotas and terms.
- Prefer local development, local MongoDB replica-set test fixtures and CI services already available.
- Do not purchase static egress, paid observability, paid AI APIs, premium plans, domains or marketplace services without explicit approval.
- Do not repeatedly retry operations after a provider quota or billing rejection.
- Avoid architecture that depends on a paid-only feature for local development or the first MVP.
- Document free-tier limits and the point at which a paid upgrade becomes a conscious owner decision.
- Do not represent unrestricted database ingress as production-secure. Keep non-production data synthetic until a secure, affordable network path is available.

## 8. Repository workflow and merge policy

- Keep the default branch releasable.
- Use short-lived feature branches and pull requests.
- Do not force-push or force-merge around checks.
- Reconcile long-running branches before merging; preserve newer target-branch work.
- Require CI evidence for code changes.
- Use squash or merge commits according to repository policy; preserve meaningful history.
- Do not deploy production or promote a deployment without explicit owner authorization.
- Record implementation evidence and known blockers in the relevant PR and status document.

## 9. Current verified baseline at plan creation

- Repository: `openpayglobal/zurios`.
- PR #4: merged on 2026-11-19 into `feature/6a3-platform-api` after branch reconciliation; merge commit `b3abd3af7f6442a00b780eb755428c7aed492617`.
- PR #6: open; carries the product/architecture/database/UX specifications and the first MAC/MAD web foundation. CI is being run and failures are being corrected before merge.
- PR #4 reconciliation commit before squash merge: `ad252ca39fb50c3a0bef742a3b8200280ceaa9d5`.
- Existing CI run on the earlier PR head passed frozen pnpm install, MongoDB replica-set startup, OpenAPI lint, typecheck, tests, builds and Fastify health smoke tests.
- Current Vercel deployment quota had returned HTTP 402 for the free daily deployment limit; no paid upgrade is authorized.
- Preview API environment variables have been configured, but the current deployment has not yet consumed the latest values.
- Atlas network access still includes `0.0.0.0/0`; this is not acceptable for production. Do not claim production readiness.
- The canonical MAC/MAD URL is documented. The complete MAC/MAD application is not yet implemented or production-verified.

## 10. Immediate next actions

1. Confirm CI on the reconciled PR head and resolve any failures without discarding the latest platform API work.
2. Merge PR #4 after required checks are green and GitHub permits the merge.
3. Create the authoritative requirements/architecture/UX/data blueprint documents as versioned repository artifacts.
4. Establish the design system and platform foundation acceptance backlog.
5. Implement platform foundation in small, testable PRs.
6. Deliver the operational MVP in dependency order.
7. Implement MAC/MAD and the secure runtime configuration plane.
8. Add AI, marketplace and vertical applications after their platform dependencies.
9. Complete release, security and recovery gates.
10. Deploy only within available free-tier quotas and only after explicit production approval.

## 11. Change control

Changes to product scope, architecture, database technology, identity model, financial invariants, security posture, provider spend or production deployment require an ADR or explicit owner decision. Implementation teams may improve internal details when they preserve these invariants and document the rationale.
