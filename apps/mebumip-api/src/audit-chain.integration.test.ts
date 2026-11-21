import test from "node:test";
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { appendAuditEvent, createAuditEvent } from "./security.js";
import { applyAuditChainBackfill, exportAuditArchive, planAuditChainBackfill, verifyAuditArchiveBundle, verifyAuditChain } from "./audit-service.js";

process.env.NODE_ENV = "test";
process.env.AUDIT_SIGNING_KEY = "test-audit-signing-key-with-adequate-entropy";
const mongoUri = process.env.MONGODB_TEST_URI ?? process.env.MONGODB_URI;

test("audit chain allocates contiguous signed events transactionally and detects tampering", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`audit_chain_test_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    await Promise.all(Array.from({ length: 8 }, (_, index) => appendAuditEvent(db, {
      actorUserId: "audit-test",
      action: "audit.concurrent",
      targetType: "test",
      outcome: "success",
      correlationId: `parallel-${index}`,
    })));
    const verification = await verifyAuditChain(db);
    assert.equal(verification.valid, true);
    assert.equal(verification.checked, 8);
    const events = await db.collection("auditEvents").find({}).sort({ sequence: 1 }).toArray();
    assert.deepEqual(events.map(event => event.sequence), [1,2,3,4,5,6,7,8]);
    assert.equal(events[0]?.previousHash, "GENESIS");
    for (let index = 1; index < events.length; index += 1) {
      assert.equal(events[index]?.previousHash, events[index - 1]?.eventHash);
    }
    const archive = await exportAuditArchive(db);
    assert.equal(verifyAuditArchiveBundle(JSON.parse(JSON.stringify(archive))).valid, true);
    await db.collection("auditEvents").updateOne({ sequence: 8 }, { $set: { action: "audit.tampered" } });
    const tampered = await verifyAuditChain(db);
    assert.equal(tampered.valid, false);
    assert.equal(tampered.firstInvalidSequence, 8);
    const tamperedArchive = await exportAuditArchive(db).catch(error => error as Error);
    assert.ok(tamperedArchive instanceof Error);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});

test("legacy audit backfill is dry-run first, bounded, signed and verifiable", {
  skip: !mongoUri ? "MONGODB_TEST_URI is not configured" : false,
}, async () => {
  const client = new MongoClient(mongoUri!, { serverSelectionTimeoutMS: 5_000 });
  const db = client.db(`audit_backfill_test_${process.pid}_${Date.now()}`);
  try {
    await client.connect();
    const legacyEvents = [1,2,3].map(sequence => createAuditEvent({
      actorUserId: "legacy-test",
      action: "legacy.audit",
      targetType: "test",
      outcome: "success",
      correlationId: `legacy-${sequence}`,
      sequence,
      occurredAt: new Date(Date.UTC(2026, 0, sequence)),
    }));
    await db.collection("auditEvents").insertMany(legacyEvents);
    const plan = await planAuditChainBackfill(db);
    assert.equal(plan.legacyCount, 3);
    assert.equal(plan.applyAllowed, true);
    assert.equal(await db.collection("auditEvents").countDocuments({ eventHash: { $exists: true } }), 0);
    const applied = await applyAuditChainBackfill(db);
    assert.deepEqual(applied, { migrated: 3, latestSequence: 3 });
    assert.equal((await verifyAuditChain(db)).valid, true);
    await appendAuditEvent(db, {
      actorUserId: "legacy-test",
      action: "post.backfill",
      targetType: "test",
      outcome: "success",
      correlationId: "post-backfill",
    });
    const final = await verifyAuditChain(db);
    assert.equal(final.valid, true);
    assert.equal(final.latestSequence, 4);
  } finally {
    await db.dropDatabase().catch(() => undefined);
    await client.close();
  }
});
