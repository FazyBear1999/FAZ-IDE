const { test, expect } = require("@playwright/test");

const requiredSelectors = [
  "#appShell",
  "#workspace",
  "#workspaceTop",
  "#workspaceBottom",
  "#side",
  "#filesPanel",
  "#fileList",
  "#editorPanel",
  "#editorTabs",
  "#editor",
  "#editorMirror",
  "#sandboxPanel",
  "#runnerShell",
  "#runner",
  "#toolsPanel",
  "#taskRunnerPanel",
  "#taskRunnerOutput",
  "#problemsPanel",
  "#problemsList",
  "#diagnosticsList",
  "#inspectPanel",
  "#inspectStatus",
  "#debugPanel",
  "#debugBreakpointList",
  "#debugWatchList",
  "#logPanel",
  "#log",
  "#footerBrand",
  "#footerEditorStatus",
  "#footerRuntimeStatus",
  "#themeMenuGroup",
  "#themeSelect",
  "#statusText",
  "#quickOpenPalette",
  "#commandPalette",
  "#editorSearchPanel",
  "#symbolPalette",
  "#projectSearchPanel",
  "#editorHistoryPanel",
  "#editorSettingsPanel",
  "#shortcutHelpPanel",
  "#promptDialog",
  "#layoutPanel",
  "#dockOverlay",
];

test("ui contract: required shell nodes exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  for (const selector of requiredSelectors) {
    await expect(page.locator(selector), `${selector} should exist`).toHaveCount(1);
  }
});

test("ui contract: default panel toggles and shell dataset state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const expectedExpanded = {
    "#toggleLog": "true",
    "#toggleEditor": "true",
    "#toggleFiles": "true",
    "#toggleSandbox": "true",
    "#toggleTools": "false",
  };

  for (const [selector, expanded] of Object.entries(expectedExpanded)) {
    await expect(page.locator(selector)).toHaveAttribute("aria-expanded", expanded);
  }

  const appShell = page.locator("#appShell");
  await expect(appShell).toHaveAttribute("data-log", "open");
  await expect(appShell).toHaveAttribute("data-editor", "open");
  await expect(appShell).toHaveAttribute("data-files", "open");
  await expect(appShell).toHaveAttribute("data-sandbox", "open");
  await expect(appShell).toHaveAttribute("data-tools", "closed");
  await expect(appShell).toHaveAttribute("data-header", "open");
  await expect(appShell).toHaveAttribute("data-footer", "open");
});

test("ui contract: splitters are keyboard accessible separators", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const splitters = [
    "#splitFiles",
    "#splitSandbox",
    "#splitTools",
    "#splitRow",
    "#splitLog",
  ];

  for (const selector of splitters) {
    const node = page.locator(selector);
    await expect(node).toHaveAttribute("role", "separator");
    await expect(node).toHaveAttribute("tabindex", "0");
    await expect(node).toHaveAttribute("aria-valuemin", "0");
    await expect(node).toHaveAttribute("aria-valuemax", "100");
  }
});

test("ui contract: overlays and palettes start closed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const closedDataOpen = [
    "#quickOpenPalette",
    "#commandPalette",
    "#editorSearchPanel",
    "#symbolPalette",
    "#projectSearchPanel",
    "#editorHistoryPanel",
    "#editorSettingsPanel",
    "#shortcutHelpPanel",
  ];

  for (const selector of closedDataOpen) {
    await expect(page.locator(selector)).toHaveAttribute("data-open", "false");
    await expect(page.locator(selector)).toHaveAttribute("aria-hidden", "true");
  }

  await expect(page.locator("#promptDialog")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#dockOverlay")).toHaveAttribute("aria-hidden", "true");
});

test("ui contract: footer/editor defaults are safe and deterministic", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#footerEditorDirty")).toHaveAttribute("data-dirty", "false");
  await expect(page.locator("#footerEditorDirty")).toContainText("Saved");
  await expect(page.locator("#footerEditorCursor")).toContainText("Ln 1, Col 1");
  await expect(page.locator("#footerEditorSelection")).toContainText("Sel 0");
  await expect(page.locator("#footerEditorChars")).toContainText("Chars ");
  await expect(page.locator("#footerEditorRuntime")).toContainText("Editor:");
  await expect(page.locator("#footerSandbox")).toContainText("Sandbox: Idle");
  await expect(page.locator("#footerProblems")).toContainText("Problems: 0");
  await expect(page.locator("#footerStorage")).toContainText("Storage: OK");

  await expect(page.locator("#themeSelect")).toHaveValue("dark");
  await expect(page.locator("#statusText")).toContainText("Ready");
});
