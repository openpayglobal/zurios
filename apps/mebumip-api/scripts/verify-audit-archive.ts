import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyAuditArchiveBundle } from "../src/audit-service.js";

const input = process.env.AUDIT_ARCHIVE_INPUT;
if (!input) throw new Error("Set AUDIT_ARCHIVE_INPUT to an exported archive file");
const path = resolve(input);
const bundle: unknown = JSON.parse(await readFile(path, "utf8"));
const verification = verifyAuditArchiveBundle(bundle);
process.stdout.write(JSON.stringify({ path, verification }, null, 2) + "\n");
if (!verification.valid) process.exitCode = 1;
