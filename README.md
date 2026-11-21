# Zuri OS

**A modular, multi-tenant Business Operating System by OIPTECH / ODEL Developers.**

Zuri OS is developed as a governed ecosystem of modular products and shared platform capabilities. Product boundaries, APIs, security controls and delivery status are documented explicitly; the presence of a workspace or roadmap does not imply production readiness.

## Documentation

**Start with the [ZURI ecosystem documentation index](./docs/README.md).**

- [ZURI Ecosystem Overview](./docs/ZURI-ECOSYSTEM-OVERVIEW.md) — ecosystem principles, architecture, governance and programme map.
- [Zuri MeBuMIP product documentation](./products/zuri-mebumip/README.md) — product scope and implementation entry point.
- [MeBuMIP implementation roadmap](./products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md) — approved objectives A–E and phases 0–7.
- [MeBuMIP architecture](./products/zuri-mebumip/ARCHITECTURE.md) — product boundaries, MAC/MAD, tenant model and integration design.
- [MeBuMIP progress register](./products/zuri-mebumip/PROGRESS.md) — implementation evidence, CI status and open gates.
- [Phase 1 production security runbook](./products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md) — operational release prerequisites.

## Technology baseline

- pnpm workspaces + Turborepo
- TypeScript
- React + Vite
- Fastify / Node.js
- MongoDB
- GitHub Actions
- Vercel as an initial web deployment direction

The stack is a repository-level baseline; each product's deployable architecture and operational requirements must be documented independently.

## Repository layout

- apps/ — application workspaces
- packages/ — shared contracts and libraries
- products/ — independently bounded product workspaces
- docs/ — ecosystem-wide documentation and navigation
- .github/workflows/ — CI and engineering automation

## Security invariants

- Tenant identity is required for tenant-owned operations and is derived from verified identity/session context.
- Authorization is default-deny; server-side role and resource policy checks are mandatory.
- Never accept a client-supplied tenant identifier as proof of access.
- Privileged actions must be authorized and audited.
- Secrets, credentials, private keys, customer data and live provider tokens must never be committed.
- A successful build is not proof of production readiness or compliance.

## Engineering governance

Keep the default branch releasable. Use feature branches and reviewed changes for delivery. Record material architecture decisions, preserve approved product scope, and test tenant isolation, authorization boundaries, audit integrity and integration contracts before enabling business capabilities.

## Delivery status

Product-specific status is maintained in each product's progress register. MeBuMIP Phase 1 remains in progress; Meta setup is deferred by the owner, and production readiness is not claimed. See the [ecosystem overview](./docs/ZURI-ECOSYSTEM-OVERVIEW.md) and [MeBuMIP progress register](./products/zuri-mebumip/PROGRESS.md) for current programme context.
