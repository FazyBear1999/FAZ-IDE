const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const outputDir = `dist_release_test/run-${Date.now()}`;
const outputAbs = path.join(root, outputDir);
const distRoot = path.join(root, "dist");
const unpackedLatestTarget = path.join(distRoot, "win-unpacked-latest");
const builderArgs = [
  "electron-builder",
  "-w",
  "nsis",
  `--config.directories.output=${outputDir}`,
];
const nodeOptions = process.env.NODE_OPTIONS || "";
const builderNodeOptions = nodeOptions.includes("--no-deprecation")
  ? nodeOptions
  : `${nodeOptions} --no-deprecation`.trim();
const builderEnv = {
  ...process.env,
  NODE_OPTIONS: builderNodeOptions,
};

const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx ${builderArgs.join(" ")}`], {
      stdio: "inherit",
      shell: false,
      env: builderEnv,
    })
  : spawnSync("npx", builderArgs, {
      stdio: "inherit",
      shell: false,
      env: builderEnv,
    });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(outputAbs) || !fs.statSync(outputAbs).isDirectory()) {
  console.error(`Desktop dist output missing: ${path.relative(root, outputAbs)}`);
  process.exit(1);
}

fs.mkdirSync(distRoot, { recursive: true });
const unpackedSource = path.join(outputAbs, "win-unpacked");
let latestMirrorPath = unpackedLatestTarget;

function isLockError(error) {
  return Boolean(error) && (error.code === "EPERM" || error.code === "EBUSY");
}

const distEntries = fs.readdirSync(distRoot, { withFileTypes: true });
const skippedLocked = [];
for (const entry of distEntries) {
  const name = entry.name;
  const fullPath = path.join(distRoot, name);
  const isGeneratedInstaller = /^FAZ-IDE-Setup-.*\.exe(?:\.blockmap)?$/i.test(name);
  const isGeneratedMeta = name === "builder-debug.yml" || name === "builder-effective-config.yaml";
  const isUnpackedDir = entry.isDirectory() && (name === "win-unpacked" || name === "win-unpacked-latest");
  if (isGeneratedInstaller || isGeneratedMeta || isUnpackedDir) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    } catch (error) {
      if (!isLockError(error)) {
        throw error;
      }
      skippedLocked.push(name);
    }
  }
}

const outputEntries = fs.readdirSync(outputAbs, { withFileTypes: true });
for (const entry of outputEntries) {
  const isGeneratedMeta = entry.name === "builder-debug.yml" || entry.name === "builder-effective-config.yaml";
  if (isGeneratedMeta) {
    continue;
  }
  const source = path.join(outputAbs, entry.name);
  const target = path.join(distRoot, entry.name);
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    if (entry.isDirectory()) {
      fs.cpSync(source, target, { recursive: true });
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target);
    }
  } catch (error) {
    if (!isLockError(error)) {
      throw error;
    }
    skippedLocked.push(entry.name);
  }
}

if (fs.existsSync(unpackedSource) && fs.statSync(unpackedSource).isDirectory()) {
  try {
    fs.rmSync(unpackedLatestTarget, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    fs.cpSync(unpackedSource, unpackedLatestTarget, { recursive: true });
  } catch (error) {
    if (!isLockError(error)) {
      throw error;
    }
    const fallbackLatest = `${unpackedLatestTarget}-run-${Date.now()}`;
    fs.rmSync(fallbackLatest, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    fs.cpSync(unpackedSource, fallbackLatest, { recursive: true });
    latestMirrorPath = fallbackLatest;
    skippedLocked.push(path.basename(unpackedLatestTarget));
  }
}

console.log("Desktop dist sync complete.");
console.log(`- Run output: ${path.relative(root, outputAbs)}`);
console.log(`- Synced release artifacts: ${path.relative(root, distRoot)}`);
if (fs.existsSync(unpackedSource) && fs.statSync(unpackedSource).isDirectory()) {
  console.log(`- Synced unpacked app (latest): ${path.relative(root, latestMirrorPath)}`);
}
if (skippedLocked.length) {
  console.log(`- Skipped locked target(s): ${Array.from(new Set(skippedLocked)).join(", ")}`);
}

process.exit(0);
