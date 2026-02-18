const { test, expect } = require("@playwright/test");

test("layout micro: panel shell and header controls exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#layoutPanel")).toHaveCount(1);
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-label", "Layout settings");
  await expect(page.locator("#layoutBackdrop")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#layoutClose")).toHaveCount(1);
  await expect(page.locator("#layoutReset")).toHaveCount(1);
  await expect(page.locator("#layoutReset")).toHaveClass(/danger/);
});

test("layout micro: preset list includes all release presets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const values = await page.locator("#layoutPreset option").evaluateAll((nodes) =>
    nodes.map((node) => String(node.getAttribute("value") || "")),
  );

  expect(values).toContain("");
  expect(values).toContain("studio");
  expect(values).toContain("focus");
  expect(values).toContain("review");
  expect(values).toContain("wide");
  expect(values).toContain("debug");
  expect(values).toContain("zen");
  expect(values).toContain("sandbox");
  expect(values).toContain("diagnostics");
});

test("layout micro: all panel order selectors expose four positions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const orderSelectors = ["#layoutOrderLog", "#layoutOrderEditor", "#layoutOrderFiles", "#layoutOrderSandbox"];

  for (const selector of orderSelectors) {
    await expect(page.locator(`${selector} option`)).toHaveCount(4);
    await expect(page.locator(`${selector} option[value=\"0\"]`)).toContainText("1");
    await expect(page.locator(`${selector} option[value=\"3\"]`)).toContainText("4");
  }
});

test("layout micro: range + number pairs are bounded consistently", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const pairs = [
    ["#layoutLogWidth", "#layoutLogWidthInput", 180, 500],
    ["#layoutSidebarWidth", "#layoutSidebarWidthInput", 180, 400],
    ["#layoutSandboxWidth", "#layoutSandboxWidthInput", 180, 500],
    ["#layoutToolsWidth", "#layoutToolsWidthInput", 180, 500],
    ["#layoutPanelGap", "#layoutPanelGapInput", 0, 10],
  ];

  for (const [rangeSelector, numberSelector, expectedMinFloor, expectedMaxFloor] of pairs) {
    const range = page.locator(rangeSelector);
    const number = page.locator(numberSelector);

    await expect(range).toHaveAttribute("type", "range");
    await expect(number).toHaveAttribute("type", "number");

    const attrs = await page.evaluate(({ rangeSelector, numberSelector }) => {
      const rangeNode = document.querySelector(rangeSelector);
      const numberNode = document.querySelector(numberSelector);
      return {
        rangeMin: String(rangeNode?.getAttribute("min") || ""),
        rangeMax: String(rangeNode?.getAttribute("max") || ""),
        numberMin: String(numberNode?.getAttribute("min") || ""),
        numberMax: String(numberNode?.getAttribute("max") || ""),
      };
    }, { rangeSelector, numberSelector });

    expect(attrs.rangeMin).toBe(attrs.numberMin);
    expect(attrs.rangeMax).toBe(attrs.numberMax);

    const minValue = Number.parseInt(attrs.rangeMin, 10);
    const maxValue = Number.parseInt(attrs.rangeMax, 10);
    expect(Number.isFinite(minValue)).toBeTruthy();
    expect(Number.isFinite(maxValue)).toBeTruthy();
    expect(minValue).toBeGreaterThanOrEqual(expectedMinFloor);
    expect(maxValue).toBeGreaterThanOrEqual(expectedMaxFloor);
    expect(maxValue).toBeGreaterThan(minValue);
  }
});

test("layout micro: layout toggle checkboxes cover all shell visibility flags", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const toggles = [
    "#layoutLogOpen",
    "#layoutEditorOpen",
    "#layoutFilesOpen",
    "#layoutSandboxOpen",
    "#layoutToolsOpen",
    "#layoutHeaderOpen",
    "#layoutFooterOpen",
  ];

  for (const selector of toggles) {
    await expect(page.locator(selector)).toHaveAttribute("type", "checkbox");
  }
});

test("layout micro: layout panel opens from header button and closes via escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "true");
  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#layoutBackdrop")).toHaveAttribute("aria-hidden", "false");

  await page.keyboard.press("Escape");
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#layoutBackdrop")).toHaveAttribute("aria-hidden", "true");
});

test("layout micro: quick layout works when header is hidden", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#toggleHeader").click();
  await expect(page.locator("#quickBar")).toHaveAttribute("aria-hidden", "false");

  await page.locator("#quickLayout").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#layoutPanel")).toHaveAttribute("data-open", "true");
});

test("layout micro: narrow viewport hides all splitters including tools splitter", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const splitters = ["#splitLog", "#splitFiles", "#splitSandbox", "#splitTools", "#splitRow"];
  for (const selector of splitters) {
    await expect(page.locator(selector)).toBeHidden();
  }
});
