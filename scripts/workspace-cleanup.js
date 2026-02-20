const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();

const removableDirs = [
  "artifacts",
  "dist",
  "test-results",
  "build/css/min",
];

const removableFiles = [
  ".tmp_js_css_ids.txt",
];

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function rel(absPath) {
  return path.relative(root, absPath).replace(/\\/g, "/") || ".";
}

function collectTmpFiles() {
  const results = [];
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(".tmp_")) continue;
    results.push(path.join(root, entry.name));
  }
  return results;
}

function collectTargets() {
  const targets = [];

  for (const dir of removableDirs) {
    const absPath = path.join(root, dir);
    if (!fs.existsSync(absPath)) continue;
    targets.push({
      kind: "dir",
      absPath,
      reason: "Generated artifact folder",
    });
  }

  for (const file of removableFiles) {
    const absPath = path.join(root, file);
    if (!fs.existsSync(absPath)) continue;
    targets.push({
      kind: "file",
      absPath,
      reason: "Temporary helper file",
    });
  }

  for (const absPath of collectTmpFiles()) {
    if (removableFiles.some((fixed) => path.join(root, fixed) === absPath)) continue;
    targets.push({
      kind: "file",
      absPath,
      reason: "Temporary .tmp_* file",
    });
  }

  targets.sort((a, b) => rel(a.absPath).localeCompare(rel(b.absPath)));
  return targets;
}

function removeTarget(target) {
  if (target.kind === "dir") {
    fs.rmSync(target.absPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
    return;
  }
  fs.rmSync(target.absPath, { force: true, maxRetries: 8, retryDelay: 120 });
}

function removeDirContents(absDir) {
  let entries = [];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return { removed: 0, skipped: 1 };
  }

  let removed = 0;
  let skipped = 0;

  for (const entry of entries) {
    const entryPath = path.join(absDir, entry.name);
    try {
      fs.rmSync(entryPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
      removed += 1;
    } catch {
      skipped += 1;
    }
  }

  return { removed, skipped };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.apply ? "APPLY" : "DRY-RUN";
  const targets = collectTargets();

  console.log(`Workspace cleanup (${mode})`);
  console.log(`- Targets found: ${targets.length}`);

  if (!targets.length) {
    console.log("Nothing to clean.");
    return;
  }

  for (const target of targets) {
    console.log(`- [${target.kind}] ${rel(target.absPath)} :: ${target.reason}`);
  }

  if (!options.apply) {
    console.log("\nDry-run complete. Re-run with --apply to remove these paths.");
    return;
  }

  let removed = 0;
  let skipped = 0;
  let contentFallbacks = 0;

  for (const target of targets) {
    try {
      removeTarget(target);
      removed += 1;
    } catch (error) {
      if (target.kind === "dir") {
        const fallback = removeDirContents(target.absPath);
        if (fallback.removed > 0 || fallback.skipped === 0) {
          contentFallbacks += 1;
          removed += 1;
          if (fallback.skipped > 0) {
            skipped += 1;
            console.warn(`Partially cleaned ${rel(target.absPath)} (locked entries remaining: ${fallback.skipped}).`);
          } else {
            console.warn(`Cleaned contents of ${rel(target.absPath)} (kept directory shell).`);
          }
          continue;
        }
      }

      skipped += 1;
      console.warn(`Could not remove ${rel(target.absPath)}: ${error.message || String(error)}`);
    }
  }

  console.log("\nCleanup complete.");
  console.log(`- Removed: ${removed}`);
  console.log(`- Skipped: ${skipped}`);
  console.log(`- Content fallback cleanups: ${contentFallbacks}`);
  console.log("- Kept intentionally: dist_site, release, source folders");
}

main();
