import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { signAuditExport, verifyAuditChainEvents } from "./security.js";

export type AuditArchiveRetention = {
  retainUntil: Date;
  legalHold: boolean;
  preventOverwrite: true;
  preventDeleteUntilRetention: true;
  preventAdministrativeBypass: boolean;
};

export type AuditArchivePackage = {
  objectKey: string;
  content: Buffer;
  sha256: string;
  fromSequence: number;
  toSequence: number;
  eventCount: number;
};

export type AuditArchiveReceipt = {
  objectKey: string;
  versionId: string;
  sha256: string;
  fromSequence: number;
  toSequence: number;
  eventCount: number;
  retainUntil: Date;
  preventOverwrite: boolean;
  preventDeleteUntilRetention: boolean;
  preventAdministrativeBypass: boolean;
  legalHold: boolean;
  archivedAt: Date;
};

export interface ImmutableAuditArchiveSink {
  /**
   * Must write a new immutable object version, reject overwrite/delete attempts,
   * and return the storage provider's authoritative object version and retention.
   * Implementations must be idempotent for a repeated objectKey + sha256.
   */
  putImmutableObject(input: {
    objectKey: string;
    content: Buffer;
    sha256: string;
    retention: AuditArchiveRetention;
  }): Promise<{ objectKey: string; versionId: string; sha256: string; retainUntil: Date; legalHold: boolean; preventOverwrite: boolean; preventDeleteUntilRetention: boolean; preventAdministrativeBypass: boolean }>;
}

export function buildAuditArchivePackage(
  inputEvents: Array<Record<string, unknown>>,
  fromSequence: number,
  toSequence: number,
  generatedAt = new Date(),
): AuditArchivePackage {
  if (!Number.isSafeInteger(fromSequence) || !Number.isSafeInteger(toSequence) || fromSequence < 1 || toSequence < fromSequence) {
    throw new Error("INVALID_AUDIT_ARCHIVE_SEQUENCE_RANGE");
  }
  const eventCount = toSequence - fromSequence + 1;
  if (eventCount > 1000 || inputEvents.length !== eventCount) throw new Error("AUDIT_ARCHIVE_BATCH_SIZE_OR_GAP_INVALID");
  const events = [...inputEvents].sort((a, b) => Number(a.sequence) - Number(b.sequence));
  if (!verifyAuditChainEvents(events, fromSequence)) throw new Error("AUDIT_ARCHIVE_CHAIN_INVALID");
  const manifest = signAuditExport(events, generatedAt.toISOString());
  if (manifest.integrity.algorithm === "unsigned") throw new Error("AUDIT_ARCHIVE_MANIFEST_UNSIGNED");
  const payload = {
    archiveFormat: "zuri-mebumip-immutable-audit-archive-v1",
    archiveStatus: "prepared_not_archived",
    generatedAt: generatedAt.toISOString(),
    fromSequence,
    toSequence,
    eventCount,
    manifest,
    events,
  };
  const content = Buffer.from(JSON.stringify(payload), "utf8");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    objectKey: `mebumip/audit/v1/${fromSequence}-${toSequence}-${sha256}.json`,
    content,
    sha256,
    fromSequence,
    toSequence,
    eventCount,
  };
}

export async function archiveAuditPackage(
  db: Db,
  sink: ImmutableAuditArchiveSink,
  archivePackage: AuditArchivePackage,
  retention: AuditArchiveRetention,
): Promise<AuditArchiveReceipt> {
  const now = new Date();
  if (!(retention.retainUntil instanceof Date) || !Number.isFinite(retention.retainUntil.getTime()) || retention.retainUntil <= now) throw new Error("AUDIT_ARCHIVE_RETENTION_REQUIRED");
  const stored = await sink.putImmutableObject({
    objectKey: archivePackage.objectKey,
    content: archivePackage.content,
    sha256: archivePackage.sha256,
    retention,
  });
  if (
    stored.objectKey !== archivePackage.objectKey ||
    !stored.versionId ||
    stored.sha256 !== archivePackage.sha256 ||
    !(stored.retainUntil instanceof Date) ||
    !Number.isFinite(stored.retainUntil.getTime()) ||
    stored.retainUntil < retention.retainUntil ||
    (retention.legalHold && !stored.legalHold) ||
    !stored.preventOverwrite ||
    !stored.preventDeleteUntilRetention ||
    (retention.preventAdministrativeBypass && !stored.preventAdministrativeBypass)
  ) throw new Error("AUDIT_ARCHIVE_STORAGE_RETENTION_NOT_CONFIRMED");

  const receipt: AuditArchiveReceipt = {
    ...stored,
    fromSequence: archivePackage.fromSequence,
    toSequence: archivePackage.toSequence,
    eventCount: archivePackage.eventCount,
    legalHold: stored.legalHold,
    preventOverwrite: stored.preventOverwrite,
    preventDeleteUntilRetention: stored.preventDeleteUntilRetention,
    preventAdministrativeBypass: stored.preventAdministrativeBypass,
    archivedAt: now,
  };
  const receipts = db.collection<AuditArchiveReceipt>("auditArchiveReceipts");
  const existing = await receipts.findOne({ objectKey: receipt.objectKey });
  if (existing && (existing.versionId !== receipt.versionId || existing.sha256 !== receipt.sha256 || existing.fromSequence !== receipt.fromSequence || existing.toSequence !== receipt.toSequence)) {
    throw new Error("AUDIT_ARCHIVE_RECEIPT_CONFLICT");
  }
  await receipts.updateOne({ objectKey: receipt.objectKey }, { $setOnInsert: receipt }, { upsert: true });
  return existing ?? receipt;
}
