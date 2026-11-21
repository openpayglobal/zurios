import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "mebumip-integration-audit-signing-key-2026";
const mongoUri = process.env.MONGODB_TEST_URI;
const { ensureMeBuMIPIndexes } = await import("./database.js");
const {
  appendAuditEvent, applyAuditChainBackfill, exportAuditArchive,
  planAuditChainBackfill, verifyAuditArchiveBundle, verifyAuditChain, withAuditTransaction,
} = await import("./security.js");

test("domain mutation rolls back when its transactional audit append fails", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_atomicity_${process.pid}_${Date.now()}`);
  const previousKeyRing = process.env.AUDIT_SIGNING_KEYRING;
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    process.env.AUDIT_SIGNING_KEYRING = "{";
    await assert.rejects(() => withAuditTransaction(
      db,
      (session) => db.collection("transactionalProbe").insertOne({ operationId: "must-rollback" }, { session }),
      (created) => ({
        actorUserId: "test-actor", action: "test.atomicity", targetType: "probe",
        targetId: String(created.insertedId), outcome: "success", correlationId: "atomicity-test",
      }),
    ));
    assert.equal(await db.collection("transactionalProbe").countDocuments({ operationId: "must-rollback" }), 0);
    assert.equal(await db.collection("auditEvents").countDocuments({}), 0);
    assert.equal(await db.collection("auditCounters").countDocuments({}), 0);
  } finally {
    if (previousKeyRing === undefined) delete process.env.AUDIT_SIGNING_KEYRING;
    else process.env.AUDIT_SIGNING_KEYRING = previousKeyRing;
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("audit chain appends serialize, verify, and detect tampering", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_chain_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    await Promise.all(Array.from({ length: 12 }, (_, index) => appendAuditEvent(db, {
      actorUserId: "audit-concurrency-test",
      action: "audit.concurrent.append",
      targetType: "test",
      outcome: "success",
      correlationId: `audit-concurrent-${index}`,
      metadata: { index, password: index === 0 ? "must-not-be-stored" : null },
    })));
    const verification = await verifyAuditChain(db);
    assert.equal(verification.valid, true);
    assert.equal(verification.checked, 12);
    assert.equal(verification.latestSequence, 12);
    const redactedEvent = await db.collection("auditEvents").findOne({ correlationId: "audit-concurrent-0" });
    assert.equal((redactedEvent?.metadata as Record<string, unknown> | undefined)?.password, "[REDACTED]");
    const archive = await exportAuditArchive(db);
    assert.equal(verifyAuditArchiveBundle(archive).valid, true);
    assert.equal(verifyAuditArchiveBundle(JSON.parse(JSON.stringify(archive))).valid, true, "serialized archive timestamps must verify offline");
    await db.collection("auditEvents").updateOne({ sequence: 6 }, { $set: { action: "tampered.event" } });
    assert.equal((await verifyAuditChain(db)).valid, false);
    assert.equal(verifyAuditArchiveBundle(archive).valid, true, "a previously exported immutable bundle remains independently verifiable");
    const tamperedBundle = { ...archive, events: archive.events.map((event, index) => index === 5 ? { ...event, action: "tampered.archive" } : event) };
    assert.equal(verifyAuditArchiveBundle(tamperedBundle).valid, false);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("audit-chain backfill refuses partial chain metadata instead of rewriting provenance", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_partial_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    await db.collection("auditEvents").insertMany([
      {
        actorUserId: "legacy-user", action: "legacy.partial", targetType: "test",
        outcome: "success", correlationId: "legacy-partial", occurredAt: new Date(),
        sequence: 7, previousHash: "GENESIS",
      },
      {
        actorUserId: "legacy-user", action: "legacy.sequence-only", targetType: "test",
        outcome: "success", correlationId: "legacy-sequence-only", occurredAt: new Date(),
        sequence: 8,
      },
    ]);
    const plan = await planAuditChainBackfill(db);
    assert.equal(plan.legacyCount, 0);
    assert.equal(plan.sequencedCount, 0);
    assert.equal(plan.malformedCount, 2);
    assert.equal(plan.applyAllowed, false);
    assert.match(plan.reason ?? "", /PARTIAL_AUDIT_CHAIN_FIELDS/);
    await assert.rejects(() => applyAuditChainBackfill(db), /PARTIAL_AUDIT_CHAIN_FIELDS/);
    assert.equal(await db.collection("auditEvents").countDocuments({ eventHash: { $exists: true } }), 0);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("audit-chain backfill refuses histories larger than the bounded transaction limit", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_oversized_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    const now = Date.now();
    await db.collection("auditEvents").insertMany(Array.from({ length: 5_001 }, (_, index) => ({
      actorUserId: "legacy-user",
      action: "legacy.bulk",
      targetType: "test",
      outcome: "success",
      correlationId: `legacy-bulk-${index}`,
      occurredAt: new Date(now + index),
    })));
    const plan = await planAuditChainBackfill(db);
    assert.equal(plan.legacyCount, 5_001);
    assert.equal(plan.maximumSupported, 5_000);
    assert.equal(plan.applyAllowed, false);
    assert.match(plan.reason ?? "", /BACKFILL_LIMIT_EXCEEDED/);
    await assert.rejects(() => applyAuditChainBackfill(db), /AUDIT_BACKFILL_LIMIT_EXCEEDED/);
    assert.equal(await db.collection("auditEvents").countDocuments({ sequence: { $exists: true } }), 0);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("legacy audit-chain backfill is dry-run-first, bounded, and refuses mixed histories", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_backfill_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    const baseTime = Date.now();
    await db.collection("auditEvents").insertMany([
      { actorUserId: "legacy-user", action: "legacy.first", targetType: "test", outcome: "success", correlationId: "legacy-1", occurredAt: new Date(baseTime) },
      { actorUserId: "legacy-user", action: "legacy.second", targetType: "test", outcome: "denied", correlationId: "legacy-2", occurredAt: new Date(baseTime + 1) },
      { actorUserId: "legacy-user", action: "legacy.third", targetType: "test", outcome: "failure", correlationId: "legacy-3", occurredAt: new Date(baseTime + 2) },
    ]);
    const dryRun = await planAuditChainBackfill(db);
    assert.equal(dryRun.legacyCount, 3);
    assert.equal(dryRun.applyAllowed, true);
    assert.equal(await db.collection("auditEvents").countDocuments({ eventHash: { $exists: true } }), 0);
    const applied = await applyAuditChainBackfill(db);
    assert.deepEqual(applied, { migrated: 3, latestSequence: 3 });
    assert.equal((await verifyAuditChain(db)).valid, true);
    const archive = await exportAuditArchive(db);
    assert.equal(verifyAuditArchiveBundle(archive).valid, true);
    assert.equal((await planAuditChainBackfill(db)).legacyCount, 0);
    await appendAuditEvent(db, { actorUserId: "new-user", action: "chain.started", targetType: "test", outcome: "success", correlationId: "chain-start" });
    await db.collection("auditEvents").insertOne({ actorUserId: "legacy-user", action: "legacy.after-chain", targetType: "test", outcome: "success", correlationId: "legacy-after", occurredAt: new Date() });
    const mixed = await planAuditChainBackfill(db);
    assert.equal(mixed.applyAllowed, false);
    assert.match(mixed.reason ?? "", /MIXED/);
    await assert.rejects(() => applyAuditChainBackfill(db), /MIXED/);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
