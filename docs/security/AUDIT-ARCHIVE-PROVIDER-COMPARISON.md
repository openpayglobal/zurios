# Immutable audit archive provider comparison

**Status:** Research note — provider not selected  
**Research date:** 2026-11-20  
**Owner:** Blockchain Innovations LTD  
**Scope:** MeBuMIP independent audit-event archive

## Decision summary

The MeBuMIP archive pipeline now has a provider-neutral sink contract. It requires an immutable object version, a verified retention date, delete/overwrite protection, an explicit administrative-bypass guarantee and optional legal hold. The adapter must fail closed if a provider cannot confirm the requested guarantees.

No storage provider, bucket/container, retention duration, legal-hold policy, data-residency region or credentials have been approved. Do not configure a production archive until these decisions are recorded.

## Official provider capabilities

| Provider | Immutable-storage mechanism | Retention / hold characteristics | Important operational constraint |
|---|---|---|---|
| Amazon Web Services | Amazon S3 Object Lock | WORM object versions; Governance and Compliance retention modes; object legal holds; fixed or variable retention | S3 Versioning and Object Lock must be enabled. Once Object Lock is enabled on a bucket, it cannot be disabled and versioning cannot be suspended. |
| Microsoft Azure | Azure Blob immutable storage | Time-based retention and legal holds; container-level or version-level WORM | Locked time-based policies cannot be deleted or shortened. Version-level WORM requires blob versioning. |
| Google Cloud | Cloud Storage Bucket Lock and object holds | Bucket retention policy can be permanently locked; object holds are separate protection controls | Locking a bucket retention policy is irreversible; the retention period cannot be reduced or removed after lock. |

Official documentation:
- AWS: [Configuring S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-configure.html)
- Azure: [Immutable storage for Blob Data](https://learn.microsoft.com/en-us/azure/storage/blobs/immutable-storage-overview)
- Google Cloud: [Use and lock retention policies](https://cloud.google.com/storage/docs/using-bucket-lock)

## Comparative assessment

### Amazon S3 Object Lock

- Strong fit for the current sink contract because its Governance and Compliance modes map to the contract's administrative-bypass guarantee.
- Supports versioned object retention and legal holds.
- Object Lock must be enabled with bucket versioning. Enabling it is a permanent bucket-level decision.
- Compliance mode should not be selected without approved retention/legal policy; it is intentionally difficult or impossible for administrators to override during the retention period.
- Governance mode is operationally more flexible but permits specially authorized bypass. If used, the bypass role must be separated, tightly controlled and audited.

### Azure Blob immutable storage

- Supports time-based retention and legal holds, including container-level and version-level policies.
- Locked time-based policies prevent shortening or deletion; version-level policies require versioning.
- The adapter must map the generic administrative-bypass guarantee to Azure's locked/unlocked policy semantics and reject unsupported combinations.
- Azure's own documentation distinguishes container-level and version-level WORM; the correct scope depends on whether individual archive objects need separate legal holds.

### Google Cloud Storage Bucket Lock

- Provides bucket retention policies that can be permanently locked.
- Once locked, a bucket's retention period cannot be reduced or removed.
- Object holds are separate from bucket retention; the adapter must verify both if a legal hold is requested.
- Bucket-level policy may impose a broader retention commitment than an object-specific policy, so lifecycle and retention costs need review.

## Selection criteria for Zuri

1. **Hosting alignment:** prefer the provider already hosting the production API and primary data unless a documented risk or cost reason supports cross-cloud storage.
2. **Data residency:** select a region approved for the customer data and audit evidence that MeBuMIP will hold.
3. **Retention/legal policy:** obtain an approved retention schedule, litigation-hold process and deletion authority before enabling irreversible compliance locks.
4. **Identity separation:** API runtime may write new objects but must not delete or shorten retention. Separate security operators should administer retention configuration; break-glass access must be independently audited.
5. **Recovery:** test object-version retrieval, regional recovery, key recovery, integrity verification and receipt reconciliation.
6. **Cost and scale:** estimate object count, request rates, storage growth, retrieval and replication costs.
7. **Evidence:** retain provider version IDs, SHA-256 digests, effective retention dates, legal-hold state and configuration evidence in MeBuMIP's archive receipt register.

## Recommended next step

Choose the provider that matches the approved production hosting environment, then implement one adapter against `ImmutableAuditArchiveSink`. Before production enablement, verify the provider's actual object-lock state and IAM permissions, run a test upload, prove overwrite/delete denial, confirm retention and legal-hold metadata, retrieve and verify the object, and reconcile the receipt in MeBuMIP.

**No default retention period is recommended here.** That is a governance/legal decision, not an engineering default. The provider comparison does not constitute a compliance certification or legal opinion.
