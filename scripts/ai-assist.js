const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const memoryRoot = path.join(root, "docs", "ai-memory");

const paths = {
  projectContext: path.join(memoryRoot, "project-context.md"),
  knownIssues: path.join(memoryRoot, "known-issues.md"),
  decisions: path.join(memoryRoot, "decisions.md"),
  releaseNotes: path.join(memoryRoot, "release-notes.md"),
  testGaps: path.join(memoryRoot, "test-gaps.md"),
  handoff: path.join(memoryRoot, "handoff-checklist.md"),
  sessionBrief: path.join(memoryRoot, "session-brief.md"),
  issueIntake: path.join(memoryRoot, "issue-intake.md"),
  featureIntake: path.join(memoryRoot, "feature-intake.md"),
  aiPrompt: path.join(memoryRoot, "ai-prompt.md"),
};

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function ensureMemoryRoot() {
  fs.mkdirSync(memoryRoot, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function extractSection(markdown, heading) {
  const lines = String(markdown || "").split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading.trim());
  if (startIndex < 0) return "";
  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    collected.push(line);
  }
  return collected.join("\n").trim();
}

function extractLatestEntry(markdown) {
  const text = String(markdown || "");
  const blocks = text.match(/(^##\s+.+?[\r\n]+[\s\S]*?)(?=^##\s+|\Z)/gm) || [];
  if (!blocks.length) return "";
  const datedBlocks = blocks.filter((block) => /^##\s+\d{4}-\d{2}-\d{2}T/.test(String(block || "").trim()));
  const target = datedBlocks.length ? datedBlocks[datedBlocks.length - 1] : "";
  return String(target || "").trim();
}

function runNpmScript(name) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm run ${name}`]
    : ["run", name];
  const result = spawnSync(command, args, {
    cwd: root,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw new Error(result.error.message || `Failed to run npm script: ${name}`);
  }
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`npm run ${name} failed with exit code ${result.status}`);
  }
}

function sanitizeForHeading(rawValue) {
  return String(rawValue || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function getGitChangedFiles(limit = 20) {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  if (result.error || result.status !== 0) return [];
  const files = String(result.stdout || "")
    .split(/\r?\n/)
    .filter((line) => line && line.length > 3)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
  return files.slice(0, limit);
}

function parseArgText(argv) {
  return argv.join(" ").trim();
}

function appendLog(filePath, title, body) {
  const exists = fs.existsSync(filePath);
  const prefix = exists ? "\n\n" : "";
  const entry = `${prefix}## ${title}\n\n${body}`;
  fs.appendFileSync(filePath, entry, "utf8");
}

function buildSessionBrief(goalText) {
  const context = readText(paths.projectContext);
  const issues = readText(paths.knownIssues);
  const decisions = readText(paths.decisions);
  const testGaps = readText(paths.testGaps);
  const handoff = readText(paths.handoff);
  const changedFiles = getGitChangedFiles();

  const currentPriorities = extractSection(context, "## Current Priorities") || "- (no priorities found)";
  const knownIssuesOpen = extractSection(issues, "## Open") || "- (no open issue section found)";
  const decisionTemplateHint = extractSection(decisions, "## Template") || "- Context\n- Decision\n- Rationale\n- Risk\n- Follow-up";
  const highPriorityTestGaps = extractSection(testGaps, "## High Priority") || "- (no high-priority test gaps found)";
  const handoffStart = extractSection(handoff, "## Before You Start") || "- Read project context and recent decisions";

  const changed = changedFiles.length
    ? changedFiles.map((file) => `- ${file}`).join("\n")
    : "- none";

  const goal = goalText || "Stabilize current branch and implement scoped change safely.";

  return `# AI Session Brief\n\n## Purpose\n- Generated startup brief for AI coding sessions in this repository.\n- Provides deterministic context so issue fixes and feature work are easier to execute safely.\n\n## How to Use\n- Run \`npm run ai:kickoff -- "<goal>"\` before starting a Codex/chat session.\n- Paste this brief into the first AI message, then attach one issue/feature intake entry.\n- Re-run kickoff when branch context or priorities change.\n\n## Minimum Content Contract\n- Timestamp and goal\n- Current priorities snapshot\n- Open issue snapshot\n- High-priority test gaps\n- Working tree summary\n- Standard QA path\n\n## Generated\n- Timestamp: ${nowIso()}\n- Goal: ${goal}\n\n## Fast Start Checklist\n${handoffStart}\n\n## Current Priorities\n${currentPriorities}\n\n## Open Issues Snapshot\n${knownIssuesOpen}\n\n## High-Priority Test Gaps\n${highPriorityTestGaps}\n\n## Working Tree\n${changed}\n\n## Standard QA Path\n- npm run frank:check\n- npm run test:quick\n\n## Decision Log Format\n${decisionTemplateHint}\n\n## Copilot/Codex Prompt Starter\nUse this exact operating mode:\n- Read docs/ai-memory/project-context.md and docs/ai-memory/known-issues.md first.\n- Propose minimal root-cause fix or scoped feature patch.\n- Implement code changes directly.\n- Run targeted tests first, then npm run test:quick.\n- Update docs/ai-memory/decisions.md and docs/ai-memory/release-notes.md if behavior changed.\n`;}

function handleKickoff(args) {
  ensureMemoryRoot();
  const goal = parseArgText(args);
  const content = buildSessionBrief(goal);
  fs.writeFileSync(paths.sessionBrief, content, "utf8");
  console.log("AI kickoff brief generated.");
  console.log(`- File: ${path.relative(root, paths.sessionBrief)}`);
}

function handleIssue(args) {
  ensureMemoryRoot();
  const text = parseArgText(args);
  if (!text) {
    console.error("Usage: node scripts/ai-assist.js issue <short issue summary>");
    process.exit(1);
  }

  const title = `${nowIso()} - ${text}`;
  const body = [
    "- Summary:",
    `  - ${text}`,
    "- Repro Steps:",
    "  - 1)",
    "  - 2)",
    "  - 3)",
    "- Expected:",
    "  -",
    "- Actual:",
    "  -",
    "- Suspected Area:",
    "  -",
    "- Acceptance Test:",
    "  -",
    "- Notes:",
    "  -",
  ].join("\n");

  appendLog(paths.issueIntake, title, body);
  console.log("Issue intake entry added.");
  console.log(`- File: ${path.relative(root, paths.issueIntake)}`);
}

function handleFeature(args) {
  ensureMemoryRoot();
  const text = parseArgText(args);
  if (!text) {
    console.error("Usage: node scripts/ai-assist.js feature <short feature summary>");
    process.exit(1);
  }

  const title = `${nowIso()} - ${text}`;
  const body = [
    "- Outcome:",
    `  - ${text}`,
    "- User Value:",
    "  -",
    "- Scope:",
    "  - In",
    "  - Out",
    "- UX Notes:",
    "  -",
    "- Technical Plan:",
    "  -",
    "- Risks:",
    "  -",
    "- Definition of Done:",
    "  -",
    "- Test Plan:",
    "  -",
  ].join("\n");

  appendLog(paths.featureIntake, title, body);
  console.log("Feature intake entry added.");
  console.log(`- File: ${path.relative(root, paths.featureIntake)}`);
}

function handleStart(args) {
  ensureMemoryRoot();
  const goal = parseArgText(args);
  handleKickoff(goal ? [goal] : []);

  console.log("Running Franklin status...");
  runNpmScript("frank:status");

  console.log("Running Franklin check gate...");
  runNpmScript("frank:check");

  console.log("AI session start completed.");
}

function handleDoctor() {
  ensureMemoryRoot();
  const requiredFiles = [
    paths.projectContext,
    paths.knownIssues,
    paths.decisions,
    paths.releaseNotes,
    paths.testGaps,
    paths.handoff,
    paths.sessionBrief,
    paths.issueIntake,
    paths.featureIntake,
    paths.aiPrompt,
  ];

  const missing = requiredFiles
    .filter((filePath) => !fs.existsSync(filePath))
    .map((filePath) => path.relative(root, filePath));

  console.log("AI Doctor Report");
  console.log(`- Memory root: ${path.relative(root, memoryRoot)}`);
  console.log(`- Missing files: ${missing.length}`);
  if (missing.length) {
    missing.forEach((file) => console.log(`  - ${file}`));
  }

  const changedFiles = getGitChangedFiles(15);
  console.log(`- Working tree changes: ${changedFiles.length}`);
  if (changedFiles.length) {
    changedFiles.forEach((file) => console.log(`  - ${file}`));
  }

  console.log("- Recommended session flow:");
  console.log("  1) npm run ai:start -- \"<goal>\"");
  console.log("  2) npm run ai:issue -- \"<issue summary>\" or npm run ai:feature -- \"<feature summary>\"");
  console.log("  3) npm run ai:prompt issue|feature");
  console.log("  4) paste docs/ai-memory/ai-prompt.md into chat");

  if (missing.length) {
    process.exitCode = 1;
  }
}

function handlePrompt(args) {
  ensureMemoryRoot();
  const mode = String(args[0] || "issue").trim().toLowerCase();
  const targetMode = mode === "feature" ? "feature" : "issue";

  const brief = readText(paths.sessionBrief);
  const issueText = readText(paths.issueIntake);
  const featureText = readText(paths.featureIntake);
  const intake = targetMode === "feature" ? extractLatestEntry(featureText) : extractLatestEntry(issueText);

  const intakeFallback = targetMode === "feature"
    ? "No feature intake entry found. Run: npm run ai:feature -- \"<summary>\""
    : "No issue intake entry found. Run: npm run ai:issue -- \"<summary>\"";

  const prompt = [
    "# AI Prompt Pack",
    "",
    "## Purpose",
    "- Ready-to-paste prompt context generated for Codex/AI chat sessions.",
    "",
    "## How to Generate",
    "- npm run ai:prompt issue",
    "- npm run ai:prompt feature",
    "",
    "## Usage",
    "- Generate this file after kickoff + intake entry, then paste into AI chat.",
    "",
    `## Mode`,
    `- ${targetMode}`,
    "",
    "## Instructions for AI",
    "- Read and obey the repository guardrails and memory files.",
    "- Apply minimal root-cause changes only.",
    "- Run targeted tests first, then npm run test:quick.",
    "- Update docs/ai-memory/decisions.md and docs/ai-memory/release-notes.md if behavior changes.",
    "",
    "## Session Brief",
    brief || "Session brief missing. Run: npm run ai:kickoff -- \"<goal>\"",
    "",
    `## Latest ${targetMode === "feature" ? "Feature" : "Issue"} Intake`,
    intake || intakeFallback,
    "",
    "## Required Sections",
    "- Mode",
    "- Instructions for AI",
    "- Session Brief",
    `- Latest ${targetMode === "feature" ? "Feature" : "Issue"} Intake`,
    "- Deliverables",
    "",
    "## Deliverables",
    "- Code changes",
    "- Tests/validation output",
    "- Short risk summary",
  ].join("\n");

  fs.writeFileSync(paths.aiPrompt, `${prompt}\n`, "utf8");
  console.log("AI prompt pack generated.");
  console.log(`- File: ${path.relative(root, paths.aiPrompt)}`);
}

function handleEnd(args) {
  ensureMemoryRoot();
  const summary = parseArgText(args) || "Session completed.";
  const heading = `${nowIso()} - ${sanitizeForHeading(summary) || "session-summary"}`;

  appendLog(paths.decisions, heading, [
    "- Date (UTC):",
    `  - ${nowIso()}`,
    "- Area:",
    "  - AI workflow",
    "- Decision:",
    `  - ${summary}`,
    "- Why:",
    "  - Preserve reliable handoff for next AI session.",
    "- Follow-up:",
    "  - Run npm run test:quick before release-sensitive work.",
  ].join("\n"));

  appendLog(paths.releaseNotes, heading, [
    "- Impact:",
    `  - ${summary}`,
    "- QA:",
    "  - test:quick",
    "- Rollout Notes:",
    "  - Local-first workflow unchanged.",
  ].join("\n"));

  console.log("AI session end notes appended.");
  console.log(`- Decisions: ${path.relative(root, paths.decisions)}`);
  console.log(`- Release notes: ${path.relative(root, paths.releaseNotes)}`);
}

function printHelp() {
  console.log("AI Assist Commands");
  console.log("- kickoff [goal]");
  console.log("- start [goal]");
  console.log("- doctor");
  console.log("- issue <summary>");
  console.log("- feature <summary>");
  console.log("- prompt [issue|feature]");
  console.log("- end [summary]");
}

function main() {
  const [, , command = "help", ...args] = process.argv;
  const normalized = String(command || "help").trim().toLowerCase();

  if (normalized === "kickoff") {
    handleKickoff(args);
    return;
  }
  if (normalized === "start") {
    handleStart(args);
    return;
  }
  if (normalized === "doctor") {
    handleDoctor();
    return;
  }
  if (normalized === "issue") {
    handleIssue(args);
    return;
  }
  if (normalized === "feature") {
    handleFeature(args);
    return;
  }
  if (normalized === "prompt") {
    handlePrompt(args);
    return;
  }
  if (normalized === "end") {
    handleEnd(args);
    return;
  }
  printHelp();
}

main();