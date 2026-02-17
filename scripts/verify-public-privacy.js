const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = process.cwd();
const failures = [];
let scannedFiles = 0;

const scanTargets = [
  { relPath: "dist_site", required: true },
  { relPath: "release/siteground/public_html", required: true },
  { relPath: "release/siteground/DEPLOY.txt", required: true },
  { relPath: "dist", required: false },
  { relPath: "dist_icon_release", required: false },
];

const bannedFiles = [
  "dist/builder-debug.yml",
  "dist/builder-effective-config.yaml",
  "dist_icon_release/builder-debug.yml",
  "dist_icon_release/builder-effective-config.yaml",
];

const textExtensions = new Set([
  ".txt",
  ".md",
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".webmanifest",
  ".yml",
  ".yaml",
  ".svg",
  ".xml",
  ".map",
]);

const textBasenames = new Set([".htaccess", "DEPLOY.txt"]);

function fail(message) {
  failures.push(message);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function shouldScanFile(absPath) {
  const base = path.basename(absPath);
  if (textBasenames.has(base)) return true;
  return textExtensions.has(path.extname(base).toLowerCase());
}

function collectFiles(absPath, out) {
  if (!fs.existsSync(absPath)) return;
  const stat = fs.statSync(absPath);
  if (stat.isFile()) {
    out.push(absPath);
    return;
  }
  if (!stat.isDirectory()) return;

  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  for (const entry of entries) {
    collectFiles(path.join(absPath, entry.name), out);
  }
}

function lineNumberAt(content, index) {
  if (index <= 0) return 1;
  return content.slice(0, index).split(/\r?\n/).length;
}

function isAllowedVendorPathMatch(relPath, patternLabel, matchValue) {
  const rel = String(relPath || "").replace(/\\/g, "/").toLowerCase();
  const value = String(matchValue || "").toLowerCase();
  const label = String(patternLabel || "").toLowerCase();

  const isVendoredPyodide = rel.includes("/assets/vendor/pyodide/") || rel.includes("/vendor/pyodide/");
  if (!isVendoredPyodide) return false;

  if (label === "absolute linux home path" && value.startsWith("/home/")) {
    return true;
  }

  return false;
}

const usernameCandidates = Array.from(
  new Set(
    [
      process.env.USERNAME,
      process.env.USER,
      process.env.LOGNAME,
      os.userInfo().username,
    ].filter(Boolean)
  )
);

const patterns = [
  {
    label: "absolute Windows user path",
    regex: /[a-zA-Z]:\\Users\\[^\\\r\n]+/g,
  },
  {
    label: "absolute macOS user path",
    regex: /\/Users\/[^/\r\n]+/g,
  },
  {
    label: "absolute Linux home path",
    regex: /\/home\/[^/\r\n]+/g,
  },
  {
    label: "Windows temp profile path",
    regex: /AppData\\Local\\Temp\\[^\\\r\n]+/g,
  },
];

for (const username of usernameCandidates) {
  patterns.push({
    label: `current username token (${username})`,
    regex: new RegExp(`\\b${escapeRegExp(username)}\\b`, "gi"),
  });
}

function scanFile(absPath) {
  if (!shouldScanFile(absPath)) return;

  let content = "";
  try {
    content = fs.readFileSync(absPath, "utf8");
  } catch (error) {
    fail(
      `Unable to read ${path.relative(root, absPath)}: ${error?.message || String(error)}`
    );
    return;
  }

  scannedFiles += 1;
  const rel = path.relative(root, absPath).replace(/\\/g, "/");

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(content);
    if (!match) continue;

    if (isAllowedVendorPathMatch(rel, pattern.label, match[0])) {
      continue;
    }

    const line = lineNumberAt(content, match.index);
    fail(`${rel}:${line} leaked ${pattern.label}: ${match[0]}`);
    break;
  }
}

function main() {
  for (const rel of bannedFiles) {
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      fail(`Banned release metadata file exists: ${rel}`);
    }
  }

  for (const target of scanTargets) {
    const abs = path.join(root, target.relPath);
    if (!fs.existsSync(abs)) {
      if (target.required) {
        fail(
          `Missing required release target: ${target.relPath} (run deploy/build pipeline first)`
        );
      }
      continue;
    }

    const files = [];
    collectFiles(abs, files);
    for (const file of files) {
      scanFile(file);
    }
  }

  if (failures.length) {
    console.error(
      `Public privacy verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`
    );
    for (const message of failures) {
      console.error(`- ${message}`);
    }
    process.exit(1);
  }

  console.log("Public privacy verification passed.");
  console.log(`- Files scanned: ${scannedFiles}`);
  console.log(`- Checked targets: ${scanTargets.length}`);
  console.log(`- Username tokens checked: ${usernameCandidates.length}`);
}

try {
  main();
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
