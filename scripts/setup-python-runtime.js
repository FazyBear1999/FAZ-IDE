const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const VERSION = "0.27.2";
const ROOT = process.cwd();
const TARGET_DIR = path.join(ROOT, "assets", "vendor", "pyodide", `v${VERSION}`, "full");
const BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full`;
const REQUIRED_FILES = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
];
const OPTIONAL_FILES = [
  "pyodide-lock.json",
  "repodata.json",
];
const FILES = [...REQUIRED_FILES, ...OPTIONAL_FILES];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileOk(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        download(res.headers.location, outPath).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const tempPath = `${outPath}.tmp`;
      const stream = fs.createWriteStream(tempPath);
      res.pipe(stream);
      stream.on("finish", () => {
        stream.close(() => {
          fs.renameSync(tempPath, outPath);
          resolve();
        });
      });
      stream.on("error", (err) => {
        try { fs.rmSync(tempPath, { force: true }); } catch {}
        reject(err);
      });
    });

    request.on("error", reject);
    request.setTimeout(30000, () => {
      request.destroy(new Error(`Timeout downloading ${url}`));
    });
  });
}

async function main() {
  const verifyOnly = process.argv.includes("--verify");
  ensureDir(TARGET_DIR);

  const missingRequired = REQUIRED_FILES.filter((name) => !fileOk(path.join(TARGET_DIR, name)));
  if (verifyOnly) {
    if (!missingRequired.length) {
      console.log(`Python runtime bundle verified: ${TARGET_DIR}`);
      console.log(`Required files present: ${REQUIRED_FILES.length}`);
      return;
    }
    console.error(`Python runtime bundle missing required files (${missingRequired.length}):`);
    missingRequired.forEach((name) => console.error(`- ${name}`));
    process.exitCode = 1;
    return;
  }

  const optionalFailures = [];

  for (const name of REQUIRED_FILES) {
    const outPath = path.join(TARGET_DIR, name);
    if (fileOk(outPath)) {
      console.log(`skip ${name} (already present)`);
      continue;
    }
    const url = `${BASE_URL}/${name}`;
    process.stdout.write(`download ${name} ... `);
    await download(url, outPath);
    console.log("ok");
  }

  for (const name of OPTIONAL_FILES) {
    const outPath = path.join(TARGET_DIR, name);
    if (fileOk(outPath)) {
      console.log(`skip ${name} (already present)`);
      continue;
    }
    const url = `${BASE_URL}/${name}`;
    process.stdout.write(`download ${name} ... `);
    try {
      await download(url, outPath);
      console.log("ok");
    } catch (err) {
      console.log(`skip (${err.message || String(err)})`);
      optionalFailures.push({ name, reason: err.message || String(err) });
    }
  }

  const stillMissing = REQUIRED_FILES.filter((name) => !fileOk(path.join(TARGET_DIR, name)));
  if (stillMissing.length) {
    throw new Error(`Bundle incomplete. Missing: ${stillMissing.join(", ")}`);
  }

  console.log(`Python runtime bundle ready: ${TARGET_DIR}`);
  if (optionalFailures.length) {
    console.log(`Optional files skipped: ${optionalFailures.map((entry) => entry.name).join(", ")}`);
  }
  console.log("Tip: this enables local-first Python runtime loading and improves offline support.");
}

main().catch((err) => {
  console.error(`python runtime setup failed: ${err.message || String(err)}`);
  process.exitCode = 1;
});
