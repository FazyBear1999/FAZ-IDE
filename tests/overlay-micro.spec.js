const { test, expect } = require("@playwright/test");

test("overlay micro: quick-open and command palette shells are initially closed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#quickOpenPalette")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#quickOpenPalette")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#quickOpenBackdrop")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#commandPalette")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#commandPalette")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#commandPaletteBackdrop")).toHaveAttribute("aria-hidden", "true");
});

test("overlay micro: editor find, symbols, and project panels start hidden", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panels = [
    ["#editorSearchPanel", "#editorSearchBackdrop"],
    ["#symbolPalette", "#symbolPaletteBackdrop"],
    ["#projectSearchPanel", "#projectSearchBackdrop"],
  ];

  for (const [panelSelector, backdropSelector] of panels) {
    await expect(page.locator(panelSelector)).toHaveAttribute("data-open", "false");
    await expect(page.locator(panelSelector)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(backdropSelector)).toHaveAttribute("aria-hidden", "true");
  }
});

test("overlay micro: history/settings/help panels start hidden with valid close buttons", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const closers = [
    ["#editorHistoryPanel", "#editorHistoryClose"],
    ["#editorSettingsPanel", "#editorSettingsClose"],
    ["#shortcutHelpPanel", "#shortcutHelpClose"],
  ];

  for (const [panelSelector, closeSelector] of closers) {
    await expect(page.locator(panelSelector)).toHaveAttribute("data-open", "false");
    await expect(page.locator(panelSelector)).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(closeSelector)).toHaveCount(1);
  }
});

test("overlay micro: prompt dialog has hidden list/input/error defaults", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#promptDialog")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#promptDialogList")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#promptDialogInputWrap")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#promptDialogError")).toHaveAttribute("data-visible", "false");
});

test("overlay micro: editor find opens and closes via escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorFindBtn").click();
  await expect(page.locator("#editorSearchPanel")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#editorSearchPanel")).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(page.locator("#editorSearchPanel")).toHaveAttribute("aria-hidden", "true");
});

test("overlay micro: symbols opens from toolbar and closes via escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorSymbolsBtn").click();
  await expect(page.locator("#symbolPalette")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#symbolPalette")).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(page.locator("#symbolPalette")).toHaveAttribute("aria-hidden", "true");
});

test("overlay micro: project search opens from toolbar and closes via escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#projectSearchBtn").click();
  await expect(page.locator("#projectSearchPanel")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#projectSearchPanel")).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(page.locator("#projectSearchPanel")).toHaveAttribute("aria-hidden", "true");
});

test("overlay micro: history and settings open from editor toolbar", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorHistoryBtn").click();
  await expect(page.locator("#editorHistoryPanel")).toHaveAttribute("data-open", "true");
  await page.locator("#editorHistoryClose").click();
  await expect(page.locator("#editorHistoryPanel")).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorSettingsBtn").click();
  await expect(page.locator("#editorSettingsPanel")).toHaveAttribute("data-open", "true");
  await page.locator("#editorSettingsClose").click();
  await expect(page.locator("#editorSettingsPanel")).toHaveAttribute("aria-hidden", "true");
});

test("overlay micro: shortcut help opens from header and closes cleanly", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorShortcutHelpBtn").click();
  await expect(page.locator("#shortcutHelpPanel")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#shortcutHelpPanel")).toHaveAttribute("aria-hidden", "false");

  await page.locator("#shortcutHelpClose").click();
  await expect(page.locator("#shortcutHelpPanel")).toHaveAttribute("aria-hidden", "true");
});
