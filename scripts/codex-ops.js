#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECKPOINT_DIR = path.join(ROOT, "artifacts", "codex", "checkpoints");

function runGit(args, { allowFail = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFail) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(err || `git ${args.join(" ")} failed with code ${result.status}`);
  }
  return {
    code: result.status,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
}

function ensureCheckpointDir() {
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function parseArgs(rawArgs = []) {
  const flags = new Set();
  const values = {};
  const positionals = [];

  rawArgs.forEach((arg) => {
    const text = String(arg || "").trim();
    if (!text) return;
    if (text.startsWith("--")) {
      const eqIndex = text.indexOf("=");
      if (eqIndex > 2) {
        const key = text.slice(2, eqIndex);
        const value = text.slice(eqIndex + 1);
        values[key] = value;
        flags.add(key);
        return;
      }
      flags.add(text.slice(2));
      return;
    }
    positionals.push(text);
  });

  return { flags, values, positionals };
}

function isGitRepo() {
  const result = runGit(["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  return result.code === 0;
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function slugify(text = "") {
  const raw = String(text || "checkpoint").toLowerCase().trim();
  const slug = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "checkpoint";
}

function getStatusRows() {
  const { stdout } = runGit(["status", "--porcelain"]);
  return stdout.split(/\r?\n/).filter(Boolean);
}

function parseStatusRows(rows = []) {
  const changedFiles = [];
  const buckets = {
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicts: 0,
  };

  rows.forEach((line) => {
    const row = String(line || "");
    const x = row[0] || " ";
    const y = row[1] || " ";
    const file = row.slice(3).trim();
    if (file) changedFiles.push(file);

    if (x === "U" || y === "U") buckets.conflicts += 1;
    if (x === "?" && y === "?") {
      buckets.untracked += 1;
      return;
    }
    if (x !== " ") buckets.staged += 1;
    if (y !== " ") buckets.unstaged += 1;
  });

  return { changedFiles, buckets };
}

function getChangedFiles() {
  const rows = getStatusRows();
  const parsed = parseStatusRows(rows);
  return parsed.changedFiles;
}

function getUntrackedFiles() {
  const { stdout } = runGit(["ls-files", "--others", "--exclude-standard"]);
  return stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

function getRepoSnapshot() {
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const head = runGit(["rev-parse", "--short", "HEAD"]).stdout.trim();
  const rows = getStatusRows();
  const parsed = parseStatusRows(rows);
  const untrackedFiles = getUntrackedFiles();
  return {
    branch,
    head,
    changedFiles: parsed.changedFiles,
    statusBuckets: parsed.buckets,
    untrackedFiles,
  };
}

function printScan({ asJson = false } = {}) {
  const snapshot = getRepoSnapshot();

  if (asJson) {
    console.log(JSON.stringify({
      type: "codex-scan",
      ...snapshot,
    }, null, 2));
    return;
  }

  console.log(`Codex Scan`);
  console.log(`- Branch: ${snapshot.branch}`);
  console.log(`- HEAD: ${snapshot.head}`);
  console.log(`- Changed files: ${snapshot.changedFiles.length}`);
  console.log(`- Status buckets: staged=${snapshot.statusBuckets.staged}, unstaged=${snapshot.statusBuckets.unstaged}, untracked=${snapshot.statusBuckets.untracked}, conflicts=${snapshot.statusBuckets.conflicts}`);
  if (snapshot.changedFiles.length) {
    snapshot.changedFiles.slice(0, 20).forEach((file) => console.log(`  - ${file}`));
    if (snapshot.changedFiles.length > 20) {
      console.log(`  - ... ${snapshot.changedFiles.length - 20} more`);
    }
  }

  if (snapshot.untrackedFiles.length) {
    console.log(`- Untracked files: ${snapshot.untrackedFiles.length}`);
    snapshot.untrackedFiles.slice(0, 20).forEach((file) => console.log(`  - ${file}`));
    if (snapshot.untrackedFiles.length > 20) {
      console.log(`  - ... ${snapshot.untrackedFiles.length - 20} more`);
    }
  }

  console.log(`\nRecommended flow:`);
  console.log(`1) npm run codex:checkpoint -- "before-change"`);
  console.log(`2) Make change + run targeted tests`);
  console.log(`3) npm run test:integrity && npm run test:memory`);
}

function getCheckpointEntries() {
  ensureCheckpointDir();
  return fs.readdirSync(CHECKPOINT_DIR)
    .filter((file) => file.endsWith(".patch"))
    .sort((a, b) => b.localeCompare(a))
    .map((file) => ({
      file,
      absolutePath: path.join(CHECKPOINT_DIR, file),
      relativePath: `artifacts/codex/checkpoints/${file}`,
    }));
}

function createCheckpoint(nameArg, { asJson = false } = {}) {
  const snapshot = getRepoSnapshot();
  const changedFiles = snapshot.changedFiles;
  if (!changedFiles.length) {
    const message = "No changed files detected. Checkpoint skipped.";
    if (asJson) {
      console.log(JSON.stringify({ type: "codex-checkpoint", created: false, message }, null, 2));
    } else {
      console.log(message);
    }
    return;
  }

  ensureCheckpointDir();

  const name = slugify(nameArg || "checkpoint");
  const stamp = nowStamp();
  const base = `${stamp}-${name}`;
  const patchPath = path.join(CHECKPOINT_DIR, `${base}.patch`);
  const metaPath = path.join(CHECKPOINT_DIR, `${base}.json`);

  const diff = runGit(["diff", "--binary", "HEAD"]).stdout;
  fs.writeFileSync(patchPath, diff, "utf8");

  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
  const head = runGit(["rev-parse", "HEAD"]).stdout.trim();
  const untrackedFiles = snapshot.untrackedFiles;

  const metadata = {
    createdAtUtc: new Date().toISOString(),
    branch,
    head,
    name: nameArg || "checkpoint",
    patchFile: path.relative(ROOT, patchPath).replace(/\\/g, "/"),
    changedFiles,
    statusBuckets: snapshot.statusBuckets,
    untrackedFiles,
    note: untrackedFiles.length
      ? "Untracked files are not included in git patch. Add or stash them separately if rollback is needed."
      : "",
  };

  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");

  if (asJson) {
    console.log(JSON.stringify({
      type: "codex-checkpoint",
      created: true,
      patch: path.relative(ROOT, patchPath).replace(/\\/g, "/"),
      meta: path.relative(ROOT, metaPath).replace(/\\/g, "/"),
      untrackedCount: untrackedFiles.length,
    }, null, 2));
    return;
  }

  console.log("Codex checkpoint created:");
  console.log(`- Patch: ${path.relative(ROOT, patchPath).replace(/\\/g, "/")}`);
  console.log(`- Meta: ${path.relative(ROOT, metaPath).replace(/\\/g, "/")}`);
  if (untrackedFiles.length) {
    console.log(`- Warning: ${untrackedFiles.length} untracked file(s) are not included in the patch.`);
  }
}

function listCheckpoints({ asJson = false, limit = 0 } = {}) {
  const entries = getCheckpointEntries();
  const capped = Number(limit) > 0 ? entries.slice(0, Number(limit)) : entries;

  if (!capped.length) {
    if (asJson) {
      console.log(JSON.stringify({ type: "codex-checkpoint-list", entries: [] }, null, 2));
    } else {
      console.log("No codex checkpoints found.");
    }
    return;
  }

  if (asJson) {
    console.log(JSON.stringify({
      type: "codex-checkpoint-list",
      entries: capped.map((entry) => entry.relativePath),
    }, null, 2));
    return;
  }

  console.log("Codex checkpoints:");
  capped.forEach((entry) => {
    console.log(`- ${entry.relativePath}`);
  });
}

function resolvePatchPath(patchInput, { latest = false } = {}) {
  if (latest) {
    const entries = getCheckpointEntries();
    if (!entries.length) {
      throw new Error("No checkpoints found for --latest rollback.");
    }
    return entries[0].absolutePath;
  }

  if (!patchInput) {
    throw new Error("Missing patch path. Usage: npm run codex:rollback -- <patchPath> [--apply] or --latest");
  }

  const patchPath = path.isAbsolute(patchInput)
    ? patchInput
    : path.resolve(ROOT, patchInput);

  if (!fs.existsSync(patchPath)) {
    throw new Error(`Patch not found: ${patchInput}`);
  }
  return patchPath;
}

function rollback({ patchInput, apply, latest = false, asJson = false }) {
  const patchPath = resolvePatchPath(patchInput, { latest });

  const relative = path.relative(ROOT, patchPath).replace(/\\/g, "/");
  const check = runGit(["apply", "--check", "-R", patchPath], { allowFail: true });
  if (check.code !== 0) {
    const message = (check.stderr || check.stdout || "Unknown git apply failure").trim();
    if (asJson) {
      console.log(JSON.stringify({
        type: "codex-rollback",
        ok: false,
        patch: relative,
        dryRunOnly: !apply,
        message,
      }, null, 2));
    } else {
      console.log("Rollback dry-run failed:");
      console.log(message);
      console.log("\nNext steps:");
      console.log("- Run npm run codex:scan to inspect current drift.");
      console.log("- Create a fresh restore point with npm run codex:checkpoint -- \"before-fix\".");
      console.log("- Use npm run codex:checkpoint:list to pick the correct patch for this workspace state.");
    }
    process.exit(2);
  }

  if (asJson) {
    if (!apply) {
      console.log(JSON.stringify({
        type: "codex-rollback",
        ok: true,
        applied: false,
        patch: relative,
      }, null, 2));
      return;
    }
    runGit(["apply", "-R", patchPath]);
    console.log(JSON.stringify({
      type: "codex-rollback",
      ok: true,
      applied: true,
      patch: relative,
    }, null, 2));
    return;
  }

  console.log(`Rollback dry-run passed for ${relative}.`);
  if (!apply) {
    console.log("Use --apply to execute rollback.");
    return;
  }

  runGit(["apply", "-R", patchPath]);
  console.log(`Rollback applied from ${relative}.`);
}

function printHelp() {
  console.log(`Codex Ops Commands:`);
  console.log(`- npm run codex:scan [-- --json]`);
  console.log(`- npm run codex:savepoint -- \"name\"`);
  console.log(`- npm run codex:checkpoint -- "name" [-- --json]`);
  console.log(`- npm run codex:checkpoint:list [-- --limit=10] [-- --json]`);
  console.log(`- npm run codex:rollback -- artifacts/codex/checkpoints/<file>.patch [-- --json]`);
  console.log(`- npm run codex:rollback -- --latest [-- --apply] [-- --json]`);
}

function main() {
  const [, , command = "help", ...rest] = process.argv;
  const parsed = parseArgs(rest);

  if (!isGitRepo()) {
    throw new Error("Current workspace is not a git repository.");
  }

  if (command === "scan") {
    printScan({ asJson: parsed.flags.has("json") });
    return;
  }

  if (command === "checkpoint") {
    const nameFromFlag = parsed.values.name ? String(parsed.values.name).trim() : "";
    const name = nameFromFlag || parsed.positionals.join(" ").trim();
    createCheckpoint(name, { asJson: parsed.flags.has("json") });
    return;
  }

  if (command === "list") {
    listCheckpoints({
      asJson: parsed.flags.has("json"),
      limit: parsed.values.limit || 0,
    });
    return;
  }

  if (command === "rollback") {
    const patchPath = parsed.positionals.find(Boolean);
    rollback({
      patchInput: patchPath,
      apply: parsed.flags.has("apply"),
      latest: parsed.flags.has("latest"),
      asJson: parsed.flags.has("json"),
    });
    return;
  }

  printHelp();
}

try {
  main();
} catch (err) {
  console.error(`codex-ops failed: ${String(err?.message || err)}`);
  process.exit(1);
}
