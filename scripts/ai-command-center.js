const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const memoryRoot = path.join(root, "docs", "ai-memory");
const sessionBriefPath = path.join(memoryRoot, "session-brief.md");

const VALID_RISKS = new Set(["low", "medium", "high"]);
const VALID_CLASSES = new Set(["behavior", "safety", "recovery", "docs"]);

function parseArgs(argv) {
  const options = {
    risk: "auto",
    changeClass: "behavior",
    json: false,
    writeSessionBrief: false,
  };

  argv.forEach((arg) => {
    if (arg === "--json") options.json = true;
    if (arg === "--write-session-brief") options.writeSessionBrief = true;
    if (arg.startsWith("--risk=")) {
      const value = arg.slice("--risk=".length).trim().toLowerCase();
      if (VALID_RISKS.has(value)) options.risk = value;
      if (value === "auto") options.risk = "auto";
    }
    if (arg.startsWith("--class=")) {
      const value = arg.slice("--class=".length).trim().toLowerCase();
      if (VALID_CLASSES.has(value)) options.changeClass = value;
    }
  });

  return options;
}

function nowIso() {
  return new Date().toISOString();
}

function getGitChangedFiles(limit = 40) {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });

  if (result.error || result.status !== 0) return [];

  return String(result.stdout || "")
    .split(/\r?\n/)
    .filter((line) => line && line.length > 3)
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .slice(0, limit);
}

function inferCheckpointIds(changedFiles) {
  const ids = new Set();

  changedFiles.forEach((file) => {
    const value = String(file || "").replace(/\\/g, "/").toLowerCase();

    if (value.startsWith("assets/js/") || value.startsWith("assets/css/") || value.startsWith("tests/")) {
      ids.add("C1");
    }
    if (value.startsWith("assets/apps/") || value.includes("sandbox") || value.includes("workspacepreview")) {
      ids.add("C2");
    }
    if (value.includes("file") || value.includes("folder") || value.includes("trash")) {
      ids.add("C3");
    }
    if (value.startsWith("scripts/") || value.startsWith("docs/") || value.includes("playbook") || value.includes("wave-map")) {
      ids.add("C4");
    }

    // Active roadmap checkpoints
    // C5: Phase-0 architecture spine (command/state/journal/layout-engine primitives)
    if (
      value === "assets/js/app.js"
      || value.includes("commandregistry")
      || value.includes("stateboundaries")
      || value.includes("ui/store.js")
      || value.includes("core/panellayoutmodel")
      || value.includes("core/layoutengine")
      || value.includes("master_roadmap")
      || value.includes("roadmap-decision-map")
    ) {
      ids.add("C5");
    }

    // C6: CM6 ghost lesson foundation
    if (value.includes("cm6") || value.includes("ghost") || value.includes("lesson")) {
      ids.add("C6");
    }

    // C7: Layout customization + docking stability lane
    if (
      value.includes("layout")
      || value.includes("docking")
      || value.includes("splitter")
      || value.includes("panel_engine_blueprint")
    ) {
      ids.add("C7");
    }
  });

  if (!ids.size) ids.add("C1");
  return [...ids.values()].sort();
}

function inferRiskTier(changedFiles = [], changeClass = "behavior") {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  if (!files.length) {
    return "low";
  }

  const normalized = files.map((file) => String(file || "").replace(/\\/g, "/").toLowerCase());

  const highRiskMatchers = [
    (value) => value === "package.json",
    (value) => value === "playwright.config.js" || value === "config/playwright.config.js",
    (value) => value === "assets/js/app.js",
    (value) => value.startsWith("assets/js/sandbox/"),
    (value) => value.startsWith("scripts/franklin"),
    (value) => value.startsWith("scripts/prepare-siteground"),
    (value) => value.startsWith("scripts/codex-ops"),
  ];

  const mediumRiskMatchers = [
    (value) => value.startsWith("assets/js/"),
    (value) => value.startsWith("assets/css/"),
    (value) => value.startsWith("tests/"),
    (value) => value.startsWith("scripts/"),
  ];

  const hasHighRiskTouch = normalized.some((value) => highRiskMatchers.some((match) => match(value)));
  if (hasHighRiskTouch) {
    return "high";
  }

  const hasMediumRiskTouch = normalized.some((value) => mediumRiskMatchers.some((match) => match(value)));
  if (hasMediumRiskTouch) {
    return "medium";
  }

  if (changeClass === "docs") {
    return "low";
  }

  return "medium";
}

function computeGatePlan(risk) {
  const plan = ["npm run test:memory"];
  if (risk === "low") return plan;

  plan.push("npm run test:integrity");
  if (risk === "medium") {
    plan.push("run focused Playwright tests for touched surfaces");
    return plan;
  }

  plan.push("run focused Playwright tests for touched surfaces");
  plan.push("npm run frank:full");
  return plan;
}

function computeMemoryTargets(changeClass, checkpointIds) {
  const targets = ["docs/ai-memory/decisions.md"];

  if (changeClass !== "docs") {
    targets.push("docs/ai-memory/release-notes.md");
  }
  if (changeClass === "safety" || changeClass === "recovery") {
    targets.push("docs/ai-memory/recovery-playbook.md");
    targets.push("docs/ai-memory/error-catalog.md");
  }
  if (changeClass === "behavior") {
    targets.push("docs/ai-memory/test-gaps.md");
  }
  if (checkpointIds.some((id) => id === "C4" || id === "C5" || id === "C6" || id === "C7")) {
    targets.push("docs/ai-memory/roadmap-decision-map.md");
  }

  return [...new Set(targets)];
}

function computeSafetyAlerts({ changedFiles = [], changeClass = "behavior", risk = "medium" } = {}) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const normalized = files.map((file) => String(file || "").replace(/\\/g, "/").toLowerCase());
  const alerts = [];

  if (!files.length) {
    alerts.push("Working tree is clean; confirm you are on the intended branch before starting.");
    return alerts;
  }

  const touchedTests = normalized.some((file) => file.startsWith("tests/"));
  const touchedRuntime = normalized.some((file) => file.startsWith("assets/js/") || file.startsWith("assets/css/") || file.startsWith("scripts/"));
  const touchedMemory = normalized.some((file) => file.startsWith("docs/ai-memory/"));

  if (changeClass === "behavior" && touchedRuntime && !touchedTests) {
    alerts.push("Behavior-facing files changed without test updates yet; add focused tests before broader gates.");
  }

  if ((changeClass === "behavior" || changeClass === "safety" || changeClass === "recovery") && touchedRuntime && !touchedMemory) {
    alerts.push("Runtime/safety surfaces changed without ai-memory updates yet; sync decisions and supporting docs before handoff.");
  }

  if (risk === "high") {
    alerts.push("High-risk touch detected; treat frank:full as required before handoff.");
  }

  return alerts;
}

function buildDecisionScaffold() {
  return [
    "Decision ID: D-<date>-<scope>",
    "Context: <what changed and why now>",
    "Options considered: <A>, <B>",
    "Selected option: <chosen>",
    "Rejected options: <why rejected>",
    "Assumptions: <verified|partially-verified|unverified>",
    "Validation plan: <focused checks + gate>",
    "Rollback trigger: <explicit trigger>",
  ];
}

function buildSessionBrief(report) {
  const changedFiles = report.changedFiles.length
    ? report.changedFiles.map((file) => `- ${file}`).join("\n")
    : "- none";

  const alerts = report.safetyAlerts.length
    ? report.safetyAlerts.map((line) => `- ${line}`).join("\n")
    : "- none";

  return `# AI Session Brief\n\n- Timestamp: ${report.generatedAt}\n- Change class: ${report.changeClass}\n- Risk tier: ${report.risk}\n- Risk source: ${report.riskSource}\n- Checkpoints: ${report.checkpointIds.join(", ")}\n\n## Working Tree\n${changedFiles}\n\n## Safety Alerts\n${alerts}\n\n## Decision Scaffold\n${report.decisionScaffold.map((line) => `- ${line}`).join("\n")}\n\n## Validation Plan\n${report.gatePlan.map((line) => `- ${line}`).join("\n")}\n\n## Memory Targets\n${report.memoryTargets.map((line) => `- ${line}`).join("\n")}\n`;
}

function writeSessionBrief(content) {
  fs.mkdirSync(memoryRoot, { recursive: true });
  fs.writeFileSync(sessionBriefPath, content, "utf8");
}

function buildReport(options) {
  const changedFiles = getGitChangedFiles();
  const checkpointIds = inferCheckpointIds(changedFiles);
  const resolvedRisk = options.risk === "auto"
    ? inferRiskTier(changedFiles, options.changeClass)
    : options.risk;
  const riskSource = options.risk === "auto" ? "inferred-from-working-tree" : "explicit-flag";
  const gatePlan = computeGatePlan(resolvedRisk);
  const memoryTargets = computeMemoryTargets(options.changeClass, checkpointIds);
  const safetyAlerts = computeSafetyAlerts({
    changedFiles,
    changeClass: options.changeClass,
    risk: resolvedRisk,
  });

  return {
    generatedAt: nowIso(),
    mode: "safe-read-only",
    changeClass: options.changeClass,
    risk: resolvedRisk,
    riskSource,
    checkpointIds,
    changedFiles,
    gatePlan,
    memoryTargets,
    safetyAlerts,
    decisionScaffold: buildDecisionScaffold(),
    writeSessionBrief: options.writeSessionBrief,
    sessionBriefPath: path.relative(root, sessionBriefPath).replace(/\\/g, "/"),
  };
}

function printTextReport(report) {
  console.log("AI Command Center (Safe Mode)");
  console.log(`- Timestamp: ${report.generatedAt}`);
  console.log(`- Change class: ${report.changeClass}`);
  console.log(`- Risk tier: ${report.risk}`);
  console.log(`- Risk source: ${report.riskSource}`);
  console.log(`- Checkpoints: ${report.checkpointIds.join(", ")}`);
  console.log(`- Working tree files: ${report.changedFiles.length}`);

  if (report.changedFiles.length) {
    console.log("\nWorking Tree Snapshot:");
    report.changedFiles.slice(0, 20).forEach((file) => console.log(`- ${file}`));
  }

  console.log("\nDecision Scaffold:");
  report.decisionScaffold.forEach((line) => console.log(`- ${line}`));

  console.log("\nValidation Plan:");
  report.gatePlan.forEach((line) => console.log(`- ${line}`));

  console.log("\nMemory Targets:");
  report.memoryTargets.forEach((line) => console.log(`- ${line}`));

  console.log("\nSafety Alerts:");
  if (report.safetyAlerts.length) {
    report.safetyAlerts.forEach((line) => console.log(`- ${line}`));
  } else {
    console.log("- none");
  }

  if (report.writeSessionBrief) {
    console.log(`\nSession brief written: ${report.sessionBriefPath}`);
  } else {
    console.log("\nNo files written (read-only mode). Use --write-session-brief to persist a brief.");
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildReport(options);

  if (options.writeSessionBrief) {
    writeSessionBrief(buildSessionBrief(report));
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printTextReport(report);
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
