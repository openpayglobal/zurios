# API security foundation

This workspace now contains the first reusable Phase 1 security primitives.

- Platform roles and tenant roles are separate; tenant roles never imply platform privileges.
- Tenant authorization requires an active membership for the exact server-resolved tenant.
- Platform and tenant permission maps use default-deny checks.
- Session tokens are intended to be random opaque values; persist only SHA-256 token hashes.
- MongoDB indexes establish unique user email, tenant slug, tenant membership, session lookup/expiry and audit query paths.
- Audit event construction intentionally accepts a constrained metadata shape and does not accept request bodies or credentials.

## Important implementation boundary

These primitives are not, by themselves, a complete authentication system. No public tenant, Meta, MAC mutation, or MAD data endpoint should be enabled until login/session issuance, session validation, verified tenant resolution, permission enforcement, CSRF protections for cookie sessions, rate limiting, and audit persistence are wired and tested. Do not treat frontend navigation visibility as authorization.

MAC remains the privileged control plane. MAD must remain read-only and use separately authorized aggregate queries. Platform roles must be assigned only through a protected bootstrap/administrative workflow, never through tenant-facing input.

## Data handling

Never write Meta access tokens, app secrets, passwords, WhatsApp message bodies, or raw authorization headers to logs or audit metadata. Production token encryption must use a managed secret/key service; source-controlled encryption keys are prohibited.
