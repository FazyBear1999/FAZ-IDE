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

test("layout micro: system font selector exposes supported font options", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const values = await page.locator("#layoutSystemFontSelect option").evaluateAll((nodes) =>
    nodes.map((node) => String(node.getAttribute("value") || "")),
  );

  expect(values).toEqual([
    "default",
    "jetbrains-mono",
    "fira-code",
    "source-code-pro",
    "ibm-plex-mono",
    "roboto-mono",
    "inconsolata",
    "ubuntu-mono",
    "cascadia-mono",
    "space-mono",
  ]);
});

test("layout micro: system font control updates runtime font variable and layout state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");

  await page.locator("#layoutSystemFontSelect").selectOption("jetbrains-mono");

  const selected = await page.evaluate(() => {
    const layout = window.fazide?.getState?.()?.layout || {};
    const runtimeFont = document.documentElement.style.getPropertyValue("--font").trim();
    return {
      systemFontFamily: String(layout.systemFontFamily || ""),
      runtimeFont,
    };
  });

  expect(selected.systemFontFamily).toBe("jetbrains-mono");
  expect(selected.runtimeFont).toContain("JetBrains Mono");

  await page.locator("#layoutSystemFontSelect").selectOption("default");

  const reset = await page.evaluate(() => {
    const layout = window.fazide?.getState?.()?.layout || {};
    return {
      systemFontFamily: String(layout.systemFontFamily || ""),
      runtimeFont: document.documentElement.style.getPropertyValue("--font").trim(),
    };
  });

  expect(reset.systemFontFamily).toBe("default");
  expect(reset.runtimeFont).toBe("");
});

test("layout micro: all panel order selectors expose four positions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const orderSelectors = ["#layoutOrderLog", "#layoutOrderEditor", "#layoutOrderFiles", "#layoutOrderSandbox", "#layoutOrderTools"];

  for (const selector of orderSelectors) {
    await expect(page.locator(`${selector} option`)).toHaveCount(4);
    await expect(page.locator(`${selector} option[value=\"0\"]`)).toContainText("1");
    await expect(page.locator(`${selector} option[value=\"3\"]`)).toContainText("4");
  }
});

test("layout micro: panel row selectors expose top and bottom docking rows", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const rowSelectors = ["#layoutRowLog", "#layoutRowEditor", "#layoutRowFiles", "#layoutRowSandbox", "#layoutRowTools"];

  for (const selector of rowSelectors) {
    await expect(page.locator(`${selector} option`)).toHaveCount(2);
    await expect(page.locator(`${selector} option[value=\"top\"]`)).toContainText("Top");
    await expect(page.locator(`${selector} option[value=\"bottom\"]`)).toContainText("Bottom");
  }
});

test("layout micro: range + number pairs are bounded consistently", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const pairs = [
    ["#layoutLogWidth", "#layoutLogWidthInput", 180, 300],
    ["#layoutSidebarWidth", "#layoutSidebarWidthInput", 180, 260],
    ["#layoutSandboxWidth", "#layoutSandboxWidthInput", 180, 300],
    ["#layoutToolsWidth", "#layoutToolsWidthInput", 180, 300],
    ["#layoutPanelGap", "#layoutPanelGapInput", 0, 10],
    ["#layoutCornerRadius", "#layoutCornerRadiusInput", 0, 8],
    ["#layoutBottomHeight", "#layoutBottomHeightInput", 60, 300],
    ["#layoutDockMagnet", "#layoutDockMagnetInput", 32, 220],
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
    "#layoutPanelAnimation",
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

test("layout micro: corner radius and bottom dock height controls apply runtime style", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.dockPanel) throw new Error("dockPanel API unavailable");
    api.dockPanel("log", "bottom");
  });

  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#layoutBottomHeight")).not.toBeDisabled();
  await expect(page.locator("#layoutBottomHeightInput")).not.toBeDisabled();

  await page.locator("#layoutCornerRadius").fill("14");
  await page.locator("#layoutCornerRadius").dispatchEvent("input");

  await page.locator("#layoutBottomHeightInput").fill("220");
  await page.locator("#layoutBottomHeightInput").dispatchEvent("change");

  const result = await page.evaluate(() => {
    const radius = document.documentElement.style.getPropertyValue("--radius").trim();
    const radiusSm = document.documentElement.style.getPropertyValue("--radius-sm").trim();
    const bottomHeight = getComputedStyle(document.querySelector("#appShell")).getPropertyValue("--bottom-height").trim();
    const layoutButtonRadius = getComputedStyle(document.querySelector("#layoutToggle")).borderTopLeftRadius;
    const topThemeSelectRadius = getComputedStyle(document.querySelector(".top-theme-select")).borderTopLeftRadius;
    const cardRadius = getComputedStyle(document.querySelector("#editorPanel")).borderTopLeftRadius;
    return { radius, radiusSm, bottomHeight, layoutButtonRadius, topThemeSelectRadius, cardRadius };
  });

  expect(result.radius).toBe("14px");
  expect(result.radiusSm).toBe("11px");
  expect(result.bottomHeight).toBe("220px");
  expect(result.layoutButtonRadius).toBe("11px");
  expect(result.topThemeSelectRadius).toBe("11px");
  expect(result.cardRadius).toBe("14px");
});

test("layout micro: dock magnet and panel animation controls sync into layout state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");

  await expect(page.locator("#layoutPanelAnimation")).toBeChecked();
  await page.locator("#layoutDockMagnetInput").fill("144");
  await page.locator("#layoutDockMagnetInput").dispatchEvent("change");
  await page.locator("#layoutPanelAnimation").uncheck();

  const result = await page.evaluate(() => {
    const layout = window.fazide?.getState?.()?.layout || {};
    return {
      dockMagnetDistance: Number(layout.dockMagnetDistance || 0),
      panelReflowAnimation: Boolean(layout.panelReflowAnimation),
    };
  });

  expect(result.dockMagnetDistance).toBe(144);
  expect(result.panelReflowAnimation).toBe(false);
});

test("layout micro: row selector docks tools panel into bottom row", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setPanelOpen?.("tools", true);
  });

  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await page.locator("#layoutRowTools").selectOption("bottom");

  const result = await page.evaluate(() => {
    const rows = window.fazide?.getState?.()?.layout?.panelRows || { top: [], bottom: [] };
    return {
      top: Array.isArray(rows.top) ? rows.top : [],
      bottom: Array.isArray(rows.bottom) ? rows.bottom : [],
    };
  });

  expect(result.bottom).toContain("tools");
  expect(result.top).not.toContain("tools");
});

test("layout micro: narrow viewport hides all splitters including tools splitter", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const splitters = ["#splitLog", "#splitFiles", "#splitSandbox", "#splitTools", "#splitRow"];
  for (const selector of splitters) {
    await expect(page.locator(selector)).toBeHidden();
  }
});
