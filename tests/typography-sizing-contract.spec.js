const { test, expect } = require("@playwright/test");

test("typography/sizing: body base typography is readable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const styles = getComputedStyle(document.body);
    return {
      fontSize: Number.parseFloat(styles.fontSize || "0"),
      lineHeight: Number.parseFloat(styles.lineHeight || "0"),
    };
  });

  expect(result.fontSize).toBeGreaterThanOrEqual(12);
  expect(result.lineHeight).toBeGreaterThanOrEqual(16);
});

test("typography/sizing: editor font size defaults remain readable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const value = await page.locator("#editorFontSize").inputValue();
  const numeric = Number.parseInt(value || "0", 10);
  expect(Number.isFinite(numeric)).toBeTruthy();
  expect(numeric).toBeGreaterThanOrEqual(12);
  expect(numeric).toBeLessThanOrEqual(22);
});

test("typography/sizing: editor surface keeps readability-focused rendering hints", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const node = document.querySelector(".CodeMirror") || document.querySelector("#editor");
    if (!(node instanceof HTMLElement)) return { ready: false };
    const styles = getComputedStyle(node);
    return {
      ready: true,
      lineHeight: Number.parseFloat(styles.lineHeight || "0"),
      textRendering: String(styles.textRendering || "").toLowerCase(),
      ligatures: String(styles.fontVariantLigatures || "").toLowerCase(),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.lineHeight).toBeGreaterThanOrEqual(18);
  expect(["optimizelegibility", "auto", "geometricprecision"]).toContain(result.textRendering);
  expect(["none", "normal"]).toContain(result.ligatures);
});

test("typography/sizing: editor tab size defaults are within guardrails", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const value = await page.locator("#editorTabSize").inputValue();
  const numeric = Number.parseInt(value || "0", 10);
  expect(Number.isFinite(numeric)).toBeTruthy();
  expect(numeric).toBeGreaterThanOrEqual(2);
  expect(numeric).toBeLessThanOrEqual(8);
});

test("typography/sizing: editor autosave delay control has sane bounds", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#editorAutoSaveMs")).toHaveAttribute("min", "100");
  await expect(page.locator("#editorAutoSaveMs")).toHaveAttribute("max", "5000");
  await expect(page.locator("#editorAutoSaveMs")).toHaveAttribute("step", "100");

  const value = await page.locator("#editorAutoSaveMs").inputValue();
  if (value && value.trim()) {
    const numeric = Number.parseInt(value || "0", 10);
    expect(Number.isFinite(numeric)).toBeTruthy();
    expect(numeric).toBeGreaterThanOrEqual(100);
    expect(numeric).toBeLessThanOrEqual(5000);
  }
});

test("typography/sizing: footer status chips remain legible", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const px = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      return Number.parseFloat(getComputedStyle(node).fontSize || "0");
    };
    return {
      brand: px("#footerStatus"),
      dirty: px("#footerEditorDirty"),
      runtime: px("#footerSandbox"),
    };
  });

  expect(result.brand).toBeGreaterThanOrEqual(11);
  expect(result.dirty).toBeGreaterThanOrEqual(11);
  expect(result.runtime).toBeGreaterThanOrEqual(11);
});

test("typography/sizing: top controls keep healthy hit areas", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const h = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      return Number.parseFloat(getComputedStyle(node).height || "0");
    };
    return {
      toggleEditor: h("#toggleEditor"),
      toggleSandbox: h("#toggleSandbox"),
      layoutToggle: h("#layoutToggle"),
      themeSelect: h("#themeSelect"),
    };
  });

  expect(result.toggleEditor).toBeGreaterThanOrEqual(28);
  expect(result.toggleSandbox).toBeGreaterThanOrEqual(28);
  expect(result.layoutToggle).toBeGreaterThanOrEqual(28);
  expect(result.themeSelect).toBeGreaterThanOrEqual(28);
});

test("typography/sizing: action buttons meet minimum visual size", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const h = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      return Number.parseFloat(getComputedStyle(node).height || "0");
    };
    return {
      run: h("#run"),
      clear: h("#clear"),
      format: h("#format"),
      filesMenu: h("#filesMenuButton"),
    };
  });

  expect(result.run).toBeGreaterThanOrEqual(30);
  expect(result.clear).toBeGreaterThanOrEqual(30);
  expect(result.format).toBeGreaterThanOrEqual(30);
  expect(result.filesMenu).toBeGreaterThanOrEqual(26);
});

test("typography/sizing: list rows and tabs keep readable label sizes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const px = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      return Number.parseFloat(getComputedStyle(node).fontSize || "0");
    };
    return {
      filesTitle: px(".files-title"),
      editorTitle: px(".editor-title"),
      editorTab: px(".editor-tab"),
      quickOpenTitle: px(".quick-open-title"),
    };
  });

  expect(result.filesTitle).toBeGreaterThanOrEqual(11);
  expect(result.editorTitle).toBeGreaterThanOrEqual(11);
  expect(result.editorTab).toBeGreaterThanOrEqual(11);
  expect(result.quickOpenTitle).toBeGreaterThanOrEqual(11);
});

test("typography/sizing: splitter hit area token stays usable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const splitterToken = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return Number.parseFloat(styles.getPropertyValue("--splitter-hit-area") || "0");
  });

  expect(splitterToken).toBeGreaterThanOrEqual(14);
});

test("typography/sizing: splitter visuals stay clean and line-only", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const read = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const before = getComputedStyle(node, "::before");
      const after = getComputedStyle(node, "::after");
      return {
        lineVisible: String(before.backgroundColor || ""),
        lineShadow: String(before.boxShadow || ""),
        afterDisplay: String(after.display || ""),
        afterContent: String(after.content || ""),
      };
    };

    return {
      vertical: read("#splitFiles"),
      horizontal: read("#splitRow"),
    };
  });

  expect(result.vertical).toBeTruthy();
  expect(result.horizontal).toBeTruthy();
  expect(result.vertical.lineVisible).not.toContain("0, 0, 0, 0");
  expect(result.horizontal.lineVisible).not.toContain("0, 0, 0, 0");
  expect(result.vertical.lineShadow).toBe("none");
  expect(result.horizontal.lineShadow).toBe("none");
  expect(result.vertical.afterDisplay).toBe("none");
  expect(result.horizontal.afterDisplay).toBe("none");
  expect(result.vertical.afterContent).toContain("none");
  expect(result.horizontal.afterContent).toContain("none");
});

test("typography/sizing: layout numeric controls retain synchronized bounds", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const pairs = [
    ["#layoutLogWidth", "#layoutLogWidthInput"],
    ["#layoutSidebarWidth", "#layoutSidebarWidthInput"],
    ["#layoutSandboxWidth", "#layoutSandboxWidthInput"],
    ["#layoutToolsWidth", "#layoutToolsWidthInput"],
    ["#layoutPanelGap", "#layoutPanelGapInput"],
    ["#layoutCornerRadius", "#layoutCornerRadiusInput"],
    ["#layoutBottomHeight", "#layoutBottomHeightInput"],
  ];

  for (const [rangeSelector, numberSelector] of pairs) {
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
  }
});

test("typography/sizing: prompt dialog controls keep minimum size", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const h = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      return Number.parseFloat(getComputedStyle(node).height || "0");
    };
    return {
      input: h("#promptDialogInput"),
      confirm: h("#promptDialogConfirm"),
      cancel: h("#promptDialogCancel"),
    };
  });

  expect(result.input).toBeGreaterThanOrEqual(30);
  expect(result.confirm).toBeGreaterThanOrEqual(28);
  expect(result.cancel).toBeGreaterThanOrEqual(28);
});
