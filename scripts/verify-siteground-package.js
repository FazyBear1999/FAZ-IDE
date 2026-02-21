const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const distDir = path.join(root, "dist_site");
const outputRoot = path.join(root, "release", "siteground");
const publicHtmlDir = path.join(outputRoot, "public_html");
const configPath = path.join(root, "assets", "js", "config.js");
const deployedConfigPath = path.join(publicHtmlDir, "assets", "js", "config.js");
const requireCloudAuth = ["1", "true", "yes", "on"].includes(
  String(process.env.REQUIRE_CLOUD_AUTH || "").trim().toLowerCase()
);

const allowedMutableFiles = new Set([
  "index.html",
  "sitemap.xml",
  "assets/js/config.js",
]);

const requiredFiles = [
  "index.html",
  "manifest.webmanifest",
  ".htaccess",
  "robots.txt",
  "sitemap.xml",
  "favicon.ico",
  "assets/css/base.css",
  "assets/js/app.js",
  "assets/icons/faz-192.svg",
  "assets/vendor/acorn/acorn.mjs",
];

const requiredDirs = [
  "assets/apps",
  "assets/css",
  "assets/games",
  "assets/lessons",
  "assets/icons",
  "assets/js",
  "assets/vendor",
];

const failures = [];
let parityComparedFiles = 0;

function fail(message) {
  failures.push(message);
}

function assertExists(relPath) {
  const abs = path.join(publicHtmlDir, relPath);
  if (!fs.existsSync(abs)) {
    fail(`Missing required path: public_html/${relPath}`);
  }
}

function assertDirectoryNotEmpty(relDir) {
  const absDir = path.join(publicHtmlDir, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    fail(`Missing required directory: public_html/${relDir}`);
    return;
  }
  const entries = fs.readdirSync(absDir);
  if (!entries.length) {
    fail(`Required directory is empty: public_html/${relDir}`);
  }
}

function collectTemplateSourcePathsFromConfig() {
  if (!fs.existsSync(configPath)) {
    fail(`Missing config file: ${path.relative(root, configPath).replace(/\\/g, "/")}`);
    return [];
  }
  const source = fs.readFileSync(configPath, "utf8");
  const matches = Array.from(source.matchAll(/src:\s*["']\.\/([^"']+)["']/g));
  const unique = new Set();
  matches.forEach((match) => {
    const rel = String(match?.[1] || "").trim();
    if (!rel) return;
    unique.add(rel.replace(/\\/g, "/"));
  });
  return [...unique].sort();
}

function assertTemplateSourcesDeployed() {
  const templateSources = collectTemplateSourcePathsFromConfig();
  for (const relPath of templateSources) {
    const sourceAbs = path.join(root, relPath);
    const deployedAbs = path.join(publicHtmlDir, relPath);
    if (!fs.existsSync(sourceAbs)) {
      fail(`Config template source missing in workspace: ${relPath}`);
      continue;
    }
    if (!fs.existsSync(deployedAbs)) {
      fail(`Missing deployed template source: public_html/${relPath}`);
    }
  }
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

function sha256(filePath) {
  const crypto = require("node:crypto");
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function assertDistToPublicParity() {
  if (!fs.existsSync(distDir)) {
    fail("Missing dist_site directory for parity verification.");
    return;
  }
  if (!fs.existsSync(publicHtmlDir)) {
    fail("Missing public_html directory for parity verification.");
    return;
  }

  const distFiles = collectFiles(distDir);
  const publicFiles = collectFiles(publicHtmlDir);

  const distOnly = distFiles.filter((rel) => !publicFiles.includes(rel));
  const publicOnly = publicFiles.filter((rel) => !distFiles.includes(rel));

  for (const rel of distOnly) {
    fail(`Missing deployed file from dist_site: public_html/${rel}`);
  }
  for (const rel of publicOnly) {
    fail(`Extra deployed file not present in dist_site: public_html/${rel}`);
  }

  const commonFiles = distFiles.filter((rel) => publicFiles.includes(rel));
  for (const rel of commonFiles) {
    if (allowedMutableFiles.has(rel)) continue;
    const distAbs = path.join(distDir, rel);
    const publicAbs = path.join(publicHtmlDir, rel);
    parityComparedFiles += 1;
    if (sha256(distAbs) !== sha256(publicAbs)) {
      fail(`Content mismatch between dist_site and public_html: ${rel}`);
    }
  }
}

function assertCloudAuthConfiguredWhenRequired() {
  if (!requireCloudAuth) return;
  if (!fs.existsSync(deployedConfigPath)) {
    fail("Cloud auth verification failed: missing public_html/assets/js/config.js.");
    return;
  }

  const source = fs.readFileSync(deployedConfigPath, "utf8");
  const urlMatch = source.match(/SUPABASE_URL:\s*"([^"]*)"/);
  const anonMatch = source.match(/SUPABASE_ANON_KEY:\s*"([^"]*)"/);
  const supabaseUrl = String(urlMatch?.[1] || "").trim();
  const supabaseAnon = String(anonMatch?.[1] || "").trim();

  if (!supabaseUrl || !supabaseAnon) {
    fail("Cloud auth verification failed: REQUIRE_CLOUD_AUTH=1 but packaged SUPABASE_URL/SUPABASE_ANON_KEY are empty.");
    return;
  }

  const looksLikeUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
  if (!looksLikeUrl) {
    fail(`Cloud auth verification failed: SUPABASE_URL looks invalid (${supabaseUrl}).`);
  }
}

if (!fs.existsSync(outputRoot)) {
  fail("release/siteground folder was not found.");
}

if (!fs.existsSync(publicHtmlDir)) {
  fail("release/siteground/public_html folder was not found.");
}

for (const relDir of requiredDirs) {
  assertDirectoryNotEmpty(relDir);
}

for (const relFile of requiredFiles) {
  assertExists(relFile);
}

assertTemplateSourcesDeployed();
assertDistToPublicParity();
assertCloudAuthConfiguredWhenRequired();

const deployNotePath = path.join(outputRoot, "DEPLOY.txt");
if (!fs.existsSync(deployNotePath)) {
  fail("Missing release/siteground/DEPLOY.txt note.");
}

if (failures.length) {
  console.error(`SiteGround package verification failed (${failures.length} issue${failures.length === 1 ? "" : "s"}).`);
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("SiteGround package verification passed.");
console.log(`- Verified root: ${publicHtmlDir}`);
console.log(`- Required directories: ${requiredDirs.length}`);
console.log(`- Required files: ${requiredFiles.length}`);
console.log(`- Dist/public parity files compared: ${parityComparedFiles}`);
console.log(`- Cloud auth required: ${requireCloudAuth ? "yes" : "no"}`);
