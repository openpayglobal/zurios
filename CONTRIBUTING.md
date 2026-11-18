# Contributing to Zuri OS

## Before making changes

1. Read the relevant approved product, architecture, UX, and database specifications in `docs/`.
2. Check existing issues and pull requests to avoid duplicate work.
3. For a substantial change, describe the problem, scope, affected modules, data/security implications, and acceptance criteria before implementation.
4. Do not introduce a new database technology, identity provider, framework, or major dependency without an architecture decision.

## Branch and review workflow

- Keep `main` stable and release-oriented.
- Use focused branches such as `feat/<area>-<short-description>`, `fix/<area>-<short-description>`, `docs/<topic>`, or `chore/<topic>`.
- Submit changes through pull requests with a clear summary, testing evidence, screenshots where relevant, migration notes, and rollback considerations.
- Do not merge changes that bypass required security, financial integrity, tenant isolation, or data migration review.

The exact integration branch and required review protections will be documented when repository branch governance is configured.

## Engineering expectations

- Use TypeScript for application and service code unless an approved exception exists.
- Keep modules cohesive and interfaces explicit.
- Validate all external input at system boundaries.
- Enforce tenant scope and authorization on the server; never rely on UI hiding as access control.
- Use idempotency for payment, webhook, and synchronization workflows.
- Preserve immutable audit evidence for sensitive operations.
- Add tests for success, failure, concurrency, retries, and permission boundaries as applicable.
- Do not log secrets, payment credentials, or unnecessary personal data.

## Commit messages

Use concise, descriptive messages. Conventional Commit prefixes are encouraged, for example:

- `feat: add stock transfer workflow`
- `fix: prevent duplicate payment callback processing`
- `docs: clarify tenant isolation model`
- `test: cover ledger posting invariants`

## Secrets and data

Never commit credentials, tokens, private keys, customer records, production exports, or real personal data. Use documented secret-management and synthetic test data practices.
