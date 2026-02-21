const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const failures = [];

const byteBudgets = [
  { relPath: "assets/js/app.js", maxBytes: 1_100_000 },
  { relPath: "assets/css/components.css", maxBytes: 190_000 },
  { relPath: "scripts/franklin.js", maxBytes: 90_000 },
  { relPath: "docs/ai-memory/decisions.md", maxBytes: 90_000 },
  { relPath: "docs/ai-memory/release-notes.md", maxBytes: 90_000 },
];

function fail(message) {
  failures.push(message);
}

function bytesToKiB(bytes = 0) {
  return `${(Number(bytes) / 1024).toFixed(1)} KiB`;
}

function validateFileBudget(relPath, maxBytes) {
  const absPath = path.join(root, relPath);
  if (!fs.existsSync(absPath)) {
    fail(`Missing required file for optimization budget check: ${relPath}`);
    return;
  }

  const stats = fs.statSync(absPath);
  if (!stats.isFile()) {
    fail(`Expected file but found non-file path: ${relPath}`);
    return;
  }

  if (stats.size > maxBytes) {
    fail(
      `${relPath} exceeds optimization safety budget (${bytesToKiB(stats.size)} > ${bytesToKiB(maxBytes)}).`
    );
  }
}

function countFilesInDirectory(relDir) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    fail(`Missing required directory for optimization safety check: ${relDir}`);
    return 0;
  }

  const stack = [absDir];
  let count = 0;
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        count += 1;
      }
    }
  }

  return count;
}

function main() {
  for (const budget of byteBudgets) {
    validateFileBudget(budget.relPath, budget.maxBytes);
  }

  const aiMemoryFileCount = countFilesInDirectory("docs/ai-memory");
  if (aiMemoryFileCount > 40) {
    fail(`docs/ai-memory has too many files (${aiMemoryFileCount} > 40). Consolidate/archive to keep memory maintainable.`);
  }

  if (failures.length) {
    console.error(`Optimization safety verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Optimization safety verification passed.");
  console.log(`- Budgets checked: ${byteBudgets.length}`);
  console.log(`- docs/ai-memory files: ${aiMemoryFileCount}`);
}

main();