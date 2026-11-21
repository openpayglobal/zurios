# Zuri OS demo accounts and sign-in autofill

## Security model

Demo identities are isolated to a dedicated non-production MongoDB database. The seeder refuses production and requires an explicit `DEMO_SEED_ENABLED=true`, `MONGODB_URI`, `DEMO_DATABASE_NAME` and a `DEMO_SEED_PASSWORD` of at least 16 characters. Use a dedicated preview/demo database user with least privilege. Never point this script at the production database.

The seeder does not create platform-operator grants, wildcard roles, MFA bypasses, or provider connections. All users authenticate through the normal password verifier, rate limits, membership checks and workspace chooser. The unassigned identity has no memberships; it cannot access a workspace and can only submit an access request when the separately governed access-request feature is enabled.

## Seed scenarios

| Email | Scenario |
|---|---|
| `demo.member@zuri.test` | One active workspace membership |
| `demo.multi@zuri.test` | Two active memberships; exercises workspace selection and switching |
| `demo.unassigned@zuri.test` | Active verified identity with no membership |

All demo accounts use the same password supplied at seed time through `DEMO_SEED_PASSWORD`. The password is not printed, committed, or stored in plaintext. Set a fresh random value in the isolated demo environment and rotate it whenever demo access is shared.

## Provisioning

From the repository root, with a dedicated non-production MongoDB replica set configured:

```sh
DEMO_SEED_ENABLED=true \
DEMO_DATABASE_NAME=zuri_demo \
MONGODB_URI="$ZURI_DEMO_MONGODB_URI" \
DEMO_SEED_PASSWORD="$ZURI_DEMO_PASSWORD" \
pnpm --filter @zuri/api demo:seed
```

The script is designed to be repeatable for the baseline accounts. It creates two demo tenants, activates them, creates/activates verified demo identities using the existing single-use invitation acceptance flow, and assigns only the memberships needed for each scenario.

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
4. The standard member receives exactly one workspace; the multi-workspace identity receives two; the unassigned identity receives none.
5. Auto-fill is absent by default and in every Production build, even if demo mode was accidentally enabled.
6. Auto-fill does not submit the form or bypass password authentication, MFA, rate limits or membership authorization.
