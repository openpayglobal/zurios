# Zuri OS

**A modular, multi-tenant Business Operating System by OIPTECH / ODEL Developers.**

Zuri OS is being designed as a unified platform for business operations, commerce, finance, inventory, workforce, integrations, analytics, AI-assisted operations, and application hosting orchestration.

## Project status

**Stage:** Greenfield foundation  
**Implementation status:** Not yet production-ready; capabilities described in project documentation are targets unless explicitly marked implemented and verified.

The repository is being initialized before application implementation. Product requirements, architecture, UX, and database specifications are the governing inputs for subsequent engineering work.

## Product principles

- Modular business capabilities with independently configurable products and modules.
- Multi-tenant architecture with explicit tenant isolation and organization/branch context.
- MongoDB as the platform's database technology.
- TypeScript-first application and service development.
- Secure identity, RBAC/ABAC authorization, auditability, and least privilege.
- Offline-capable workflows where operationally appropriate, with explicit synchronization and reconciliation.
- Provider-neutral integrations and hosting orchestration, subject to each provider's actual API capabilities.
- Human approval and policy controls for sensitive financial, security, and infrastructure actions.
- Uganda-first market configuration with a design that can support additional jurisdictions.
- No claims of compliance, provider integration, or production readiness without evidence and testing.

## Planned product domains

The planned product family includes Zuri Core, Zuri Till / Zuri Register, Zuri Stock, Zuri Ledger, Zuri Pay, Zuri Commerce, Zuri CRM, Zuri Supply, Zuri People, Zuri Workforce, Zuri Insight, Zuri Intelligence, Zuri Connect, Zuri Documents, Zuri Projects, Zuri Manufacturing, Zuri Hospitality, Zuri Pharmacy, Zuri Franchise, Zuri Devices OS, Zuri Cloud & Hosting OS, and the Zuri ecosystem and marketplace.

The platform is also intended to support approved ODEI ecosystem products, partner products, and customer/developer applications. Product availability, licensing, permissions, data boundaries, and deployment capabilities must be explicitly configured.

## Technology direction

- TypeScript
- React
- Vite
- Tailwind CSS
- Node.js services and APIs
- MongoDB
- GitHub
- Vercel for suitable initial web workloads, with portable deployment architecture
- tma.js as an optional Telegram Mini App channel, not a core platform dependency

Exact versions, package choices, deployment topology, and service boundaries will be fixed in the approved technical architecture and implementation decisions.

## Repository map

The repository will evolve to contain:

- `apps/` — user-facing applications and portals
- `services/` — business capabilities and platform services
- `packages/` — shared UI, schemas, SDKs, authorization, events, and utilities
- `providers/` — payment, hosting, tax, shipping, commerce, and communications adapters
- `infrastructure/` — deployment, observability, backup, and operational configuration
- `docs/` — product, architecture, database, UX, security, compliance, and operations specifications
- `tests/` — unit, integration, end-to-end, performance, and security tests

This is a target organization, not a claim that these components have already been implemented.

## Engineering governance

- Keep `main` releasable; use pull requests for reviewed changes.
- Develop features on short-lived branches and merge through the agreed integration branch/workflow.
- Record significant architecture decisions as ADRs in `docs/architecture/decisions/`.
- Validate tenant isolation, financial correctness, inventory consistency, audit trails, and permission boundaries.
- Never commit credentials, private keys, tokens, production data, or unredacted secrets.
- Treat provider callbacks as untrusted input; verify signatures and make processing idempotent.
- Document implementation status and evidence; distinguish planned, in-progress, implemented, tested, and production-verified capabilities.

## Getting started

The application workspace and development commands will be added after the foundation stack and package boundaries are approved. Until then, consult the specifications in `docs/` and the repository contribution guidance.

## Ownership and licensing

This repository is maintained by the Zuri OS project under OIPTECH / ODEL Developers. A formal repository license has not yet been selected. Public visibility alone does not grant permission to copy, redistribute, or create derivative works. Confirm licensing terms with the project owner before reuse.
