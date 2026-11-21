import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MongoClient } from "mongodb";
import { config } from "../src/config.js";
import { exportAuditArchive } from "../src/audit-service.js";

if (!config.MONGODB_URI) throw new Error("MONGODB_URI is required for audit archive export");
const output = process.env.AUDIT_ARCHIVE_OUTPUT;
if (!output) throw new Error("Set AUDIT_ARCHIVE_OUTPUT to a new output file path");
const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  await client.connect();
  const bundle = await exportAuditArchive(client.db(config.MONGODB_DATABASE));
  const path = resolve(output);
  await writeFile(path, JSON.stringify(bundle, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
  process.stdout.write(JSON.stringify({ exported: bundle.manifest.count, firstSequence: bundle.manifest.firstSequence, lastSequence: bundle.manifest.lastSequence, path }, null, 2) + "\n");
} finally {
  await client.close();
}
