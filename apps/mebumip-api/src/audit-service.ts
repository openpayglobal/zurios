import type { ClientSession, Db, Document } from "mongodb";
import {
  auditEventHash,
  createAuditEvent,
  signAuditExport,
  verifyAuditEvent,
  verifyAuditExportManifest,
  type AuditEventInput,
} from "./security.js";

const GENESIS_HASH = "GENESIS";
const MAX_BACKFILL_EVENTS = 5_000;
type StoredAuditEvent = Document & {
  sequence?: number;
  previousHash?: string;
  eventHash?: string;
  occurredAt?: Date;
  integrity?: { algorithm?: string };
};

export type AuditChainVerification = {
  valid: boolean;
  chainValid: boolean;
  checked: number;
  legacyUnchainedEvents: number;
  latestSequence: number;
  latestHash: string;
  firstInvalidSequence: number | null;
  reason: string | null;
};

function auditInput(event: StoredAuditEvent): AuditEventInput & { occurredAt: Date } {
  const occurredAt = event.occurredAt instanceof Date ? event.occurredAt : new Date(String(event.occurredAt ?? ""));
  if (!Number.isFinite(occurredAt.getTime())) throw new Error("AUDIT_EVENT_TIMESTAMP_INVALID");
  if (typeof event.actorUserId !== "string" || typeof event.action !== "string" || typeof event.targetType !== "string" ||
      typeof event.outcome !== "string" || typeof event.correlationId !== "string") throw new Error("AUDIT_EVENT_REQUIRED_FIELDS_INVALID");
  return {
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    ...(typeof event.targetId === "string" ? { targetId: event.targetId } : {}),
    ...(typeof event.tenantId === "string" ? { tenantId: event.tenantId } : {}),
    outcome: event.outcome as AuditEventInput["outcome"],
    correlationId: event.correlationId,
    occurredAt,
    ...(Number.isSafeInteger(event.sequence) ? { sequence: event.sequence } : {}),
    ...(typeof event.previousHash === "string" ? { previousHash: event.previousHash } : {}),
    ...(event.metadata && typeof event.metadata === "object" ? { metadata: event.metadata as AuditEventInput["metadata"] } : {}),
  };
}

export async function verifyAuditChain(db: Db): Promise<AuditChainVerification> {
  const events = await db.collection<StoredAuditEvent>("auditEvents").find({}).sort({ sequence: 1, occurredAt: 1, _id: 1 }).toArray();
  let previousHash = GENESIS_HASH;
  let expectedSequence = 1;
  let firstInvalidSequence: number | null = null;
  let legacyUnchainedEvents = 0;
  let reason: string | null = null;
  for (const event of events) {
    const sequence = Number(event.sequence);
    if (!Number.isSafeInteger(sequence) || typeof event.previousHash !== "string" || typeof event.eventHash !== "string") {
      legacyUnchainedEvents += 1;
      if (!reason) reason = "AUDIT_CHAIN_BACKFILL_REQUIRED";
      continue;
    }
    try {
      const input = auditInput(event);
      const calculatedHash = auditEventHash(input);
      if (sequence !== expectedSequence || event.previousHash !== previousHash ||
          calculatedHash !== event.eventHash || !verifyAuditEvent({ ...event, occurredAt: input.occurredAt })) {
        firstInvalidSequence = sequence;
        reason = "AUDIT_CHAIN_INTEGRITY_FAILED";
        break;
      }
    } catch {
      firstInvalidSequence = Number.isSafeInteger(sequence) ? sequence : expectedSequence;
      reason = "AUDIT_EVENT_INVALID";
      break;
    }
    previousHash = event.eventHash;
    expectedSequence += 1;
  }
  const chainValid = firstInvalidSequence === null && legacyUnchainedEvents === 0 && expectedSequence - 1 === events.length;
  return {
    valid: chainValid,
    chainValid,
    checked: expectedSequence - 1,
    legacyUnchainedEvents,
    latestSequence: expectedSequence - 1,
    latestHash: previousHash,
    firstInvalidSequence,
    reason: chainValid ? null : reason ?? "AUDIT_CHAIN_SEQUENCE_GAP",
  };
}

export async function planAuditChainBackfill(db: Db) {
  const events = await db.collection<StoredAuditEvent>("auditEvents").find({}).sort({ sequence: 1, occurredAt: 1, _id: 1 }).toArray();
  const legacy = events.filter(event => !Number.isSafeInteger(event.sequence) || typeof event.previousHash !== "string" || typeof event.eventHash !== "string");
  const chainedCount = events.length - legacy.length;
  let invalidLegacyCount = 0;
  for (const event of legacy) {
    try { auditInput(event); } catch { invalidLegacyCount += 1; }
  }
  const probe = createAuditEvent({
    actorUserId: "audit-backfill-preflight",
    action: "audit.backfill.preflight",
    targetType: "audit_chain",
    outcome: "success",
    correlationId: "audit-backfill-preflight",
    sequence: 1,
    previousHash: GENESIS_HASH,
  });
  const reason = chainedCount > 0 && legacy.length > 0
    ? "CHAINED_AND_UNCHAINED_EVENTS_MIXED"
    : legacy.length > MAX_BACKFILL_EVENTS
      ? "BACKFILL_LIMIT_EXCEEDED"
      : invalidLegacyCount > 0
        ? "LEGACY_EVENTS_INVALID"
        : probe.integrity.algorithm === "unsigned"
          ? "AUDIT_SIGNING_KEY_REQUIRED"
          : null;
  return {
    legacyCount: legacy.length,
    chainedCount,
    totalCount: events.length,
    maximumSupported: MAX_BACKFILL_EVENTS,
    invalidLegacyCount,
    applyAllowed: reason === null && legacy.length > 0,
    reason,
    oldestLegacyAt: legacy[0]?.occurredAt instanceof Date ? legacy[0].occurredAt.toISOString() : null,
    newestLegacyAt: legacy.at(-1)?.occurredAt instanceof Date ? legacy.at(-1)!.occurredAt!.toISOString() : null,
  };
}

export async function applyAuditChainBackfill(db: Db): Promise<{ migrated: number; latestSequence: number }> {
  const session = db.client.startSession();
  let migrated = 0;
  try {
    await session.withTransaction(async () => {
      const collection = db.collection<StoredAuditEvent>("auditEvents");
      const events = await collection.find({}, { session }).sort({ sequence: 1, occurredAt: 1, _id: 1 }).toArray();
      const legacy = events.filter(event => !Number.isSafeInteger(event.sequence) || typeof event.previousHash !== "string" || typeof event.eventHash !== "string");
      if (legacy.length === 0) { migrated = 0; return; }
      if (legacy.length !== events.length) throw new Error("CHAINED_AND_UNCHAINED_EVENTS_MIXED");
      if (legacy.length > MAX_BACKFILL_EVENTS) throw new Error("AUDIT_BACKFILL_LIMIT_EXCEEDED");
      let previousHash = GENESIS_HASH;
      let expectedSequence = 1;
      for (const stored of legacy) {
        const input = auditInput(stored);
        const sequence = Number.isSafeInteger(stored.sequence) ? Number(stored.sequence) : expectedSequence;
        if (sequence !== expectedSequence) throw new Error("LEGACY_AUDIT_SEQUENCE_NOT_CONTIGUOUS");
        const event = createAuditEvent({ ...input, sequence, previousHash });
        if (event.integrity.algorithm === "unsigned") throw new Error("AUDIT_SIGNING_KEY_REQUIRED");
        const eventHash = auditEventHash(event);
        const result = await collection.updateOne(
          { _id: stored._id, eventHash: { $exists: false } },
          { $set: { sequence, previousHash, eventHash, integrity: event.integrity } },
          { session },
        );
        if (result.modifiedCount !== 1) throw new Error("LEGACY_AUDIT_EVENT_CHANGED_DURING_BACKFILL");
        previousHash = eventHash;
        expectedSequence += 1;
      }
      await db.collection("auditCounters").updateOne(
        { _id: "global" },
        { $set: { sequence: expectedSequence - 1, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true, session },
      );
      migrated = legacy.length;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" });
    return { migrated, latestSequence: migrated };
  } finally {
    await session.endSession();
  }
}

export type AuditArchiveBundle = {
  manifest: ReturnType<typeof signAuditExport>;
  events: StoredAuditEvent[];
};

export async function exportAuditArchive(db: Db): Promise<AuditArchiveBundle> {
  const verification = await verifyAuditChain(db);
  if (!verification.valid) throw new Error("AUDIT_CHAIN_NOT_COMPLETE_FOR_ARCHIVE");
  const events = await db.collection<StoredAuditEvent>("auditEvents").find({}).sort({ sequence: 1 }).toArray();
  const manifest = signAuditExport(events, new Date().toISOString());
  if (manifest.integrity.algorithm === "unsigned") throw new Error("AUDIT_ARCHIVE_MANIFEST_UNSIGNED");
  return { manifest, events };
}

export function verifyAuditArchiveBundle(value: unknown) {
  if (!value || typeof value !== "object") return { valid: false, checked: 0, firstInvalidSequence: null, reason: "ARCHIVE_INVALID_SHAPE" };
  const bundle = value as Partial<AuditArchiveBundle>;
  if (!bundle.manifest || !Array.isArray(bundle.events) || !verifyAuditExportManifest(bundle.manifest as unknown as Record<string, unknown>, bundle.events)) {
    return { valid: false, checked: 0, firstInvalidSequence: null, reason: "ARCHIVE_MANIFEST_INVALID" };
  }
  let previousHash = GENESIS_HASH;
  for (let index = 0; index < bundle.events.length; index += 1) {
    const event = bundle.events[index]!;
    const sequence = Number(event.sequence);
    try {
      const input = auditInput(event);
      if (sequence !== index + 1 || event.previousHash !== previousHash ||
          event.eventHash !== auditEventHash(input) || !verifyAuditEvent({ ...event, occurredAt: input.occurredAt })) {
        return { valid: false, checked: index, firstInvalidSequence: sequence, reason: "ARCHIVE_EVENT_CHAIN_INVALID" };
      }
      previousHash = String(event.eventHash);
    } catch {
      return { valid: false, checked: index, firstInvalidSequence: sequence, reason: "ARCHIVE_EVENT_INVALID" };
    }
  }
  return { valid: true, checked: bundle.events.length, firstInvalidSequence: null, reason: null };
}
