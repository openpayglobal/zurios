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

**Latest CI repair:** [PR #8](https://github.com/openpayglobal/zurios/pull/8) fixes the OpenAPI schema-property parser and invalid escaped newlines in the location service. GitHub Actions [run #615](https://github.com/openpayglobal/zurios/actions/runs/44552128620) passed replica-set startup, OpenAPI lint, route/schema drift checks, typecheck, tests and build. The PR remains open; this is not a claim that the changes are merged or deployed.

## What is not yet accepted

- The 6A foundation has not completed independent security, tenant-isolation, operational and production-readiness acceptance.
- The outbox currently hands events to the internal MongoDB event stream. External broker/provider adapters, deployed consumer registry, alerting, replay operations and runbooks remain to be completed.
- The governance/admin implementation still needs full route-by-route acceptance, provider integration and UX/accessibility review.
- A separately packaged, shared design system has not yet been accepted.
- ERP, POS and Inventory are roadmap deliverables, not production-ready modules in this repository baseline.
- Vercel deployment status contexts for the current PR commit are failing and must be diagnosed before release.

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
