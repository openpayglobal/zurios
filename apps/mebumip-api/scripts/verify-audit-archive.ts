import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { verifyAuditArchiveBundle } from "../src/security.js";

const input = process.env.AUDIT_ARCHIVE_FILE;
if (!input) throw new Error("Set AUDIT_ARCHIVE_FILE to the archive bundle to verify");
const bundle = JSON.parse(await readFile(resolve(input), "utf8")) as unknown;
const result = verifyAuditArchiveBundle(bundle);
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
if (!result.valid) process.exitCode = 1;
