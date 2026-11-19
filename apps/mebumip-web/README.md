# Zuri MeBuMIP Web Workspace

Standalone React/Vite application for Zuri MeBuMIP's MAC and MAD surfaces.

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @zuri/mebumip-web dev
```

Vite serves the app on port 5174. Production build:

```bash
pnpm --filter @zuri/mebumip-web build
```

## Current scope

This is the Phase 1 administration shell. It contains:
- MAD operational overview with clearly labelled placeholder/demo values.
- MAC navigation surfaces for business directory, Meta connections, integrations, security and settings.
- A–E objective register and Phase 0–7 roadmap.
- Responsive desktop/mobile navigation.

This shell is not yet connected to a backend, database, authentication provider or Meta API. No real customer data, credentials, or live connection status is represented. Do not deploy it as a production admin console until server-side authentication, platform RBAC, tenant isolation, audit logging, CSRF protections and API authorization are implemented and tested.
