import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Db, Document } from "mongodb";
import { config } from "./config.js";
import { createAuditEvent, type AuditEventInput } from "./security.js";

const GENESIS_HASH = "GENESIS";
const DEVELOPMENT_SIGNING_KEY = "development-only-audit-signing-key-not-for-production";

type SequencedAuditEvent = Document & {
  sequence: number;
  previousHash: string;
  eventHash: string;
  signature: string;
  signatureKeyId: string;
  occurredAt: Date;
};

function currentSigningKeyId(): string {
  return config.AUDIT_SIGNING_KEY ? config.AUDIT_SIGNING_KEY_ID : "dev";
}

function keyFor(keyId: string): string | null {
  if (config.AUDIT_SIGNING_KEY && keyId === config.AUDIT_SIGNING_KEY_ID) return config.AUDIT_SIGNING_KEY;
  if (!config.AUDIT_SIGNING_KEY && config.NODE_ENV !== "production" && keyId === "dev") return DEVELOPMENT_SIGNING_KEY;
  try {
    const previous = JSON.parse(config.AUDIT_SIGNING_PREVIOUS_KEYS) as Record<string, string>;
    return typeof previous[keyId] === "string" ? previous[keyId]! : null;
  } catch {
    return null;
  }
}

function canonicalPayload(event: AuditEventInput & { sequence: number; previousHash: string; occurredAt: Date }): string {
  const metadata = event.metadata
    ? Object.fromEntries(Object.entries(event.metadata).sort(([left], [right]) => left.localeCompare(right)))
    : null;
  return JSON.stringify({
    sequence: event.sequence,
    previousHash: event.previousHash,
    actorUserId: event.actorUserId,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId ?? null,
    tenantId: event.tenantId ?? null,
    outcome: event.outcome,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt.toISOString(),
    metadata,
  });
}

function digest(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function sign(eventHash: string): { signature: string; signatureKeyId: string } {
  const signatureKeyId = currentSigningKeyId();
  const key = keyFor(signatureKeyId);
  if (!key) throw new Error("AUDIT_SIGNING_KEY_UNAVAILABLE");
  return { signature: createHmac("sha256", key).update(eventHash).digest("hex"), signatureKeyId };
}

function verifySignature(eventHash: string, signature: unknown, signatureKeyId: unknown): boolean {
  if (typeof signatureKeyId !== "string") return false;
  const key = keyFor(signatureKeyId);
  if (!key) return false;
  const expected = createHmac("sha256", key).update(eventHash).digest("hex");
  return equalHex(signature, expected);
}

function equalHex(left: unknown, right: string): boolean {
  if (typeof left !== "string" || !/^[a-f0-9]{64}$/i.test(left)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Append an event and advance the global sequence in one MongoDB transaction. */
export async function appendAuditEvent(db: Db, input: AuditEventInput): Promise<void> {
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const counters = db.collection<{ _id: string; sequence: number; updatedAt: Date }>("auditCounters");
      await counters.updateOne(
        { _id: "global" },
        { $inc: { sequence: 1 }, $set: { updatedAt: new Date() } },
        { upsert: true, session },
      );
      const counter = await counters.findOne({ _id: "global" }, { session });
      const sequence = Number(counter?.sequence);
      if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("AUDIT_SEQUENCE_INVALID");

      const events = db.collection<SequencedAuditEvent>("auditEvents");
      const previous = sequence > 1 ? await events.findOne({ sequence: sequence - 1 }, { session }) : null;
      if (sequence > 1 && !previous) throw new Error("AUDIT_CHAIN_PREDECESSOR_MISSING");
      const previousHash = previous?.eventHash ?? GENESIS_HASH;
      const base = createAuditEvent(input);
      const payload = canonicalPayload({
        ...input,
        sequence,
        previousHash,
        occurredAt: base.occurredAt,
      });
      const eventHash = digest(payload);
      const signed = sign(eventHash);
      await events.insertOne({
        ...base,
        sequence,
        previousHash,
        eventHash,
        signature: signed.signature,
        signatureKeyId: signed.signatureKeyId,
      } as SequencedAuditEvent, { session });
    });
  } finally {
    await session.endSession();
  }
}

/** Verify the signed hash chain and explicitly report legacy events not yet backfilled. */
export async function verifyAuditChain(db: Db): Promise<{
  valid: boolean;
  chainValid: boolean;
  checked: number;
  legacyUnchainedEvents: number;
  latestSequence: number;
  latestHash: string;
  firstInvalidSequence: number | null;
}> {
  const events = await db.collection<SequencedAuditEvent>("auditEvents").find(
    { sequence: { $exists: true } },
  ).sort({ sequence: 1 }).toArray();
  const legacyUnchainedEvents = await db.collection("auditEvents").countDocuments({ sequence: { $exists: false } });
  let expectedSequence = 1;
  let previousHash = GENESIS_HASH;
  let firstInvalidSequence: number | null = null;

  for (const event of events) {
    const sequence = Number(event.sequence);
    const payload = canonicalPayload({
      actorUserId: String(event.actorUserId),
      action: String(event.action),
      targetType: String(event.targetType),
      ...(typeof event.targetId === "string" ? { targetId: event.targetId } : {}),
      ...(typeof event.tenantId === "string" ? { tenantId: event.tenantId } : {}),
      outcome: event.outcome as AuditEventInput["outcome"],
      correlationId: String(event.correlationId),
      ...(event.metadata && typeof event.metadata === "object" ? { metadata: event.metadata as NonNullable<AuditEventInput["metadata"]> } : {}),
      sequence,
      previousHash: String(event.previousHash),
      occurredAt: event.occurredAt,
    });
    const calculatedHash = digest(payload);
    if (
      sequence !== expectedSequence ||
      event.previousHash !== previousHash ||
      !equalHex(event.eventHash, calculatedHash) ||
      !verifySignature(calculatedHash, event.signature, event.signatureKeyId)
    ) {
      firstInvalidSequence = sequence;
      break;
    }
    previousHash = String(event.eventHash);
    expectedSequence += 1;
  }

  const chainValid = firstInvalidSequence === null && expectedSequence - 1 === events.length;
  return {
    valid: chainValid && legacyUnchainedEvents === 0,
    chainValid,
    checked: events.length,
    legacyUnchainedEvents,
    latestSequence: events.length ? Number(events[events.length - 1]!.sequence) : 0,
    latestHash: previousHash,
    firstInvalidSequence,
  };
}

export async function planAuditChainBackfill(db: Db): Promise<{
  legacyCount: number;
  sequencedCount: number;
  maximumSupported: number;
  invalidLegacyCount: number;
  applyAllowed: boolean;
  reason: string | null;
  oldestLegacyAt: string | null;
  newestLegacyAt: string | null;
}> {
  const legacyCount = await db.collection("auditEvents").countDocuments({ sequence: { $exists: false } });
  const sequencedCount = await db.collection("auditEvents").countDocuments({ sequence: { $exists: true } });
  const oldest = await db.collection("auditEvents").findOne(
    { sequence: { $exists: false } },
    { sort: { occurredAt: 1, _id: 1 }, projection: { occurredAt: 1 } },
  );
  const newest = await db.collection("auditEvents").findOne(
    { sequence: { $exists: false } },
    { sort: { occurredAt: -1, _id: -1 }, projection: { occurredAt: 1 } },
  );
  const sample = await db.collection("auditEvents").find(
    { sequence: { $exists: false } },
    { projection: { occurredAt: 1, outcome: 1 } },
  ).limit(5_001).toArray();
  const invalidLegacyCount = sample.filter((event) =>
    !(event.occurredAt instanceof Date) ||
    !["success", "denied", "failure"].includes(String(event.outcome))
  ).length;
  const reason = sequencedCount > 0 && legacyCount > 0
    ? "LEGACY_AND_SEQUENCED_EVENTS_MIXED: backfill must run before new chain writes"
    : legacyCount > 5_000
      ? "BACKFILL_LIMIT_EXCEEDED: split historical records into an approved maintenance migration"
      : invalidLegacyCount > 0
        ? "LEGACY_EVENTS_INVALID: inspect timestamps and outcomes before migration"
        : null;
  return {
    legacyCount,
    sequencedCount,
    maximumSupported: 5_000,
    invalidLegacyCount,
    applyAllowed: reason === null && legacyCount > 0,
    reason,
    oldestLegacyAt: oldest?.occurredAt instanceof Date ? oldest.occurredAt.toISOString() : null,
    newestLegacyAt: newest?.occurredAt instanceof Date ? newest.occurredAt.toISOString() : null,
  };
}

/** One-time, bounded migration for pre-chain events. Requires an explicit apply flag in the CLI. */
export async function applyAuditChainBackfill(db: Db): Promise<{ migrated: number; latestSequence: number }> {
  const session = db.client.startSession();
  let migrated = 0;
  try {
    await session.withTransaction(async () => {
      const events = db.collection<SequencedAuditEvent>("auditEvents");
      const legacy = await events.find({ sequence: { $exists: false } }, { session }).sort({ occurredAt: 1, _id: 1 }).toArray();
      const sequencedCount = await events.countDocuments({ sequence: { $exists: true } }, { session });
      if (sequencedCount > 0 && legacy.length > 0) throw new Error("LEGACY_AND_SEQUENCED_EVENTS_MIXED");
      if (legacy.length > 5_000) throw new Error("AUDIT_BACKFILL_LIMIT_EXCEEDED");
      if (legacy.length === 0) { migrated = 0; return; }

      let previousHash = GENESIS_HASH;
      let sequence = 0;
      for (const legacyEvent of legacy) {
        sequence += 1;
        const occurredAt = legacyEvent.occurredAt instanceof Date ? legacyEvent.occurredAt : new Date(String(legacyEvent.occurredAt ?? ""));
        if (Number.isNaN(occurredAt.getTime())) throw new Error("LEGACY_AUDIT_TIMESTAMP_INVALID");
        const outcome = legacyEvent.outcome === "success" || legacyEvent.outcome === "denied" || legacyEvent.outcome === "failure"
          ? legacyEvent.outcome
          : null;
        if (!outcome) throw new Error("LEGACY_AUDIT_OUTCOME_INVALID");
        const metadata = legacyEvent.metadata && typeof legacyEvent.metadata === "object"
          ? legacyEvent.metadata as AuditEventInput["metadata"]
          : undefined;
        const input: AuditEventInput = {
          actorUserId: String(legacyEvent.actorUserId ?? "unknown"),
          action: String(legacyEvent.action ?? "legacy.unknown"),
          targetType: String(legacyEvent.targetType ?? "unknown"),
          ...(typeof legacyEvent.targetId === "string" ? { targetId: legacyEvent.targetId } : {}),
          ...(typeof legacyEvent.tenantId === "string" ? { tenantId: legacyEvent.tenantId } : {}),
          outcome,
          correlationId: String(legacyEvent.correlationId ?? String(legacyEvent._id)),
          occurredAt,
          ...(metadata ? { metadata } : {}),
        };
        const payload = canonicalPayload({ ...input, sequence, previousHash, occurredAt });
        const eventHash = digest(payload);
        const signed = sign(eventHash);
        const result = await events.updateOne(
          { _id: legacyEvent._id, sequence: { $exists: false } },
          { $set: { sequence, previousHash, eventHash, signature: signed.signature, signatureKeyId: signed.signatureKeyId, occurredAt } },
          { session },
        );
        if (result.modifiedCount !== 1) throw new Error("LEGACY_AUDIT_EVENT_CHANGED_DURING_BACKFILL");
        previousHash = eventHash;
      }
      await db.collection("auditCounters").updateOne(
        { _id: "global" },
        { $set: { sequence, updatedAt: new Date() } },
        { upsert: true, session },
      );
      migrated = sequence;
    });
    return { migrated, latestSequence: migrated };
  } finally {
    await session.endSession();
  }
}
