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
  occurredAt: Date;
};

function signingKey(): string {
  return config.AUDIT_SIGNING_KEY ?? DEVELOPMENT_SIGNING_KEY;
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

function sign(eventHash: string): string {
  return createHmac("sha256", signingKey()).update(eventHash).digest("hex");
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
      await events.insertOne({
        ...base,
        sequence,
        previousHash,
        eventHash,
        signature: sign(eventHash),
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
      !equalHex(event.signature, sign(calculatedHash))
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
