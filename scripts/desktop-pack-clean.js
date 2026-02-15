const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const baseDir = path.join(root, "dist_pack_check");

if (!fs.existsSync(baseDir)) {
  console.log("No dist_pack_check directory found. Nothing to clean.");
  process.exit(0);
}

const entries = fs.readdirSync(baseDir, { withFileTypes: true });
const runDirs = entries
  .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
  .map((entry) => path.join(baseDir, entry.name));

if (runDirs.length === 0) {
  console.log("No run-* directories found. Nothing to clean.");
  process.exit(0);
}

let removed = 0;
const skipped = [];

for (const dirPath of runDirs) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
    removed += 1;
  } catch (error) {
    skipped.push(path.basename(dirPath));
  }
}

console.log(`Removed ${removed} desktop pack run director${removed === 1 ? "y" : "ies"}.`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} locked director${skipped.length === 1 ? "y" : "ies"}: ${skipped.join(", ")}`);
}
