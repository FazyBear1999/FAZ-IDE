const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadLocalReleaseEnv } = require("./load-local-release-env");

const root = process.cwd();
loadLocalReleaseEnv({ rootDir: root, silent: true });
const scriptsDir = __dirname;
const distDir = path.join(root, "dist_site");
const outputRoot = path.join(root, "release", "siteground");
const publicHtmlDir = path.join(outputRoot, "public_html");
const requireCloudAuth = ["1", "true", "yes", "on"].includes(
  String(process.env.REQUIRE_CLOUD_AUTH || "").trim().toLowerCase()
);

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

function applyAuthOverrides(publicDir, {
  supabaseUrl = "",
  supabaseAnonKey = "",
  oauthRedirectPath = "/",
} = {}) {
  const hasUrl = Boolean(String(supabaseUrl || "").trim());
  const hasAnon = Boolean(String(supabaseAnonKey || "").trim());
  if (!hasUrl && !hasAnon) {
    return { applied: false, reason: "not-provided" };
  }
  if (hasUrl !== hasAnon) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must both be set when enabling cloud auth in deploy package.");
  }

  const configTargetPath = path.join(publicDir, "assets", "js", "config.js");
  if (!fs.existsSync(configTargetPath)) {
    throw new Error("Cannot apply auth overrides: public_html/assets/js/config.js is missing.");
  }

  const source = fs.readFileSync(configTargetPath, "utf8");
  const normalizedUrl = String(supabaseUrl || "").trim();
  const normalizedAnon = String(supabaseAnonKey || "").trim();
  const normalizedRedirect = String(oauthRedirectPath || "/").trim() || "/";

  const updated = source
    .replace(/SUPABASE_URL:\s*"[^"]*"/, `SUPABASE_URL: "${normalizedUrl}"`)
    .replace(/SUPABASE_ANON_KEY:\s*"[^"]*"/, `SUPABASE_ANON_KEY: "${normalizedAnon}"`)
    .replace(/OAUTH_REDIRECT_PATH:\s*"[^"]*"/, `OAUTH_REDIRECT_PATH: "${normalizedRedirect}"`);

  if (updated === source) {
    throw new Error("Auth override failed: expected AUTH fields were not found in packaged config.js.");
  }

  fs.writeFileSync(configTargetPath, updated, "utf8");
  return { applied: true, reason: "env-injected" };
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
  if (requireCloudAuth && (!String(process.env.SUPABASE_URL || "").trim() || !String(process.env.SUPABASE_ANON_KEY || "").trim())) {
    throw new Error("REQUIRE_CLOUD_AUTH is enabled, but SUPABASE_URL/SUPABASE_ANON_KEY were not both provided. Aborting package generation.");
  }
  const authOverrideResult = applyAuthOverrides(publicHtmlDir, {
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    oauthRedirectPath: process.env.SUPABASE_OAUTH_REDIRECT_PATH || "/",
  });

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
      authOverrideResult.applied
        ? "Cloud auth values injected into deploy package via SUPABASE_URL + SUPABASE_ANON_KEY."
        : "Cloud auth values not injected (SUPABASE_URL/SUPABASE_ANON_KEY not provided); package stays local-only.",
      `Cloud auth strict mode: ${requireCloudAuth ? "enabled" : "disabled"}.`,
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
