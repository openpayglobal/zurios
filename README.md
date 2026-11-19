# Zuri OS

**A modular, multi-tenant Business Operating System by OIPTECH / ODEL Developers.**

Zuri OS is being built as one governed platform with shared identity, tenant boundaries, authorization, audit, event delivery and design-system foundations. ERP, POS, Inventory and subsequent business ecosystems must consume those shared authorities rather than creating parallel identity, permission or ledger systems.

## Current engineering status

The repository is in active foundation implementation. The current `main` baseline contains:

- A pnpm/Turborepo TypeScript monorepo with React/Vite web and Fastify API applications.
- MongoDB as the application database, with transaction-backed services requiring a replica set.
- Tenant, organization, location, membership, user, session, RBAC and ABAC platform services.
- Password/JWT authentication, MFA flows, recovery-code and session lifecycle logic.
- Versioned platform API routes, Zod request schemas, OpenAPI 3.1 contract and route/schema drift validation.
- Idempotent mutation handling, transactional audit/outbox writes, a MongoDB-backed event stream and consumer receipt primitives.
- Governance/admin API and workspace capabilities for approvals, tenant lifecycle, invitations, policy simulation, audit, configuration and break-glass controls.
- Initial `@zuri/design-system` workspace package with semantic tokens, shared React primitives, admin-shell integration and server-rendered component tests; full visual/accessibility acceptance remains pending.
- Platform API and admin routes now enforce default-deny ABAC; membership creation and platform-operator bootstrap create scoped allow policies, with a dry-run-first backfill utility for legacy memberships and grants.
- All 21 tenant/platform admin HTTP routes and all 16 versioned platform API route families now have replica-set integration coverage; [Actions run #705](https://github.com/openpayglobal/zurios/actions/runs/44560227803) and [run #709](https://github.com/openpayglobal/zurios/actions/runs/44560663776) passed the complete pipeline.
- Initial ERP, POS and Inventory domain contracts now live in @zuri/domain-contracts; these are versioned schemas and invariants, not yet the domain services or production APIs.

**Latest CI repair:** [PR #8](https://github.com/openpayglobal/zurios/pull/8) now includes the pnpm v9 lockfile, frozen CI installs, Turbo MongoDB environment propagation, runner-reachable replica-set initialization, migration/outbox fixes and expanded auth HTTP route tests. GitHub Actions [run #681](https://github.com/openpayglobal/zurios/actions/runs/44557432014) passed the complete pipeline with database-backed integration tests executing (not skipped). [Run #698](https://github.com/openpayglobal/zurios/actions/runs/44559275964) additionally passed default-deny ABAC route tests, policy provisioning and backfill typecheck. [PR #9](https://github.com/openpayglobal/zurios/pull/9) adds the initial shared design-system package; [run #679](https://github.com/openpayglobal/zurios/actions/runs/44557264189) passed its full CI pipeline. Both PRs remain open; these changes are not merged into `main`.

## What is not yet accepted

- The 6A foundation has not completed independent security, tenant-isolation, operational and production-readiness acceptance.
- The outbox currently hands events to the internal MongoDB event stream. External broker/provider adapters, deployed consumer registry, alerting, replay operations and runbooks remain to be completed.
- The governance/admin implementation still needs full route-by-route acceptance, provider integration and UX/accessibility review.
- The initial shared design-system package is implemented and CI-tested, but visual regression, keyboard-flow and independent WCAG 2.2 AA acceptance remain open.
- ERP, POS and Inventory are roadmap deliverables, not production-ready modules in this repository baseline.
- Vercel previews are currently blocked by the account's free-tier daily deployment quota (over 100 deployments); the earlier PR #8 web preview reached READY. Wait for quota reset or plan adjustment before retrying deployment.

See [the whole-ecosystem roadmap](docs/architecture/WHOLE-ECOSYSTEM-ROADMAP.md) for the implementation sequence, dependencies, acceptance gates and progress ledger. No compliance certification or production readiness is claimed.

## Technology and repository layout

- pnpm workspaces + Turborepo
- TypeScript, Node.js 22+
- React + Vite + Tailwind CSS
- Fastify API
- MongoDB (transaction workflows require a replica set)
- GitHub Actions CI
- `apps/web` — web application
- `apps/api` — API and platform routes
- `packages/*` — shared platform/domain packages
- `docs/architecture` — architecture decisions, contracts, roadmap and acceptance records

## Local development

1. Install Node.js 22.12+ and pnpm 9.15.4.
2. Start MongoDB as a replica set for transaction-backed workflows.
3. Copy `.env.example` to `.env` and configure unique secrets (never commit them).
4. Run `pnpm install`.
5. Run `pnpm dev`.

The API defaults to port 4000 and the web application to port 5173.

## Non-negotiable platform invariants

- Tenant identity is derived from a verified principal and active membership, never trusted from a caller-supplied tenant ID.
- Organization and location scopes narrow tenant access.
- Authorization is default-deny; RBAC and ABAC must both permit the operation.
- Mutations are idempotent where retryable; domain change, audit and outbox writes share a transaction.
- Event delivery is at-least-once; consumers deduplicate using stable event IDs and idempotent side effects.
- Financial postings use a balanced, immutable double-entry ledger; inventory movements use an append-only stock movement ledger.
- Secrets, credentials, private keys and production data must never be committed.
- Keep `main` releasable. Work on feature branches, use reviewed pull requests, and preserve the approved MongoDB-native architecture.
