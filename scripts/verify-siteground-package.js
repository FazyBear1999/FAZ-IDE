const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const outputRoot = path.join(root, "release", "siteground");
const publicHtmlDir = path.join(outputRoot, "public_html");

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
  "assets/icons",
  "assets/js",
  "assets/vendor",
];

const failures = [];

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
