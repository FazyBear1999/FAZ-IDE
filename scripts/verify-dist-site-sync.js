const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { dirPairs, filePairs } = require("./dist-site-map.js");

const root = process.cwd();

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function collectFiles(baseDir) {
  const out = [];
  const stack = [baseDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(path.relative(baseDir, abs).replace(/\\/g, "/"));
      }
    }
  }

  out.sort();
  return out;
}

const failures = [];
let comparedFiles = 0;

function fail(message) {
  failures.push(message);
}

function compareFilePair(srcRel, distRel) {
  const src = path.join(root, srcRel);
  const dist = path.join(root, distRel);

  if (!fs.existsSync(src)) {
    fail(`Missing source file: ${srcRel}`);
    return;
  }
  if (!fs.existsSync(dist)) {
    fail(`Missing dist file: ${distRel}`);
    return;
  }

  const srcHash = sha256(src);
  const distHash = sha256(dist);
  comparedFiles += 1;

  if (srcHash !== distHash) {
    fail(`Content mismatch: ${srcRel} <> ${distRel}`);
  }
}

function compareDirPair(srcRelDir, distRelDir) {
  const srcDir = path.join(root, srcRelDir);
  const distDir = path.join(root, distRelDir);

  if (!fs.existsSync(srcDir)) {
    fail(`Missing source directory: ${srcRelDir}`);
    return;
  }
  if (!fs.existsSync(distDir)) {
    fail(`Missing dist directory: ${distRelDir}`);
    return;
  }

  const srcFiles = collectFiles(srcDir);
  const distFiles = collectFiles(distDir);

  const srcOnly = srcFiles.filter((rel) => !distFiles.includes(rel));
  const distOnly = distFiles.filter((rel) => !srcFiles.includes(rel));

  for (const rel of srcOnly) {
    fail(`Missing dist file: ${distRelDir}/${rel}`);
  }
  for (const rel of distOnly) {
    fail(`Extra dist file (not in source): ${distRelDir}/${rel}`);
  }

  const common = srcFiles.filter((rel) => distFiles.includes(rel));
  for (const rel of common) {
    const src = path.join(srcDir, rel);
    const dist = path.join(distDir, rel);
    comparedFiles += 1;
    if (sha256(src) !== sha256(dist)) {
      fail(`Content mismatch: ${srcRelDir}/${rel} <> ${distRelDir}/${rel}`);
    }
  }
}

for (const [srcRel, distRel] of filePairs) {
  compareFilePair(srcRel, distRel);
}

for (const [srcRelDir, distRelDir] of dirPairs) {
  compareDirPair(srcRelDir, distRelDir);
}

if (failures.length) {
  console.error(`dist_site sync check failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`dist_site sync check passed. Compared ${comparedFiles} files.`);
