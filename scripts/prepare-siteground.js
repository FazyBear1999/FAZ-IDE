const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = process.cwd();
const scriptsDir = __dirname;
const distDir = path.join(root, "dist_site");
const outputRoot = path.join(root, "release", "siteground");
const publicHtmlDir = path.join(outputRoot, "public_html");

function normalizeSiteUrl(raw = "") {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function applySiteUrlOverrides(publicDir, siteUrl) {
  if (!siteUrl) return;

  const canonicalUrl = `${siteUrl}/`;
  const indexPath = path.join(publicDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const source = fs.readFileSync(indexPath, "utf8");
    const updated = source
      .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
      .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonicalUrl}" />`)
      .replace(/"url"\s*:\s*"\.\/"/g, `"url": "${canonicalUrl}"`)
      .replace(/"@id"\s*:\s*"\.\/#/g, `"@id": "${canonicalUrl}#`);
    if (updated !== source) {
      fs.writeFileSync(indexPath, updated, "utf8");
    }
  }

  const sitemapPath = path.join(publicDir, "sitemap.xml");
  if (fs.existsSync(sitemapPath)) {
    const source = fs.readFileSync(sitemapPath, "utf8");
    const updated = source.replace(/<loc>[^<]*<\/loc>/, `<loc>${canonicalUrl}</loc>`);
    if (updated !== source) {
      fs.writeFileSync(sitemapPath, updated, "utf8");
    }
  }
}

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

  const siteUrl = normalizeSiteUrl(process.env.SITE_URL || "");
  applySiteUrlOverrides(publicHtmlDir, siteUrl);

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
      siteUrl
        ? `SITE_URL applied: ${siteUrl}/`
        : "SITE_URL not provided (canonical/og:url remain relative and sitemap keeps default placeholder domain).",
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
