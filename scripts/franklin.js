const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = process.cwd();
const packageJsonPath = path.join(root, "package.json");
const memoryRoot = path.join(root, "docs", "ai-memory");
const frankleenReportsRoot = path.join(root, "artifacts", "frankleen", "reports");
const doctorRequiredScripts = [
  "test:all",
  "test:all:contract",
  "test:sync:dist-site",
  "test:memory",
  "test:frank:safety",
  "test:integrity",
  "test:desktop:icon",
  "test:desktop:pack",
  "test:desktop:dist",
  "deploy:siteground",
  "verify:siteground",
  "frank:guardian",
  "frank:snapshot:create",
  "frank:snapshot:list",
  "frank:snapshot:restore",
  "frank:snapshot:verify",
];
const fullGateSteps = [
  { script: "test:all:contract", label: "Contract guard" },
  { script: "sync:dist-site", label: "Sync dist_site assets" },
  { script: "test:sync:dist-site", label: "Verify dist_site sync" },
  { script: "test:memory", label: "Validate AI memory docs" },
  { script: "test:frank:safety", label: "Validate Franklin safety" },
  { script: "test:integrity", label: "Validate test integrity rules" },
  { script: "test", label: "Run Playwright E2E suite" },
  { script: "test:desktop:icon", label: "Build desktop icons" },
  { script: "test:desktop:pack", label: "Pack desktop app" },
  { script: "test:desktop:dist", label: "Build Windows installer" },
  { script: "deploy:siteground", label: "Prepare SiteGround package" },
  { script: "verify:siteground", label: "Verify SiteGround package" },
];
const memoryPaths = {
  decisions: path.join(memoryRoot, "decisions.md"),
  errors: path.join(memoryRoot, "error-catalog.md"),
  fixRequest: path.join(memoryRoot, "franklin-fix-request.md"),
};
const guardianPaths = {
  root: path.join(root, "artifacts", "frankleen"),
  snapshots: path.join(root, "artifacts", "frankleen", "snapshots"),
  index: path.join(root, "artifacts", "frankleen", "snapshots", "index.json"),
};
const guardianSnapshotTargets = [
  "assets",
  "config",
  "desktop",
  "scripts",
  "tests",
  "docs/ai-memory",
  "index.html",
  "package.json",
  "package-lock.json",
  "manifest.webmanifest",
  ".htaccess",
];
const guardianSnapshotLimit = 25;

function runNpmScript(name, { captureOutput = false, printOutput = true, silentNpm = false } = {}) {
  const stdioMode = captureOutput ? "pipe" : "inherit";
  const encoding = captureOutput ? "utf8" : undefined;
  const maxBuffer = captureOutput ? 32 * 1024 * 1024 : undefined;
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npm run ${silentNpm ? "--silent " : ""}${name}`], {
        stdio: stdioMode,
        encoding,
        maxBuffer,
        cwd: root,
        shell: false,
      })
    : spawnSync("npm", ["run", ...(silentNpm ? ["--silent"] : []), name], {
        stdio: stdioMode,
        encoding,
        maxBuffer,
        cwd: root,
        shell: false,
      });

  if (captureOutput && printOutput) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw new Error(result.error.message || `Failed to run npm script: ${name}`);
  }
  if (result.signal) {
    const failure = new Error(`npm run ${name} interrupted (${result.signal})`);
    failure.code = 130;
    failure.scriptName = name;
    failure.stdout = result.stdout || "";
    failure.stderr = result.stderr || "";
    failure.signal = result.signal;
    throw failure;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    const failure = new Error(`npm run ${name} failed`);
    failure.code = result.status;
    failure.scriptName = name;
    failure.stdout = result.stdout || "";
    failure.stderr = result.stderr || "";
    throw failure;
  }

  return result;
}

function renderLiveProgress(prefix, current, total) {
  if (!supportsAnsiColor()) return;
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.max(0, Math.min(safeTotal, Number(current) || 0));
  const percent = Math.round((safeCurrent / safeTotal) * 100);
  const bar = buildProgressBar(safeCurrent, safeTotal, 20);
  const text = `${prefix} ${bar} ${String(percent).padStart(3, " ")}% (${safeCurrent}/${safeTotal})`;
  process.stdout.write(`\r${styleText(text, ansiStyles.dim)}`);
}

function runNpmScriptWithLiveProgress(name, { silentNpm = false, progressMode = "none" } = {}) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run ${silentNpm ? "--silent " : ""}${name}`]
      : ["run", ...(silentNpm ? ["--silent"] : []), name];

    const child = spawn(command, args, {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let lastProgressCurrent = 0;
    let lastProgressTotal = 0;
    let sawProgress = false;

    const progressRegex = /\[(\d+)\/(\d+)\]/g;

    function ingestChunk(source, chunk) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      if (source === "stdout") {
        stdout += text;
      } else {
        stderr += text;
      }

      if (progressMode !== "playwright") return;
      const matches = Array.from(text.matchAll(progressRegex));
      if (!matches.length) return;

      const last = matches[matches.length - 1];
      const current = Number(last[1]);
      const total = Number(last[2]);
      if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return;

      sawProgress = true;
      lastProgressCurrent = current;
      lastProgressTotal = total;
      renderLiveProgress("    Playwright", lastProgressCurrent, lastProgressTotal);
    }

    child.stdout.on("data", (chunk) => ingestChunk("stdout", chunk));
    child.stderr.on("data", (chunk) => ingestChunk("stderr", chunk));

    child.on("error", (error) => {
      const failure = new Error(error?.message || `Failed to run npm script: ${name}`);
      failure.code = 1;
      failure.scriptName = name;
      failure.stdout = stdout;
      failure.stderr = stderr;
      reject(failure);
    });

    child.on("close", (status, signal) => {
      if (sawProgress && supportsAnsiColor()) {
        if (lastProgressTotal > 0) {
          renderLiveProgress("    Playwright", lastProgressTotal, lastProgressTotal);
        }
        process.stdout.write("\n");
      }

      if (signal) {
        const failure = new Error(`npm run ${name} interrupted (${signal})`);
        failure.code = 130;
        failure.scriptName = name;
        failure.stdout = stdout;
        failure.stderr = stderr;
        failure.signal = signal;
        reject(failure);
        return;
      }

      if (typeof status === "number" && status !== 0) {
        const failure = new Error(`npm run ${name} failed`);
        failure.code = status;
        failure.scriptName = name;
        failure.stdout = stdout;
        failure.stderr = stderr;
        reject(failure);
        return;
      }

      resolve({
        stdout,
        stderr,
        status: typeof status === "number" ? status : 0,
      });
    });
  });
}

function assertPathInsideMemoryRoot(filePath) {
  const normalizedRoot = path.resolve(memoryRoot);
  const normalizedTarget = path.resolve(filePath);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Refusing to write outside docs/ai-memory: ${normalizedTarget}`);
  }
}

function sanitizeMemoryMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message) {
    throw new Error("Message is required.");
  }
  if (message.length > 500) {
    throw new Error("Message too long. Max 500 characters.");
  }
  if (/[\r\n]/.test(message)) {
    throw new Error("Multiline messages are not allowed.");
  }
  if (/[\u0000-\u001F\u007F]/.test(message)) {
    throw new Error("Control characters are not allowed.");
  }
  return message;
}

function normalizeRescueOutput(rawValue, maxChars = 4000) {
  const cleaned = String(rawValue || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "")
    .replace(/[^\x09\x0A\x20-\x7E]/g, "?")
    .trim();

  if (!cleaned) return "(no output)";
  if (cleaned.length <= maxChars) return cleaned;
  const overflow = cleaned.length - maxChars;
  return `${cleaned.slice(0, maxChars)}\n...[truncated ${overflow} chars]`;
}

function readPackageScripts() {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error("Missing package.json.");
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid package.json JSON: ${error.message || String(error)}`);
  }

  if (!pkg || typeof pkg !== "object" || !pkg.scripts || typeof pkg.scripts !== "object") {
    throw new Error("Missing scripts object in package.json.");
  }

  return pkg.scripts;
}

function isLockError(error) {
  return Boolean(error) && (error.code === "EPERM" || error.code === "EBUSY");
}

function isDiskCapacityError(error) {
  if (!error) return false;

  const code = String(error.code || "").toUpperCase();
  const errno = Number(error.errno);
  if (code === "ENOSPC") return true;
  if (code === "EINPROGRESS" && errno === 112) return true;
  if (errno === 28 || errno === 112) return true;

  const message = String(error.message || "").toLowerCase();
  return message.includes("no space left on device")
    || message.includes("not enough space on the disk");
}

function isRecoverableFsError(error, { allowDiskCapacity = false } = {}) {
  if (isLockError(error)) return true;
  if (allowDiskCapacity && isDiskCapacityError(error)) return true;
  return false;
}

function ensureGuardianPaths() {
  fs.mkdirSync(guardianPaths.snapshots, { recursive: true });
}

function sanitizeSnapshotLabel(rawLabel, fallback = "snapshot") {
  const normalized = String(rawLabel || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = normalized || fallback;
  return safe.slice(0, 48);
}

function loadSnapshotIndex() {
  ensureGuardianPaths();
  if (!fs.existsSync(guardianPaths.index)) {
    return { version: 1, snapshots: [] };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(guardianPaths.index, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.snapshots)) {
      return { version: 1, snapshots: [] };
    }
    return {
      version: 1,
      snapshots: parsed.snapshots.filter((entry) => entry && typeof entry.id === "string"),
    };
  } catch {
    return { version: 1, snapshots: [] };
  }
}

function saveSnapshotIndex(index) {
  ensureGuardianPaths();
  fs.writeFileSync(guardianPaths.index, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

function pruneOldSnapshots(index) {
  if (!Array.isArray(index.snapshots)) return;
  while (index.snapshots.length > guardianSnapshotLimit) {
    const removed = index.snapshots.pop();
    if (!removed?.id) continue;
    const removedDir = path.join(guardianPaths.snapshots, removed.id);
    try {
      fs.rmSync(removedDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 });
    } catch {
      // keep rolling even if one old snapshot cannot be deleted
    }
  }
}

function copyPathToSnapshot(relativePath, payloadRoot, summary) {
  const normalizedRel = String(relativePath || "").split("/").join(path.sep);
  const sourceAbs = path.join(root, normalizedRel);
  if (!fs.existsSync(sourceAbs)) {
    summary.missing.push(relativePath);
    return;
  }

  const targetAbs = path.join(payloadRoot, normalizedRel);
  fs.mkdirSync(path.dirname(targetAbs), { recursive: true });
  try {
    fs.cpSync(sourceAbs, targetAbs, { recursive: true, force: true });
    summary.included.push(relativePath);
  } catch (error) {
    if (!isRecoverableFsError(error, { allowDiskCapacity: true })) {
      throw error;
    }
    // Avoid keeping a partial payload copy for this target.
    try {
      fs.rmSync(targetAbs, { recursive: true, force: true, maxRetries: 6, retryDelay: 80 });
    } catch {
      // Best-effort cleanup only.
    }
    summary.skipped.push(relativePath);
  }
}

function createGuardianSnapshot(labelRaw, reason = "manual") {
  ensureGuardianPaths();
  const label = sanitizeSnapshotLabel(labelRaw, "snapshot");
  const id = `${Date.now()}-${label}`;
  const snapshotDir = path.join(guardianPaths.snapshots, id);
  const payloadRoot = path.join(snapshotDir, "payload");
  fs.mkdirSync(payloadRoot, { recursive: true });

  const summary = {
    id,
    label,
    reason: String(reason || "manual"),
    createdAt: new Date().toISOString(),
    included: [],
    skipped: [],
    missing: [],
  };

  for (const target of guardianSnapshotTargets) {
    copyPathToSnapshot(target, payloadRoot, summary);
  }

  const metadataPath = path.join(snapshotDir, "metadata.json");
  fs.writeFileSync(metadataPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const index = loadSnapshotIndex();
  index.snapshots.unshift({
    id: summary.id,
    label: summary.label,
    reason: summary.reason,
    createdAt: summary.createdAt,
    includedCount: summary.included.length,
    skippedCount: summary.skipped.length,
    missingCount: summary.missing.length,
  });
  pruneOldSnapshots(index);
  saveSnapshotIndex(index);

  return summary;
}

function listGuardianSnapshots(limit = 10) {
  const index = loadSnapshotIndex();
  return index.snapshots.slice(0, Math.max(0, Number(limit) || 0));
}

function verifyGuardianSnapshotEntry(entry) {
  const issues = [];
  if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id.trim()) {
    return {
      id: "",
      ok: false,
      issues: ["Invalid snapshot index entry."],
      restoredTargets: 0,
    };
  }

  const snapshotDir = path.join(guardianPaths.snapshots, entry.id);
  const metadataPath = path.join(snapshotDir, "metadata.json");
  const payloadRoot = path.join(snapshotDir, "payload");

  if (!fs.existsSync(snapshotDir) || !fs.statSync(snapshotDir).isDirectory()) {
    issues.push("Snapshot directory is missing.");
  }
  if (!fs.existsSync(metadataPath) || !fs.statSync(metadataPath).isFile()) {
    issues.push("metadata.json is missing.");
  }
  if (!fs.existsSync(payloadRoot) || !fs.statSync(payloadRoot).isDirectory()) {
    issues.push("payload directory is missing.");
  }

  let metadata = null;
  if (!issues.includes("metadata.json is missing.")) {
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    } catch (error) {
      issues.push(`metadata.json is invalid JSON (${error.message || String(error)}).`);
    }
  }

  if (metadata && typeof metadata === "object") {
    if (metadata.id && metadata.id !== entry.id) {
      issues.push(`metadata id mismatch (expected ${entry.id}, got ${metadata.id}).`);
    }
    const included = Array.isArray(metadata.included) ? metadata.included : [];
    if (!Array.isArray(metadata.included)) {
      issues.push("metadata included list is missing.");
    }
    for (const target of included) {
      const normalizedRel = String(target || "").split("/").join(path.sep);
      if (!normalizedRel) continue;
      const payloadTarget = path.join(payloadRoot, normalizedRel);
      if (!fs.existsSync(payloadTarget)) {
        issues.push(`payload target missing: ${target}`);
      }
    }
    if (metadata.createdAt) {
      const createdMs = Date.parse(metadata.createdAt);
      if (!Number.isFinite(createdMs)) {
        issues.push("metadata createdAt is invalid.");
      }
    }
  }

  return {
    id: entry.id,
    ok: issues.length === 0,
    issues,
    restoredTargets: Array.isArray(metadata?.included) ? metadata.included.length : 0,
  };
}

function verifyGuardianSnapshots(selectorRaw = "latest") {
  const selector = String(selectorRaw || "latest").trim();
  const normalized = selector.toLowerCase();
  const index = loadSnapshotIndex();
  const entries = normalized === "all"
    ? index.snapshots
    : [resolveSnapshotEntry(selector)];
  const results = entries.map((entry) => verifyGuardianSnapshotEntry(entry));
  const issues = [];

  for (const result of results) {
    for (const issue of result.issues) {
      issues.push(`${result.id || "(unknown)"}: ${issue}`);
    }
  }

  return {
    selector: normalized,
    totalSnapshots: entries.length,
    ok: issues.length === 0,
    issues,
    results,
  };
}

function resolveSnapshotEntry(selectorRaw) {
  const selector = String(selectorRaw || "latest").trim();
  const index = loadSnapshotIndex();
  if (!index.snapshots.length) {
    throw new Error("No guardian snapshots available.");
  }

  if (!selector || selector === "latest") {
    return index.snapshots[0];
  }

  const exact = index.snapshots.find((entry) => entry.id === selector);
  if (exact) return exact;

  const byPrefix = index.snapshots.find((entry) => entry.id.startsWith(selector));
  if (byPrefix) return byPrefix;

  throw new Error(`Unknown snapshot id: ${selector}`);
}

function restoreGuardianSnapshot(selectorRaw, { strict = false } = {}) {
  const entry = resolveSnapshotEntry(selectorRaw);
  const snapshotDir = path.join(guardianPaths.snapshots, entry.id);
  const metadataPath = path.join(snapshotDir, "metadata.json");
  const payloadRoot = path.join(snapshotDir, "payload");
  if (!fs.existsSync(metadataPath) || !fs.existsSync(payloadRoot)) {
    throw new Error(`Snapshot payload missing for: ${entry.id}`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const normalizeSnapshotTarget = (targetRaw) => String(targetRaw || "").trim().replace(/\\/g, "/");
  const includedTargets = Array.isArray(metadata?.included)
    ? new Set(metadata.included.map((target) => normalizeSnapshotTarget(target)).filter(Boolean))
    : null;
  const skippedTargets = Array.isArray(metadata?.skipped)
    ? new Set(metadata.skipped.map((target) => normalizeSnapshotTarget(target)).filter(Boolean))
    : new Set();
  const restored = [];
  const skipped = [];

  for (const target of guardianSnapshotTargets) {
    const normalizedTarget = normalizeSnapshotTarget(target);
    if (includedTargets && !includedTargets.has(normalizedTarget)) continue;
    if (skippedTargets.has(normalizedTarget)) {
      skipped.push(target);
      continue;
    }

    const normalizedRel = String(target).split("/").join(path.sep);
    const sourceAbs = path.join(payloadRoot, normalizedRel);
    if (!fs.existsSync(sourceAbs)) {
      skipped.push(target);
      continue;
    }
    const targetAbs = path.join(root, normalizedRel);

    try {
      fs.rmSync(targetAbs, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
      fs.cpSync(sourceAbs, targetAbs, { recursive: true, force: true });
      restored.push(target);
    } catch (error) {
      if (strict || !isRecoverableFsError(error, { allowDiskCapacity: true })) {
        throw error;
      }
      skipped.push(target);
    }
  }

  return {
    id: entry.id,
    label: metadata?.label || entry.label || "snapshot",
    reason: metadata?.reason || entry.reason || "manual",
    createdAt: metadata?.createdAt || entry.createdAt || "",
    restored,
    skipped,
  };
}

function printSnapshotSummary(prefix, summary) {
  console.log(`${prefix}: ${summary.id}`);
  if (summary.label) console.log(`- Label: ${summary.label}`);
  if (summary.reason) console.log(`- Reason: ${summary.reason}`);
  if (summary.createdAt) console.log(`- Created: ${summary.createdAt}`);
  if (Array.isArray(summary.included)) {
    console.log(`- Included targets: ${summary.included.length}`);
    if (summary.skipped?.length) {
      console.log(`- Skipped targets: ${summary.skipped.join(", ")}`);
    }
    if (summary.missing?.length) {
      console.log(`- Missing targets: ${summary.missing.join(", ")}`);
    }
  }
  if (Array.isArray(summary.restored)) {
    console.log(`- Restored targets: ${summary.restored.length}`);
    if (summary.skipped?.length) {
      console.log(`- Skipped targets: ${summary.skipped.join(", ")}`);
    }
  }
}

function runSnapshotCommand(subcommandRaw, args = []) {
  const subcommand = String(subcommandRaw || "").trim().toLowerCase();
  if (subcommand === "create") {
    const label = args.join(" ").trim() || "manual";
    const summary = createGuardianSnapshot(label, "manual");
    printSnapshotSummary("FRANKLIN SNAPSHOT CREATED", summary);
    return summary;
  }

  if (subcommand === "list") {
    const snapshots = listGuardianSnapshots(15);
    if (!snapshots.length) {
      console.log("FRANKLIN SNAPSHOT LIST: no snapshots found.");
      return [];
    }

    console.log("FRANKLIN SNAPSHOT LIST");
    snapshots.forEach((entry, index) => {
      const num = String(index + 1).padStart(2, "0");
      console.log(`${num}. ${entry.id} | ${entry.reason || "manual"} | ${entry.createdAt || "unknown-time"}`);
    });
    return snapshots;
  }

  if (subcommand === "restore") {
    const selector = args[0] || "latest";
    const summary = restoreGuardianSnapshot(selector);
    printSnapshotSummary("FRANKLIN SNAPSHOT RESTORED", summary);
    return summary;
  }

  if (subcommand === "verify") {
    const selector = args[0] || "latest";
    const report = verifyGuardianSnapshots(selector);
    if (!report.totalSnapshots) {
      throw new Error("No guardian snapshots available.");
    }

    if (report.ok) {
      console.log(`FRANKLIN SNAPSHOT VERIFY: OK (${report.totalSnapshots} snapshot${report.totalSnapshots === 1 ? "" : "s"})`);
      return report;
    }

    console.error(`FRANKLIN SNAPSHOT VERIFY: FAILED (${report.issues.length} issue${report.issues.length === 1 ? "" : "s"})`);
    for (const issue of report.issues) {
      console.error(`- ${issue}`);
    }
    throw new Error("Snapshot verification failed.");
  }

  throw new Error("Usage: npm run frank -- snapshot <create [label] | list | restore <id|latest> | verify <id|latest|all>>");
}

function writeRescueReport(scriptName, failure) {
  const reportPath = memoryPaths.fixRequest;
  assertPathInsideMemoryRoot(reportPath);

  const statusLine = typeof failure?.code === "number"
    ? `exit code ${failure.code}`
    : failure?.signal
      ? `signal ${failure.signal}`
      : "unknown failure";

  const lines = [
    "# Franklin Fix Request",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Failing command: npm run ${scriptName}`,
    `- Failure status: ${statusLine}`,
    "",
    "## Summary",
    "- Reproduce with the exact command above.",
    "- Fix only the first failing root cause.",
    "- Re-run isolated gate, then re-run full target gate.",
    "",
    "## Captured Output (stdout)",
    "```text",
    normalizeRescueOutput(failure?.stdout || ""),
    "```",
    "",
    "## Captured Output (stderr)",
    "```text",
    normalizeRescueOutput(failure?.stderr || ""),
    "```",
    "",
    "## Recovery Checklist",
    "1. Identify failing stage and exact assertion/error text.",
    "2. Apply minimal fix.",
    "3. Re-run failing stage only.",
    "4. Re-run `npm run test:quick` or `npm run test:all`.",
  ];

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
}

function appendMemoryLine(filePath, message) {
  assertPathInsideMemoryRoot(filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing memory file: ${path.relative(root, filePath)}`);
  }
  const safeMessage = sanitizeMemoryMessage(message);
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `- ${stamp}: ${safeMessage}`;
  fs.appendFileSync(filePath, `\n${line}\n`, "utf8");
}

function printHelp() {
  console.log("Franklin terminal commands:");
  console.log("- npm run frank -- help");
  console.log("- npm run frank -- check");
  console.log("- npm run frank -- full");
  console.log("- npm run frank -- guardian");
  console.log("- npm run frank -- doctor");
  console.log("- npm run frank -- snapshot create [label]");
  console.log("- npm run frank -- snapshot list");
  console.log("- npm run frank -- snapshot restore <id|latest>");
  console.log("- npm run frank -- snapshot verify <id|latest|all>");
  console.log("- npm run frank -- rescue <script>");
  console.log("- npm run frank -- note \"message\"");
  console.log("- npm run frank -- error \"message\"");
  console.log("- npm run frank -- status");
  console.log("");
  console.log("Shortcuts:");
  console.log("- npm run frank:check");
  console.log("- npm run frank:all");
  console.log("- npm run frank:guardian");
  console.log("- npm run frank:full");
  console.log("- npm run frank:doctor");
  console.log("- npm run frank:snapshot:create");
  console.log("- npm run frank:snapshot:list");
  console.log("- npm run frank:snapshot:restore");
  console.log("- npm run frank:snapshot:verify");
  console.log("- npm run frank:status");
}

function printStatus() {
  const snapshots = listGuardianSnapshots(1);
  const checks = [
    ["AI memory", memoryRoot],
    ["Decisions log", memoryPaths.decisions],
    ["Error catalog", memoryPaths.errors],
    ["Fix request doc", memoryPaths.fixRequest],
    ["Guardian snapshots", guardianPaths.snapshots],
  ];

  console.log("FRANKLIN STATUS");
  for (const [label, target] of checks) {
    const ok = fs.existsSync(target);
    console.log(`- ${label}: ${ok ? "OK" : "MISSING"}`);
  }
  if (snapshots.length) {
    console.log(`- Latest snapshot: ${snapshots[0].id}`);
  } else {
    console.log("- Latest snapshot: (none)");
  }
  console.log("- Core checks: test:all:contract, test:sync:dist-site, test:memory, test:frank:safety, test:integrity");
}

function runFranklinCheckSequence() {
  runNpmScript("test:all:contract");
  runNpmScript("test:sync:dist-site");
  runNpmScript("test:memory");
  runNpmScript("test:frank:safety");
  runNpmScript("test:integrity");
}

function runDoctor() {
  const scripts = readPackageScripts();
  const checks = [
    ["AI memory directory", fs.existsSync(memoryRoot)],
    ["Decisions log", fs.existsSync(memoryPaths.decisions)],
    ["Error catalog", fs.existsSync(memoryPaths.errors)],
    ["Fix request doc", fs.existsSync(memoryPaths.fixRequest)],
  ];

  for (const scriptName of doctorRequiredScripts) {
    const hasScript = typeof scripts[scriptName] === "string" && scripts[scriptName].trim().length > 0;
    checks.push([`npm script ${scriptName}`, hasScript]);
  }

  const latestSnapshots = listGuardianSnapshots(1);
  const snapshotIssues = [];
  if (!latestSnapshots.length) {
    checks.push(["Latest guardian snapshot", true]);
  } else {
    try {
      const verification = verifyGuardianSnapshots("latest");
      checks.push(["Latest guardian snapshot", verification.ok]);
      if (!verification.ok) {
        snapshotIssues.push(...verification.issues);
      }
    } catch (error) {
      checks.push(["Latest guardian snapshot", false]);
      snapshotIssues.push(error?.message || String(error));
    }
  }

  let failures = 0;
  console.log("FRANKLIN DOCTOR");
  for (const [label, ok] of checks) {
    if (!ok) failures += 1;
    console.log(`- ${label}: ${ok ? "OK" : "MISSING"}`);
  }
  for (const issue of snapshotIssues) {
    console.log(`- Snapshot issue: ${issue}`);
  }

  if (failures) {
    throw new Error(`FRANKLIN DOCTOR found ${failures} issue${failures === 1 ? "" : "s"}.`);
  }

  console.log("- Result: READY");
}

function runRescue(scriptNameRaw) {
  const scriptName = String(scriptNameRaw || "").trim();
  if (!scriptName) {
    throw new Error("Usage: npm run frank -- rescue <script>");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]*$/.test(scriptName)) {
    throw new Error(`Invalid script name for rescue: ${scriptName}`);
  }

  const scripts = readPackageScripts();
  if (!Object.prototype.hasOwnProperty.call(scripts, scriptName)) {
    throw new Error(`Unknown npm script for rescue: ${scriptName}`);
  }

  try {
    runNpmScript(scriptName, { captureOutput: true });
    console.log(`FRANKLIN RESCUE: npm run ${scriptName} passed. No fix request generated.`);
    return;
  } catch (failure) {
    writeRescueReport(scriptName, failure);
    appendMemoryLine(
      memoryPaths.errors,
      `Franklin rescue generated docs/ai-memory/franklin-fix-request.md for failing script npm run ${scriptName}`,
    );
    console.log("FRANKLIN RESCUE REPORT SAVED: docs/ai-memory/franklin-fix-request.md");

    const rescueError = new Error(`Rescue captured failing script: npm run ${scriptName}`);
    rescueError.code = typeof failure?.code === "number" ? failure.code : 1;
    throw rescueError;
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function buildProgressBar(completed, total, width = 24) {
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCompleted = Math.max(0, Math.min(safeTotal, Number(completed) || 0));
  const ratio = safeCompleted / safeTotal;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  if (filled >= width) {
    return `[${"=".repeat(width)}]`;
  }
  const head = filled > 0 ? ">" : "";
  const body = filled > 0 ? "=".repeat(Math.max(0, filled - 1)) : "";
  const tail = ".".repeat(Math.max(0, width - filled - head.length));
  return `[${body}${head}${tail}]`;
}

function sanitizeFileToken(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function ensureFrankleenReportsRoot() {
  fs.mkdirSync(frankleenReportsRoot, { recursive: true });
}

function createStageLogRun(label = "full-gate") {
  ensureFrankleenReportsRoot();
  const runId = `run-${Date.now()}-${sanitizeFileToken(label, "full-gate")}`;
  const runDir = path.join(frankleenReportsRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });
  return {
    runId,
    runDir,
    runDirRel: path.relative(root, runDir).split(path.sep).join("/") || ".",
  };
}

function writeStageLog(runDir, index, stepScript, status, output) {
  const scriptToken = sanitizeFileToken(stepScript, "stage");
  const filename = `${String(index).padStart(2, "0")}-${scriptToken}-${status}.log`;
  const absPath = path.join(runDir, filename);
  fs.writeFileSync(absPath, String(output || ""), "utf8");
  return path.relative(root, absPath).split(path.sep).join("/") || filename;
}

function normalizeOutputForDigest(rawOutput) {
  return String(rawOutput || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u001B\[[0-9;]*[A-Za-z]/g, "");
}

function collectOutputHighlights(stepScript, output, maxLines = 6) {
  const normalized = normalizeOutputForDigest(output);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("> "))
    .filter((line) => !/^\[\d+\/\d+\]/.test(line))
    .filter((line) => !/^npm\s+(warn|notice)\b/i.test(line))
    .filter((line) => !/^node:\s+/i.test(line));

  if (!lines.length) return ["No stage output captured."];

  const keywords = [
    /^\d+\s+passed\b/i,
    /^\d+\s+failed\b/i,
    /^\d+\s+skipped\b/i,
    /\brunning\s+\d+\s+tests?\b/i,
    /\bverification\s+(passed|failed)\b/i,
    /\bpass(?:ed)?\b/i,
    /\bfail(?:ed|ure)?\b/i,
    /\bready to upload\b/i,
    /\bcreated\b/i,
    /\brestored\b/i,
    /\bsync(?:ed)?\b/i,
    /\bplaywright\b/i,
  ];
  const highlights = [];
  for (const line of lines) {
    if (!keywords.some((pattern) => pattern.test(line))) continue;
    if (highlights.includes(line)) continue;
    highlights.push(line);
    if (highlights.length >= maxLines) break;
  }

  if (highlights.length >= Math.min(maxLines, 3)) {
    return highlights.slice(0, maxLines);
  }

  if (stepScript === "test" && highlights.length) {
    return highlights.slice(0, maxLines);
  }

  const tail = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (highlights.includes(line) || tail.includes(line)) continue;
    tail.unshift(line);
    if (tail.length >= Math.max(0, maxLines - highlights.length)) break;
  }

  return [...highlights, ...tail].slice(0, maxLines);
}

function supportsAnsiColor() {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR === "0") return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout && process.stdout.isTTY);
}

const ansiStyles = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
};

function styleText(text, ...styles) {
  if (!supportsAnsiColor() || !styles.length) {
    return text;
  }
  return `${styles.join("")}${text}${ansiStyles.reset}`;
}

function printStageFlowIntro(totalSteps) {
  const rows = [
    `Mode                 : FRANKLEEN TEST ORCHESTRATOR`,
    `Target               : Full release gate (${totalSteps} stages)`,
    "Telemetry            : Live stage progress + timing recap",
  ];
  const lines = renderBox("FRANKLEEN TEST FLOW", rows);
  console.log("");
  for (const line of lines) {
    if (line.startsWith("+-")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (line.includes("FRANKLEEN TEST FLOW")) {
      console.log(styleText(line, ansiStyles.bold, ansiStyles.cyan));
      continue;
    }
    console.log(styleText(line, ansiStyles.dim));
  }
  console.log("");
}

function printStageStart(index, total, step) {
  const bar = buildProgressBar(index - 1, total);
  const line = `${bar} [${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}] START ${step.script}  (${step.label})`;
  console.log(styleText(line, ansiStyles.cyan));
}

function printStageEnd(index, total, step, status, durationMs) {
  const bar = buildProgressBar(status === "passed" ? index : index - 1, total);
  const label = status === "passed" ? "PASS " : "FAIL ";
  const color = status === "passed" ? ansiStyles.green : ansiStyles.yellow;
  const line = `${bar} [${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")}] ${label}${step.script}  (${formatDuration(durationMs)})`;
  console.log(styleText(line, color));
}

function printStageDigest(index, total, step, status, output, logPath) {
  const statusLabel = status === "passed" ? "PASS" : "FAIL";
  const rows = collectOutputHighlights(step.script, output).map((line) => `- ${line}`);
  rows.push(`- Log file: ${logPath}`);
  const lines = renderBox(`STAGE ${String(index).padStart(2, "0")}/${String(total).padStart(2, "0")} ${statusLabel} DIGEST (${step.script})`, rows);
  for (const line of lines) {
    if (line.startsWith("+-")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (line.includes("DIGEST")) {
      const color = status === "passed" ? ansiStyles.green : ansiStyles.yellow;
      console.log(styleText(line, ansiStyles.bold, color));
      continue;
    }
    if (line.includes("Log file:")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (status !== "passed") {
      console.log(styleText(line, ansiStyles.yellow));
      continue;
    }
    console.log(styleText(line, ansiStyles.dim));
  }
}

function printStageRecap(stages, logRunDirRel = "") {
  const rows = stages.map((stage, idx) => {
    const stageNumber = String(idx + 1).padStart(2, "0");
    const status = stage.status === "passed" ? "OK  " : "FAIL";
    const script = stage.script.padEnd(21, " ");
    const duration = formatDuration(stage.durationMs).padStart(6, " ");
    return `${stageNumber}. ${status} ${script} ${duration}`;
  });
  if (logRunDirRel) {
    rows.push(`Logs: ${logRunDirRel}`);
  }

  const lines = renderBox("STAGE TIMELINE", rows);
  console.log("");
  for (const line of lines) {
    if (line.startsWith("+-")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (line.includes("STAGE TIMELINE")) {
      console.log(styleText(line, ansiStyles.bold, ansiStyles.cyan));
      continue;
    }
    if (line.includes("FAIL")) {
      console.log(styleText(line, ansiStyles.yellow));
      continue;
    }
    if (line.includes("OK")) {
      console.log(styleText(line, ansiStyles.green));
      continue;
    }
    console.log(line);
  }
}

async function runFullGateSequence() {
  const startedAt = Date.now();
  const stageResults = [];
  const totalStages = fullGateSteps.length;
  const logRun = createStageLogRun("full-gate");

  printStageFlowIntro(totalStages);
  console.log(styleText(`Stage logs: ${logRun.runDirRel}`, ansiStyles.dim));
  console.log("");

  for (let i = 0; i < fullGateSteps.length; i += 1) {
    const index = i + 1;
    const step = fullGateSteps[i];
    const stepStartedAt = Date.now();

    printStageStart(index, totalStages, step);
    try {
      const result = step.script === "test"
        ? await runNpmScriptWithLiveProgress(step.script, {
          silentNpm: true,
          progressMode: "playwright",
        })
        : runNpmScript(step.script, {
          captureOutput: true,
          printOutput: false,
          silentNpm: true,
        });
      const combinedOutput = `${result.stdout || ""}${result.stderr || ""}`;
      const durationMs = Date.now() - stepStartedAt;
      const logPath = writeStageLog(logRun.runDir, index, step.script, "pass", combinedOutput);
      stageResults.push({
        script: step.script,
        label: step.label,
        status: "passed",
        durationMs,
        logPath,
      });
      printStageEnd(index, totalStages, step, "passed", durationMs);
      printStageDigest(index, totalStages, step, "passed", combinedOutput, logPath);
    } catch (error) {
      const durationMs = Date.now() - stepStartedAt;
      const combinedOutput = `${error?.stdout || ""}${error?.stderr || ""}`;
      const logPath = writeStageLog(logRun.runDir, index, step.script, "fail", combinedOutput);
      stageResults.push({
        script: step.script,
        label: step.label,
        status: "failed",
        durationMs,
        logPath,
      });
      printStageEnd(index, totalStages, step, "failed", durationMs);
      printStageDigest(index, totalStages, step, "failed", combinedOutput, logPath);
      printStageRecap(stageResults, logRun.runDirRel);
      throw error;
    }
  }

  printStageRecap(stageResults, logRun.runDirRel);
  console.log(styleText("ALL GOOD FAZYBEAR - FRANKLEEN ONLINE", ansiStyles.bold, ansiStyles.green));

  return {
    durationMs: Date.now() - startedAt,
    stages: stageResults,
    logRunDirRel: logRun.runDirRel,
  };
}

async function runGuardianMode() {
  console.log(styleText("FRANKLIN GUARDIAN MODE", ansiStyles.bold, ansiStyles.cyan));

  const preflight = createGuardianSnapshot("guardian-preflight", "guardian-preflight");
  printSnapshotSummary("GUARDIAN PRE-FLIGHT SNAPSHOT", preflight);

  try {
    const result = await runFullGateSequence();
    const safe = createGuardianSnapshot("guardian-safe", "guardian-safe");
    printFrankleenVictoryBanner(result.durationMs, result.stages, { logRunDirRel: result.logRunDirRel });
    printSnapshotSummary("GUARDIAN SAFE SNAPSHOT", safe);
    appendMemoryLine(
      memoryPaths.decisions,
      `Guardian run passed with safe snapshot ${safe.id}`,
    );
    return result;
  } catch (error) {
    console.error(styleText(`GUARDIAN FAILURE: ${error.message || String(error)}`, ansiStyles.yellow));

    const failedScript = typeof error?.scriptName === "string" && error.scriptName.trim()
      ? error.scriptName.trim()
      : "guardian";

    try {
      const rollback = restoreGuardianSnapshot(preflight.id);
      printSnapshotSummary("GUARDIAN ROLLBACK APPLIED", rollback);
      appendMemoryLine(
        memoryPaths.errors,
        `Guardian rollback restored snapshot ${rollback.id} after gate failure`,
      );
    } catch (rollbackError) {
      const rollbackMessage = String(rollbackError?.message || rollbackError || "unknown rollback error");
      console.error(`Guardian rollback failed: ${rollbackMessage}`);
      appendMemoryLine(
        memoryPaths.errors,
        `Guardian rollback failed after gate failure: ${rollbackMessage.slice(0, 180)}`,
      );
    }

    try {
      let reportFailure = error;
      const hasCapturedOutput = Boolean(
        String(error?.stdout || "").trim()
        || String(error?.stderr || "").trim(),
      );
      if (!hasCapturedOutput && failedScript !== "guardian") {
        try {
          runNpmScript(failedScript, { captureOutput: true });
        } catch (capturedFailure) {
          reportFailure = capturedFailure;
        }
      }

      writeRescueReport(failedScript, reportFailure);
      console.error("GUARDIAN FIX REQUEST SAVED: docs/ai-memory/franklin-fix-request.md");
      appendMemoryLine(
        memoryPaths.errors,
        `Guardian failure generated docs/ai-memory/franklin-fix-request.md for npm run ${failedScript}`,
      );
    } catch (rescueError) {
      console.error(`Guardian fix request generation failed: ${rescueError?.message || String(rescueError)}`);
    }

    throw error;
  }
}

function formatCompletedAt(date = new Date()) {
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function getLatestDesktopPackOutputPath() {
  const distPackRoot = path.join(root, "dist_pack_check");
  if (!fs.existsSync(distPackRoot)) {
    return "dist_pack_check/(none yet)";
  }

  const entryNames = fs.readdirSync(distPackRoot);
  const runDirs = entryNames
    .map((name) => path.join(distPackRoot, name))
    .filter((absPath) => {
      const base = path.basename(absPath);
      return base.startsWith("run-") && fs.existsSync(absPath) && fs.statSync(absPath).isDirectory();
    });

  if (!runDirs.length) {
    return "dist_pack_check/(none yet)";
  }

  const latestRunDir = runDirs
    .map((absPath) => ({ absPath, mtimeMs: fs.statSync(absPath).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0].absPath;

  const candidate = path.join(latestRunDir, "win-unpacked");
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    return path.relative(root, candidate) || ".";
  }

  return path.relative(root, latestRunDir) || ".";
}

function buildVictoryReportLines(durationMs, stages = [], options = {}) {
  const elapsed = formatDuration(durationMs);
  const uploadSource = path.relative(root, path.join(root, "release", "siteground", "public_html")) || ".";
  const distSitePath = path.relative(root, path.join(root, "dist_site")) || ".";
  const desktopPackPath = getLatestDesktopPackOutputPath();
  const logRunDirRel = String(options.logRunDirRel || "").trim();
  const passedStages = stages.filter((stage) => stage.status === "passed").length;
  const totalStages = stages.length || fullGateSteps.length;
  const slowestStage = stages.length
    ? stages.reduce((prev, next) => (next.durationMs > prev.durationMs ? next : prev))
    : null;
  return [
    "Release Gate         : PASSED",
    "AI + Integrity       : PASSED",
    "Desktop + Siteground : PASSED",
    `Gate Stages          : ${passedStages}/${totalStages} passed`,
    `Slowest Stage        : ${slowestStage ? `${slowestStage.script} (${formatDuration(slowestStage.durationMs)})` : "n/a"}`,
    `Total Runtime        : ${elapsed}`,
    `Completed At         : ${formatCompletedAt()}`,
    `Upload Source        : ${uploadSource}`,
    `dist_site Snapshot   : ${distSitePath}`,
    `Desktop Pack Output  : ${desktopPackPath}`,
    `Stage Log Folder     : ${logRunDirRel || "artifacts/frankleen/reports"}`,
    "Status               : READY TO UPLOAD",
  ];
}

function renderBox(title, rows) {
  const innerWidth = Math.max(
    58,
    title.length,
    ...rows.map((row) => row.length),
  );
  const border = `+-${"-".repeat(innerWidth)}-+`;
  const lines = [border, `| ${title.padEnd(innerWidth)} |`, border];
  for (const row of rows) {
    lines.push(`| ${row.padEnd(innerWidth)} |`);
  }
  lines.push(border);
  return lines;
}

function printFrankleenVictoryBanner(durationMs, stages = [], options = {}) {
  const reportRows = buildVictoryReportLines(durationMs, stages, options);
  const lines = renderBox("FRANKLEEN VICTORY REPORT", reportRows);

  console.log("");
  for (const line of lines) {
    if (line.startsWith("+-")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (line.includes("FRANKLEEN VICTORY REPORT")) {
      console.log(styleText(line, ansiStyles.bold, ansiStyles.green));
      continue;
    }
    if (line.includes("PASSED") || line.includes("READY TO UPLOAD")) {
      console.log(styleText(line, ansiStyles.green));
      continue;
    }
    if (line.includes("Upload Source") || line.includes("Desktop Pack Output")) {
      console.log(styleText(line, ansiStyles.cyan));
      continue;
    }
    if (line.includes("Completed At") || line.includes("Total Runtime")) {
      console.log(styleText(line, ansiStyles.dim));
      continue;
    }
    console.log(line);
  }
  console.log("");
  console.log(styleText("ALL SYSTEMS GREEN. FRANKLEEN ONLINE.", ansiStyles.bold, ansiStyles.green));
  console.log(styleText("Upload target: SiteGround/public_html", ansiStyles.yellow));
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2).map((value) => String(value));

  if (command === "help") {
    printHelp();
    return;
  }

  if (command === "check") {
    runFranklinCheckSequence();
    console.log("FRANKLIN CHECK COMPLETE");
    return;
  }

  if (command === "full") {
    const result = await runFullGateSequence();
    printFrankleenVictoryBanner(result.durationMs, result.stages, { logRunDirRel: result.logRunDirRel });
    return;
  }

  if (command === "guardian") {
    await runGuardianMode();
    return;
  }

  if (command === "doctor") {
    runDoctor();
    return;
  }

  if (command === "snapshot") {
    runSnapshotCommand(args[0], args.slice(1));
    return;
  }

  if (command === "rescue") {
    runRescue(args[0]);
    return;
  }

  if (command === "note") {
    const message = args.join(" ").trim();
    if (!message) {
      throw new Error("Usage: npm run frank -- note \"message\"");
    }
    appendMemoryLine(memoryPaths.decisions, message);
    console.log("FRANKLIN NOTE SAVED");
    return;
  }

  if (command === "error") {
    const message = args.join(" ").trim();
    if (!message) {
      throw new Error("Usage: npm run frank -- error \"message\"");
    }
    appendMemoryLine(memoryPaths.errors, message);
    console.log("FRANKLIN ERROR LOGGED");
    return;
  }

  if (command === "status") {
    printStatus();
    return;
  }

  throw new Error(`Unknown Franklin command: ${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  appendMemoryLine,
  assertPathInsideMemoryRoot,
  createGuardianSnapshot,
  listGuardianSnapshots,
  normalizeRescueOutput,
  readPackageScripts,
  restoreGuardianSnapshot,
  runGuardianMode,
  runDoctor,
  runRescue,
  runSnapshotCommand,
  sanitizeMemoryMessage,
  writeRescueReport,
  verifyGuardianSnapshots,
  guardianPaths,
  memoryPaths,
  memoryRoot,
};
