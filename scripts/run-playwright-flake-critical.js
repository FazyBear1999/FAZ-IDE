const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

const criticalGrep = [
  "theme dropdown uses simple themed native select surface",
  "editor split keeps editor and mirror scroll positions synchronized",
  "workspace import applies safety limits for large payloads",
  "sandbox ignores spoofed parent-window messages even with a valid token",
  "manifest is reachable and valid",
].join("|");

function main() {
  const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

  const args = [
    cli,
    "test",
    "--config",
    "config/playwright.config.js",
    "--workers",
    "1",
    "--retries",
    "0",
    "--repeat-each",
    "3",
    "--grep",
    criticalGrep,
    "tests/ide.spec.js",
    "tests/release.spec.js",
  ];

  console.log("Running critical flake detector (repeat-each=3, retries=0, workers=1)");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to run critical flake detector.");
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

main();