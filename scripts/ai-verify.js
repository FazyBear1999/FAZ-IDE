const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const memoryReleaseNotes = path.join(root, "docs", "ai-memory", "release-notes.md");

function nowIso() {
  return new Date().toISOString();
}

function runScript(name) {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", `npm run ${name}`]
    : ["run", name];

  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });
  const durationMs = Date.now() - started;
  const passed = !result.error && (typeof result.status !== "number" || result.status === 0);
  return {
    script: name,
    passed,
    durationMs,
    code: typeof result.status === "number" ? result.status : 0,
    error: result.error ? String(result.error.message || result.error) : "",
  };
}

function appendReleaseSummary(results, mode) {
  const timestamp = nowIso();
  const passed = results.every((entry) => entry.passed);
  const title = `## ${timestamp} - AI Verify (${mode})`;
  const body = [
    "- Status:",
    `  - ${passed ? "PASS" : "FAIL"}`,
    "- Steps:",
    ...results.map((entry) => `  - ${entry.script}: ${entry.passed ? "PASS" : `FAIL (code ${entry.code})`} (${entry.durationMs}ms)`),
    "- Follow-up:",
    `  - ${passed ? "No action required." : "Inspect failing step and rerun ai:verify after fix."}`,
  ].join("\n");

  fs.appendFileSync(memoryReleaseNotes, `\n\n${title}\n\n${body}\n`, "utf8");
}

function main() {
  const mode = process.argv.includes("--full") ? "full" : "standard";
  const scripts = ["test:integrity", "test:memory", "test:changed", "test:smoke"];
  if (mode === "full") scripts.push("test:quick");

  const results = [];
  for (const script of scripts) {
    console.log(`\n=== Running ${script} ===`);
    const result = runScript(script);
    results.push(result);
    if (!result.passed) break;
  }

  appendReleaseSummary(results, mode);

  const failed = results.find((entry) => !entry.passed);
  if (failed) {
    console.error(`\nAI verify failed at step: ${failed.script}`);
    process.exit(failed.code || 1);
  }
  console.log("\nAI verify completed successfully.");
}

main();