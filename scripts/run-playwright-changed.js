const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();

function runGitStatusPorcelain() {
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
    .filter(Boolean);
}

function normalize(filePath) {
  return String(filePath || "").replace(/\\/g, "/").toLowerCase();
}

function pickSpecs(changedFiles) {
  const specs = new Set();
  for (const rawFile of changedFiles) {
    const file = normalize(rawFile);

    if (file.startsWith("tests/") && file.endsWith(".spec.js")) {
      specs.add(file);
      continue;
    }

    if (
      file.startsWith("assets/js/") ||
      file.startsWith("assets/css/") ||
      file === "index.html" ||
      file.startsWith("docs/ai-memory/")
    ) {
      specs.add("tests/ide.spec.js");
    }

    if (
      file === "manifest.webmanifest" ||
      file.startsWith("assets/icons/") ||
      file.startsWith("build/")
    ) {
      specs.add("tests/release.spec.js");
    }
  }

  if (!specs.size) {
    specs.add("tests/release.spec.js");
    specs.add("tests/ide.spec.js");
  }

  return Array.from(specs);
}

function runPlaywright(specs) {
  const cli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

  const args = [cli, "test", "--config", "config/playwright.config.js", ...specs];

  console.log("Running changed test target set:");
  specs.forEach((spec) => console.log(`- ${spec}`));

  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw new Error(result.error.message || "Failed to run Playwright changed tests.");
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function main() {
  const changedFiles = runGitStatusPorcelain();
  console.log(`Changed files detected: ${changedFiles.length}`);
  const specs = pickSpecs(changedFiles);
  runPlaywright(specs);
}

main();