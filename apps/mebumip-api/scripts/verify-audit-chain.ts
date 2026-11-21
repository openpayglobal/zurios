import { MongoClient } from "mongodb";
import { config } from "../src/config.js";
import { verifyAuditChain } from "../src/security.js";

if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required for audit-chain verification");

const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(config.MONGODB_DATABASE);
  const result = await verifyAuditChain(db);
  process.stdout.write(JSON.stringify({ ...result, verifiedAt: new Date().toISOString() }, null, 2) + "\n");
  if (!result.valid) process.exitCode = 1;
} finally {
  await client.close();
}
