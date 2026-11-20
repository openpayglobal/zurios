import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "test-audit-signing-key-2026-not-production";
const { ensureMeBuMIPIndexes } = await import("./database.js");
const { appendAuditEvent, applyAuditChainBackfill, planAuditChainBackfill, verifyAuditChain } = await import("./audit-service.js");
const mongoUri = process.env.MONGODB_TEST_URI;

test("audit chain backfill defaults to dry-run and verifies migrated legacy events", {
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
      { actorUserId: "u1", action: "legacy.first", targetType: "test", outcome: "success", correlationId: "legacy-1", occurredAt: new Date(baseTime) },
      { actorUserId: "u1", action: "legacy.second", targetType: "test", outcome: "denied", correlationId: "legacy-2", occurredAt: new Date(baseTime + 1) },
      { actorUserId: "u2", action: "legacy.third", targetType: "test", outcome: "failure", correlationId: "legacy-3", occurredAt: new Date(baseTime + 2) },
    ]);

    const dryRun = await planAuditChainBackfill(db);
    assert.equal(dryRun.legacyCount, 3);
    assert.equal(dryRun.sequencedCount, 0);
    assert.equal(dryRun.applyAllowed, true);
    assert.equal(await db.collection("auditEvents").countDocuments({ sequence: { $exists: true } }), 0);

    const applied = await applyAuditChainBackfill(db);
    assert.deepEqual(applied, { migrated: 3, latestSequence: 3 });
    const verification = await verifyAuditChain(db);
    assert.equal(verification.valid, true);
    assert.equal(verification.checked, 3);
    assert.equal(verification.legacyUnchainedEvents, 0);

    const repeat = await planAuditChainBackfill(db);
    assert.equal(repeat.legacyCount, 0);
    assert.equal(repeat.applyAllowed, false);
    assert.equal((await verifyAuditChain(db)).valid, true);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("audit chain backfill refuses mixed legacy and already-sequenced histories", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`mebumip_audit_mixed_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await db.command({ ping: 1 });
    await ensureMeBuMIPIndexes(db);
    await appendAuditEvent(db, {
      actorUserId: "u1", action: "chain.started", targetType: "test",
      outcome: "success", correlationId: "chain-start",
    });
    await db.collection("auditEvents").insertOne({
      actorUserId: "u1", action: "legacy.after-chain", targetType: "test",
      outcome: "success", correlationId: "legacy-after", occurredAt: new Date(),
    });
    const plan = await planAuditChainBackfill(db);
    assert.equal(plan.applyAllowed, false);
    assert.match(plan.reason ?? "", /MIXED/);
    await assert.rejects(() => applyAuditChainBackfill(db), /MIXED/);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
