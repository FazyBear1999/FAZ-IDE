const { test, expect } = require("@playwright/test");

test("workflow contract: tools toggle updates button and shell state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const toggle = page.locator("#toggleTools");
  const shell = page.locator("#appShell");

  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(shell).toHaveAttribute("data-tools", "closed");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(shell).toHaveAttribute("data-tools", "open");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(shell).toHaveAttribute("data-tools", "closed");
});

test("workflow contract: problems dock can be hidden and shown from tools", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#toggleTools").click();
  await expect(page.locator("#toolsProblemsDock")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#toolsProblemsToggle")).toHaveAttribute("aria-expanded", "true");

  await page.locator("#toolsProblemsToggle").click();
  await expect(page.locator("#toolsProblemsDock")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#toolsProblemsToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#toolsProblemsToggle")).toContainText("Show Problems");
  await expect(page.locator("#problemsPanel")).toHaveAttribute("aria-hidden", "true");

  await page.locator("#toolsProblemsToggle").click();
  await expect(page.locator("#toolsProblemsDock")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#toolsProblemsToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#toolsProblemsToggle")).toContainText("Hide Problems");
  await expect(page.locator("#problemsPanel")).toHaveAttribute("aria-hidden", "false");
});

test("workflow contract: layout panel opens and closes from toolbar actions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#layoutPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#layoutToggle").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.locator("#layoutClose").click();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: editor settings opens from editor toolbar and closes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#editorSettingsPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorSettingsBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.locator("#editorSettingsClose").click();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: editor history opens from editor toolbar and closes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#editorHistoryPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorHistoryBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.locator("#editorHistoryClose").click();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: shortcut help opens from header and closes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#shortcutHelpPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorShortcutHelpBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.locator("#shortcutHelpClose").click();
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: find panel opens from editor toolbar", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#editorSearchPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorFindBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: symbols panel opens from editor toolbar", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#symbolPalette");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#editorSymbolsBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: project search panel opens from editor toolbar", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#projectSearchPanel");
  await expect(panel).toHaveAttribute("aria-hidden", "true");

  await page.locator("#projectSearchBtn").click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(panel).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(panel).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: files menu button toggles menu visibility", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const button = page.locator("#filesMenuButton");
  const menu = page.locator("#filesMenu");

  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-hidden", "true");

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toHaveAttribute("aria-hidden", "false");

  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "false");
  await expect(menu).toHaveAttribute("aria-hidden", "true");
});

test("workflow contract: header toggle updates shell and quick bar visibility", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const shell = page.locator("#appShell");
  const quickBar = page.locator("#quickBar");

  await expect(shell).toHaveAttribute("data-header", "open");
  await expect(quickBar).toHaveAttribute("aria-hidden", "true");

  await page.locator("#toggleHeader").click();
  await expect(shell).toHaveAttribute("data-header", "closed");
  await expect(quickBar).toHaveAttribute("aria-hidden", "false");

  await page.locator("#quickHeader").click();
  await expect(shell).toHaveAttribute("data-header", "open");
});

test("workflow contract: layout quick action opens layout panel when header is hidden", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#toggleHeader").click();
  await expect(page.locator("#quickBar")).toHaveAttribute("aria-hidden", "false");

  await page.locator("#quickLayout").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#layoutPanel")).toHaveAttribute("data-open", "true");
});
