# ZURI MeBuMIP

**Zuri Meta Business Management and Integration Platform**

Product owner: **Blockchain Innovations LTD**  
Product type: Standalone, multi-tenant SaaS platform with integrations into Zuri OS and third-party software.

## Product mandate

Zuri MeBuMIP delivers all five approved objectives:

- **A — Social presence management:** manage connected Facebook Pages and Instagram Professional accounts.
- **B — Advertising management:** connect eligible ad accounts and manage/report campaigns through Meta Marketing APIs.
- **C — WhatsApp Business Platform:** onboard customer WhatsApp Business Accounts and phone numbers, send/receive messages, manage templates and webhooks.
- **D — Multi-business platform:** let independent businesses authorize and manage their own Meta assets in isolated workspaces.
- **E — Software integrations:** expose secure APIs, webhooks and integration services for Zuri OS and approved external applications.

## Mandatory administration surfaces

- **MAC — Master Admin Console:** privileged configuration and control plane for platform settings, tenants, roles, integration policies, plans, security and audit operations.
- **MAD — Master Admin Dashboard:** operational visibility for tenant counts, connected assets, API and webhook health, usage, subscriptions, incidents and platform trends.

MAC and MAD are distinct product surfaces backed by shared authorization and audit services. MAC actions must be permission-gated and audited. MAD must not become an alternate path for privileged mutations.

## Architecture and implementation constraints

The initial implementation is a separately deployable product workspace within the Zuri OS monorepo. It must maintain bounded modules, its own routes, data models, configuration, tests and deployment configuration so it can later be extracted into a dedicated repository without redesigning tenant boundaries.

Follow the existing Zuri OS stack and governance:
- TypeScript
- React + Vite + Tailwind CSS
- Fastify on Node.js
- MongoDB as the application database
- pnpm workspaces + Turborepo
- Zod for runtime validation where appropriate

Do not introduce PostgreSQL or another application database without an approved architecture decision record.

## Meta integration principles

1. Meta Business Portfolio creation and Meta developer registration are external prerequisites. They are intentionally deferred by the owner; local product foundation work must continue without live credentials.
2. Never invent, hard-code, commit or expose Meta App IDs, secrets, access tokens, system-user tokens, verification codes or customer credentials.
3. Use least-privilege OAuth scopes and customer-granted authorization. Do not treat a tenant ID or supplied Meta ID as proof of ownership.
4. Keep customer tokens encrypted server-side, tenant-scoped, revocable and access-audited.
5. Verify webhook signatures, enforce idempotency, acknowledge promptly and process events asynchronously.
6. Meta App Review, Advanced Access, business verification and Tech Provider eligibility are release gates where required; software implementation alone does not confer approval.
7. Use the currently supported Meta login and WhatsApp Embedded Signup flow at implementation time. Recheck Meta's official documentation before configuring the live app.

## Current status

See [implementation roadmap](./IMPLEMENTATION-ROADMAP.md), [architecture](./ARCHITECTURE.md) and [progress tracker](./PROGRESS.md). This folder is the product source of truth for scope and delivery status.
