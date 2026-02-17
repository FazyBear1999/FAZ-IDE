const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const targets = [
  "dist_pack_check",
  "dist_release_test",
];

function cleanRunDirectories(baseDirName) {
  const baseDir = path.join(root, baseDirName);
  if (!fs.existsSync(baseDir)) {
    console.log(`${baseDirName}: not found (skipped).`);
    return { removed: 0, skipped: 0 };
  }

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => path.join(baseDir, entry.name));

  if (!runDirs.length) {
    console.log(`${baseDirName}: no run-* directories found.`);
    return { removed: 0, skipped: 0 };
  }

  let removed = 0;
  const skipped = [];

  for (const dirPath of runDirs) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
      removed += 1;
    } catch {
      skipped.push(path.basename(dirPath));
    }
  }

  console.log(`${baseDirName}: removed ${removed} run director${removed === 1 ? "y" : "ies"}.`);
  if (skipped.length) {
    console.log(`${baseDirName}: skipped ${skipped.length} locked director${skipped.length === 1 ? "y" : "ies"}.`);
  }

  return { removed, skipped: skipped.length };
}

let totalRemoved = 0;
let totalSkipped = 0;

for (const target of targets) {
  const result = cleanRunDirectories(target);
  totalRemoved += result.removed;
  totalSkipped += result.skipped;
}

console.log(`Total removed run directories: ${totalRemoved}`);
if (totalSkipped) {
  console.log(`Total skipped locked directories: ${totalSkipped}`);
}
