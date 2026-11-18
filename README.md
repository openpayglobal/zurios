# Zuri OS

**A modular, multi-tenant Business Operating System by OIPTECH / ODEL Developers.**

## Foundation status

The initial monorepo foundation is being implemented on `develop`. It includes the React/Vite application shell, Fastify API bootstrap, MongoDB connection/index initialization, password/JWT primitives, tenant-scoped authorization primitives, audit event writer and GitHub Actions CI. These are foundation components, not a production-ready identity provider or complete business application.

## Stack

- pnpm workspaces + Turborepo
- TypeScript
- React + Vite + Tailwind CSS
- Fastify API on Node.js
- MongoDB as the sole application database
- GitHub Actions CI
- Vercel as the initial web deployment direction

## Repository layout

- `apps/web` — React/Vite application shell
- `apps/api` — API bootstrap and platform services
- `packages/*` — shared contracts and libraries (next implementation increment)
- `.github/workflows` — CI workflows

## Local development

1. Install Node.js 20.11+ and pnpm 9.15.4.
2. Start a MongoDB replica set for local development if transaction-backed workflows are being tested.
3. Copy `.env.example` to `.env`; set a unique random `JWT_SECRET` of at least 32 characters.
4. Run `pnpm install`.
5. Run `pnpm dev`.

The API uses port 4000 and the web application uses port 5173.

## Platform security invariants

- Tenant identity is required for tenant-owned operations.
- Organization and location scopes narrow access within a tenant.
- Authorization is default-deny; role-derived permissions and ABAC predicates must both be satisfied.
- Never accept tenant identifiers as proof of access. Resolve tenant membership from a verified identity/session.
- Audit events are append-only through the application service. Production database permissions, tamper evidence, retention and export controls remain required.
- Secrets, credentials, private keys and production data must never be committed.

## Delivery status and limitations

This is an initial development scaffold. Login/registration endpoints, refresh-token rotation and revocation, invitation and recovery flows, persistent role/policy administration, migrations, comprehensive tests, rate limiting, CSRF strategy, production key management, deployment configuration and operational hardening remain future increments. No compliance certification or production readiness is claimed.

## Engineering governance

Keep `main` releasable. Work on `develop` and feature branches, review through pull requests, and record material architecture changes as ADRs. Preserve the approved MongoDB-native architecture and test tenant isolation, authorization boundaries, ledger correctness and audit integrity before enabling business modules.
