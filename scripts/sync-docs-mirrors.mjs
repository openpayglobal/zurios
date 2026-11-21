import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const pairs = [
  ["products/zuri-mebumip/README.md", "docs/products/zuri-mebumip/README.md"],
  ["products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md", "docs/products/zuri-mebumip/IMPLEMENTATION-ROADMAP.md"],
  ["products/zuri-mebumip/ARCHITECTURE.md", "docs/products/zuri-mebumip/ARCHITECTURE.md"],
  ["products/zuri-mebumip/PROGRESS.md", "docs/products/zuri-mebumip/PROGRESS.md"],
  ["products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md", "docs/products/zuri-mebumip/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md"],
];

function mirrorContent(sourcePath) {
  let content = readFileSync(sourcePath, "utf8");
  // The source documents live one directory above docs/; mirrored copies
  // live inside docs/ and therefore need their relative links rebased.
  if (sourcePath.endsWith("/README.md")) {
    content = content
      .replaceAll("../../docs/README.md", "../../README.md")
      .replaceAll("../../docs/ZURI-ECOSYSTEM-OVERVIEW.md", "../../ZURI-ECOSYSTEM-OVERVIEW.md");
  }
  if (sourcePath.endsWith("/PHASE1-PRODUCTION-SECURITY-RUNBOOK.md")) {
    content = content.replaceAll(
      "../../docs/security/KEY-MANAGEMENT-AND-AUDIT-ARCHIVING.md",
      "../../security/KEY-MANAGEMENT-AND-AUDIT-ARCHIVING.md",
    );
  }
  return content;
}

const writeMode = process.argv.includes("--write");
let stale = 0;
for (const [sourcePath, mirrorPath] of pairs) {
  const expected = mirrorContent(sourcePath);
  let actual = "";
  try {
    actual = readFileSync(mirrorPath, "utf8");
  } catch {
    // A missing mirror is handled by the same write/check path as stale content.
  }
  if (actual === expected) {
    console.log(`OK ${mirrorPath}`);
    continue;
  }
  stale += 1;
  if (writeMode) {
    mkdirSync(dirname(mirrorPath), { recursive: true });
    writeFileSync(mirrorPath, expected);
    console.log(`SYNCED ${mirrorPath}`);
  } else {
    console.error(`OUT OF SYNC ${mirrorPath} (source: ${sourcePath})`);
  }
}
if (!writeMode && stale > 0) {
  console.error(`\n${stale} product documentation mirror(s) are stale. Run: pnpm docs:sync`);
  process.exitCode = 1;
} else if (writeMode) {
  console.log(`\nSynchronized ${stale} product documentation mirror(s).`);
}
