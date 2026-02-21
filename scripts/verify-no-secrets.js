const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = process.cwd();
const failures = [];
let scanned = 0;

const maxFileBytes = 1024 * 1024;

const skipPrefixes = [
  "node_modules/",
  "artifacts/",
  "release/",
  "dist/",
  "dist_site/",
  "build/",
  "assets/vendor/",
];

const skipExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".gz",
  ".wasm",
]);

const patterns = [
  { label: "private key block", regex: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/i },
  { label: "GitHub personal access token", regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { label: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/ },
  { label: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { label: "Supabase JWT-like key", regex: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/ },
  { label: "generic API key assignment", regex: /(?:api[_-]?key|secret|token)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{24,}["']/i },
];

const allowedFragments = [
  "YOUR_SUPABASE_ANON_PUBLIC_KEY",
  "YOUR_PROJECT_REF",
  "example",
  "placeholder",
];

function fail(message) {
  failures.push(message);
}

function isSkippedFile(relPath) {
  const normalized = String(relPath || "").replace(/\\/g, "/");
  if (!normalized) return true;
  if (skipPrefixes.some((prefix) => normalized.startsWith(prefix))) return true;
  const ext = path.extname(normalized).toLowerCase();
  return skipExtensions.has(ext);
}

function lineFromIndex(content, index) {
  if (index <= 0) return 1;
  return content.slice(0, index).split(/\r?\n/).length;
}

function hasAllowedFragment(text = "") {
  return allowedFragments.some((fragment) => text.includes(fragment));
}

function scanFile(relPath) {
  if (isSkippedFile(relPath)) return;
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (!stat.isFile() || stat.size > maxFileBytes) return;

  let content = "";
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    return;
  }

  scanned += 1;
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(content);
    if (!match) continue;
    if (hasAllowedFragment(match[0])) continue;
    const line = lineFromIndex(content, match.index);
    fail(`${relPath}:${line} potential secret (${pattern.label})`);
  }
}

function main() {
  let output = "";
  try {
    output = execSync("git ls-files", { cwd: root, encoding: "utf8" });
  } catch (error) {
    console.error(error?.message || String(error));
    process.exit(1);
  }

  const files = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  files.forEach(scanFile);

  if (failures.length) {
    console.error(`Secret verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exit(1);
  }

  console.log("Secret verification passed.");
  console.log(`- Tracked files scanned: ${scanned}`);
}

main();
