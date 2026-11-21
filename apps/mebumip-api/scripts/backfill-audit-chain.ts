import { MongoClient } from "mongodb";
import { config } from "../src/config.js";
import { applyAuditChainBackfill, planAuditChainBackfill, verifyAuditChain } from "../src/security.js";

const apply = process.env.AUDIT_CHAIN_BACKFILL_APPLY === "true";
const migrationUri = process.env.AUDIT_MIGRATION_MONGODB_URI;
if (apply && !migrationUri) throw new Error("AUDIT_MIGRATION_MONGODB_URI is required for apply mode; use a separately approved maintenance credential");
const uri = apply ? migrationUri : config.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required for audit-chain backfill dry-run");
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });

try {
  await client.connect();
  const db = client.db(config.MONGODB_DATABASE);
  const plan = await planAuditChainBackfill(db);
  process.stdout.write(JSON.stringify({ mode: apply ? "apply" : "dry-run", plan }, null, 2) + "\n");
  if (!apply) {
    process.stdout.write("Dry-run only. Set AUDIT_CHAIN_BACKFILL_APPLY=true only after backup, maintenance approval and independent review.\n");
    process.exitCode = plan.reason ? 2 : 0;
  } else if (plan.reason) {
    throw new Error(plan.reason);
  } else if (plan.legacyCount > 0) {
    const result = await applyAuditChainBackfill(db);
    const verification = await verifyAuditChain(db);
    process.stdout.write(JSON.stringify({ result, verification }, null, 2) + "\n");
    if (!verification.valid) throw new Error("AUDIT_CHAIN_BACKFILL_VERIFICATION_FAILED");
  }
} finally {
  await client.close();
}
