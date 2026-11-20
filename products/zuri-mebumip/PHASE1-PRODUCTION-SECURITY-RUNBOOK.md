# Zuri MeBuMIP — Phase 1 Production Security Runbook

**Owner:** Blockchain Innovations LTD  
**Status:** Operational checklist; Phase 1 remains open  
**Purpose:** Define the evidence required before any production deployment. This document does not assert that production infrastructure, secrets, email delivery, or immutable audit storage have been configured.

## 1. Release-blocking principles

- Do not deploy a public production instance until every applicable gate in this runbook has an owner, evidence, and sign-off.
- Never place credentials, encryption keys, API keys, customer data, or real tokens in Git, issue comments, CI logs, screenshots, or this document.
- Keep MAC privileged mutations server-authorized, MFA step-up protected, and auditable. MAD remains read-only.
- Keep Meta integrations disabled until the owner completes the external Meta prerequisites and provider-specific controls are implemented.
- A signed export is not an immutable archive. HMAC signatures do not prevent a database administrator from deleting or replacing records.

## 2. Runtime configuration and secret inventory

Configure values through the deployment secret manager. Do not commit real values to `.env` files.

| Setting | Required use | Validation evidence |
|---|---|---|
| `MONGODB_URI` | Production MongoDB connection | TLS enabled; private network access; least-privilege application user; backup/restore test |
| `MONGODB_DATABASE` | Dedicated MeBuMIP database | Confirmed database boundary and ownership |
| `AUDIT_SIGNING_KEY` | HMAC-SHA256 audit event signatures and signed export manifests | High-entropy secret stored outside MongoDB; restricted access; protected backup |
| `MFA_ENCRYPTION_KEY` | AES-256-GCM encryption of TOTP secrets | 32 random bytes encoded as 64 hex characters; separate protected backup and recovery test |
| `RESEND_API_KEY` | Transactional email delivery | Key restricted to required sending capabilities and stored only in secret manager |
| `MAIL_FROM` | Verified sender identity | Sender domain verified with the provider; test invitation and password recovery delivery |
| `CORS_ORIGINS` | Browser origin allowlist | Exact HTTPS origins only; no wildcard and no localhost |
| `TRUSTED_PROXY_CIDRS` | Trust forwarded client IP headers only from known proxies | Exact deployment proxy CIDRs confirmed by infrastructure owner |
| `SESSION_COOKIE_SAME_SITE` | Browser session cookie policy | Select Strict/Lax for same-site topology; use None only when cross-site cookies are necessary and HTTPS is enforced |
| `SESSION_TTL_HOURS` | Session lifetime | Approved risk-based value within application bounds |

Generate random key material in a controlled operator environment, for example with `openssl rand -hex 32`. Do not paste generated values into chat or commit them. Obtain the Resend API key from the provider's secured dashboard; it is not a locally generated key.

### Key continuity warning

The current implementation uses a single configured audit signing key and a single configured MFA encryption key. Replacing either key without a versioned key-ring and migration process can make historical audit signatures unverifiable or existing MFA secrets undecryptable. **Do not rotate either key by simply replacing the environment variable.** Key-version metadata, old-key verification/decryption support, migration tooling, rollback procedures, and tested backups are required before routine rotation.

## 3. Browser, proxy, and API deployment checks

- [ ] Serve the web application and API only over HTTPS.
- [ ] Confirm the production cookie has `HttpOnly`, `Secure`, an explicit `SameSite` policy, and the narrowest viable path/domain.
- [ ] Confirm the session cookie is not readable by browser JavaScript.
- [ ] Confirm every cookie-authenticated state-changing request sends the session-bound CSRF header and is rejected when it is missing or invalid.
- [ ] Confirm credentialed CORS allows only the exact production web origins.
- [ ] Confirm no wildcard CORS origin is combined with credentials.
- [ ] Configure `TRUSTED_PROXY_CIDRS` only with the actual reverse-proxy ranges. Leave proxy trust disabled if the API is not behind a trusted proxy.
- [ ] Verify the application sees the correct client IP through the configured proxy chain; do not trust arbitrary `X-Forwarded-For` values.
- [ ] Confirm liveness and readiness are monitored separately and readiness fails when MongoDB/index initialization fails.
- [ ] Confirm API logs exclude passwords, cookies, authorization headers, invitation/reset tokens, MFA secrets, Meta credentials, and message content.
- [ ] Confirm rate-limit counters and session expiry TTL indexes are present and operational.

## 4. Email delivery acceptance

- [ ] Verify the sender domain in the Resend account.
- [ ] Configure `RESEND_API_KEY` and `MAIL_FROM` in the production secret manager.
- [ ] Send and receive a tenant invitation using a controlled test mailbox.
- [ ] Confirm the API response never returns the raw invitation token.
- [ ] Confirm invitation delivery failure revokes the pending invitation and returns a non-success response.
- [ ] Request password recovery for an existing and a nonexistent address; confirm responses do not reveal account existence.
- [ ] Confirm reset tokens are single-use, expire, are stored only as hashes, and revoke existing sessions.
- [ ] Confirm provider delivery failures are monitored without logging message tokens or secrets.

## 5. MFA and recovery operations

- [ ] Confirm the production MFA encryption key is present and backed up under dual control.
- [ ] Complete TOTP enrollment and step-up with a controlled administrator account.
- [ ] Confirm recovery codes are shown once, stored only as hashes, and cannot be replayed.
- [ ] Confirm MFA factor reset requires the account password and an unused recovery code and revokes all sessions.
- [ ] Store the recovery procedure and key-custody contacts in the organization's restricted operations system, not in this repository.
- [ ] Conduct a documented recovery exercise before production approval.

## 6. Audit retention, integrity, and independent archive

The application currently provides sequenced HMAC-signed events, verification of a bounded recent event window, and signed paginated exports. This is tamper evidence, not independent immutable retention.

Required before closure:

- [ ] Create a dedicated application database role that can insert audit events but cannot update or delete them. Separate migration/operator roles from runtime credentials.
- [ ] Select an independent archive destination with immutable/WORM retention or object-lock controls.
- [ ] Define retention duration, legal hold, access controls, encryption, and deletion governance with the organization.
- [ ] Implement a scheduled export/archival worker with durable retry state and alerting.
- [ ] Store each signed export manifest and the exact exported records in the independent archive.
- [ ] Verify archive object retention/lock state after write.
- [ ] Verify signatures, sequence continuity, record counts, and export boundaries during archive ingestion and periodic restore exercises.
- [ ] Alert on missing sequence numbers, invalid signatures, unsigned legacy records, archive lag, failed writes, or retention-policy drift.
- [ ] Perform a full-history reconciliation; do not treat the latest-500 verification endpoint as a full-history audit.

No WORM provider, retention duration, archive destination, or archive credentials have been selected/configured in the repository at this stage.

## 7. MongoDB, backup, and operational resilience

- [ ] Use a dedicated production database and non-root application identity.
- [ ] Restrict network access to approved application and operator networks.
- [ ] Require TLS for database connections and validate certificates.
- [ ] Verify indexes and unique constraints using the deployment's migration process.
- [ ] Define encrypted backups, retention, restore objectives, and access controls.
- [ ] Perform a restore into an isolated environment and verify users, memberships, sessions, MFA ciphertext, and audit records.
- [ ] Ensure backup and restore procedures do not silently reset audit counters or remove historical records.
- [ ] Monitor connection saturation, slow queries, storage, TTL cleanup, and rate-limit collection growth.

## 8. Release evidence register

| Gate | Current status | Evidence still required |
|---|---|---|
| API/web build and test | Latest previously confirmed GitHub Actions run passed | Re-run after subsequent test changes and retain the run URL |
| Email delivery | Adapter implemented; live configuration pending | Verified sender, secret-manager values, successful delivery tests |
| MFA recovery | Implemented; recovery tests exist | Production key custody and recovery exercise |
| Audit integrity | Sequenced HMAC events and signed exports implemented | Restricted DB roles, versioned key handling, independent WORM archive, full-history verification |
| Database resilience | MongoDB-backed CI integration test exists | Production backup/restore exercise and least-privilege role review |
| Session/proxy security | Cookie, CSRF, SameSite and proxy allowlist foundations implemented | HTTPS, exact CORS, proxy CIDR and cross-site topology verification |
| MAC/MAD policy | Core control and read-only monitoring surfaces implemented | Final access review and production operational sign-off |

## 9. Formal release approval

Phase 1 remains **In progress** until the release owner records evidence for every applicable gate, unresolved critical/high findings are closed or explicitly risk-accepted, and the production deployment architecture is reviewed. Completion of this checklist does not itself complete Meta business verification, App Review, Advanced Access, or WhatsApp Tech Provider prerequisites.
