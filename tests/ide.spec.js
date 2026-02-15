const { test, expect } = require("@playwright/test");

test("loads the IDE shell with files and editor", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#fileList")).toBeVisible();

  const hasEditorSurface = await page.evaluate(() => {
    return Boolean(document.querySelector(".CodeMirror") || document.querySelector("textarea"));
  });
  expect(hasEditorSurface).toBeTruthy();

  const fileRows = await page.locator("#fileList .file-row").count();
  expect(fileRows).toBeGreaterThan(0);
});

test("theme selector switches value safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const themeSelect = page.locator("#themeSelect");
  await expect(themeSelect).toBeVisible();

  await themeSelect.selectOption("light");
  await expect(themeSelect).toHaveValue("light");

  await themeSelect.selectOption("dark");
  await expect(themeSelect).toHaveValue("dark");
});
