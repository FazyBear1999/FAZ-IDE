const { test, expect } = require("@playwright/test");

test("a11y contract: landmark roles and labels exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("header[aria-label='Top bar']")).toHaveCount(1);
  await expect(page.locator("main[aria-label='Main content']")).toHaveCount(1);
  await expect(page.locator("footer[aria-label='Footer']")).toHaveCount(1);

  await expect(page.locator("#side")).toHaveAttribute("aria-label", "Files sidebar");
  await expect(page.locator("#editorPanel")).toHaveAttribute("aria-label", "Editor panel");
  await expect(page.locator("#sandboxPanel")).toHaveAttribute("aria-label", "Sandbox panel");
  await expect(page.locator("#toolsPanel")).toHaveAttribute("aria-label", "Tools panel");
  await expect(page.locator("#logPanel")).toHaveAttribute("aria-label", "Console log");
});

test("a11y contract: all resize splitters expose separator semantics", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const expected = {
    "#splitFiles": "vertical",
    "#splitSandbox": "vertical",
    "#splitTools": "vertical",
    "#splitLog": "vertical",
    "#splitRow": "horizontal",
  };

  for (const [selector, orientation] of Object.entries(expected)) {
    const node = page.locator(selector);
    await expect(node).toHaveAttribute("role", "separator");
    await expect(node).toHaveAttribute("aria-orientation", orientation);
    await expect(node).toHaveAttribute("tabindex", "0");
    await expect(node).toHaveAttribute("aria-valuemin", "0");
    await expect(node).toHaveAttribute("aria-valuemax", "100");
  }
});

test("a11y contract: quick/open panels are hidden and labeled initially", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const hiddenPanels = [
    "#quickOpenBackdrop",
    "#commandPaletteBackdrop",
    "#editorSearchBackdrop",
    "#symbolPaletteBackdrop",
    "#projectSearchBackdrop",
    "#editorHistoryBackdrop",
    "#editorSettingsBackdrop",
    "#shortcutHelpBackdrop",
    "#promptDialogBackdrop",
    "#layoutBackdrop",
  ];

  for (const selector of hiddenPanels) {
    await expect(page.locator(selector)).toHaveAttribute("aria-hidden", "true");
  }

  for (const selector of ["#quickOpenList", "#commandPaletteList", "#symbolList", "#symbolRefsList", "#projectSearchList"]) {
    await expect(page.locator(selector)).toHaveAttribute("role", "listbox");
  }
});

test("a11y contract: prompt dialog has proper dialog semantics", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#promptDialog")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-modal", "true");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-labelledby", "promptDialogTitle");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-describedby", "promptDialogMessage");
  await expect(page.locator("#promptDialog")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#promptDialog")).toHaveAttribute("data-open", "false");

  await expect(page.locator("#promptDialogTitle")).toHaveCount(1);
  await expect(page.locator("#promptDialogMessage")).toHaveCount(1);
  await expect(page.locator("#promptDialogError")).toHaveAttribute("data-visible", "false");
});

test("a11y contract: important aria-controls targets exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const idPairs = [
    ["#toggleLog", "logPanel"],
    ["#toggleEditor", "editorPanel"],
    ["#toggleFiles", "side"],
    ["#toggleSandbox", "sandboxPanel"],
    ["#toggleTools", "toolsPanel"],
    ["#filesMenuButton", "filesMenu"],
    ["#gamesSelectorToggle", "gamesList"],
    ["#appsSelectorToggle", "applicationsList"],
    ["#lessonsSelectorToggle", "lessonsList"],
  ];

  for (const [selector, targetId] of idPairs) {
    await expect(page.locator(selector)).toHaveAttribute("aria-controls", targetId);
    await expect(page.locator(`#${targetId}`)).toHaveCount(1);
  }
});

test("a11y contract: no duplicate element ids exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const duplicateIds = await page.evaluate(() => {
    const counts = new Map();
    document.querySelectorAll("[id]").forEach((node) => {
      const id = node.id;
      counts.set(id, (counts.get(id) || 0) + 1);
    });
    return Array.from(counts.entries()).filter(([, count]) => count > 1);
  });

  expect(duplicateIds).toEqual([]);
});
