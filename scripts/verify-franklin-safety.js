const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const franklinScript = path.join(root, "scripts", "franklin.js");
const { appendMemoryLine, guardianPaths, memoryPaths } = require("./franklin.js");

const failures = [];

function fail(message) {
  failures.push(message);
}

function runFrank(args = []) {
  return spawnSync(process.execPath, [franklinScript, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    shell: false,
  });
}

function outputOf(result) {
  return `${String(result.stdout || "")}${String(result.stderr || "")}`;
}

function escapeRegex(raw) {
  return String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertSuccess(result, label) {
  if (result.error) {
    fail(`${label}: process error (${result.error.message || String(result.error)})`);
    return;
  }
  if (result.status !== 0) {
    fail(`${label}: expected success, got exit code ${result.status}`);
  }
}

function assertFailure(result, label) {
  if (result.error) {
    return;
  }
  if (result.status === 0) {
    fail(`${label}: expected failure, got success`);
  }
}

function writeTempPackageScripts(extraScripts) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  pkg.scripts = pkg.scripts || {};
  for (const [name, command] of Object.entries(extraScripts)) {
    pkg.scripts[name] = command;
  }
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function listSnapshotDirs() {
  if (!fs.existsSync(guardianPaths.snapshots)) return [];
  return fs.readdirSync(guardianPaths.snapshots, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function toFsRelativePath(relativePath) {
  return String(relativePath || "").split("/").join(path.sep);
}

function snapshotWorkspaceTarget(relativePath, backupRoot) {
  const normalizedRel = toFsRelativePath(relativePath);
  const sourceAbs = path.join(root, normalizedRel);
  const backupAbs = path.join(backupRoot, normalizedRel);
  const exists = fs.existsSync(sourceAbs);
  if (!exists) {
    return { relativePath, exists: false };
  }
  fs.mkdirSync(path.dirname(backupAbs), { recursive: true });
  fs.cpSync(sourceAbs, backupAbs, { recursive: true, force: true });
  return { relativePath, exists: true };
}

function restoreWorkspaceTarget(snapshot, backupRoot) {
  const normalizedRel = toFsRelativePath(snapshot?.relativePath);
  if (!normalizedRel) return;
  const targetAbs = path.join(root, normalizedRel);
  try {
    fs.rmSync(targetAbs, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
  } catch (error) {
    if (!error || (error.code !== "EPERM" && error.code !== "EBUSY")) {
      throw error;
    }
  }
  if (!snapshot?.exists) return;
  const backupAbs = path.join(backupRoot, normalizedRel);
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  fs.cpSync(backupAbs, targetAbs, { recursive: true, force: true });
}

function main() {
  const decisionsPath = memoryPaths.decisions;
  const errorsPath = memoryPaths.errors;
  const fixRequestPath = memoryPaths.fixRequest;

  if (!fs.existsSync(decisionsPath)) {
    fail("Missing docs/ai-memory/decisions.md.");
  }
  if (!fs.existsSync(errorsPath)) {
    fail("Missing docs/ai-memory/error-catalog.md.");
  }
  if (!fs.existsSync(fixRequestPath)) {
    fail("Missing docs/ai-memory/franklin-fix-request.md.");
  }
  if (!fs.existsSync(packageJsonPath)) {
    fail("Missing package.json.");
  }

  if (failures.length) return;

  const originalDecisions = fs.readFileSync(decisionsPath, "utf8");
  const originalErrors = fs.readFileSync(errorsPath, "utf8");
  const originalFixRequest = fs.readFileSync(fixRequestPath, "utf8");
  const originalPackageJson = fs.readFileSync(packageJsonPath, "utf8");
  const originalSnapshotIndex = fs.existsSync(guardianPaths.index)
    ? fs.readFileSync(guardianPaths.index, "utf8")
    : null;
  const originalSnapshotIds = new Set(listSnapshotDirs());
  const workspaceBackupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "franklin-safety-"));
  const workspaceSnapshots = [
    snapshotWorkspaceTarget("assets", workspaceBackupRoot),
  ];

  try {
    const helpResult = runFrank(["help"]);
    assertSuccess(helpResult, "help command");
    if (
      !/doctor/i.test(outputOf(helpResult))
      || !/rescue <script>/i.test(outputOf(helpResult))
      || !/guardian/i.test(outputOf(helpResult))
      || !/snapshot create/i.test(outputOf(helpResult))
      || !/snapshot verify/i.test(outputOf(helpResult))
    ) {
      fail("help command: expected doctor/rescue/guardian/snapshot verify commands in help output.");
    }

    const statusResult = runFrank(["status"]);
    assertSuccess(statusResult, "status command");
    if (!/Fix request doc/i.test(outputOf(statusResult))) {
      fail("status command: expected fix request doc status line.");
    }

    const doctorResult = runFrank(["doctor"]);
    assertSuccess(doctorResult, "doctor command");
    if (!/FRANKLIN DOCTOR/i.test(outputOf(doctorResult))) {
      fail("doctor command: missing doctor header.");
    }
    if (!/- Result: READY/i.test(outputOf(doctorResult))) {
      fail("doctor command: expected ready result line.");
    }

    const snapshotCreateResult = runFrank(["snapshot", "create", "safety-run"]);
    assertSuccess(snapshotCreateResult, "snapshot create command");
    const snapshotCreateOutput = outputOf(snapshotCreateResult);
    const snapshotIdMatch = snapshotCreateOutput.match(/FRANKLIN SNAPSHOT CREATED:\s*([^\r\n]+)/i);
    if (!snapshotIdMatch?.[1]) {
      fail("snapshot create command: missing created snapshot id.");
    }
    const snapshotId = String(snapshotIdMatch?.[1] || "").trim();
    if (snapshotId) {
      const snapshotListResult = runFrank(["snapshot", "list"]);
      assertSuccess(snapshotListResult, "snapshot list command");
      if (!outputOf(snapshotListResult).includes(snapshotId)) {
        fail("snapshot list command: expected created snapshot id in list output.");
      }

      const snapshotVerifyResult = runFrank(["snapshot", "verify", snapshotId]);
      assertSuccess(snapshotVerifyResult, "snapshot verify command");
      if (!/FRANKLIN SNAPSHOT VERIFY: OK/i.test(outputOf(snapshotVerifyResult))) {
        fail("snapshot verify command: expected verification success output.");
      }

      const sentinel = `guardian-snapshot-sentinel-${Date.now()}`;
      fs.appendFileSync(decisionsPath, `\n- ${sentinel}\n`, "utf8");
      const snapshotRestoreResult = runFrank(["snapshot", "restore", snapshotId]);
      assertSuccess(snapshotRestoreResult, "snapshot restore command");
      if (!/FRANKLIN SNAPSHOT RESTORED/i.test(outputOf(snapshotRestoreResult))) {
        fail("snapshot restore command: expected restore confirmation output.");
      }
      if (fs.readFileSync(decisionsPath, "utf8").includes(sentinel)) {
        fail("snapshot restore command: expected sentinel change to be reverted.");
      }
    }

    const unknownResult = runFrank(["unknown-cmd"]);
    assertFailure(unknownResult, "unknown command");
    if (!/Unknown Franklin command/i.test(outputOf(unknownResult))) {
      fail("unknown command: expected 'Unknown Franklin command' message.");
    }

    const token = `franklin-safety-${Date.now()}`;
    const noteResult = runFrank(["note", token]);
    assertSuccess(noteResult, "note command");

    const errorResult = runFrank(["error", token]);
    assertSuccess(errorResult, "error command");

    const afterValidDecisions = fs.readFileSync(decisionsPath, "utf8");
    const afterValidErrors = fs.readFileSync(errorsPath, "utf8");

    if (!afterValidDecisions.includes(token)) {
      fail("note command: expected token to be appended to decisions log.");
    }
    if (!afterValidErrors.includes(token)) {
      fail("error command: expected token to be appended to error catalog.");
    }

    const multilineResult = runFrank(["note", "line1\nline2"]);
    assertFailure(multilineResult, "multiline note rejection");
    if (!/Multiline messages are not allowed/i.test(outputOf(multilineResult))) {
      fail("multiline note rejection: expected multiline rejection message.");
    }
    const afterMultilineDecisions = fs.readFileSync(decisionsPath, "utf8");
    if (afterMultilineDecisions !== afterValidDecisions) {
      fail("multiline note rejection: decisions log changed after invalid input.");
    }

    const controlCharResult = runFrank(["error", `bad\u0007token`]);
    assertFailure(controlCharResult, "control-char error rejection");
    if (!/Control characters are not allowed/i.test(outputOf(controlCharResult))) {
      fail("control-char error rejection: expected control-char rejection message.");
    }
    const afterControlErrors = fs.readFileSync(errorsPath, "utf8");
    if (afterControlErrors !== afterValidErrors) {
      fail("control-char error rejection: error catalog changed after invalid input.");
    }

    const passScript = "franklin:safety:pass";
    const failScript = "franklin:safety:fail";
    writeTempPackageScripts({
      [passScript]: "node -e \"process.stdout.write('pass script ok\\n')\"",
      [failScript]: "node -e \"process.stderr.write('forced rescue failure\\n'); process.exit(7)\"",
    });

    const rescuePassResult = runFrank(["rescue", passScript]);
    assertSuccess(rescuePassResult, "rescue pass command");
    if (!/No fix request generated/i.test(outputOf(rescuePassResult))) {
      fail("rescue pass command: expected no-report message.");
    }
    const afterRescuePassFix = fs.readFileSync(fixRequestPath, "utf8");
    if (afterRescuePassFix !== originalFixRequest) {
      fail("rescue pass command: fix request doc changed unexpectedly.");
    }

    const rescueFailResult = runFrank(["rescue", failScript]);
    assertFailure(rescueFailResult, "rescue fail command");
    if (!/FRANKLIN RESCUE REPORT SAVED/i.test(outputOf(rescueFailResult))) {
      fail("rescue fail command: expected rescue report saved message.");
    }
    if (!/Rescue captured failing script/i.test(outputOf(rescueFailResult))) {
      fail("rescue fail command: expected rescue failure summary.");
    }

    const rescueFixRequest = fs.readFileSync(fixRequestPath, "utf8");
    if (!rescueFixRequest.includes(`npm run ${failScript}`)) {
      fail("rescue fail command: fix request doc missing failing script name.");
    }
    if (!rescueFixRequest.includes("forced rescue failure")) {
      fail("rescue fail command: fix request doc missing captured stderr output.");
    }

    const afterRescueErrors = fs.readFileSync(errorsPath, "utf8");
    if (!afterRescueErrors.includes(`npm run ${failScript}`)) {
      fail("rescue fail command: error catalog missing rescue entry.");
    }

    const beforeUnknownRescueFix = fs.readFileSync(fixRequestPath, "utf8");
    const beforeUnknownRescueErrors = fs.readFileSync(errorsPath, "utf8");
    const unknownRescueResult = runFrank(["rescue", "not-a-real-script"]);
    assertFailure(unknownRescueResult, "unknown rescue script");
    if (!/Unknown npm script for rescue/i.test(outputOf(unknownRescueResult))) {
      fail("unknown rescue script: expected unknown script rejection message.");
    }
    if (fs.readFileSync(fixRequestPath, "utf8") !== beforeUnknownRescueFix) {
      fail("unknown rescue script: fix request doc changed unexpectedly.");
    }
    if (fs.readFileSync(errorsPath, "utf8") !== beforeUnknownRescueErrors) {
      fail("unknown rescue script: error catalog changed unexpectedly.");
    }

    const guardianFailScript = "franklin:safety:guardian-fail";
    writeTempPackageScripts({
      [guardianFailScript]: "node -e \"process.stderr.write('forced guardian gate failure\\n'); process.exit(19)\"",
      "test:all:contract": `npm run ${guardianFailScript}`,
    });

    const guardianFailureResult = runFrank(["guardian"]);
    assertFailure(guardianFailureResult, "guardian command forced-failure rollback");
    const guardianOutput = outputOf(guardianFailureResult);
    if (!/GUARDIAN PRE-FLIGHT SNAPSHOT:/i.test(guardianOutput)) {
      fail("guardian command forced-failure rollback: missing pre-flight snapshot output.");
    }
    if (!/GUARDIAN ROLLBACK APPLIED:/i.test(guardianOutput)) {
      fail("guardian command forced-failure rollback: missing rollback output.");
    }
    if (!/GUARDIAN FIX REQUEST SAVED:/i.test(guardianOutput)) {
      fail("guardian command forced-failure rollback: missing fix-request output.");
    }
    const preflightMatch = guardianOutput.match(/GUARDIAN PRE-FLIGHT SNAPSHOT:\s*([^\r\n]+)/i);
    const rollbackMatch = guardianOutput.match(/GUARDIAN ROLLBACK APPLIED:\s*([^\r\n]+)/i);
    if (preflightMatch?.[1] && rollbackMatch?.[1]) {
      const preflightId = String(preflightMatch[1]).trim();
      const rollbackId = String(rollbackMatch[1]).trim();
      if (preflightId !== rollbackId) {
        fail("guardian command forced-failure rollback: rollback snapshot id did not match pre-flight snapshot id.");
      }
      const strictRollbackPattern = new RegExp(`GUARDIAN ROLLBACK APPLIED:\\s*${escapeRegex(preflightId)}`, "i");
      if (!strictRollbackPattern.test(guardianOutput)) {
        fail("guardian command forced-failure rollback: expected rollback output to include exact pre-flight snapshot id.");
      }
    }

    const guardianFixRequest = fs.readFileSync(fixRequestPath, "utf8");
    if (!guardianFixRequest.includes("npm run test:all:contract")) {
      fail("guardian command forced-failure rollback: fix request missing failing guardian gate script.");
    }
    if (!guardianFixRequest.includes("forced guardian gate failure")) {
      fail("guardian command forced-failure rollback: fix request missing captured guardian failure output.");
    }

    const afterGuardianErrors = fs.readFileSync(errorsPath, "utf8");
    if (!afterGuardianErrors.includes("Guardian rollback restored snapshot")) {
      fail("guardian command forced-failure rollback: error catalog missing rollback entry.");
    }
    if (!afterGuardianErrors.includes("Guardian failure generated docs/ai-memory/franklin-fix-request.md")) {
      fail("guardian command forced-failure rollback: error catalog missing guardian fix-request entry.");
    }

    let traversalBlocked = false;
    try {
      appendMemoryLine(path.join(root, "README.md"), "should fail");
    } catch (error) {
      traversalBlocked = /Refusing to write outside docs\/ai-memory/i.test(String(error?.message || error));
    }
    if (!traversalBlocked) {
      fail("path boundary protection: expected write outside docs/ai-memory to be blocked.");
    }
  } finally {
    for (const snapshot of workspaceSnapshots) {
      restoreWorkspaceTarget(snapshot, workspaceBackupRoot);
    }
    try {
      fs.rmSync(workspaceBackupRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 });
    } catch (error) {
      if (!error || (error.code !== "EPERM" && error.code !== "EBUSY")) {
        throw error;
      }
    }
    fs.writeFileSync(decisionsPath, originalDecisions, "utf8");
    fs.writeFileSync(errorsPath, originalErrors, "utf8");
    fs.writeFileSync(fixRequestPath, originalFixRequest, "utf8");
    fs.writeFileSync(packageJsonPath, originalPackageJson, "utf8");
    const currentSnapshotIds = listSnapshotDirs();
    for (const id of currentSnapshotIds) {
      if (!originalSnapshotIds.has(id)) {
        try {
          fs.rmSync(path.join(guardianPaths.snapshots, id), {
            recursive: true,
            force: true,
            maxRetries: 8,
            retryDelay: 120,
          });
        } catch (error) {
          if (!error || (error.code !== "EPERM" && error.code !== "EBUSY")) {
            throw error;
          }
        }
      }
    }
    if (originalSnapshotIndex === null) {
      try {
        fs.rmSync(guardianPaths.index, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 });
      } catch (error) {
        if (!error || (error.code !== "EPERM" && error.code !== "EBUSY")) {
          throw error;
        }
      }
    } else {
      fs.writeFileSync(guardianPaths.index, originalSnapshotIndex, "utf8");
    }
  }
}

try {
  main();
} catch (error) {
  fail(error?.message || String(error));
}

if (failures.length) {
  console.error(`Franklin safety verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("Franklin safety verification passed.");
console.log("- Verified allowlist failure handling");
console.log("- Verified doctor/status command coverage");
console.log("- Verified snapshot create/list/restore/verify safety flow");
console.log("- Verified note/error input sanitization");
console.log("- Verified rescue command safety and fix-request generation");
console.log("- Verified guardian rollback + fix-request generation on gate failure");
console.log("- Verified docs/ai-memory path boundary protection");
