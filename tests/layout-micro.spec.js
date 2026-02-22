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

test("layout micro: cannot close the final remaining primary panel", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen) return { ready: false };

    api.setPanelOpen("log", false);
    api.setPanelOpen("files", false);
    api.setPanelOpen("sandbox", false);
    api.setPanelOpen("tools", false);
    api.setPanelOpen("editor", false);

    const shell = document.querySelector("#appShell");
    const states = {
      log: String(shell?.getAttribute("data-log") || ""),
      editor: String(shell?.getAttribute("data-editor") || ""),
      files: String(shell?.getAttribute("data-files") || ""),
      sandbox: String(shell?.getAttribute("data-sandbox") || ""),
      tools: String(shell?.getAttribute("data-tools") || ""),
    };
    const openCount = Object.values(states).filter((value) => value === "open").length;
    return {
      ready: true,
      states,
      openCount,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.openCount).toBeGreaterThanOrEqual(1);
  expect(result.states.editor).toBe("open");
});

test("layout micro: invalid panel api inputs are safe no-ops", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState || !api?.setPanelOrder || !api?.dockPanel || !api?.setPanelOpen || !api?.togglePanel) {
      return { ready: false };
    }

    const before = api.getState()?.layout || {};
    const beforeRows = JSON.stringify(before.panelRows || {});
    const beforeOpen = {
      log: Boolean(before.logOpen),
      editor: Boolean(before.editorOpen),
      files: Boolean(before.filesOpen),
      sandbox: Boolean(before.sandboxOpen),
      tools: Boolean(before.toolsOpen),
    };

    api.setPanelOrder("ghost", 1);
    api.dockPanel("ghost", "bottom");
    const setResult = api.setPanelOpen("ghost", false);
    const toggleResult = api.togglePanel("ghost");

    const after = api.getState()?.layout || {};
    const afterRows = JSON.stringify(after.panelRows || {});
    const afterOpen = {
      log: Boolean(after.logOpen),
      editor: Boolean(after.editorOpen),
      files: Boolean(after.filesOpen),
      sandbox: Boolean(after.sandboxOpen),
      tools: Boolean(after.toolsOpen),
    };

    return {
      ready: true,
      rowsUnchanged: beforeRows === afterRows,
      openUnchanged: JSON.stringify(beforeOpen) === JSON.stringify(afterOpen),
      setResult,
      toggleResult,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.rowsUnchanged).toBeTruthy();
  expect(result.openUnchanged).toBeTruthy();
  expect(result.setResult).toBe(false);
  expect(result.toggleResult).toBe(false);
});

test("layout micro: malformed row and order inputs are safe no-ops", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState || !api?.setPanelOrder || !api?.dockPanel) {
      return { ready: false };
    }

    const before = api.getState()?.layout || {};
    const beforeRows = JSON.stringify(before.panelRows || {});

    api.setPanelOrder("editor", "two");
    api.setPanelOrder("editor", 1.5);
    api.dockPanel("editor", "middle");

    const after = api.getState()?.layout || {};
    const afterRows = JSON.stringify(after.panelRows || {});

    return {
      ready: true,
      rowsUnchanged: beforeRows === afterRows,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.rowsUnchanged).toBeTruthy();
});

test("layout micro: panel order uses safe-integer bounds and rejects unsafe integers", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState || !api?.setPanelOrder) {
      return { ready: false };
    }

    const getRows = () => JSON.parse(JSON.stringify(api.getState()?.layout?.panelRows || {}));
    const findPanel = (rows, panel) => {
      const top = Array.isArray(rows.top) ? rows.top : [];
      const bottom = Array.isArray(rows.bottom) ? rows.bottom : [];
      const topIndex = top.indexOf(panel);
      if (topIndex !== -1) {
        return { row: "top", index: topIndex, length: top.length };
      }
      const bottomIndex = bottom.indexOf(panel);
      if (bottomIndex !== -1) {
        return { row: "bottom", index: bottomIndex, length: bottom.length };
      }
      return { row: "", index: -1, length: 0 };
    };

    const panel = "log";
    const beforeUnsafeRows = getRows();
    const beforeUnsafe = JSON.stringify(beforeUnsafeRows);
    api.setPanelOrder(panel, Number.MAX_SAFE_INTEGER + 1);
    const afterUnsafeRows = getRows();
    const unsafeNoOp = JSON.stringify(afterUnsafeRows) === beforeUnsafe;

    api.setPanelOrder(panel, Number.MAX_SAFE_INTEGER);
    const afterMaxRows = getRows();
    const afterMaxPos = findPanel(afterMaxRows, panel);
    const maxClampedToEnd = afterMaxPos.index === Math.max(0, afterMaxPos.length - 1);

    api.setPanelOrder(panel, Number.MIN_SAFE_INTEGER);
    const afterMinRows = getRows();
    const afterMinPos = findPanel(afterMinRows, panel);
    const minClampedToStart = afterMinPos.index === 0;

    return {
      ready: true,
      unsafeNoOp,
      maxClampedToEnd,
      minClampedToStart,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.unsafeNoOp).toBeTruthy();
  expect(result.maxClampedToEnd).toBeTruthy();
  expect(result.minClampedToStart).toBeTruthy();
});

test("layout micro: persisted dense rows are normalized to row caps on reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seeded = await page.evaluate(() => {
    let layoutKey = "";
    let layoutSnapshot = null;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.panelRows && parsed.panelLayout) {
          layoutKey = key;
          layoutSnapshot = parsed;
          break;
        }
      } catch {
        // no-op
      }
    }

    if (!layoutKey || !layoutSnapshot) {
      return { ready: false };
    }

    const dense = {
      ...layoutSnapshot,
      logOpen: true,
      editorOpen: true,
      filesOpen: true,
      sandboxOpen: true,
      toolsOpen: true,
      panelRows: {
        top: ["log", "editor", "files", "sandbox", "tools"],
        bottom: [],
      },
      panelLayout: {
        top: ["log", "editor", "files", "sandbox", "tools"],
        bottom: [],
      },
    };

    localStorage.setItem(layoutKey, JSON.stringify(dense));
    return { ready: true, layoutKey };
  });

  expect(seeded.ready).toBeTruthy();
  await page.reload({ waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState) {
      return { ready: false };
    }

    const rows = api.getState()?.layout?.panelRows || {};
    const top = Array.isArray(rows.top) ? rows.top : [];
    const bottom = Array.isArray(rows.bottom) ? rows.bottom : [];

    const isOpen = (panel) => {
      const shell = document.querySelector("#appShell");
      if (!shell) return false;
      if (panel === "log") return shell.getAttribute("data-log") === "open";
      if (panel === "editor") return shell.getAttribute("data-editor") === "open";
      if (panel === "files") return shell.getAttribute("data-files") === "open";
      if (panel === "sandbox") return shell.getAttribute("data-sandbox") === "open";
      if (panel === "tools") return shell.getAttribute("data-tools") === "open";
      return false;
    };

    const topOpen = top.filter((panel) => isOpen(panel)).length;
    const bottomOpen = bottom.filter((panel) => isOpen(panel)).length;

    return {
      ready: true,
      topOpen,
      bottomOpen,
      totalPanels: top.length + bottom.length,
      topCount: top.length,
      bottomCount: bottom.length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.totalPanels).toBe(5);
  expect(result.topOpen).toBeLessThanOrEqual(3);
  expect(result.bottomOpen).toBeLessThanOrEqual(3);
  expect(result.topCount).toBeLessThanOrEqual(3);
  expect(result.bottomCount).toBeGreaterThanOrEqual(2);
});

test("layout micro: persisted all-closed primary panel state recovers on reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seeded = await page.evaluate(() => {
    let layoutKey = "";
    let layoutSnapshot = null;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.panelRows && parsed.panelLayout) {
          layoutKey = key;
          layoutSnapshot = parsed;
          break;
        }
      } catch {
        // no-op
      }
    }

    if (!layoutKey || !layoutSnapshot) {
      return { ready: false };
    }

    const allClosed = {
      ...layoutSnapshot,
      logOpen: false,
      editorOpen: false,
      filesOpen: false,
      sandboxOpen: false,
      toolsOpen: false,
    };

    localStorage.setItem(layoutKey, JSON.stringify(allClosed));
    return { ready: true };
  });

  expect(seeded.ready).toBeTruthy();
  await page.reload({ waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const shell = document.querySelector("#appShell");
    if (!shell) {
      return { ready: false };
    }

    const states = {
      log: String(shell.getAttribute("data-log") || ""),
      editor: String(shell.getAttribute("data-editor") || ""),
      files: String(shell.getAttribute("data-files") || ""),
      sandbox: String(shell.getAttribute("data-sandbox") || ""),
      tools: String(shell.getAttribute("data-tools") || ""),
    };
    const openCount = Object.values(states).filter((value) => value === "open").length;
    return {
      ready: true,
      openCount,
      states,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.openCount).toBeGreaterThanOrEqual(1);
  expect(result.states.editor).toBe("open");
});

test("layout micro: persisted dense all-closed payload recovers floor and row caps on reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seeded = await page.evaluate(() => {
    let layoutKey = "";
    let layoutSnapshot = null;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.panelRows && parsed.panelLayout) {
          layoutKey = key;
          layoutSnapshot = parsed;
          break;
        }
      } catch {
        // no-op
      }
    }

    if (!layoutKey || !layoutSnapshot) {
      return { ready: false };
    }

    const payload = {
      ...layoutSnapshot,
      logOpen: false,
      editorOpen: false,
      filesOpen: false,
      sandboxOpen: false,
      toolsOpen: false,
      panelRows: {
        top: ["log", "editor", "files", "sandbox", "tools"],
        bottom: [],
      },
      panelLayout: {
        top: ["log", "editor", "files", "sandbox", "tools"],
        bottom: [],
      },
    };

    localStorage.setItem(layoutKey, JSON.stringify(payload));
    return { ready: true };
  });

  expect(seeded.ready).toBeTruthy();
  await page.reload({ waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const shell = document.querySelector("#appShell");
    if (!api?.getState || !shell) {
      return { ready: false };
    }

    const rows = api.getState()?.layout?.panelRows || {};
    const top = Array.isArray(rows.top) ? rows.top : [];
    const bottom = Array.isArray(rows.bottom) ? rows.bottom : [];
    const states = {
      log: String(shell.getAttribute("data-log") || ""),
      editor: String(shell.getAttribute("data-editor") || ""),
      files: String(shell.getAttribute("data-files") || ""),
      sandbox: String(shell.getAttribute("data-sandbox") || ""),
      tools: String(shell.getAttribute("data-tools") || ""),
    };

    const topOpen = top.filter((panel) => states[panel] === "open").length;
    const bottomOpen = bottom.filter((panel) => states[panel] === "open").length;
    const openCount = Object.values(states).filter((value) => value === "open").length;

    return {
      ready: true,
      topCount: top.length,
      bottomCount: bottom.length,
      topOpen,
      bottomOpen,
      openCount,
      editorState: states.editor,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.openCount).toBeGreaterThanOrEqual(1);
  expect(result.editorState).toBe("open");
  expect(result.topOpen).toBeLessThanOrEqual(3);
  expect(result.bottomOpen).toBeLessThanOrEqual(3);
});
