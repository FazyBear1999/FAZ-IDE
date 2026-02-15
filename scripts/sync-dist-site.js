const fs = require("node:fs");
const path = require("node:path");
const { dirPairs, filePairs } = require("./dist-site-map.js");

const root = process.cwd();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listFiles(baseDir) {
  const results = [];
  const stack = [baseDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        results.push(path.relative(baseDir, abs).replace(/\\/g, "/"));
      }
    }
  }

  return results.sort();
}

function removeEmptyDirs(baseDir) {
  if (!fs.existsSync(baseDir)) return;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      removeEmptyDirs(path.join(baseDir, entry.name));
    }
  }
  const after = fs.readdirSync(baseDir);
  if (after.length === 0) {
    fs.rmdirSync(baseDir);
  }
}

let copiedFiles = 0;
let removedFiles = 0;

for (const [srcRel, distRel] of filePairs) {
  const src = path.join(root, srcRel);
  const dist = path.join(root, distRel);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing source file: ${srcRel}`);
  }
  ensureDir(path.dirname(dist));
  fs.copyFileSync(src, dist);
  copiedFiles += 1;
}

for (const [srcRelDir, distRelDir] of dirPairs) {
  const srcDir = path.join(root, srcRelDir);
  const distDir = path.join(root, distRelDir);

  if (!fs.existsSync(srcDir)) {
    throw new Error(`Missing source directory: ${srcRelDir}`);
  }

  ensureDir(distDir);

  const srcFiles = listFiles(srcDir);
  const distFiles = fs.existsSync(distDir) ? listFiles(distDir) : [];

  for (const rel of srcFiles) {
    const src = path.join(srcDir, rel);
    const dist = path.join(distDir, rel);
    ensureDir(path.dirname(dist));
    fs.copyFileSync(src, dist);
    copiedFiles += 1;
  }

  const srcSet = new Set(srcFiles);
  for (const rel of distFiles) {
    if (!srcSet.has(rel)) {
      fs.rmSync(path.join(distDir, rel), { force: true });
      removedFiles += 1;
    }
  }

  removeEmptyDirs(distDir);
  ensureDir(distDir);
}

console.log(`dist_site synced. Copied ${copiedFiles} files, removed ${removedFiles} stale files.`);
