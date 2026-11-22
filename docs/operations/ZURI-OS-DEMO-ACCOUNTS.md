# Zuri OS demo accounts and sign-in autofill

## Security model

Demo identities are isolated to a dedicated non-production MongoDB database. The seeder refuses production and requires an explicit `DEMO_SEED_ENABLED=true`, `MONGODB_URI` and a dedicated `DEMO_DATABASE_NAME` beginning with `zuri_demo`. It accepts an optional `DEMO_SEED_PASSWORD` of at least 16 characters; when omitted, it generates a cryptographically random 32-byte password. Use a dedicated preview/demo database user with least privilege. Never point this script at the production database.

The seeder does not create platform-operator grants, wildcard roles, MFA bypasses, or provider connections. All users authenticate through the normal password verifier, rate limits, membership checks and workspace chooser. The unassigned identity has no memberships; it cannot access a workspace and can only submit an access request when the separately governed access-request feature is enabled.

## Seed scenarios

| Email | Scenario |
|---|---|
| `demo.member@zuri.test` | One active workspace membership |
| `demo.multi@zuri.test` | Two active memberships; exercises workspace selection and switching |
| `demo.unassigned@zuri.test` | Active verified identity with no membership |

All demo accounts use one randomly generated password per seed run, or the value supplied through `DEMO_SEED_PASSWORD`. If generated, the script prints the password exactly once in its terminal result; protect that output and do not paste it into source control, tickets or shared logs. The password is hashed before storage and is never persisted in plaintext. A rerun rotates the password hash and revokes existing sessions.

## Provisioning

From the repository root, with a dedicated non-production MongoDB replica set configured:

```sh
DEMO_SEED_ENABLED=true \
DEMO_DATABASE_NAME=zuri_demo \
MONGODB_URI="$ZURI_DEMO_MONGODB_URI" \
DEMO_SEED_PASSWORD="$ZURI_DEMO_PASSWORD" \
pnpm --filter @zuri/api demo:seed
```

The script is designed to be repeatable for the baseline accounts. It creates two demo tenants, seeds only the tenant-viewer role, activates verified identities through the existing single-use invitation acceptance flow, and assigns only the memberships needed for each scenario. It revokes sessions on password rotation. If you let the script generate a password, copy the one-time password from the terminal output into the Vercel Preview-only `VITE_DEMO_PASSWORD` environment variable before rebuilding that Preview deployment. If you supply `DEMO_SEED_PASSWORD`, configure the exact same value as `VITE_DEMO_PASSWORD` in Preview.

## Sign-in auto-fill

The Zuri OS sign-in screen shows the demo-account selector only when:
- `VITE_DEMO_MODE=true`; and
- the app is a local development build, or a Vercel Preview build with `VITE_VERCEL_ENV=preview`; and
- `VITE_DEMO_PASSWORD` contains the preview-only demo password (minimum 16 characters).

Configure `VITE_DEMO_MODE`, `VITE_VERCEL_ENV`, and `VITE_DEMO_PASSWORD` only in Vercel's Preview environment for the Zuri OS web project. Do not configure them for Production. Vite embeds `VITE_*` values in browser assets, so the demo password is intentionally visible to anyone who can access that preview; use only synthetic accounts and data, keep preview access protected, and rotate the password. The selector only fills email/password fields; the user must still press Sign in and complete MFA if enabled.

## Acceptance checks

1. The seed command refuses when the explicit enable flag is absent.
2. The seed command refuses production.
3. The seed command refuses missing/short password or missing database URI.
4. The standard member receives exactly one workspace; the multi-workspace identity receives two; the unassigned identity receives none. Each assigned membership has only the tenant-viewer role.
5. Auto-fill is absent by default and in every Production build, even if demo mode was accidentally enabled.
6. Auto-fill does not submit the form or bypass password authentication, MFA, rate limits or membership authorization.


## Current provisioned environment (2026-11-22 UTC)

The isolated `zuri_demo` database has been provisioned on the existing Atlas free replica-set cluster. A dedicated Atlas database principal `zuri_demo_runtime` has only `readWrite` on `zuri_demo`. The three identities and two tenants in the table above have been seeded and checked directly in Atlas. Standard member: one active membership. Multi-workspace member: two active memberships. Unassigned identity: zero memberships across all statuses. Both tenant roles are `tenant.viewer` with only `platform.read`.

The Zuri OS web and API projects have Preview-only environment variables scoped to `feat/mac-secrets-user-workflow-v2`. API database, JWT and MFA settings are isolated to this demo Preview. The UI demo password is in a `VITE_*` variable and therefore visible to users who can access the protected Preview bundle; it is a synthetic-account password, not a secret suitable for production. Keep SSO Preview protection enabled and never add these variables to Production.

The seeder was run successfully as an explicit one-time Vercel Preview build step. After the successful seed operation, the API project's build command was restored to `pnpm --filter @zuri/api build` and `DEMO_SEED_ENABLED=false` was set to prevent routine deployments from rotating passwords or revoking demo sessions.

**Not yet live:** the Vercel API deployment that ran the seed failed during its subsequent TypeScript build. The TypeScript and CI issues found there have been fixed in source; GitHub typecheck and tests pass on the latest checked head, with build verification still running at last inspection. A fresh Vercel deployment is blocked by the team's 100/day API deployment limit (HTTP 402, 24-hour retry). Do not mark API health, browser login or final UI acceptance complete until a fresh Preview deployment reaches READY and login scenarios are exercised against it.


## Latest runtime and verification checkpoint — 2026-11-22 UTC

The Zuri OS web Preview responds HTTP 200 and is READY, but the API deployment currently assigned to the branch alias is not yet healthy. The first API deployment built successfully but failed at runtime because `@zuri/core-platform` exported a TypeScript source entry point. The package now exports compiled JavaScript and declarations; the API build compiles that package first. A dedicated runtime-import regression test was added and exact-head GitHub CI runs `44989687455` and `44989683049` passed on `4d12a6bf95c34db9e15f6cf289890e373f373138` (OpenAPI, route drift, docs mirrors, typecheck, tests and build).

A corrected API Preview deployment is still pending. Vercel returned HTTP 402 `api-deployments-free-per-day` with retry-after 86,400 seconds. Until that deployment is created and `/health/live` and `/health/ready` return success, do not treat browser login or the three sign-in scenarios as live-accepted. The demo database and Preview environment remain isolated; the seeder is disabled and Production has not been modified.
