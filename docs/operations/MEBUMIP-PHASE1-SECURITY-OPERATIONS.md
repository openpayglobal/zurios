# MeBuMIP Phase 1 — production security operations runbook

**Status:** procedure defined; no production controls are asserted as configured by this document.  
**Applies to:** `apps/mebumip-api` and the standalone MeBuMIP deployment.  
**Release rule:** Phase 1 remains open until every applicable evidence item below is attached to the release record and independently reviewed.

## 1. Change-control and evidence rules

- Use a named operator and an independent approver for production security changes.
- Record the change ticket, target environment, UTC start/end times, operator, approver, commands, sanitized output, backup identifiers and rollback decision.
- Never place credentials, reset tokens, invitation tokens, session tokens, raw audit signing keys or customer data in tickets, CI logs or this evidence record.
- Do not run a production migration from a developer workstation with broad database credentials.
- Stop on unexpected counts, mixed audit histories, failed integrity verification, missing backup evidence, permission errors or any unplanned write.
- CI against disposable MongoDB is not production evidence. A successful application build is not deployment acceptance.

## 2. First-owner bootstrap atomicity

The first platform owner, initial tenant, tenant-owner membership and signed `platform.bootstrap.completed` audit event must be written in one MongoDB transaction. The bootstrap lease serializes competing requests; the unique platform-owner index remains the database-level invariant. The transaction-scoped audit append must use the caller session, not create a nested transaction. Failed transactions must roll back together: never compensate by deleting an audit event or by leaving partially created owner/tenant records. If an existing owner is detected while the lock record is absent or expired, reseal the lock as completed. Classify duplicate-key conflicts by key pattern so owner, normalized-email and tenant-slug conflicts return distinct safe responses. The integration test must exercise concurrent bootstrap requests, missing-lock recovery and exactly one successful owner/bootstrap audit event.

**Evidence:** successful replica-set concurrency test; one owner, one tenant and one owner membership; exactly one bootstrap audit event; clean signed-chain verification.

## 3. Production identity, email and browser configuration

Before enabling public traffic:

1. Provision a dedicated Resend project/API key through the approved secret manager. Scope and rotate it according to provider capability.
2. Verify the sender domain with the mail provider and publish the exact DNS records it supplies. Confirm SPF/DKIM (and DMARC policy) from an independent DNS check.
3. Set `RESEND_API_KEY` and `MAIL_FROM` in the production secret manager; never in source control or a committed environment file.
4. Send invitation and password-recovery messages to controlled test mailboxes. Verify delivery, sender alignment, link/token handling, expiry, one-time consumption, and that API responses do not disclose tokens or account existence.
5. Confirm failed provider delivery revokes the newly created invitation/reset workflow and returns a generic safe response. Configure provider-side bounce/complaint monitoring and an operator alert. A durable retry/outbox and delivery monitoring implementation is still a separate requirement; do not claim retries from the current synchronous adapter.
6. Set exact HTTPS `CORS_ORIGINS`; review `SESSION_COOKIE_SAME_SITE`, `SESSION_COOKIE_DOMAIN`, secure cookie behavior, trusted proxy configuration and the actual browser/API origin topology. Do not select `SameSite=None` without HTTPS and cross-site browser tests.
7. Test login, refresh rotation, CSRF acquisition, unsafe-request rejection without CSRF, rejection of untrusted Origin, logout, password reset and MFA reset in supported browsers.

**Evidence:** verified sender-domain report; redacted secret reference/version; sanitized delivery test IDs; DNS verification; browser test matrix; exact origin/cookie settings; alert test.

## 3. MongoDB production roles and audit write protection

Use separately authenticated identities for application runtime, migration/backfill, audit archive export and read-only verification. Grant only the database/collection actions each process requires.

- Runtime identity: application CRUD only on its explicitly owned collections, plus the minimum transaction/index privileges required by the deployment model. It must not have administrative user/role management privileges.
- Backfill identity: temporary, time-bounded access only for the approved audit backfill window; remove or disable it immediately afterward.
- Archive identity: read-only access to audit events and signing-key retrieval through the approved secret manager; no update/delete on audit records.
- Verification identity: read-only access sufficient to verify the chain and export integrity evidence.
- Administrative database credentials: held outside the application runtime and controlled by a separate operations group.

MongoDB privilege design must be tested against the exact server version and deployment topology. Do not assume a generic role name prevents updates/deletes. Prove the runtime identity cannot update or delete existing audit events, cannot change collection validators/indexes, cannot create users/roles, and cannot read unrelated tenant data. Confirm transaction-backed append continues to work under the least-privilege role.

**Evidence:** reviewed role definitions; effective-privilege output; positive/negative authorization tests using each real role; emergency access procedure; role-rotation record.

## 4. Audit and MFA signing-key lifecycle

MeBuMIP uses the environment names and formats implemented by `apps/mebumip-api/src/config.ts`; do not use the legacy `AUDIT_SIGNING_KEY_ID` or `AUDIT_SIGNING_PREVIOUS_KEYS` names from earlier drafts.

- **Audit keyring:** set `AUDIT_SIGNING_KEYRING` to a JSON object mapping key IDs to 32-byte hexadecimal keys. Set `AUDIT_SIGNING_ACTIVE_KEY_ID` to one non-`legacy` key ID in that object.
- **Legacy audit key:** retain `AUDIT_SIGNING_KEY` or the keyring's `legacy` entry while historical events still use the legacy HMAC format. If both are set, they must represent the same bytes. Never overwrite a historical key in place.
- **MFA keyring:** set `MFA_ENCRYPTION_KEYRING` to a JSON object mapping key IDs to 32-byte hexadecimal keys and set `MFA_ENCRYPTION_ACTIVE_KEY_ID` to a key in that object.
- **Legacy MFA key:** retain `MFA_ENCRYPTION_KEY` until all stored MFA ciphertext has been re-encrypted and verified under the new keyring.
- Keep all raw key values in the approved secret manager. Store only key IDs and secret-manager version references in the release evidence.
- Escrow recovery material under dual control, restrict read access, log access, and rehearse recovery.
- Test rotation in a non-production replica set: append under key A, activate key B while retaining A, and verify both historical and new events. Repeat for MFA ciphertext.
- Never remove a previous key while retained records, archives or backups still require it. Document compromise response and distinguish rotation from retroactive re-signing.

**Evidence:** key IDs and secret-manager version references only; dual-control escrow attestation; rotation test; access logs; recovery drill.

## 5. Legacy audit-chain backfill — controlled migration

The CLI is dry-run-first and bounded to 5,000 wholly unsequenced legacy events in one transaction. It refuses mixed histories and partial chain metadata (including records that already have a sequence but lack the predecessor/hash fields); those require a separately reviewed reconciliation rather than an automatic rewrite. The API remains unready while its persisted audit chain does not verify. No automatic production migration is performed.

Preconditions:

- Approved maintenance window and named operator/approver.
- Verified, restorable, point-in-time-consistent database backup.
- Confirmed replica-set or sharded-cluster transaction support.
- Correct active and previous audit signing keys available to the API and migration process.
- Application writes paused or otherwise proven unable to create a mixed history during the operation.
- Baseline chain verification output and event counts captured securely.

Procedure:

1. Run `AUDIT_MIGRATION_MONGODB_URI=<read-only-maintenance-uri> pnpm --filter @zuri/mebumip-api audit:backfill`. This is a dry run and should use a temporary read-only maintenance identity.

When `AUDIT_MIGRATION_MONGODB_URI` is supplied, both dry-run and apply use that URI; without it, dry-run falls back to `MONGODB_URI`. Apply mode requires the separate, short-lived maintenance URI and refuses to fall back to the application runtime URI. For apply, use a separately approved time-bounded write-maintenance credential. Keep both URIs in the secret manager, never in shell history, CI logs or evidence output.
2. Review the complete sanitized output, count, ordering and detected legacy/mixed-history conditions with the independent approver.
3. If the count exceeds 5,000, or the utility reports mixed histories/invalid records, stop. Do not split or force the migration; create a separately reviewed reconciliation design.
4. **Sequenced pre-chain events require separate handling.** Earlier MeBuMIP builds allocated a sequence before predecessor hashes/event hashes were introduced. Those records are classified as malformed/partial by the current backfill utility and are intentionally not auto-renumbered or rewritten. If the dry run finds any record with a sequence but incomplete chain metadata, stop and preserve the original bytes/signatures. A separately approved reconciliation must verify the original signature with the correct historical key, prove sequence continuity, preserve the old signature as signed provenance, and then add the new chain metadata. Do not delete, reset or silently renumber those events.
5. Confirm the backup restore point and rollback owner. Obtain explicit written approval for apply.
6. Run `AUDIT_CHAIN_BACKFILL_APPLY=true AUDIT_MIGRATION_MONGODB_URI=<dedicated-maintenance-uri> pnpm --filter @zuri/mebumip-api audit:backfill` once, using the temporary maintenance credential rather than the runtime credential.
7. Immediately run `verifyAuditChain` through the authorized MAC verification endpoint and require zero invalid links and zero legacy unchained records.
8. Revoke the temporary migration credential, restore normal write traffic, monitor append errors and preserve sanitized evidence.

Never rerun apply blindly after an interrupted operation. Inspect database state and chain verification first.

**Evidence:** backup/restore proof; dry-run output; signed approval; apply output; before/after counts; final verification; revoked temporary credential.

## 6. Signed audit archive and independent WORM retention

The current `audit:archive` command creates a signed local bundle; it does not upload or enforce retention. The archive must be copied to a separately administered immutable object store.

For an S3-compatible implementation, the storage owner must independently configure and verify:

- Versioning and Object Lock enabled at bucket creation where required by the provider.
- Compliance-mode retention (not merely governance mode) for the approved retention period, after legal/privacy review.
- A dedicated archive-writer identity permitted to create new objects but denied object deletion, retention shortening, legal-hold removal and bucket-policy changes.
- A separate archive administrator identity under dual control; the application runtime must have no bucket administration permissions.
- Server-side encryption with a separately managed key and tested key-recovery process.
- Cross-account or otherwise administratively independent ownership, access logging, alerting on policy changes and failed uploads.
- Lifecycle rules that cannot bypass Object Lock; legal hold and retention exception processes documented.
- Object version ID, checksum, retention-until timestamp and immutable storage receipt recorded in the evidence register.

Export and verification:

1. Require a clean chain and zero legacy unchained events.
2. Run `AUDIT_ARCHIVE_OUTPUT=/secure/audit-archive.json pnpm --filter @zuri/mebumip-api audit:archive`.
3. Verify locally with `AUDIT_ARCHIVE_FILE=/secure/audit-archive.json pnpm --filter @zuri/mebumip-api audit:archive:verify`.
4. Upload through the dedicated archive-writer identity to the locked bucket; capture the object version and retention metadata.
5. Download the retained object through the read-only restore identity and run the offline verifier against the retrieved bytes.
6. Perform a documented restore drill and verify signatures, manifest, event count, sequence range and boundary hashes.

Do not mark WORM acceptance complete based only on a successful local export or an upload response. Require independent proof that deletion/retention-shortening is denied for the retained object.

**Evidence:** bucket configuration; policy review; object-lock receipt; denied-delete test; retained-object restore; offline verification output; restore-drill sign-off.

## 7. ABAC backfill and tenant-isolation release gate

The platform ABAC utility is separate from the MeBuMIP audit-chain backfill. Never conflate their flags or approval records.

For Zuri platform ABAC, use the dry-run default:

```sh
pnpm --filter @zuri/api abac:backfill
```

Only after protected production database access, verified backup, reviewed counts and scope, maintenance approval and a rollback plan may the approved operator apply:

```sh
ABAC_BACKFILL_APPLY=true pnpm --filter @zuri/api abac:backfill
```

Before enabling default-deny enforcement in production, test representative existing users, tenant owners, operators, service identities and every supported organization/location scope. Verify cross-tenant and cross-organization negative cases. Require explicit allow policies; prove missing policies and explicit denies fail closed. Re-run the full authorization integration matrix after migration.

**Evidence:** dry-run output; approved policy mapping; backup ID; apply output; post-migration counts; allow/deny matrix; independent reviewer sign-off.

## 8. Backup, restore, monitoring and incident readiness

- Configure encrypted, point-in-time-capable backups with access separation and retention appropriate to legal requirements.
- Restore into an isolated environment on a regular schedule; validate users, memberships, sessions, indexes, audit chain and archive verification.
- Alert on API readiness failures, MongoDB topology changes, audit append/verification failures, abnormal login/MFA failures, mail delivery failures, webhook dead letters, backup failures and archive retention-policy changes.
- Document on-call ownership, escalation, incident containment, credential/key rotation, evidence preservation and customer notification responsibilities.
- Complete an independent security assessment covering authentication, authorization, tenant isolation, browser session/CSRF, secrets, audit integrity, retention and recovery.

**Evidence:** backup policy; successful restore report; alert delivery tests; on-call/runbook ownership; incident tabletop; independent security report and tracked remediation.

## 9. Phase 1 release checklist

Phase 1 may close only when all applicable items are evidenced:

- [ ] Sender domain verified; invitation and recovery delivery tested; failure handling and monitoring accepted.
- [ ] Production browser origins, cookie policy, CSRF and proxy trust tested in supported browsers.
- [ ] Runtime and operational MongoDB roles are least-privilege; runtime cannot mutate/delete historical audit records.
- [ ] Active/previous audit keys are escrowed and rotation/recovery tested.
- [ ] Legacy audit backfill is approved, applied, and verifies cleanly (or a documented zero-legacy result is independently confirmed).
- [ ] Signed audit archive is retained in independently administered WORM storage; denied-delete and restore tests pass.
- [ ] ABAC production dry-run reviewed and approved; apply completed; tenant/org/location isolation matrix passes.
- [ ] Backup restoration and incident/alert exercises pass.
- [ ] Independent security review completed and critical/high findings remediated or formally risk-accepted.
- [ ] API, web, full monorepo CI and production deployment checks pass on the release commit.
- [ ] Product owner and security/operations approvers sign the release record.



**Implementation note:** the production configuration uses `AUDIT_SIGNING_KEYRING`, `AUDIT_SIGNING_ACTIVE_KEY_ID`, `MFA_ENCRYPTION_KEYRING` and `MFA_ENCRYPTION_ACTIVE_KEY_ID`. The local signed export commands are `audit:archive` and `audit:archive:verify`; the exporter creates a local bundle only. The current code does not configure an object-store provider or prove WORM retention. The API verifies the chain at startup and remains unready on missing, malformed or tampered chain state.

Until then, the product status remains **Phase 1 — In progress; not production-ready**.
