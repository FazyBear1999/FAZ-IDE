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

test("release contract: css gate is present in quick and all pipelines", async () => {
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

test("release contract: ai verify runs css gate before changed and smoke suites", async () => {
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

test("release contract: modal css optimization keeps deduped selector contract", async () => {
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

test("release contract: search panel css keeps shared deduped selectors", async () => {
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

test("release contract: footer runtime status selector includes zoom chip", async () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "layout.css");
  const source = fs.readFileSync(cssPath, "utf8");

  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"ok\"]")).toBeTruthy();
  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"warn\"]")).toBeTruthy();
  expect(source.includes(":is(#footerSandbox, #footerStorage, #footerProblems, #footerEditorRuntime, #footerZoom)[data-state=\"error\"]")).toBeTruthy();
});

test("release contract: themes css keeps deduped retro and purple input selector lists", async () => {
  const cssPath = path.join(process.cwd(), "assets", "css", "themes.css");
  const source = fs.readFileSync(cssPath, "utf8");

  expect(source.includes(':root[data-theme="retro"] :is(#quickOpenInput, #commandPaletteInput, #topCommandPaletteInput, #editorFindInput, #editorReplaceInput, #symbolSearchInput, #projectSearchInput, #projectReplaceInput)')).toBeTruthy();
  expect(source.includes(':root[data-theme="purple"] :is(#quickOpenInput, #commandPaletteInput, #editorFindInput, #editorReplaceInput, #symbolSearchInput, #projectSearchInput, #projectReplaceInput)')).toBeTruthy();

  const legacyRetroList = /:root\[data-theme="retro"\]\s+#quickOpenInput\s*,\s*:root\[data-theme="retro"\]\s+#commandPaletteInput/;
  const legacyPurpleList = /:root\[data-theme="purple"\]\s+#quickOpenInput\s*,\s*:root\[data-theme="purple"\]\s+#commandPaletteInput/;
  expect(legacyRetroList.test(source)).toBeFalsy();
  expect(legacyPurpleList.test(source)).toBeFalsy();
});
