# ZURI Security Engineering — Key Management and Audit Archiving

**Owner:** Blockchain Innovations LTD  
**Status:** Engineering standard; provider and retention choices require owner approval  
**Applies to:** Zuri OS shared platform and Zuri MeBuMIP  
**Last reviewed:** 2026-11-20

## 1. Purpose and governing references

This standard converts established security guidance into implementable controls for ZURI. It is an engineering baseline, not a certification or legal opinion.

Primary references:
- [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) — secret lifecycle, gradual rotation, versioning, access, auditing and revocation.
- [NIST SP 800-57 Part 1 Rev. 5](https://csrc.nist.gov/pubs/sp/800/57/pt1/r5/final) — key inventory, protection, lifecycle, backup, recovery and key management.
- [OWASP ASVS 5.0 — V7 Session Management](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x16-V7-Session-Management.md) — server-side session controls and invalidation.
- [OWASP ASVS 5.0 — V16 Security Logging and Error Handling](https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md) — security event inventory, privacy and log integrity.
- [AWS S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) — one implementation example for versioned WORM storage, retention and legal holds. This is not an approved ZURI provider selection.
- [Meta Platform Versioning](https://developers.facebook.com/docs/graph-api/guides/versioning) and [Graph API / Marketing API version changelog](https://developers.facebook.com/docs/graph-api/changelog/versions/) — version pinning and separate API lifecycle schedules.

## 2. Key inventory and separation

Maintain a restricted inventory for every cryptographic key:
- identifier and purpose;
- algorithm and key size;
- owner and authorized consumers;
- source secret manager and version reference;
- activation date and status (active, decrypt-only, revoked, destroyed);
- backup/recovery location and dual-control custodians;
- rotation/migration dependencies and last exercise.

Do not reuse one key across independent purposes. MFA encryption, audit signing, webhook signing and provider-token encryption must have separate key material and access policies. Keys must never be stored in MongoDB, source control, issue comments, CI logs or application audit metadata.

## 3. MFA encryption key-ring design

MeBuMIP supports versioned AES-256-GCM ciphertext:

`v2.<key-id>.<iv>.<tag>.<ciphertext>`

New writes use `MFA_ENCRYPTION_ACTIVE_KEY_ID`. Decryption resolves the embedded key ID from `MFA_ENCRYPTION_KEYRING`. Retained old keys are read-only by operational policy, even though the configured key ring can decrypt them. Existing unversioned ciphertext remains readable only while its original key is retained as `MFA_ENCRYPTION_KEY` or the `legacy` key-ring entry.

Environment configuration:
- `MFA_ENCRYPTION_KEYRING`: JSON object of key ID to 64-character hex-encoded 32-byte key.
- `MFA_ENCRYPTION_ACTIVE_KEY_ID`: key ID used for all new encryption.
- `MFA_ENCRYPTION_KEY`: legacy fallback for existing unversioned ciphertext and compatibility with existing deployments.

Example shape only — never use these sample bytes as actual keys:

```json
{
  "legacy": "<64-hex-character-old-key>",
  "mfa-2026-11": "<64-hex-character-new-key>"
}
```

`MFA_ENCRYPTION_ACTIVE_KEY_ID=mfa-2026-11`

### Safe rotation sequence

1. Take and verify an encrypted database backup; confirm restore procedure and key custody.
2. Add the new key to the key ring while retaining the old key.
3. Set the active key ID to the new key and deploy to every API instance in a coordinated rollout.
4. Run `pnpm --filter @zuri/mebumip-api mfa:rekey` (dry-run default). Review counts and errors; do not proceed if any ciphertext cannot be decrypted.
5. Apply only after the backup has been independently verified and approved:
   `MFA_REKEY_BACKUP_CONFIRMED=true MFA_REKEY_APPLY=true pnpm --filter @zuri/mebumip-api mfa:rekey`
6. Re-run dry-run. It should report zero legacy/previous-key records and all remaining encrypted MFA secrets as already current.
7. Keep the old key available for the agreed rollback and backup-retention window. Remove it only after restore tests prove no retained backup or live ciphertext depends on it.
8. Record the key ID transition and counts in the restricted change register; never record key values.

The utility uses conditional updates against the original ciphertext to avoid overwriting a concurrently changed MFA value. It verifies decryption and re-encryption before update and does not print plaintext or key material.

## 4. Audit-signing key lifecycle

MeBuMIP now supports an optional versioned audit key ring. When `AUDIT_SIGNING_KEYRING` and `AUDIT_SIGNING_ACTIVE_KEY_ID` are configured, new audit events and export manifests use `HMAC-SHA256-v2`, carry a key ID, and bind that ID into the signed payload. Historical `HMAC-SHA256` events remain verifiable using the original `AUDIT_SIGNING_KEY` or a `legacy` key-ring entry containing the original key bytes encoded as hex. The legacy key must remain available for historical events and retained backups.

Safe rotation sequence:
1. Back up the audit database and verify restore before changing key configuration.
2. Add a new 32-byte key to the ring while retaining the legacy key and all prior verification keys.
3. Set `AUDIT_SIGNING_ACTIVE_KEY_ID` to the new key and deploy to every API instance.
4. Verify a newly generated event and signed export report `HMAC-SHA256-v2` with the new key ID.
5. Verify a sample of historical events and all available export manifests using retained keys; then run full-history verification.
6. Retain old keys until every historical event, export and backup that depends on them has passed its retention/recovery window.
7. Record the key ID transition and verification counts, never key material.

A re-sign operation must never silently rewrite historical event content or claim the original signature was produced by a replacement key. Key compromise/revocation requires a separate incident procedure and must not silently invalidate evidence.

## 5. Independent immutable audit archive

Application HMAC signatures and sequential counters are tamper-evident but do not prevent a privileged database operator from deleting data. A provider-neutral, content-addressed archive package builder and immutable-sink contract now exist in the MeBuMIP API; receipts are stored with sequence-range indexes. An independent archive is still mandatory for production release, and no concrete storage adapter, provider, retention duration or legal-hold policy has been approved or configured.

Provider selection criteria:
- WORM/object-lock retention and versioning;
- separate account/project and IAM boundary from the application database;
- application write-only role with no delete, retention-shortening or lock-bypass permissions;
- separate archive verification/read role;
- encryption at rest and TLS in transit;
- durable retry/outbox state, idempotent object naming and alerting;
- legal hold, retention policy, lifecycle and data residency governance;
- independent restore and full-history reconciliation.

AWS S3 Object Lock is one possible candidate. Governance and Compliance modes have materially different bypass semantics; Compliance mode prevents deletion/overwrite of a protected version during its retention period, including by account root. Do not select a mode or retention duration until legal, contractual and jurisdictional requirements are reviewed and the owner approves the provider.

Archive package should contain the exact event batch, signed manifest, first/last sequence, count, export boundaries, source collection watermark, verification result, object version ID and archive retention metadata. Reconcile archived sequence ranges against the database and alert on gaps, duplicates, signature failures, unsigned legacy events and archive lag.

## 6. Meta API lifecycle

Meta API versions must be explicit and centrally configured; never rely on unversioned Graph API calls. Graph API and Marketing API have separate version schedules. Record the selected version, required permissions, review status, deprecation date and test coverage in the integration register. Re-evaluate the current official changelog before selecting a version or upgrading. Do not hardcode a version solely from this document.

## 7. Release gates

- Key inventory, dual-control backup and recovery evidence exist.
- MFA key-ring dry-run and controlled apply migration are tested on a restorable non-production copy.
- Old keys remain available until every dependent ciphertext and retained backup is migrated or expired.
- Versioned audit key-ring verification is implemented and tested; production rotation remains blocked until backup/recovery evidence, full-history verification and a controlled deployment window are approved.
- Independent archive provider, retention and access policy are approved and exercised; the provider-neutral package builder and sink contract alone do not satisfy this gate.
- Full-history audit archive reconciliation passes.
- Critical/high findings are closed or explicitly risk-accepted by the accountable owner.

## 8. Change history

- 2026-11-20: Initial engineering standard based on OWASP, NIST, AWS and Meta primary documentation. MeBuMIP versioned MFA ciphertext and dry-run-first migration tooling introduced; production key migration and independent WORM archive remain unexecuted.


## Provider selection

See the [Immutable Audit Archive Provider Comparison](./AUDIT-ARCHIVE-PROVIDER-COMPARISON.md) for current official documentation and trade-offs across Amazon S3 Object Lock, Azure Blob immutable storage and Google Cloud Storage Bucket Lock. The provider comparison is a research note, not a selection or compliance certification.
