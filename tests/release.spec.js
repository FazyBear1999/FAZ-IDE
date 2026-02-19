const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

test("manifest is reachable and valid", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(Boolean(manifest.name || manifest.short_name)).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("critical static assets are reachable", async ({ request }) => {
  const requiredAssets = [
    "/assets/js/app.js",
    "/assets/js/config.js",
    "/assets/css/base.css",
    "/assets/css/components.css",
    "/assets/vendor/acorn/acorn.mjs",
    "/favicon.ico",
  ];

  for (const assetPath of requiredAssets) {
    const response = await request.get(assetPath);
    expect(response.ok(), `${assetPath} should be reachable`).toBeTruthy();
  }
});

test("release contract: css gate is present in quick and all pipelines", () => {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const scripts = pkg?.scripts || {};

  const testCss = String(scripts["test:css"] || "");
  const testQuick = String(scripts["test:quick"] || "");
  const testAll = String(scripts["test:all"] || "");

  expect(testCss).toContain("npm run css:lint");
  expect(testCss).toContain("npm run css:audit:imports");
  expect(testQuick).toContain("npm run test:css");
  expect(testAll).toContain("npm run test:css");

  const parseSteps = (value) => String(value || "")
    .split("&&")
    .map((step) => step.trim())
    .filter(Boolean);

  const quickSteps = parseSteps(testQuick);
  const allSteps = parseSteps(testAll);

  const indexOfStep = (steps, step) => steps.findIndex((entry) => entry === step);

  const quickIntegrityIndex = indexOfStep(quickSteps, "npm run test:integrity");
  const quickCssIndex = indexOfStep(quickSteps, "npm run test:css");
  const quickPlaywrightIndex = indexOfStep(quickSteps, "npm run test");
  expect(quickIntegrityIndex).toBeGreaterThanOrEqual(0);
  expect(quickCssIndex).toBeGreaterThan(quickIntegrityIndex);
  expect(quickPlaywrightIndex).toBeGreaterThan(quickCssIndex);

  const allIntegrityIndex = indexOfStep(allSteps, "npm run test:integrity");
  const allCssIndex = indexOfStep(allSteps, "npm run test:css");
  const allPlaywrightIndex = indexOfStep(allSteps, "npm run test");
  expect(allIntegrityIndex).toBeGreaterThanOrEqual(0);
  expect(allCssIndex).toBeGreaterThan(allIntegrityIndex);
  expect(allPlaywrightIndex).toBeGreaterThan(allCssIndex);
});

test("release contract: ai verify runs css gate before changed and smoke suites", () => {
  const aiVerifyPath = path.join(process.cwd(), "scripts", "ai-verify.js");
  const source = fs.readFileSync(aiVerifyPath, "utf8");

  const memoryIndex = source.indexOf('"test:memory"');
  const cssIndex = source.indexOf('"test:css"');
  const changedIndex = source.indexOf('"test:changed"');
  const smokeIndex = source.indexOf('"test:smoke"');

  expect(memoryIndex).toBeGreaterThanOrEqual(0);
  expect(cssIndex).toBeGreaterThan(memoryIndex);
  expect(changedIndex).toBeGreaterThan(cssIndex);
  expect(smokeIndex).toBeGreaterThan(changedIndex);
});

test("release contract: modal css optimization keeps deduped selector contract", () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "components.css");
  const source = fs.readFileSync(cssPath, "utf8");

  const sharedModalSelector = ":is(#editorHistoryPanel, #shortcutHelpPanel, #editorSettingsPanel) .layout-header";
  expect(source.includes(sharedModalSelector)).toBeTruthy();

  const sharedActionsSelector = /#editorHistoryPanel\s+\.editor-history-actions\s+button\s*,\s*#shortcutHelpPanel\s+#shortcutHelpClose\s*,\s*#editorSettingsPanel\s+\.layout-header\s*>\s*button/;
  expect(sharedActionsSelector.test(source)).toBeTruthy();

  const legacyStandalone = /#editorHistoryPanel\s+\.editor-history-actions\s+button\s*\{/g;
  const legacyMatches = source.match(legacyStandalone) || [];
  expect(legacyMatches.length).toBe(0);
});

test("release contract: search panel css keeps shared deduped selectors", () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "components.css");
  const source = fs.readFileSync(cssPath, "utf8");

  const sharedPanelSelector = ":is(#editorSearchPanel, #symbolPalette, #projectSearchPanel)";
  expect(source.includes(sharedPanelSelector)).toBeTruthy();

  const legacyEditorStandalone = /#editorSearchPanel\s*\{[^}]*border-radius:\s*0;/g;
  const legacySymbolStandalone = /#symbolPalette\s*\{[^}]*border-radius:\s*0;/g;
  const legacyProjectStandalone = /#projectSearchPanel\s*\{[^}]*border-radius:\s*0;/g;
  expect((source.match(legacyEditorStandalone) || []).length).toBe(0);
  expect((source.match(legacySymbolStandalone) || []).length).toBe(0);
  expect((source.match(legacyProjectStandalone) || []).length).toBe(0);
});

test("release contract: footer runtime status selector includes zoom chip", () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "layout.css");
  const source = fs.readFileSync(cssPath, "utf8");

  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"ok\"]")).toBeTruthy();
  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"warn\"]")).toBeTruthy();
  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"error\"]")).toBeTruthy();
});

test("release contract: themes css keeps deduped retro and purple input selector lists", () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "themes.css");
  const source = fs.readFileSync(cssPath, "utf8");

  expect(source.includes(':root[data-theme="retro"] :is(#quickOpenInput, #commandPaletteInput, #topCommandPaletteInput, #editorFindInput, #editorReplaceInput, #symbolSearchInput, #projectSearchInput, #projectReplaceInput)')).toBeTruthy();
  expect(source.includes(':root[data-theme="purple"] :is(#quickOpenInput, #commandPaletteInput, #editorFindInput, #editorReplaceInput, #symbolSearchInput, #projectSearchInput, #projectReplaceInput)')).toBeTruthy();

  const legacyRetroList = /:root\[data-theme="retro"\]\s+#quickOpenInput\s*,\s*:root\[data-theme="retro"\]\s+#commandPaletteInput/;
  const legacyPurpleList = /:root\[data-theme="purple"\]\s+#quickOpenInput\s*,\s*:root\[data-theme="purple"\]\s+#commandPaletteInput/;
  expect(legacyRetroList.test(source)).toBeFalsy();
  expect(legacyPurpleList.test(source)).toBeFalsy();
});

test("release contract: frank full-gate includes css stage", () => {
  const franklinPath = path.join(process.cwd(), "scripts", "franklin.js");
  const source = fs.readFileSync(franklinPath, "utf8");

  const integrityIndex = source.indexOf('{ script: "test:integrity"');
  const cssIndex = source.indexOf('{ script: "test:css"');
  const testIndex = source.indexOf('{ script: "test"');

  expect(integrityIndex).toBeGreaterThanOrEqual(0);
  expect(cssIndex).toBeGreaterThan(integrityIndex);
  expect(testIndex).toBeGreaterThan(cssIndex);
});

test("release contract: seo metadata and web crawler files are present", () => {
  const indexPath = path.join(process.cwd(), "index.html");
  const manifestPath = path.join(process.cwd(), "manifest.webmanifest");
  const robotsPath = path.join(process.cwd(), "robots.txt");
  const sitemapPath = path.join(process.cwd(), "sitemap.xml");

  const indexSource = fs.readFileSync(indexPath, "utf8");
  const manifestSource = fs.readFileSync(manifestPath, "utf8");

  expect(indexSource.includes('name="robots"')).toBeTruthy();
  expect(indexSource.includes('property="og:title"')).toBeTruthy();
  expect(indexSource.includes('property="og:description"')).toBeTruthy();
  expect(indexSource.includes('name="twitter:card"')).toBeTruthy();
  expect(indexSource.includes('rel="apple-touch-icon"')).toBeTruthy();
  expect(indexSource.includes('assets/icons/faz-192.png')).toBeTruthy();
  expect(indexSource.includes('assets/icons/faz-512.png')).toBeTruthy();

  expect(manifestSource.includes('"./assets/icons/faz-192.png"')).toBeTruthy();
  expect(manifestSource.includes('"./assets/icons/faz-512.png"')).toBeTruthy();

  expect(fs.existsSync(robotsPath)).toBeTruthy();
  expect(fs.existsSync(sitemapPath)).toBeTruthy();
});

test("release contract: dist-site map includes lessons and package verification checks config template sources", () => {
  const distMapPath = path.join(process.cwd(), "scripts", "dist-site-map.js");
  const verifyDistPath = path.join(process.cwd(), "scripts", "verify-dist-site-sync.js");
  const verifySitegroundPath = path.join(process.cwd(), "scripts", "verify-siteground-package.js");

  const distMapSource = fs.readFileSync(distMapPath, "utf8");
  const verifyDistSource = fs.readFileSync(verifyDistPath, "utf8");
  const verifySitegroundSource = fs.readFileSync(verifySitegroundPath, "utf8");

  expect(distMapSource.includes('["assets/lessons", "dist_site/assets/lessons"]')).toBeTruthy();
  expect(verifyDistSource.includes("collectTemplateSourcePathsFromConfig")).toBeTruthy();
  expect(verifyDistSource.includes("Config template source missing in dist_site")).toBeTruthy();
  expect(verifySitegroundSource.includes("collectTemplateSourcePathsFromConfig")).toBeTruthy();
  expect(verifySitegroundSource.includes("Missing deployed template source")).toBeTruthy();
});

test("release contract: ai-memory markdown remains isolated from runtime wiring", () => {
  const indexPath = path.join(process.cwd(), "index.html");
  const appPath = path.join(process.cwd(), "assets", "js", "app.js");
  const swPath = path.join(process.cwd(), "assets", "js", "sw.js");

  const indexSource = fs.readFileSync(indexPath, "utf8");
  const appSource = fs.readFileSync(appPath, "utf8");
  const swSource = fs.readFileSync(swPath, "utf8");

  const forbiddenMemoryRefs = [
    "docs/ai-memory",
    "./docs/ai-memory",
    "../docs/ai-memory",
  ];

  for (const marker of forbiddenMemoryRefs) {
    expect(indexSource.includes(marker)).toBeFalsy();
    expect(appSource.includes(marker)).toBeFalsy();
    expect(swSource.includes(marker)).toBeFalsy();
  }

  const coreAssetsArrayMatch = swSource.match(/const\s+CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  const coreAssetsBody = String(coreAssetsArrayMatch?.[1] || "");
  expect(coreAssetsBody.includes("docs/ai-memory")).toBeFalsy();
});

test("release contract: worker and core javascript wiring remain valid", () => {
  const root = process.cwd();
  const indexPath = path.join(root, "index.html");
  const appPath = path.join(root, "assets", "js", "app.js");
  const swPath = path.join(root, "assets", "js", "sw.js");
  const astClientPath = path.join(root, "assets", "js", "core", "astClient.js");
  const astWorkerPath = path.join(root, "assets", "js", "workers", "ast.worker.js");
  const lintWorkerPath = path.join(root, "assets", "js", "workers", "editorLint.worker.js");

  const indexSource = fs.readFileSync(indexPath, "utf8");
  const appSource = fs.readFileSync(appPath, "utf8");
  const swSource = fs.readFileSync(swPath, "utf8");
  const astClientSource = fs.readFileSync(astClientPath, "utf8");

  expect(indexSource.includes('<script type="module" src="./assets/js/app.js"></script>')).toBeTruthy();
  expect(appSource.includes('navigator.serviceWorker.register("./assets/js/sw.js")')).toBeTruthy();
  expect(appSource.includes('new Worker(new URL("./workers/editorLint.worker.js", import.meta.url), { type: "module" })')).toBeTruthy();
  expect(astClientSource.includes('new Worker(new URL("../workers/ast.worker.js", import.meta.url), { type: "module" })')).toBeTruthy();

  const coreAssetsArrayMatch = swSource.match(/const\s+CORE_ASSETS\s*=\s*\[([\s\S]*?)\];/);
  const coreAssetsBody = String(coreAssetsArrayMatch?.[1] || "");
  expect(coreAssetsBody.includes("./assets/js/app.js")).toBeTruthy();
  expect(coreAssetsBody.includes("./assets/js/workers/ast.worker.js")).toBeTruthy();
  expect(coreAssetsBody.includes("./assets/js/workers/editorLint.worker.js")).toBeTruthy();

  expect(fs.existsSync(astWorkerPath)).toBeTruthy();
  expect(fs.existsSync(lintWorkerPath)).toBeTruthy();
});

test("release contract: startup loading screen is wired and automation-safe", () => {
  const indexPath = path.join(process.cwd(), "index.html");
  const appPath = path.join(process.cwd(), "assets", "js", "app.js");
  const layoutPath = path.join(process.cwd(), "assets", "css", "layout.css");

  const indexSource = fs.readFileSync(indexPath, "utf8");
  const appSource = fs.readFileSync(appPath, "utf8");
  const layoutSource = fs.readFileSync(layoutPath, "utf8");

  expect(indexSource.includes('id="bootScreen"')).toBeTruthy();
  expect(indexSource.includes('id="bootScreenStatus"')).toBeTruthy();
  expect(indexSource.includes('data-check="dom"')).toBeTruthy();
  expect(indexSource.includes('data-check="storage"')).toBeTruthy();
  expect(indexSource.includes('data-check="editor"')).toBeTruthy();
  expect(indexSource.includes('data-check="runtime"')).toBeTruthy();
  expect(indexSource.includes('class="boot-screen-galaxy"')).toBeTruthy();

  expect(appSource.includes("const BOOT_SCREEN_MIN_MS = 3200;")).toBeTruthy();
  expect(appSource.includes("const BOOT_SCREEN_MAX_MS = 4200;")).toBeTruthy();
  expect(appSource.includes('const BOOT_SCREEN_SESSION_KEY = "fazide.boot-screen.seen.v1";')).toBeTruthy();
  expect(appSource.includes("createBootScreenController")).toBeTruthy();
  expect(appSource.includes("sessionStorage")).toBeTruthy();
  expect(appSource.includes("seenInSession")).toBeTruthy();
  expect(appSource.includes("BOOT_SCREEN_TICKER_LINES")).toBeTruthy();
  expect(appSource.includes("navigator.webdriver")).toBeTruthy();
  expect(appSource.includes("bootScreen.mark(\"dom\"")).toBeTruthy();
  expect(appSource.includes("FAZ IDE Ready • 8 rapid checks complete.")).toBeTruthy();
  expect(appSource.includes("await bootScreen.finish")).toBeTruthy();

  expect(layoutSource.includes(".boot-screen")).toBeTruthy();
  expect(layoutSource.includes(".boot-screen-galaxy")).toBeTruthy();
  expect(layoutSource.includes(".boot-screen-particle")).toBeTruthy();
  expect(layoutSource.includes(".boot-screen-panel")).toBeTruthy();
  expect(layoutSource.includes("border-radius: 0;")).toBeTruthy();
});
