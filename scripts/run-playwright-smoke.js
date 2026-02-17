const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

const smokeSpecs = [
  "tests/release.spec.js",
  "tests/ide.spec.js",
];

const smokeGrep = [
  "loads the IDE shell with files and editor",
  "theme selector switches value safely",
  "theme dropdown uses simple themed native select surface",
  "dev terminal runs safe commands and blocks privileged eval commands",
  "workspace import applies safety limits for large payloads",
  "manifest is reachable and valid",
  "critical static assets are reachable",
].join("|");

function main() {
  const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

  const args = [
    cli,
    "test",
    "--config",
    "config/playwright.config.js",
    "--grep",
    smokeGrep,
    ...smokeSpecs,
  ];

  console.log("Running smoke tests:");
  smokeSpecs.forEach((spec) => console.log(`- ${spec}`));

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to run smoke tests.");
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

main();