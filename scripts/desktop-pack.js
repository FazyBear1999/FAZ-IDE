const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const outputDir = `dist_pack_check/run-${Date.now()}`;
const outputAbs = path.join(root, outputDir);
const distRoot = path.join(root, "dist");
const unpackedLatestTarget = path.join(distRoot, "win-unpacked-latest");
const builderArgs = [
  "electron-builder",
  "--dir",
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

const unpackedSource = path.join(outputAbs, "win-unpacked");
const unpackedTarget = path.join(distRoot, "win-unpacked");

function isLockError(error) {
  return Boolean(error) && (error.code === "EPERM" || error.code === "EBUSY");
}

function mirrorDirectoryWithFallback(source, target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
    fs.cpSync(source, target, { recursive: true });
    return { targetPath: target, usedFallback: false };
  } catch (error) {
    if (!isLockError(error)) {
      throw error;
    }
    const fallback = `${target}-run-${Date.now()}`;
    fs.rmSync(fallback, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    fs.cpSync(source, fallback, { recursive: true });
    return { targetPath: fallback, usedFallback: true };
  }
}

if (!fs.existsSync(unpackedSource) || !fs.statSync(unpackedSource).isDirectory()) {
  console.error(`Desktop pack output missing: ${path.relative(root, unpackedSource)}`);
  process.exit(1);
}

fs.mkdirSync(distRoot, { recursive: true });
const latestMirror = mirrorDirectoryWithFallback(unpackedSource, unpackedLatestTarget);

let primarySynced = false;
try {
  fs.rmSync(unpackedTarget, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  fs.cpSync(latestMirror.targetPath, unpackedTarget, { recursive: true });
  primarySynced = true;
} catch (error) {
  if (!isLockError(error)) {
    throw error;
  }
}

console.log("Desktop pack sync complete.");
console.log(`- Run output: ${path.relative(root, outputAbs)}`);
console.log(`- Synced unpacked app (latest): ${path.relative(root, latestMirror.targetPath)}`);
if (latestMirror.usedFallback) {
  console.log(`- Latest mirror fallback used (locked target): ${path.relative(root, unpackedLatestTarget)}`);
}
if (primarySynced) {
  console.log(`- Synced unpacked app (primary): ${path.relative(root, unpackedTarget)}`);
} else {
  console.log(`- Primary sync skipped (folder locked): ${path.relative(root, unpackedTarget)}`);
}

process.exit(0);
