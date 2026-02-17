const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const reportsRoot = path.join(root, "artifacts", "frankleen", "reports");
const snapshotsRoot = path.join(root, "artifacts", "frankleen", "snapshots");
const snapshotIndexPath = path.join(snapshotsRoot, "index.json");

const keepFailedRuns = 1;
const keepSnapshots = 2;
const minPassLogsForSuccess = 12;

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
  };
}

function listRunDirs() {
  if (!fs.existsSync(reportsRoot)) return [];
  return fs.readdirSync(reportsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("run-"))
    .map((entry) => {
      const absPath = path.join(reportsRoot, entry.name);
      const stats = fs.statSync(absPath);
      return {
        id: entry.name,
        absPath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function classifyRun(run) {
  let files = [];
  try {
    files = fs.readdirSync(run.absPath);
  } catch {
    return { ...run, status: "failed", passLogs: 0, failLogs: 0 };
  }

  const passLogs = files.filter((name) => /-pass\.log$/i.test(name)).length;
  const failLogs = files.filter((name) => /-fail\.log$/i.test(name)).length;

  const status = failLogs > 0 || passLogs < minPassLogsForSuccess ? "failed" : "passed";
  return { ...run, status, passLogs, failLogs };
}

function loadSnapshotIndex() {
  if (!fs.existsSync(snapshotIndexPath)) {
    return { version: 1, snapshots: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotIndexPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) {
      return { version: 1, snapshots: [] };
    }
    return parsed;
  } catch {
    return { version: 1, snapshots: [] };
  }
}

function removeDir(absPath) {
  fs.rmSync(absPath, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.apply ? "APPLY" : "DRY-RUN";

  const runs = listRunDirs().map(classifyRun);
  const passedRuns = runs.filter((run) => run.status === "passed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const failedRunsToDelete = failedRuns.slice(keepFailedRuns);

  const snapshotIndex = loadSnapshotIndex();
  const snapshots = Array.isArray(snapshotIndex.snapshots) ? snapshotIndex.snapshots : [];
  const snapshotsToDelete = snapshots.slice(keepSnapshots);
  const snapshotsToKeep = snapshots.slice(0, keepSnapshots);

  console.log(`FRANKLEEN CLEANUP (${mode})`);
  console.log(`- Reports total: ${runs.length}`);
  console.log(`- Passed runs: ${passedRuns.length}`);
  console.log(`- Failed/partial runs: ${failedRuns.length}`);
  console.log(`- Failed runs to delete: ${failedRunsToDelete.length}`);
  console.log(`- Snapshots total: ${snapshots.length}`);
  console.log(`- Snapshots to keep: ${snapshotsToKeep.length}`);
  console.log(`- Snapshots to delete: ${snapshotsToDelete.length}`);

  if (!passedRuns.length) {
    console.log("- Note: no successful runs were detected. Cleanup still targets only old failed/partial runs and old snapshots.");
  }

  if (!failedRunsToDelete.length && !snapshotsToDelete.length) {
    console.log("Nothing to clean.");
    return;
  }

  if (failedRunsToDelete.length) {
    console.log("\nFailed/partial runs queued:");
    failedRunsToDelete.forEach((run) => {
      console.log(`- ${run.id} (pass logs: ${run.passLogs}, fail logs: ${run.failLogs})`);
    });
  }

  if (snapshotsToDelete.length) {
    console.log("\nSnapshots queued:");
    snapshotsToDelete.forEach((snapshot) => {
      console.log(`- ${snapshot.id} (${snapshot.reason || "manual"})`);
    });
  }

  if (!options.apply) {
    console.log("\nDry-run complete. Re-run with --apply to delete these artifacts.");
    return;
  }

  let removedRunCount = 0;
  for (const run of failedRunsToDelete) {
    try {
      removeDir(run.absPath);
      removedRunCount += 1;
    } catch (error) {
      console.warn(`Could not remove ${run.id}: ${error.message || String(error)}`);
    }
  }

  let removedSnapshotCount = 0;
  for (const snapshot of snapshotsToDelete) {
    if (!snapshot?.id) continue;
    const snapshotDir = path.join(snapshotsRoot, snapshot.id);
    try {
      removeDir(snapshotDir);
      removedSnapshotCount += 1;
    } catch (error) {
      console.warn(`Could not remove snapshot ${snapshot.id}: ${error.message || String(error)}`);
    }
  }

  const nextIndex = {
    ...snapshotIndex,
    snapshots: snapshotsToKeep,
  };
  fs.mkdirSync(path.dirname(snapshotIndexPath), { recursive: true });
  fs.writeFileSync(snapshotIndexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf8");

  console.log("\nCleanup complete.");
  console.log(`- Removed failed/partial runs: ${removedRunCount}`);
  console.log(`- Removed snapshots: ${removedSnapshotCount}`);
  console.log(`- Remaining snapshots: ${nextIndex.snapshots.length}`);
}

main();
