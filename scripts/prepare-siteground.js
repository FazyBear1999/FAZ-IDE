const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const scriptsDir = __dirname;
const distDir = path.join(root, "dist_site");
const outputRoot = path.join(root, "release", "siteground");
const publicHtmlDir = path.join(outputRoot, "public_html");

function runNodeScript(scriptName) {
  const scriptPath = path.join(scriptsDir, scriptName);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: "inherit",
    shell: false,
  });

  if (result.error || result.status !== 0) {
    const details = result.error?.message || `Exit code ${result.status}`;
    throw new Error(`Failed while running ${scriptName}: ${details}`);
  }
}

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error("dist_site folder was not found.");
  }

  runNodeScript("sync-dist-site.js");
  runNodeScript("verify-dist-site-sync.js");

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(publicHtmlDir, { recursive: true });

  fs.cpSync(distDir, publicHtmlDir, { recursive: true, force: true });

  const indexPath = path.join(publicHtmlDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    throw new Error("public_html/index.html is missing after preparation.");
  }

  const notePath = path.join(outputRoot, "DEPLOY.txt");
  const publicHtmlRelative = path.relative(outputRoot, publicHtmlDir).replace(/\\/g, "/");
  fs.writeFileSync(
    notePath,
    [
      "SiteGround deployment package prepared.",
      "Upload the public_html folder contents (or extract this folder on server).",
      "Path:",
      `./${publicHtmlRelative || "public_html"}`,
      "",
    ].join("\n"),
    "utf8"
  );

  runNodeScript("verify-siteground-package.js");

  console.log("SiteGround package is ready.");
  console.log(`- Source: ${distDir}`);
  console.log(`- Output: ${publicHtmlDir}`);
  console.log(`- Note: ${notePath}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  process.exit(1);
}
