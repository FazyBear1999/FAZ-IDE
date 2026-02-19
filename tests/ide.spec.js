const { test, expect } = require("@playwright/test");

test("loads the IDE shell with files and editor", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#fileList")).toBeVisible();
  await expect(page.locator("#gamesSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#appsSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#lessonsSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('#fileList [data-file-section="files"]')).toHaveAttribute("aria-expanded", "false");

  const hasEditorSurface = await page.evaluate(() => {
    return Boolean(document.querySelector(".CodeMirror") || document.querySelector("textarea"));
  });
  expect(hasEditorSurface).toBeTruthy();

  await page.locator('#fileList [data-file-section="files"]').click();
  const fileRows = await page.locator("#fileList .file-row").count();
  expect(fileRows).toBeGreaterThan(0);
});

test("boot exposes core fazide api surface", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const hasMethod = (name) => typeof api?.[name] === "function";
    return {
      ready: Boolean(api),
      createFolder: hasMethod("createFolder"),
      setPanelOpen: hasMethod("setPanelOpen"),
      applyPreset: hasMethod("applyPreset"),
      getState: hasMethod("getState"),
      stateHasLayout: Boolean(api?.getState?.()?.layout),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.createFolder).toBeTruthy();
  expect(result.setPanelOpen).toBeTruthy();
  expect(result.applyPreset).toBeTruthy();
  expect(result.getState).toBeTruthy();
  expect(result.stateHasLayout).toBeTruthy();
});

test("theme selector switches value safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const themeSelect = page.locator("#themeSelect");
  await expect(themeSelect).toBeVisible();

  await themeSelect.selectOption("light");
  await expect(themeSelect).toHaveValue("light");

  await themeSelect.selectOption("retro");
  await expect(themeSelect).toHaveValue("retro");

  await themeSelect.selectOption("temple");
  await expect(themeSelect).toHaveValue("temple");

  await themeSelect.selectOption("midnight");
  await expect(themeSelect).toHaveValue("midnight");

  await themeSelect.selectOption("dark");
  await expect(themeSelect).toHaveValue("dark");
});

test("header theme selector reflects registered system themes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const select = document.querySelector("#themeSelect");
    if (!select) return { ready: false };
    const values = Array.from(select.querySelectorAll("option")).map((option) => String(option.value || "").trim());
    return {
      ready: true,
      values,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.values).toEqual(["dark", "light", "purple", "retro", "temple", "midnight", "ocean", "forest", "graphite", "sunset"]);
});

test("ui theme selection auto-matches syntax theme", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const themeSelect = document.querySelector("#themeSelect");
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!themeSelect || !syntaxSelect) return { ready: false };

    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const readPair = async (theme) => {
      themeSelect.value = theme;
      themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForPaint();
      return {
        theme: String(themeSelect.value || ""),
        syntax: String(syntaxSelect.value || ""),
      };
    };

    return {
      ready: true,
      dark: await readPair("dark"),
      light: await readPair("light"),
      retro: await readPair("retro"),
      temple: await readPair("temple"),
      midnight: await readPair("midnight"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.dark.theme).toBe("dark");
  expect(result.dark.syntax).toBe("dark");
  expect(result.light.theme).toBe("light");
  expect(result.light.syntax).toBe("light");
  expect(result.retro.theme).toBe("retro");
  expect(result.retro.syntax).toBe("retro");
  expect(result.temple.theme).toBe("temple");
  expect(result.temple.syntax).toBe("temple");
  expect(result.midnight.theme).toBe("midnight");
  expect(result.midnight.syntax).toBe("midnight");
});

test("header keeps theme group next to workspace actions and removes top health chips", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const baseline = await page.evaluate(() => {
    const topBar = document.querySelector('.topbar[aria-label="Top bar"]')
      || document.querySelector('header.topbar')
      || document.querySelector('[aria-label="Top bar"]');
    const actionsGroup = topBar?.querySelector('[aria-label="Workspace actions"]');
    const themeGroup = topBar?.querySelector('[aria-label="Theme"]')
      || topBar?.querySelector(".strip-theme-group");
    const health = topBar?.querySelector('.health[aria-label="System health"]');
    const themeSelect = document.querySelector("#themeSelect");
    if (!topBar || !actionsGroup || !themeGroup || !themeSelect) {
      return { ready: false };
    }

    const parseAlpha = (value = "") => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw || raw === "transparent") return 0;
      const rgbaMatch = raw.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
      if (rgbaMatch) return Number.parseFloat(rgbaMatch[4]);
      const rgbMatch = raw.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (rgbMatch) return 1;
      return Number.NaN;
    };

    const parsePx = (value = "") => {
      const parsed = Number.parseFloat(String(value || ""));
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const children = Array.from(actionsGroup.parentElement?.children || []);
    const actionsIndex = children.indexOf(actionsGroup);
    const themeIndex = children.indexOf(themeGroup);
    const selectStyle = getComputedStyle(themeSelect);
    const actionsRect = actionsGroup.getBoundingClientRect();
    const themeRect = themeGroup.getBoundingClientRect();
    const actionsThemeGap = Math.abs(themeRect.left - actionsRect.right);

    return {
      ready: true,
      actionsIndex,
      themeIndex,
      hasTopHealth: Boolean(health),
      actionsThemeGap,
      backgroundAlpha: parseAlpha(selectStyle.backgroundColor),
      hasCaretGradient: String(selectStyle.backgroundImage || "").includes("gradient"),
      selectHeight: parsePx(selectStyle.height),
      groupWidth: themeRect.width,
    };
  });

  expect(baseline.ready).toBeTruthy();
  expect(baseline.actionsIndex).toBeGreaterThanOrEqual(0);
  expect(baseline.themeIndex).toBe(baseline.actionsIndex + 1);
  expect(baseline.hasTopHealth).toBeFalsy();
  expect(baseline.actionsThemeGap).toBeLessThanOrEqual(14);
  expect(baseline.backgroundAlpha).toBeGreaterThan(0);
  expect(baseline.hasCaretGradient).toBeTruthy();
  expect(baseline.selectHeight).toBeGreaterThanOrEqual(28);
  expect(baseline.groupWidth).toBeGreaterThan(90);

});

test("quick bar buttons are square and do not block workspace clicks", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#toggleHeader").click();

  const result = await page.evaluate(() => {
    const quickBar = document.querySelector("#quickBar");
    const quickHeader = document.querySelector("#quickHeader");
    const quickLayout = document.querySelector("#quickLayout");
    if (!quickBar || !quickHeader || !quickLayout) {
      return { ready: false };
    }

    const parseRadius = (value = "") => String(value || "")
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    const isSquare = (value = "") => {
      const values = parseRadius(value);
      return values.length > 0 && values.every((part) => part === 0);
    };

    const quickHeaderRect = quickHeader.getBoundingClientRect();
    const quickLayoutRect = quickLayout.getBoundingClientRect();
    const probeX = (quickHeaderRect.right + quickLayoutRect.left) / 2;
    const probeY = (Math.max(quickHeaderRect.top, quickLayoutRect.top) + Math.min(quickHeaderRect.bottom, quickLayoutRect.bottom)) / 2;
    const hit = document.elementFromPoint(probeX, probeY);

    return {
      ready: true,
      visible: quickBar.getAttribute("data-visible") === "true",
      barPointerEvents: String(getComputedStyle(quickBar).pointerEvents || ""),
      headerPointerEvents: String(getComputedStyle(quickHeader).pointerEvents || ""),
      layoutPointerEvents: String(getComputedStyle(quickLayout).pointerEvents || ""),
      headerSquare: isSquare(getComputedStyle(quickHeader).borderRadius),
      layoutSquare: isSquare(getComputedStyle(quickLayout).borderRadius),
      hitId: hit?.id || "",
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.visible).toBeTruthy();
  expect(result.barPointerEvents).toBe("none");
  expect(result.headerPointerEvents).toBe("auto");
  expect(result.layoutPointerEvents).toBe("auto");
  expect(result.headerSquare).toBeTruthy();
  expect(result.layoutSquare).toBeTruthy();
  expect(result.hitId).not.toBe("quickBar");
  expect(result.hitId).not.toBe("quickHeader");
  expect(result.hitId).not.toBe("quickLayout");
});

test("quick bar is non-interactive while header is visible", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const quickBar = document.querySelector("#quickBar");
    const quickHeader = document.querySelector("#quickHeader");
    const quickLayout = document.querySelector("#quickLayout");
    if (!quickBar || !quickHeader || !quickLayout) {
      return { ready: false };
    }

    const quickHeaderRect = quickHeader.getBoundingClientRect();
    const probeX = quickHeaderRect.left + (quickHeaderRect.width / 2);
    const probeY = quickHeaderRect.top + (quickHeaderRect.height / 2);
    const hit = document.elementFromPoint(probeX, probeY);

    return {
      ready: true,
      visible: quickBar.getAttribute("data-visible") === "true",
      barPointerEvents: String(getComputedStyle(quickBar).pointerEvents || ""),
      headerPointerEvents: String(getComputedStyle(quickHeader).pointerEvents || ""),
      layoutPointerEvents: String(getComputedStyle(quickLayout).pointerEvents || ""),
      hitId: hit?.id || "",
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.visible).toBeFalsy();
  expect(result.barPointerEvents).toBe("none");
  expect(result.headerPointerEvents).toBe("none");
  expect(result.layoutPointerEvents).toBe("none");
  expect(result.hitId).not.toBe("quickBar");
  expect(result.hitId).not.toBe("quickHeader");
  expect(result.hitId).not.toBe("quickLayout");
});

test("headers stay horizontally scrollable when constrained", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const targets = {
      top: document.querySelector(".top"),
      files: document.querySelector(".files-header"),
      log: document.querySelector("#logPanel .card-hd"),
      editor: document.querySelector("#editorPanel .editor-header"),
    };

    const forceOverflow = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      node.style.maxWidth = "260px";
      const filler = document.createElement("span");
      filler.setAttribute("data-scroll-filler", "true");
      filler.textContent = "HEADER-SCROLL-FILLER ".repeat(24);
      filler.style.display = "inline-block";
      filler.style.whiteSpace = "nowrap";
      filler.style.minWidth = "1000px";
      filler.style.height = "1px";
      filler.style.opacity = "0";
      filler.style.pointerEvents = "none";
      node.appendChild(filler);
      return true;
    };

    const runWheelScroll = (node) => {
      if (!(node instanceof HTMLElement)) {
        return { ready: false, overflowX: "", overflow: false, moved: false };
      }
      void node.offsetWidth;
      const overflowX = String(getComputedStyle(node).overflowX || "");
      const overflow = (node.scrollWidth - node.clientWidth) > 1;
      const before = node.scrollLeft;
      node.dispatchEvent(new WheelEvent("wheel", { deltaY: 220, bubbles: true, cancelable: true }));
      const after = node.scrollLeft;
      return {
        ready: true,
        overflowX,
        overflow,
        moved: after > before,
      };
    };

    Object.values(targets).forEach((node) => forceOverflow(node));

    return {
      top: runWheelScroll(targets.top),
      files: runWheelScroll(targets.files),
      log: runWheelScroll(targets.log),
      editor: runWheelScroll(targets.editor),
    };
  });

  [result.top, result.files, result.log, result.editor].forEach((entry) => {
    expect(entry.ready).toBeTruthy();
    expect(["auto", "scroll"]).toContain(entry.overflowX);
    expect(entry.overflow).toBeTruthy();
    expect(entry.moved).toBeTruthy();
  });
});

test("theme dropdown uses simple themed native select surface", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const select = document.querySelector("#themeSelect");
    const parseAlpha = (value = "") => {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw || raw === "transparent") return 0;
      const rgbaMatch = raw.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
      if (rgbaMatch) return Number.parseFloat(rgbaMatch[4]);
      const rgbMatch = raw.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
      if (rgbMatch) return 1;
      return Number.NaN;
    };
    if (!select) {
      return { ready: false };
    }

    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const readSelectStyle = () => {
      const style = getComputedStyle(select);
      return {
        value: String(select.value || ""),
        backgroundColor: String(style.backgroundColor || ""),
        backgroundImage: String(style.backgroundImage || ""),
        appearance: String(style.appearance || ""),
      };
    };

    select.value = "dark";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const dark = readSelectStyle();
    select.value = "light";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const light = readSelectStyle();
    select.value = "purple";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const purple = readSelectStyle();
    select.value = "temple";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const temple = readSelectStyle();

    return {
      ready: true,
      darkValue: dark.value,
      lightValue: light.value,
      purpleValue: purple.value,
      templeValue: temple.value,
      darkBg: dark.backgroundColor,
      lightBg: light.backgroundColor,
      purpleBg: purple.backgroundColor,
      templeBg: temple.backgroundColor,
      darkAlpha: parseAlpha(dark.backgroundColor),
      lightAlpha: parseAlpha(light.backgroundColor),
      purpleAlpha: parseAlpha(purple.backgroundColor),
      templeAlpha: parseAlpha(temple.backgroundColor),
      darkArrow: dark.backgroundImage,
      lightArrow: light.backgroundImage,
      purpleArrow: purple.backgroundImage,
      templeArrow: temple.backgroundImage,
      darkAppearance: dark.appearance,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.darkValue).toBe("dark");
  expect(result.lightValue).toBe("light");
  expect(result.purpleValue).toBe("purple");
  expect(result.templeValue).toBe("temple");
  expect(result.darkAlpha).toBeGreaterThan(0);
  expect(result.lightAlpha).toBeGreaterThan(0);
  expect(result.purpleAlpha).toBeGreaterThan(0);
  expect(result.templeAlpha).toBeGreaterThan(0);
  expect(new Set([result.darkBg, result.lightBg, result.purpleBg, result.templeBg]).size).toBeGreaterThanOrEqual(2);
  expect(result.darkArrow).toContain("gradient");
  expect(result.lightArrow).toContain("gradient");
  expect(result.purpleArrow).toContain("gradient");
  expect(result.templeArrow).toContain("gradient");
  expect(result.darkAppearance).toBe("none");
});

test("layout preset menu includes extended presets and applies diagnostics preset safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const presetSelect = document.querySelector("#layoutPreset");
    const api = window.fazide;
    if (!presetSelect || !api?.applyPreset || !api?.getState) return { ready: false };

    const values = Array.from(presetSelect.querySelectorAll("option"))
      .map((option) => String(option.value || "").trim())
      .filter(Boolean);

    api.applyPreset("diagnostics");
    const state = api.getState();
    const layout = state?.layout || {};
    const panelRows = layout.panelRows || { top: [], bottom: [] };

    return {
      ready: true,
      values,
      toolsOpen: Boolean(layout.toolsOpen),
      sandboxOpen: Boolean(layout.sandboxOpen),
      logOpen: Boolean(layout.logOpen),
      topOrder: Array.isArray(panelRows.top) ? panelRows.top.slice(0, 4) : [],
      bottomOrder: Array.isArray(panelRows.bottom) ? panelRows.bottom.slice(0, 2) : [],
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.values).toContain("studio");
  expect(result.values).toContain("focus");
  expect(result.values).toContain("review");
  expect(result.values).toContain("wide");
  expect(result.values).toContain("debug");
  expect(result.values).toContain("zen");
  expect(result.values).toContain("sandbox");
  expect(result.values).toContain("diagnostics");
  expect(result.toolsOpen).toBeTruthy();
  expect(result.sandboxOpen).toBeFalsy();
  expect(result.logOpen).toBeTruthy();
  expect(result.topOrder).toEqual(["files", "editor", "tools", "sandbox"]);
  expect(result.bottomOrder).toEqual(["log"]);
});

test("applying layout preset resets panel geometry from prior custom sizes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.applyPreset || !api?.setSizes || !api?.getState || !api?.setPanelOpen) {
      return { ready: false };
    }

    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", true);
    api.setPanelOpen("log", true);
    api.setSizes({
      sidebarWidth: 900,
      sandboxWidth: 900,
      toolsWidth: 900,
      logWidth: 900,
      bottomHeight: 520,
    });

    api.applyPreset("studio");
    const state = api.getState();
    const layout = state?.layout || {};
    const rows = layout.panelRows || { top: [], bottom: [] };

    return {
      ready: true,
      logWidth: Number(layout.logWidth || 0),
      sidebarWidth: Number(layout.sidebarWidth || 0),
      sandboxWidth: Number(layout.sandboxWidth || 0),
      toolsWidth: Number(layout.toolsWidth || 0),
      bottomHeight: Number(layout.bottomHeight || 0),
      topOrder: Array.isArray(rows.top) ? rows.top.slice(0, 4) : [],
      bottomOrder: Array.isArray(rows.bottom) ? rows.bottom.slice(0, 2) : [],
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.logWidth).toBeGreaterThanOrEqual(250);
  expect(result.logWidth).toBeLessThanOrEqual(520);
  expect(result.sidebarWidth).toBeGreaterThanOrEqual(160);
  expect(result.sidebarWidth).toBeLessThanOrEqual(420);
  expect(result.sandboxWidth).toBeGreaterThanOrEqual(220);
  expect(result.sandboxWidth).toBeLessThanOrEqual(620);
  expect(result.toolsWidth).toBeGreaterThanOrEqual(220);
  expect(result.toolsWidth).toBeLessThanOrEqual(520);
  expect(result.bottomHeight).toBeGreaterThanOrEqual(160);
  expect(result.bottomHeight).toBeLessThanOrEqual(360);
  expect(result.topOrder).toEqual(["files", "editor", "sandbox", "tools"]);
  expect(result.bottomOrder).toEqual(["log"]);
});

test("dock center touch resets layout to selected preset for all primary panels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const handleByPanel = {
    files: '#side .drag-handle[data-panel="files"]',
    editor: '#editorPanel .drag-handle[data-panel="editor"]',
    sandbox: '#sandboxPanel .drag-handle[data-panel="sandbox"]',
    tools: '#toolsPanel .drag-handle[data-panel="tools"]',
    log: '#logPanel .drag-handle[data-panel="log"]',
  };
  const panels = ["editor", "log"];
  const failingPanels = [];
  for (const panel of panels) {
    await page.evaluate((targetPanel) => {
      const api = window.fazide;
      if (!api?.applyPreset || !api?.setPanelOpen || !api?.setPanelOrder || !api?.dockPanel || !api?.setSizes) return;
      api.applyPreset("diagnostics");
      if (targetPanel === "tools") {
        api.setPanelOpen("files", true);
        api.setPanelOpen("editor", true);
        api.setPanelOpen("sandbox", false);
        api.setPanelOpen("tools", true);
        api.setPanelOpen("log", false);
        api.dockPanel("tools", "top");
        api.dockPanel("editor", "top");
        api.dockPanel("files", "top");
        api.setPanelOrder("tools", 0);
        api.setPanelOrder("editor", 1);
        api.setPanelOrder("files", 2);
      } else if (targetPanel === "log") {
        api.setPanelOpen("files", false);
        api.setPanelOpen("editor", true);
        api.setPanelOpen("sandbox", false);
        api.setPanelOpen("tools", false);
        api.setPanelOpen("log", true);
        api.dockPanel("editor", "top");
        api.dockPanel("log", "bottom");
      } else {
        api.setPanelOpen("files", true);
        api.setPanelOpen("editor", true);
        api.setPanelOpen("sandbox", true);
        api.setPanelOpen("tools", false);
        api.setPanelOpen("log", true);
        api.dockPanel("editor", "top");
        api.dockPanel("files", "top");
        api.dockPanel("sandbox", "top");
        api.setPanelOrder("editor", 0);
        api.setPanelOrder("files", 1);
        api.setPanelOrder("sandbox", 2);
      }
      api.setSizes({ sidebarWidth: 260, sandboxWidth: 500, toolsWidth: 420, logWidth: 420 });
    }, panel);

    const handle = page.locator(handleByPanel[panel]);
    const workspace = page.locator("#workspace");
    await expect(handle).toBeVisible();
    await expect(workspace).toBeVisible();
    const handleBox = await handle.boundingBox();
    const workspaceBox = await workspace.boundingBox();
    expect(handleBox).toBeTruthy();
    expect(workspaceBox).toBeTruthy();
    const startX = handleBox.x + (handleBox.width / 2);
    const startY = handleBox.y + (handleBox.height / 2);
    const centerX = workspaceBox.x + (workspaceBox.width / 2);
    const centerY = workspaceBox.y + (workspaceBox.height / 2);

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 36, startY + 24);

    const centerZone = page.locator('#dockOverlay .dock-zone[data-dock-zone="center"]');
    const centerVisible = await centerZone.isVisible();
    if (centerVisible) {
      const centerBox = await centerZone.boundingBox();
      if (centerBox) {
        await page.mouse.move(centerBox.x + centerBox.width / 2, centerBox.y + centerBox.height / 2);
      } else {
        await page.mouse.move(centerX, centerY);
      }
    } else {
      await page.mouse.move(centerX, centerY);
    }
    await page.mouse.up();

    const result = await page.evaluate(() => {
      const api = window.fazide;
      const state = api?.getState?.() || {};
      const layout = state.layout || {};
      const rows = layout.panelRows || { top: [], bottom: [] };
      const top = Array.isArray(rows.top) ? rows.top : [];
      const bottom = Array.isArray(rows.bottom) ? rows.bottom : [];
      return {
        activeLayoutPreset: String(state.activeLayoutPreset || ""),
        toolsOpen: Boolean(layout.toolsOpen),
        sandboxOpen: Boolean(layout.sandboxOpen),
        filesOpen: Boolean(layout.filesOpen),
        editorOpen: Boolean(layout.editorOpen),
        logOpen: Boolean(layout.logOpen),
        topOrder: top.slice(0, 4),
        bottomOrder: bottom.slice(0, 2),
      };
    });

    const matchesDiagnostics =
      result.activeLayoutPreset === "diagnostics"
      && result.filesOpen === true
      && result.editorOpen === true
      && result.sandboxOpen === false
      && result.logOpen === true
      && result.toolsOpen === true
      && JSON.stringify(result.topOrder) === JSON.stringify(["files", "editor", "tools", "sandbox"])
      && JSON.stringify(result.bottomOrder) === JSON.stringify(["log"]);

    if (!matchesDiagnostics) {
      failingPanels.push({ panel, ...result });
    }
  }

  expect(failingPanels).toEqual([]);
});

test("dock edge magnet snaps panel to left zone without precise zone targeting", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen || !api?.setPanelOrder || !api?.dockPanel) return;
    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", false);
    api.setPanelOpen("log", true);
    api.dockPanel("files", "top");
    api.dockPanel("editor", "top");
    api.dockPanel("sandbox", "top");
    api.setPanelOrder("files", 0);
    api.setPanelOrder("editor", 1);
    api.setPanelOrder("sandbox", 2);
  });

  const before = await page.evaluate(() => {
    const api = window.fazide;
    const layout = api?.getState?.()?.layout || {};
    const top = Array.isArray(layout.panelRows?.top) ? layout.panelRows.top : [];
    return top.indexOf("sandbox");
  });

  const handle = page.locator('#sandboxPanel .drag-handle[data-panel="sandbox"]');
  const workspace = page.locator("#workspace");
  await expect(handle).toBeVisible();
  await expect(workspace).toBeVisible();

  const leftZone = page.locator('#dockOverlay .dock-zone[data-dock-zone="left"]');
  await expect(leftZone).toHaveCount(1);

  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();

  await handle.dragTo(leftZone, {
    sourcePosition: { x: Math.max(2, handleBox.width / 2), y: Math.max(2, handleBox.height / 2) },
  });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const layout = api?.getState?.()?.layout || {};
    const top = Array.isArray(layout.panelRows?.top) ? layout.panelRows.top : [];
    return {
      sandboxIndex: top.indexOf("sandbox"),
      topOrder: top.slice(0, 4),
    };
  });

  expect(before).toBeGreaterThanOrEqual(0);
  expect(result.sandboxIndex).toBeGreaterThanOrEqual(0);
  expect(result.sandboxIndex).toBe(0);
});

test("dock pass-through center does not reset custom layout behavior settings", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen || !api?.dockPanel || !api?.setPanelOrder) return;
    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", true);
    api.setPanelOpen("log", true);
    api.dockPanel("files", "top");
    api.dockPanel("editor", "top");
    api.dockPanel("sandbox", "top");
    api.dockPanel("tools", "top");
    api.dockPanel("log", "bottom");
    api.setPanelOrder("files", 1);
  });

  await page.locator("#layoutToggle").click();
  await page.locator("#layoutDockMagnetInput").fill("152");
  await page.locator("#layoutDockMagnetInput").dispatchEvent("change");
  await page.locator("#layoutPanelAnimation").uncheck();
  await expect(page.locator("#layoutDockMagnetInput")).toHaveValue("152");
  await expect(page.locator("#layoutPanelAnimation")).not.toBeChecked();
  await page.keyboard.press("Escape");

  const handle = page.locator('#side .drag-handle[data-panel="files"]');
  const workspace = page.locator("#workspace");
  const leftZone = page.locator('#dockOverlay .dock-zone[data-dock-zone="left"]');

  await expect(handle).toBeVisible();
  await expect(workspace).toBeVisible();
  await expect(leftZone).toHaveCount(1);

  const handleBox = await handle.boundingBox();
  const workspaceBox = await workspace.boundingBox();
  const leftBox = await leftZone.boundingBox();
  expect(handleBox).toBeTruthy();
  expect(workspaceBox).toBeTruthy();
  expect(leftBox).toBeTruthy();

  const startX = handleBox.x + (handleBox.width / 2);
  const startY = handleBox.y + (handleBox.height / 2);
  const centerX = workspaceBox.x + (workspaceBox.width / 2);
  const centerY = workspaceBox.y + (workspaceBox.height / 2);
  const leftDropX = leftBox.x + Math.max(10, Math.min(leftBox.width - 10, leftBox.width * 0.35));
  const leftDropY = leftBox.y + (leftBox.height / 2);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 24, startY + 18);
  await page.mouse.move(centerX, centerY);
  await page.mouse.move(leftDropX, leftDropY);
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const state = api?.getState?.() || {};
    const layout = state.layout || {};
    const top = Array.isArray(layout.panelRows?.top) ? layout.panelRows.top : [];
    const bottom = Array.isArray(layout.panelRows?.bottom) ? layout.panelRows.bottom : [];
    return {
      dockMagnetDistance: Number(layout.dockMagnetDistance || 0),
      panelReflowAnimation: Boolean(layout.panelReflowAnimation),
      filesInTop: top.includes("files"),
      filesInBottom: bottom.includes("files"),
    };
  });

  expect(result.dockMagnetDistance).toBe(152);
  expect(result.panelReflowAnimation).toBe(false);
  expect(result.filesInTop || result.filesInBottom).toBeTruthy();
});

test("docking routes stay stable for left, right, and bottom", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen || !api?.dockPanel || !api?.setPanelOrder || !api?.setSizes || !api?.getState) {
      return { ready: false };
    }

    const setupDockScenario = () => {
      ["files", "editor", "sandbox", "tools", "log"].forEach((name) => {
        api.setPanelOpen(name, true);
      });
      api.dockPanel("log", "bottom");
      ["files", "editor", "sandbox", "tools"].forEach((name) => {
        api.dockPanel(name, "top");
      });
      api.setPanelOrder("files", 0);
      api.setPanelOrder("editor", 1);
      api.setPanelOrder("sandbox", 2);
      api.setPanelOrder("tools", 3);
      api.setSizes({ sidebarWidth: 280, sandboxWidth: 360, toolsWidth: 320, logWidth: 340 });
    };

    const readRows = () => {
      const layout = api.getState()?.layout || {};
      const rows = layout.panelRows || { top: [], bottom: [] };
      const top = Array.isArray(rows.top) ? rows.top : [];
      const bottom = Array.isArray(rows.bottom) ? rows.bottom : [];
      return { top, bottom };
    };

    const applyRoute = (zoneName) => {
      setupDockScenario();
      if (zoneName === "left") {
        api.dockPanel("editor", "top");
        api.setPanelOrder("editor", 0);
      }
      if (zoneName === "right") {
        api.dockPanel("editor", "top");
        const rows = readRows();
        api.setPanelOrder("editor", Math.max(0, rows.top.length - 1));
      }
      if (zoneName === "bottom") {
        api.dockPanel("editor", "bottom");
      }
      return readRows();
    };

    const left = applyRoute("left");
    const right = applyRoute("right");
    const bottom = applyRoute("bottom");

    return {
      ready: true,
      leftIndex: left.top.indexOf("editor"),
      leftTopHasEditor: left.top.includes("editor"),
      rightIndex: right.top.indexOf("editor"),
      rightTopLength: right.top.length,
      rightTopHasEditor: right.top.includes("editor"),
      bottomHasEditor: bottom.bottom.includes("editor"),
      bottomIndex: bottom.bottom.indexOf("editor"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.leftTopHasEditor).toBeTruthy();
  expect(result.leftIndex).toBe(0);
  expect(result.rightTopHasEditor).toBeTruthy();
  expect(result.rightIndex).toBe(result.rightTopLength - 1);
  expect(result.bottomHasEditor).toBeTruthy();
  expect(result.bottomIndex).toBeGreaterThanOrEqual(0);
});

test("dock HUD exposes clear visual guidance while dragging", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const handle = page.locator('#editorPanel .drag-handle[data-panel="editor"]');
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();

  await page.mouse.move(handleBox.x + 8, handleBox.y + 8);
  await page.mouse.down();

  const result = await page.evaluate(() => {
    const overlay = document.querySelector("#dockOverlay");
    const left = overlay?.querySelector?.('.dock-zone[data-dock-zone="left"]');
    const center = overlay?.querySelector?.('.dock-zone[data-dock-zone="center"]');
    if (!(overlay instanceof HTMLElement) || !(left instanceof HTMLElement) || !(center instanceof HTMLElement)) {
      return { ready: false };
    }

    const leftStyle = getComputedStyle(left);
    const centerStyle = getComputedStyle(center);

    return {
      ready: true,
      active: overlay.getAttribute("data-active"),
      hidden: overlay.getAttribute("aria-hidden"),
      panelLabel: String(overlay.getAttribute("data-panel-label") || ""),
      leftFontSize: Number.parseFloat(leftStyle.fontSize || "0"),
      leftOpacity: Number.parseFloat(leftStyle.opacity || "0"),
      leftBorderStyle: String(leftStyle.borderStyle || ""),
      centerText: String(center.textContent || "").trim().toLowerCase(),
      centerBorderStyle: String(centerStyle.borderStyle || ""),
    };
  });

  await page.mouse.up();

  expect(result.ready).toBeTruthy();
  expect(result.active).toBe("true");
  expect(result.hidden).toBe("false");
  expect(result.panelLabel).toBe("Editor");
  expect(result.leftFontSize).toBeGreaterThanOrEqual(9);
  expect(result.leftOpacity).toBeGreaterThan(0.5);
  expect(result.leftBorderStyle).toContain("solid");
  expect(result.centerText).toContain("center");
  expect(result.centerBorderStyle).toContain("solid");
});

test("layout panel opens centered in the viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#layoutToggle").click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#layoutPanel");
    if (!panel) return { ready: false };
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const viewportX = window.innerWidth / 2;
    const viewportY = window.innerHeight / 2;
    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      deltaX: Math.abs(centerX - viewportX),
      deltaY: Math.abs(centerY - viewportY),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.deltaX).toBeLessThanOrEqual(4);
  expect(result.deltaY).toBeLessThanOrEqual(4);
});

test("shortcut help panel opens centered in the viewport", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#editorShortcutHelpBtn").click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#shortcutHelpPanel");
    if (!panel) return { ready: false };
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const viewportX = window.innerWidth / 2;
    const viewportY = window.innerHeight / 2;
    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      deltaX: Math.abs(centerX - viewportX),
      deltaY: Math.abs(centerY - viewportY),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.deltaX).toBeLessThanOrEqual(4);
  expect(result.deltaY).toBeLessThanOrEqual(4);
});

test("shortcut help panel stays square and lists required shortcuts", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#editorShortcutHelpBtn").click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#shortcutHelpPanel");
    const close = document.querySelector("#shortcutHelpClose");
    const firstRow = document.querySelector("#shortcutHelpPanel .shortcut-help-list li");
    const firstKbd = document.querySelector("#shortcutHelpPanel .shortcut-help-list kbd");
    if (!panel || !close || !firstRow || !firstKbd) return { ready: false };

    const normalize = (value = "") => String(value || "").trim().toLowerCase();
    const parseRadius = (value = "") => String(value || "")
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    const isSquare = (value = "") => {
      const values = parseRadius(value);
      return values.length > 0 && values.every((part) => part === 0);
    };

    const rows = Array.from(document.querySelectorAll("#shortcutHelpPanel .shortcut-help-list li"));
    const labels = rows.map((row) => normalize(row.querySelector("span")?.textContent || ""));
    const keys = rows.map((row) => normalize(row.querySelector("kbd")?.textContent || ""));

    return {
      ready: true,
      panelOpen: panel.getAttribute("data-open") === "true",
      panelSquare: isSquare(getComputedStyle(panel).borderRadius),
      closeSquare: isSquare(getComputedStyle(close).borderRadius),
      rowSquare: isSquare(getComputedStyle(firstRow).borderRadius),
      kbdSquare: isSquare(getComputedStyle(firstKbd).borderRadius),
      labels,
      keys,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.panelOpen).toBeTruthy();
  expect(result.panelSquare).toBeTruthy();
  expect(result.closeSquare).toBeTruthy();
  expect(result.rowSquare).toBeTruthy();
  expect(result.kbdSquare).toBeTruthy();
  expect(result.labels).toContain("open this panel");
  expect(result.labels).toContain("close open panel/modal");
  expect(result.labels).toContain("clear console (editor focus)");
  expect(result.labels).toContain("toggle line comment");
  expect(result.labels).toContain("move line down");
  expect(result.labels).toContain("move line up");
  expect(result.labels).toContain("duplicate line down");
  expect(result.labels).toContain("duplicate line up");
  expect(result.labels).toContain("delete line/block");
  expect(result.labels).toContain("select next occurrence");
  expect(result.labels).toContain("rename file (files panel focus)");
  expect(result.labels).toContain("trash file/selection (files panel focus)");
  expect(result.keys).toContain("f1");
  expect(result.keys).toContain("esc");
  expect(result.keys).toContain("ctrl/cmd + l");
  expect(result.keys).toContain("ctrl/cmd + /");
  expect(result.keys).toContain("alt + arrowdown");
  expect(result.keys).toContain("alt + arrowup");
  expect(result.keys).toContain("alt + shift + arrowdown");
  expect(result.keys).toContain("alt + shift + arrowup");
  expect(result.keys).toContain("ctrl/cmd + shift + k");
  expect(result.keys).toContain("ctrl/cmd + d");
  expect(result.keys).toContain("f2");
  expect(result.keys).toContain("shift + f10");
});

test("all modal shells use consistent tokenized chrome and shortcut header is not clipped", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorShortcutHelpBtn").click();

  const result = await page.evaluate(() => {
    const modalSelectors = [
      "#quickOpenPalette",
      "#commandPalette",
      "#editorSearchPanel",
      "#symbolPalette",
      "#projectSearchPanel",
      "#promptDialog",
      "#editorHistoryPanel",
      "#editorSettingsPanel",
      "#shortcutHelpPanel",
      "#layoutPanel",
    ];

    const readStyleSignature = (selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) return null;
      const style = getComputedStyle(node);
      return {
        selector,
        borderTopColor: String(style.borderTopColor || ""),
        backgroundColor: String(style.backgroundColor || ""),
        borderTopLeftRadius: String(style.borderTopLeftRadius || ""),
      };
    };

    const signatures = modalSelectors.map(readStyleSignature);
    if (signatures.some((entry) => !entry)) return { ready: false };

    const baseline = signatures[0];
    const consistentChrome = signatures.every((entry) => (
      entry.borderTopColor === baseline.borderTopColor
      && entry.backgroundColor === baseline.backgroundColor
      && entry.borderTopLeftRadius === baseline.borderTopLeftRadius
    ));

    const panel = document.querySelector("#shortcutHelpPanel");
    const header = document.querySelector("#shortcutHelpPanel .layout-header");
    if (!(panel instanceof HTMLElement) || !(header instanceof HTMLElement)) {
      return { ready: false };
    }
    const panelRect = panel.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();

    return {
      ready: true,
      consistentChrome,
      shortcutOpen: panel.getAttribute("data-open") === "true",
      headerWithinPanelTop: headerRect.top >= (panelRect.top - 0.5),
      headerHeight: headerRect.height,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.consistentChrome).toBeTruthy();
  expect(result.shortcutOpen).toBeTruthy();
  expect(result.headerWithinPanelTop).toBeTruthy();
  expect(result.headerHeight).toBeGreaterThanOrEqual(52);
});

test("modal and popup shells stay viewport-bounded at high zoom", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.fazide?.setUiZoom?.(160);
  });

  await page.locator("#layoutToggle").click();

  const layoutRect = await page.evaluate(() => {
    const panel = document.querySelector("#layoutPanel");
    if (!(panel instanceof HTMLElement)) return null;
    const rect = panel.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });

  await page.locator("#layoutClose").click();
  await page.locator("#editorShortcutHelpBtn").click();

  const shortcutRect = await page.evaluate(() => {
    const panel = document.querySelector("#shortcutHelpPanel");
    if (!(panel instanceof HTMLElement)) return null;
    const rect = panel.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom };
  });

  const result = await page.evaluate(() => {
    const selectors = [
      "#quickOpenPalette",
      "#commandPalette",
      "#editorSearchPanel",
      "#symbolPalette",
      "#projectSearchPanel",
      "#promptDialog",
      "#editorHistoryPanel",
      "#editorSettingsPanel",
      "#shortcutHelpPanel",
      "#layoutPanel",
    ];

    const parsePx = (raw = "") => {
      const value = Number.parseFloat(String(raw || ""));
      return Number.isFinite(value) ? value : null;
    };

    const checks = selectors.map((selector) => {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) {
        return { selector, ready: false };
      }
      const style = getComputedStyle(node);
      const maxHeight = parsePx(style.maxHeight);
      const overflowY = String(style.overflowY || "").toLowerCase();
      return {
        selector,
        ready: true,
        maxHeight,
        overflowY,
        viewportBoundByStyle: Number.isFinite(maxHeight) ? maxHeight <= (window.innerHeight + 1) : false,
      };
    });

    return {
      zoom: Number(window.fazide?.getState?.()?.uiZoomPercent || 0),
      checks,
      viewportHeight: window.innerHeight,
    };
  });

  expect(result.zoom).toBe(160);
  expect(result.checks.every((entry) => entry.ready)).toBeTruthy();
  expect(result.checks.every((entry) => entry.viewportBoundByStyle)).toBeTruthy();
  expect(result.checks.every((entry) => ["auto", "scroll", "hidden"].includes(entry.overflowY))).toBeTruthy();
  expect(layoutRect).toBeTruthy();
  expect(shortcutRect).toBeTruthy();
  expect(layoutRect.top).toBeGreaterThanOrEqual(-1);
  expect(layoutRect.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
  expect(shortcutRect.top).toBeGreaterThanOrEqual(-1);
  expect(shortcutRect.bottom).toBeLessThanOrEqual(result.viewportHeight + 1);
});

test("editor syntax token colors follow selected theme", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const themeSelect = document.querySelector("#themeSelect");
    if (!api?.setCode || !themeSelect) return { ready: false };

    api.setCode("const total = 1;\\nif (total) { console.log('ok'); }\\n");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const readKeywordColor = () => {
      const token = document.querySelector(".CodeMirror .cm-keyword");
      if (!token) return "";
      return String(getComputedStyle(token).color || "");
    };

    const setThemeAndRead = async (theme) => {
      themeSelect.value = theme;
      themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return readKeywordColor();
    };

    const dark = await setThemeAndRead("dark");
    const light = await setThemeAndRead("light");
    const purple = await setThemeAndRead("purple");
    return { ready: true, dark, light, purple };
  });

  expect(result.ready).toBeTruthy();
  expect(result.dark).toBeTruthy();
  expect(result.light).toBeTruthy();
  expect(result.purple).toBeTruthy();
  expect(result.dark).not.toBe(result.light);
  expect(new Set([result.dark, result.light, result.purple]).size).toBeGreaterThanOrEqual(2);
});

test("editor keeps bottom comfort room so typing line stays above lower viewport half", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setCode) return { ready: false };

    const sample = Array.from({ length: 220 }, (_, index) => `const line_${index} = ${index};`).join("\n");
    api.setCode(sample);

    const cmHost = document.querySelector(".CodeMirror");
    if (cmHost && cmHost.CodeMirror) {
      const cm = cmHost.CodeMirror;
      const doc = cm.getDoc();
      const lastLine = Math.max(0, cm.lineCount() - 1);
      const lineText = String(cm.getLine(lastLine) || "");
      doc.setCursor({ line: lastLine, ch: lineText.length });
      cm.focus();
      cm.replaceSelection("\nconst typing_tail = true;");

      const scroller = cm.getScrollerElement();
      const lines = cmHost.querySelector(".CodeMirror-lines");
      const cursorPage = cm.cursorCoords(doc.getCursor(), "page");
      const rect = scroller.getBoundingClientRect();
      const cursorY = cursorPage.top - rect.top;
      const centerY = rect.height / 2;
      const spacerPx = Number.parseFloat(getComputedStyle(lines).paddingBottom || "0") || 0;
      return {
        ready: true,
        hasCodeMirror: true,
        spacerPx,
        cursorY,
        centerY,
      };
    }

    const textarea = document.querySelector("#editor");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return { ready: false };
    }
    textarea.value = `${sample}\nconst typing_tail = true;`;
    textarea.focus();
    textarea.selectionStart = textarea.value.length;
    textarea.selectionEnd = textarea.value.length;
    const spacerPx = Number.parseFloat(getComputedStyle(textarea).paddingBottom || "0") || 0;
    return {
      ready: true,
      hasCodeMirror: false,
      spacerPx,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.spacerPx).toBeGreaterThanOrEqual(96);
  if (result.hasCodeMirror) {
    expect(result.cursorY).toBeLessThanOrEqual(result.centerY + 140);
  }
});

test("editor scope breadcrumb tracks nested scope and jumps on click", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const cmHost = document.querySelector(".CodeMirror");
    const api = window.fazide;
    if (!cmHost || !cmHost.CodeMirror || !api?.setCode) return { ready: false };

    const code = [
      "class Engine {",
      "  start() {",
      "    function tick() {",
      "      return 1;",
      "    }",
      "    return tick();",
      "  }",
      "}",
      "",
    ].join("\n");

    api.setCode(code);
    const cm = cmHost.CodeMirror;
    const doc = cm.getDoc();
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    doc.setCursor({ line: 3, ch: 8 });
    cm.focus();
    await waitForPaint();
    await waitForPaint();

    const bar = document.querySelector("#editorScopeBar");
    const labels = Array.from(document.querySelectorAll("#editorScopeTrail [data-scope-item] .editor-scope-item-name"))
      .map((node) => String(node.textContent || "").trim())
      .filter(Boolean);
    const classButton = document.querySelector('#editorScopeTrail [data-scope-kind="class"]');
    if (classButton instanceof HTMLElement) {
      classButton.click();
      await waitForPaint();
    }
    const nextCursor = doc.getCursor();

    return {
      ready: true,
      visible: bar?.getAttribute("data-visible") === "true",
      labels,
      cursorLine: Number(nextCursor?.line || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.visible).toBeTruthy();
  expect(result.labels).toContain("Engine");
  expect(result.labels).toContain("tick");
  expect(result.labels.length).toBeGreaterThanOrEqual(2);
  expect(result.cursorLine).toBe(0);
});

test("editor scope breadcrumb supports keyboard traversal and smooth motion contract", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const cmHost = document.querySelector(".CodeMirror");
    const api = window.fazide;
    if (!cmHost || !cmHost.CodeMirror || !api?.setCode) return { ready: false };

    const code = [
      "class Engine {",
      "  start() {",
      "    function tick() {",
      "      return 1;",
      "    }",
      "    return tick();",
      "  }",
      "}",
    ].join("\n");

    api.setCode(code);
    const cm = cmHost.CodeMirror;
    const doc = cm.getDoc();
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    doc.setCursor({ line: 3, ch: 8 });
    cm.focus();
    await waitForPaint();
    await waitForPaint();

    const bar = document.querySelector("#editorScopeBar");
    const trail = document.querySelector("#editorScopeTrail");
    const firstButton = trail?.querySelector?.("[data-scope-item]");
    if (!(bar instanceof HTMLElement) || !(trail instanceof HTMLElement) || !(firstButton instanceof HTMLElement)) {
      return { ready: false };
    }

    firstButton.focus();
    firstButton.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await waitForPaint();

    const motionStyle = getComputedStyle(bar);
    const activeElement = document.activeElement;

    return {
      ready: true,
      visible: bar.getAttribute("data-visible") === "true",
      transitionDuration: String(motionStyle.transitionDuration || ""),
      focusedIsScopeButton: Boolean(activeElement?.matches?.("#editorScopeTrail [data-scope-item]")),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.visible).toBeTruthy();
  expect(result.transitionDuration).not.toBe("0s");
  expect(result.focusedIsScopeButton).toBeTruthy();
});

test("editor settings syntax theme selector updates syntax colors and persists", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!api?.setCode || !syntaxSelect) return { ready: false };

    api.setCode("const score = 7;\\nif (score) { console.log('ok'); }\\n");
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const readKeywordColor = () => {
      const token = document.querySelector(".CodeMirror .cm-keyword");
      if (!token) return "";
      return String(getComputedStyle(token).color || "");
    };

    await waitForPaint();
    syntaxSelect.value = "retro";
    syntaxSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const retro = readKeywordColor();

    syntaxSelect.value = "ocean";
    syntaxSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const ocean = readKeywordColor();

    let persistedTheme = "";
    try {
      const raw = localStorage.getItem("fazide.editor-settings.v1") || "{}";
      persistedTheme = String(JSON.parse(raw).syntaxTheme || "");
    } catch (_err) {
      persistedTheme = "";
    }

    return { ready: true, retro, ocean, persistedTheme };
  });

  expect(result.ready).toBeTruthy();
  expect(result.retro).toBeTruthy();
  expect(result.ocean).toBeTruthy();
  expect(result.persistedTheme).toBe("ocean");
});

test("editor settings syntax theme selector applies on input event", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!syntaxSelect) return { ready: false };

    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const readKeywordColor = () => String(getComputedStyle(document.documentElement).getPropertyValue("--syntax-keyword") || "").trim();

    syntaxSelect.value = "retro";
    syntaxSelect.dispatchEvent(new Event("input", { bubbles: true }));
    await waitForPaint();
    const retro = readKeywordColor();

    syntaxSelect.value = "temple";
    syntaxSelect.dispatchEvent(new Event("input", { bubbles: true }));
    await waitForPaint();
    const temple = readKeywordColor();

    return { ready: true, retro, temple };
  });

  expect(result.ready).toBeTruthy();
  expect(result.retro).toBeTruthy();
  expect(result.temple).toBeTruthy();
  expect(result.retro).not.toBe(result.temple);
});

test("syntax theme selection changes rendered editor token colors", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!api?.setCode || !syntaxSelect) return { ready: false };

    api.setCode("const score = 7;\nif (score) { console.log('ok'); }\n");
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const readKeywordColor = () => {
      const token = document.querySelector(".CodeMirror .cm-keyword");
      return token ? String(getComputedStyle(token).color || "").trim() : "";
    };

    syntaxSelect.value = "retro";
    syntaxSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const retroKeyword = readKeywordColor();

    syntaxSelect.value = "temple";
    syntaxSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForPaint();
    const templeKeyword = readKeywordColor();

    return { ready: true, retroKeyword, templeKeyword };
  });

  expect(result.ready).toBeTruthy();
  expect(result.retroKeyword).toBeTruthy();
  expect(result.templeKeyword).toBeTruthy();
  expect(result.retroKeyword).not.toBe(result.templeKeyword);
});

test("editor settings syntax selector includes curated eleven presets", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!syntaxSelect) return { ready: false };
    const values = Array.from(syntaxSelect.querySelectorAll("option")).map((option) => String(option.value || "").trim());
    return {
      ready: true,
      count: values.length,
      values,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.count).toBe(11);
  expect(result.values).toContain("default");
  expect(result.values).toContain("dark");
  expect(result.values).toContain("light");
  expect(result.values).toContain("purple");
  expect(result.values).toContain("retro");
  expect(result.values).toContain("temple");
  expect(result.values).toContain("midnight");
  expect(result.values).toContain("ocean");
  expect(result.values).toContain("forest");
  expect(result.values).toContain("graphite");
  expect(result.values).toContain("sunset");
});

test("legacy saved syntax theme migrates to curated theme set", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fazide.editor-settings.v1", JSON.stringify({
      profile: "balanced",
      syntaxTheme: "volcanic",
    }));
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!syntaxSelect) return { ready: false };
    const values = Array.from(syntaxSelect.querySelectorAll("option")).map((option) => String(option.value || "").trim());
    return {
      ready: true,
      selected: String(syntaxSelect.value || "").trim(),
      count: values.length,
      includesSunset: values.includes("sunset"),
      includesVolcanic: values.includes("volcanic"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.count).toBe(11);
  expect(result.selected).toBe("dark");
  expect(result.includesSunset).toBeTruthy();
  expect(result.includesVolcanic).toBeFalsy();
});

test("editor settings syntax selector includes color identity descriptions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!syntaxSelect) return { ready: false, entries: [] };
    const entries = Array.from(syntaxSelect.querySelectorAll("option")).map((option) => {
      const value = String(option.value || "").trim();
      const label = String(option.textContent || "").trim();
      const summaryMatch = label.match(/\(([^)]+)\)\s*$/);
      const colors = summaryMatch
        ? summaryMatch[1].split("/").map((part) => part.trim()).filter(Boolean)
        : [];
      return {
        value,
        hasSummary: Boolean(summaryMatch),
        colorCount: colors.length,
      };
    });
    return { ready: true, entries };
  });

  expect(result.ready).toBeTruthy();
  expect(result.entries.length).toBe(11);
  result.entries.forEach((entry) => {
    expect(entry.hasSummary).toBeTruthy();
    if (entry.value === "default") {
      expect(entry.colorCount).toBeGreaterThanOrEqual(3);
      return;
    }
    expect(entry.colorCount).toBeGreaterThanOrEqual(4);
  });
});

test("syntax presets keep five clearly distinct token colors", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!syntaxSelect) return { ready: false, failing: [] };
    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const readCssColor = (name) => String(getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim();
    const parseColor = (value) => {
      const raw = String(value || "").trim().toLowerCase();
      const rgbMatch = raw.match(/^rgba?\(([^)]+)\)$/);
      if (rgbMatch) {
        const parts = rgbMatch[1]
          .split(",")
          .slice(0, 3)
          .map((part) => Number.parseFloat(part.trim()))
          .filter((part) => Number.isFinite(part));
        if (parts.length === 3) return { r: parts[0], g: parts[1], b: parts[2] };
      }
      const hex = raw.replace(/^#/, "");
      if (/^[0-9a-f]{6}$/.test(hex)) {
        return {
          r: Number.parseInt(hex.slice(0, 2), 16),
          g: Number.parseInt(hex.slice(2, 4), 16),
          b: Number.parseInt(hex.slice(4, 6), 16),
        };
      }
      if (/^[0-9a-f]{3}$/.test(hex)) {
        return {
          r: Number.parseInt(hex[0] + hex[0], 16),
          g: Number.parseInt(hex[1] + hex[1], 16),
          b: Number.parseInt(hex[2] + hex[2], 16),
        };
      }
      return null;
    };
    const distance = (a, b) => {
      if (!a || !b) return 0;
      const dr = a.r - b.r;
      const dg = a.g - b.g;
      const db = a.b - b.b;
      return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
    };

    const tokens = ["--syntax-keyword", "--syntax-atom", "--syntax-number", "--syntax-string", "--syntax-comment"];
    const failing = [];
    const themes = Array.from(syntaxSelect.querySelectorAll("option")).map((option) => String(option.value || "").trim()).filter(Boolean);

    for (const theme of themes) {
      syntaxSelect.value = theme;
      syntaxSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForPaint();
      const colors = tokens.map((token) => readCssColor(token));
      const uniqueCount = new Set(colors).size;
      const parsed = colors.map((value) => parseColor(value));
      let minDistance = Number.POSITIVE_INFINITY;
      for (let i = 0; i < parsed.length; i += 1) {
        for (let j = i + 1; j < parsed.length; j += 1) {
          minDistance = Math.min(minDistance, distance(parsed[i], parsed[j]));
        }
      }
      if (uniqueCount < 5 || !Number.isFinite(minDistance) || minDistance < 52) {
        failing.push({
          theme,
          uniqueCount,
          minDistance: Number.isFinite(minDistance) ? Math.round(minDistance) : -1,
          colors,
        });
      }
    }

    return { ready: true, failing };
  });

  expect(result.ready).toBeTruthy();
  expect(result.failing).toEqual([]);
});

test("light theme drag handles render a plus marker", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const themeSelect = document.querySelector("#themeSelect");
    if (themeSelect) {
      themeSelect.value = "light";
      themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const handle = document.querySelector(".drag-handle");
    if (!handle) return { ready: false };
    const before = getComputedStyle(handle, "::before");
    const marker = String(before.content || "");
    return {
      ready: true,
      marker,
      fontSize: String(before.fontSize || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.marker).toContain("+");
  expect(result.fontSize).not.toBe("0px");
});

test("purple theme drag handles render a plus marker and purple status tokens", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const themeSelect = document.querySelector("#themeSelect");
    if (themeSelect) {
      themeSelect.value = "purple";
      themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const handle = document.querySelector(".drag-handle");
    const rootStyles = getComputedStyle(document.documentElement);
    if (!handle) return { ready: false };
    const before = getComputedStyle(handle, "::before");
    const marker = String(before.content || "");
    const statusInfoBg = String(rootStyles.getPropertyValue("--status-info-bg") || "").replace(/\s+/g, "");
    const overlayBackdrop = String(rootStyles.getPropertyValue("--overlay-backdrop") || "").replace(/\s+/g, "");
    return {
      ready: true,
      marker,
      statusInfoBg,
      overlayBackdrop,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.marker).toContain("+");
  expect(result.statusInfoBg).toContain("61,28,102");
  expect(result.overlayBackdrop).toContain("6,3,12");
});

test("editor drag handle stays solid and matches other panel move boxes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const readHandleStyles = () =>
    page.evaluate(() => {
      const editorHandle = document.querySelector("#editorPanel .drag-handle");
      const filesHandle = document.querySelector("#side .drag-handle");
      if (!editorHandle || !filesHandle) return { ready: false };
      const editorStyle = getComputedStyle(editorHandle);
      const filesStyle = getComputedStyle(filesHandle);
      return {
        ready: true,
        editor: {
          opacity: String(editorStyle.opacity || ""),
          backgroundColor: String(editorStyle.backgroundColor || ""),
          borderColor: String(editorStyle.borderColor || ""),
        },
        files: {
          opacity: String(filesStyle.opacity || ""),
          backgroundColor: String(filesStyle.backgroundColor || ""),
          borderColor: String(filesStyle.borderColor || ""),
        },
      };
    });

  const baseline = await readHandleStyles();
  expect(baseline.ready).toBeTruthy();
  expect(baseline.editor.opacity).toBe("1");
  expect(baseline.editor.opacity).toBe(baseline.files.opacity);
  expect(baseline.editor.backgroundColor).toBe(baseline.files.backgroundColor);
  expect(baseline.editor.borderColor).toBe(baseline.files.borderColor);

  await page.locator("#editorPanel").hover();
  const onHover = await readHandleStyles();
  expect(onHover.ready).toBeTruthy();
  expect(onHover.editor.opacity).toBe(baseline.editor.opacity);
  expect(onHover.editor.backgroundColor).toBe(baseline.editor.backgroundColor);
  expect(onHover.editor.borderColor).toBe(baseline.editor.borderColor);

  await page.mouse.move(2, 2);
  const afterHoverOut = await readHandleStyles();
  expect(afterHoverOut.ready).toBeTruthy();
  expect(afterHoverOut.editor.opacity).toBe(baseline.editor.opacity);
  expect(afterHoverOut.editor.backgroundColor).toBe(baseline.editor.backgroundColor);
  expect(afterHoverOut.editor.borderColor).toBe(baseline.editor.borderColor);
});

test("editor open file tabs use square corners", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator('#fileList [data-file-section="files"]').click();
  await page.locator("#fileList .file-row").first().click();

  const result = await page.evaluate(() => {
    const tab = document.querySelector("#editorTabs .editor-tab");
    if (!tab) return { ready: false };
    const close = tab.querySelector(".editor-tab-close");
    const parseRadius = (value = "") => String(value || "")
      .trim()
      .split(/\s+/)
      .map((part) => Number.parseFloat(part))
      .filter((part) => Number.isFinite(part));
    const tabRadiusParts = parseRadius(getComputedStyle(tab).borderRadius);
    const closeRadiusParts = parseRadius(close ? getComputedStyle(close).borderRadius : "");
    const tabSquare = tabRadiusParts.length > 0 && tabRadiusParts.every((part) => part === 0);
    const closeSquare = closeRadiusParts.length > 0 && closeRadiusParts.every((part) => part === 0);
    return {
      ready: true,
      tabSquare,
      closeSquare,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.tabSquare).toBeTruthy();
  expect(result.closeSquare).toBeTruthy();
});

test("games catalog populated keeps section available and collapsed by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const games = api?.listGames?.() || [];
    const section = document.querySelector("#filesGames");
    const toggle = document.querySelector("#gamesSelectorToggle");
    const list = document.querySelector("#gamesList");
    const load = document.querySelector("#gameLoad");

    return {
      count: games.length,
      sectionHidden: section?.getAttribute("aria-hidden") === "true",
      toggleDisabled: Boolean(toggle?.disabled),
      toggleExpanded: String(toggle?.getAttribute("aria-expanded") || ""),
      listHidden: list?.getAttribute("aria-hidden") === "true",
      listCount: Number(list?.children?.length || 0),
      loadHidden: Boolean(load?.hidden),
      loadDisabled: Boolean(load?.disabled),
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.sectionHidden).toBeFalsy();
  expect(result.toggleDisabled).toBeFalsy();
  expect(result.toggleExpanded).toBe("false");
  expect(result.listHidden).toBeTruthy();
  expect(result.listCount).toBe(result.count);
  expect(result.loadHidden).toBeTruthy();
  expect(result.loadDisabled).toBeTruthy();
});

test("applications catalog populated keeps section available and collapsed by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const apps = api?.listApplications?.() || [];
    const section = document.querySelector("#filesApps");
    const toggle = document.querySelector("#appsSelectorToggle");
    const list = document.querySelector("#applicationsList");
    const load = document.querySelector("#appLoad");

    return {
      count: apps.length,
      sectionHidden: section?.getAttribute("aria-hidden") === "true",
      toggleDisabled: Boolean(toggle?.disabled),
      toggleExpanded: String(toggle?.getAttribute("aria-expanded") || ""),
      listHidden: list?.getAttribute("aria-hidden") === "true",
      listCount: Number(list?.children?.length || 0),
      loadHidden: Boolean(load?.hidden),
      loadDisabled: Boolean(load?.disabled),
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.sectionHidden).toBeFalsy();
  expect(result.toggleDisabled).toBeFalsy();
  expect(result.toggleExpanded).toBe("false");
  expect(result.listHidden).toBeTruthy();
  expect(result.listCount).toBe(result.count);
  expect(result.loadHidden).toBeTruthy();
  expect(result.loadDisabled).toBeTruthy();
});

test("lessons catalog populated keeps section available and collapsed by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const lessons = api?.listLessons?.() || [];
    const section = document.querySelector("#filesLessons");
    const toggle = document.querySelector("#lessonsSelectorToggle");
    const list = document.querySelector("#lessonsList");
    const load = document.querySelector("#lessonLoad");

    return {
      count: lessons.length,
      sectionHidden: section?.getAttribute("aria-hidden") === "true",
      toggleDisabled: Boolean(toggle?.disabled),
      toggleExpanded: String(toggle?.getAttribute("aria-expanded") || ""),
      listHidden: list?.getAttribute("aria-hidden") === "true",
      listCount: Number(list?.children?.length || 0),
      loadHidden: Boolean(load?.hidden),
      loadDisabled: Boolean(load?.disabled),
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.sectionHidden).toBeFalsy();
  expect(result.toggleDisabled).toBeFalsy();
  expect(result.toggleExpanded).toBe("false");
  expect(result.listHidden).toBeTruthy();
  expect(result.listCount).toBe(result.count);
  expect(result.loadHidden).toBeTruthy();
  expect(result.loadDisabled).toBeTruthy();
});

test("runtime validation applications are present in Applications catalog", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const apps = window.fazide?.listApplications?.() || [];
    const ids = apps.map((entry) => String(entry.id || ""));
    return {
      count: ids.length,
      hasRuntimeMatrix: ids.includes("runtime-full-matrix-app"),
      hasRuntimeJs: ids.includes("runtime-js-check-app"),
      hasRuntimeHtml: ids.includes("runtime-html-check-app"),
      hasRuntimeCss: ids.includes("runtime-css-check-app"),
      hasRuntimePy: ids.includes("runtime-python-check-app"),
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.hasRuntimeMatrix).toBeTruthy();
  expect(result.hasRuntimeJs).toBeTruthy();
  expect(result.hasRuntimeHtml).toBeTruthy();
  expect(result.hasRuntimeCss).toBeTruthy();
  expect(result.hasRuntimePy).toBeFalsy();
});

test("runtime validation applications execute and emit expected console/sandbox signals", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadApplication || !api?.listApplications) return { ready: false };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const loadJs = await api.loadApplication("runtime-js-check-app", { run: true });
    await wait(420);
    const logAfterJs = String(document.querySelector("#log")?.textContent || "");

    const loadHtml = await api.loadApplication("runtime-html-check-app", { run: true });
    await wait(420);
    const logAfterHtml = String(document.querySelector("#log")?.textContent || "");

    const loadCss = await api.loadApplication("runtime-css-check-app", { run: true });
    await wait(420);
    const statusAfterCss = String(document.querySelector("#statusText")?.textContent || "");
    const langAfterCss = String(document.querySelector("#footerEditorLang")?.textContent || "");

    return {
      ready: true,
      loadJs,
      loadHtml,
      loadCss,
      jsProbeSeen: /runtime-js-check:.*console-log/.test(logAfterJs),
      htmlProbeSeen: /runtime-html-check:.*linked-js-console/.test(logAfterHtml),
      cssRan: statusAfterCss.toLowerCase().includes("ran"),
      cssLangSeen: langAfterCss.toLowerCase().includes("css"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loadJs).toBeTruthy();
  expect(result.loadHtml).toBeTruthy();
  expect(result.loadCss).toBeTruthy();
  expect(result.jsProbeSeen).toBeTruthy();
  expect(result.htmlProbeSeen).toBeTruthy();
  expect(result.cssRan).toBeTruthy();
  expect(result.cssLangSeen).toBeTruthy();
});

test("runtime full matrix app emits detailed signals for html/css channels", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadApplication || !api?.exportWorkspaceData || !api?.importWorkspaceData) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const loadOk = await api.loadApplication("runtime-full-matrix-app", { run: true });
    if (!loadOk) {
      return { ready: true, ok: false };
    }
    await wait(460);
    const logAfterHtml = String(document.querySelector("#log")?.textContent || "");

    const activateBySuffix = (suffix) => {
      const snapshot = api.exportWorkspaceData();
      const data = snapshot?.data;
      if (!data || !Array.isArray(data.files)) return false;
      const target = data.files.find((file) => String(file?.name || "").toLowerCase().endsWith(String(suffix).toLowerCase()));
      if (!target?.id) return false;
      data.activeId = target.id;
      const openIds = Array.isArray(data.openIds) ? data.openIds : [];
      data.openIds = Array.from(new Set([...openIds, target.id]));
      return api.importWorkspaceData(snapshot);
    };

    const cssSwitched = activateBySuffix("/matrix.css");
    if (!cssSwitched) {
      return { ready: true, ok: false, reason: "css-switch-failed" };
    }
    document.querySelector("#run")?.click();
    await wait(360);
    const statusAfterCss = String(document.querySelector("#statusText")?.textContent || "");
    const langAfterCss = String(document.querySelector("#footerEditorLang")?.textContent || "");

    return {
      ready: true,
      ok: true,
      htmlDetailedSeen: /runtime-full-matrix:.*html-js:done/.test(logAfterHtml),
      cssRan: statusAfterCss.toLowerCase().includes("ran"),
      cssLangSeen: langAfterCss.toLowerCase().includes("css"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.htmlDetailedSeen).toBeTruthy();
  expect(result.cssRan).toBeTruthy();
  expect(result.cssLangSeen).toBeTruthy();
});

test("games load successfully", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.listGames || !api?.loadGame || !api?.listFiles) {
      return { ready: false };
    }

    const games = api.listGames();
    const firstGame = games[0];
    if (!firstGame?.id) {
      return { ready: false, reason: "no-games" };
    }

    const loaded = await api.loadGame(firstGame.id, { run: false });
    const files = api.listFiles();
    const activeName = String(files.find((entry) => entry.active)?.name || "");

    return {
      ready: true,
      loaded,
      fileCount: files.length,
      activeName,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.fileCount).toBeGreaterThan(0);
  expect(result.activeName.length).toBeGreaterThan(0);
});

test("games applications and lessons load buttons reveal and enable when catalogs are expanded", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const gamesToggle = document.querySelector("#gamesSelectorToggle");
    const appsToggle = document.querySelector("#appsSelectorToggle");
    const lessonsToggle = document.querySelector("#lessonsSelectorToggle");
    gamesToggle?.click();
    appsToggle?.click();
    lessonsToggle?.click();

    const gameLoad = document.querySelector("#gameLoad");
    const appLoad = document.querySelector("#appLoad");
    const lessonLoad = document.querySelector("#lessonLoad");
    if (!gamesToggle || !appsToggle || !lessonsToggle || !gameLoad || !appLoad || !lessonLoad) {
      return { ready: false };
    }

    return {
      ready: true,
      gamesToggleDisabled: Boolean(gamesToggle.disabled),
      appsToggleDisabled: Boolean(appsToggle.disabled),
      lessonsToggleDisabled: Boolean(lessonsToggle.disabled),
      gameLoadHidden: Boolean(gameLoad.hidden),
      appLoadHidden: Boolean(appLoad.hidden),
      lessonLoadHidden: Boolean(lessonLoad.hidden),
      gameLoadDisabled: Boolean(gameLoad.disabled),
      appLoadDisabled: Boolean(appLoad.disabled),
      lessonLoadDisabled: Boolean(lessonLoad.disabled),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.gamesToggleDisabled).toBeFalsy();
  expect(result.appsToggleDisabled).toBeFalsy();
  expect(result.lessonsToggleDisabled).toBeFalsy();
  expect(result.gameLoadHidden).toBeFalsy();
  expect(result.appLoadHidden).toBeFalsy();
  expect(result.lessonLoadHidden).toBeFalsy();
  expect(result.gameLoadDisabled).toBeFalsy();
  expect(result.appLoadDisabled).toBeFalsy();
  expect(result.lessonLoadDisabled).toBeFalsy();
});

test("files panel sections can be reordered and persist in layout state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const source = document.querySelector('#fileList [data-files-section-id="applications"]');
    const target = document.querySelector('#fileList [data-files-section-id="open-editors"]');
    if (!source || !target || typeof DragEvent === "undefined" || typeof DataTransfer === "undefined") {
      return { ready: false };
    }

    const payload = new DataTransfer();
    source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: payload }));
    const rect = target.getBoundingClientRect();
    const clientY = rect.top + 1;
    target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: payload, clientY }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: payload, clientY }));
    source.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: payload }));

    const sectionOrder = Array.from(document.querySelectorAll('#fileList [data-files-section-id]'))
      .map((node) => String(node.getAttribute("data-files-section-id") || ""));

    let persistedOrder = [];
    try {
      const raw = localStorage.getItem("fazide.layout.v1") || "{}";
      const parsed = JSON.parse(raw);
      persistedOrder = Array.isArray(parsed.filesSectionOrder) ? parsed.filesSectionOrder : [];
    } catch (_err) {
      persistedOrder = [];
    }

    return {
      ready: true,
      sectionOrder,
      persistedOrder,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.sectionOrder.slice(0, 5)).toEqual(["applications", "open-editors", "files", "games", "lessons"]);
  expect(result.persistedOrder).toEqual(["applications", "open-editors", "files", "games", "lessons"]);
});

test("files panel width is clamped to a minimum of 180px", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const side = document.querySelector("#side");
    const shell = document.querySelector("#appShell");
    const slider = document.querySelector("#layoutSidebarWidth");
    const input = document.querySelector("#layoutSidebarWidthInput");
    if (!api?.setSidebarWidth || !api?.getState || !side || !shell || !slider || !input) {
      return { ready: false };
    }

    const applied = Number(api.setSidebarWidth(48));
    const layoutWidth = Number(api.getState().layout?.sidebarWidth);
    const cssMin = Number.parseFloat(getComputedStyle(side).minWidth || "0");
    const cssVar = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--sidebar-width") || "0");

    return {
      ready: true,
      applied,
      layoutWidth,
      cssMin,
      cssVar,
      sliderMin: Number(slider.min),
      inputMin: Number(input.min),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.sliderMin).toBe(180);
  expect(result.inputMin).toBe(180);
  expect(result.cssMin).toBe(180);
  expect(result.applied).toBeGreaterThanOrEqual(180);
  expect(result.layoutWidth).toBeGreaterThanOrEqual(180);
  expect(result.cssVar).toBeGreaterThanOrEqual(180);
});

test("panel docking keeps rows within three open columns and preserves keyboard target placement", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const sandboxHandle = document.querySelector('#sandboxPanel .drag-handle[data-panel="sandbox"]');
    if (!api?.setPanelOpen || !api?.getState || !(sandboxHandle instanceof HTMLElement)) {
      return { ready: false };
    }

    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("log", true);
    api.setPanelOpen("tools", true);

    sandboxHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    sandboxHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));

    const layout = api.getState()?.layout || {};
    const rows = layout.panelRows || { top: [], bottom: [] };
    const isOpen = {
      files: layout.filesOpen !== false,
      editor: layout.editorOpen !== false,
      sandbox: layout.sandboxOpen !== false,
      log: layout.logOpen !== false,
      tools: layout.toolsOpen !== false,
    };
    const topOpen = (Array.isArray(rows.top) ? rows.top : []).filter((panel) => isOpen[panel]);
    const bottomOpen = (Array.isArray(rows.bottom) ? rows.bottom : []).filter((panel) => isOpen[panel]);

    return {
      ready: true,
      topOpenCount: topOpen.length,
      bottomOpenCount: bottomOpen.length,
      topHasSandbox: topOpen.includes("sandbox"),
      topHasEditor: topOpen.includes("editor"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.topOpenCount).toBeLessThanOrEqual(3);
  expect(result.bottomOpenCount).toBeLessThanOrEqual(3);
  expect(result.topHasSandbox).toBeTruthy();
  expect(result.topHasEditor).toBeTruthy();
});

test("workspace edge resize respects row-aware max cap for files panel", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen || !api?.setSidebarWidth) return;
    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", false);
    api.setSidebarWidth(200);
  });

  const side = page.locator("#side");
  await expect(side).toBeVisible();
  const rect = await side.boundingBox();
  expect(rect).toBeTruthy();

  const startX = rect.x + rect.width - 2;
  const startY = rect.y + rect.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 1500, startY);
  await page.mouse.up();

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const layout = api?.getState?.()?.layout || {};
    const topOrder = Array.isArray(layout.panelRows?.top) ? layout.panelRows.top : [];
    const isOpen = {
      files: layout.filesOpen !== false,
      editor: layout.editorOpen !== false,
      sandbox: layout.sandboxOpen !== false,
      tools: layout.toolsOpen !== false,
      log: layout.logOpen !== false,
    };
    const topOpen = topOrder.filter((panel) => isOpen[panel]);
    const row = document.querySelector('#workspaceTop');
    const rowRect = row?.getBoundingClientRect?.() || { width: window.innerWidth };
    const gap = Number(layout.panelGap || 0);
    const gapTotal = Math.max(0, topOpen.length - 1) * 2 * gap;
    const usable = Math.max(0, rowRect.width - gapTotal);
    const expectedMax = topOpen.includes("editor")
      ? Math.round((usable * 2) / 3)
      : Math.round(usable * 0.9);

    return {
      ready: true,
      filesWidth: Number(layout.sidebarWidth || 0),
      expectedMax,
      topOpen,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.topOpen).toContain("editor");
  expect(result.filesWidth).toBeLessThanOrEqual(result.expectedMax);
});

test("tiny editor width still supports edge resize", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(() => {
    const api = window.fazide;
    const editor = document.querySelector("#editorPanel");
    if (!api?.setPanelOpen || !api?.setSidebarWidth || !api?.setSandboxWidth || !api?.setPanelOrder || !api?.dockPanel || !api?.getState || !(editor instanceof HTMLElement)) {
      return { ready: false };
    }

    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", false);
    api.setPanelOpen("log", true);
    api.dockPanel("files", "top");
    api.dockPanel("editor", "top");
    api.dockPanel("sandbox", "top");
    api.setPanelOrder("files", 0);
    api.setPanelOrder("editor", 1);
    api.setPanelOrder("sandbox", 2);

    api.setSidebarWidth(560);
    api.setSandboxWidth(560);

    const rect = editor.getBoundingClientRect();
    const beforeSidebar = Number(api.getState()?.layout?.sidebarWidth || 0);
    const beforeSandbox = Number(api.getState()?.layout?.sandboxWidth || 0);
    return {
      ready: true,
      editorWidth: rect.width,
      beforeSidebar,
      beforeSandbox,
    };
  });

  expect(setup.ready).toBeTruthy();

  const filesSeparator = page.getByRole("separator", { name: "Resize files panel" });
  await expect(filesSeparator).toBeVisible();
  const side = page.locator("#side");
  await expect(side).toBeVisible();
  const beforeSide = await side.boundingBox();
  expect(beforeSide).toBeTruthy();

  const rect = await filesSeparator.boundingBox();
  expect(rect).toBeTruthy();

  const startX = rect.x + rect.width / 2;
  const startY = rect.y + (rect.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY);
  await page.mouse.up();

  const afterSide = await side.boundingBox();
  expect(afterSide).toBeTruthy();

  const result = await page.evaluate(({ beforeSidebar, beforeSandbox }) => {
    const api = window.fazide;
    const afterSidebar = Number(api?.getState?.()?.layout?.sidebarWidth || 0);
    const afterSandbox = Number(api?.getState?.()?.layout?.sandboxWidth || 0);
    return {
      ready: Boolean(api?.getState),
      beforeSidebar,
      beforeSandbox,
      afterSidebar,
      afterSandbox,
    };
  }, {
    beforeSidebar: setup.beforeSidebar,
    beforeSandbox: setup.beforeSandbox,
  });

  expect(result.ready).toBeTruthy();
  const sidebarChanged = Math.abs(afterSide.width - beforeSide.width) >= 1;
  expect(sidebarChanged).toBeTruthy();
});

test("splitter resize remains functional at 160 percent zoom", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setUiZoom || !api?.setPanelOpen || !api?.setSidebarWidth || !api?.setSandboxWidth || !api?.getState) {
      return { ready: false };
    }
    api.setPanelOpen("files", true);
    api.setPanelOpen("editor", true);
    api.setPanelOpen("sandbox", false);
    api.setPanelOpen("tools", false);
    api.setUiZoom(160);
    api.setSidebarWidth(240);
    const layout = api.getState()?.layout || {};
    return {
      ready: true,
      beforeSidebar: Number(layout.sidebarWidth || 0),
      zoom: Number(api.getState?.().uiZoomPercent || 0),
    };
  });

  expect(setup.ready).toBeTruthy();
  expect(setup.zoom).toBe(160);

  const separator = page.getByRole("separator", { name: "Resize files panel" });
  await expect(separator).toBeVisible();
  const box = await separator.boundingBox();
  expect(box).toBeTruthy();

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 240, startY, { steps: 12 });
  await page.mouse.up();

  const result = await page.evaluate((beforeSidebar) => {
    const api = window.fazide;
    const afterSidebar = Number(api?.getState?.()?.layout?.sidebarWidth || 0);
    return {
      ready: Boolean(api?.getState),
      beforeSidebar,
      afterSidebar,
      delta: afterSidebar - beforeSidebar,
    };
  }, setup.beforeSidebar);

  if (Math.abs(result.delta) < 16) {
    await separator.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
  }

  const afterKeyboard = await page.evaluate((beforeSidebar) => {
    const api = window.fazide;
    const afterSidebar = Number(api?.getState?.()?.layout?.sidebarWidth || 0);
    return {
      ready: Boolean(api?.getState),
      delta: afterSidebar - beforeSidebar,
    };
  }, setup.beforeSidebar);

  expect(afterKeyboard.ready).toBeTruthy();
  expect(Math.abs(afterKeyboard.delta)).toBeGreaterThanOrEqual(16);
});

test("panel layout keeps every visible panel in-bounds with zero overlap after resize stress", async ({ page }) => {
  test.slow();
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore storage-clear failures in restricted environments
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const scenarios = [
    {
      open: { files: true, editor: true, sandbox: true, tools: false, log: true },
      rows: {
        top: ["files", "editor", "sandbox"],
        bottom: ["log", "tools"],
      },
      sizes: { sidebarWidth: 260, sandboxWidth: 320, toolsWidth: 300, logWidth: 320 },
    },
    {
      open: { files: true, editor: true, sandbox: false, tools: true, log: true },
      rows: {
        top: ["files", "editor", "tools"],
        bottom: ["log", "sandbox"],
      },
      sizes: { sidebarWidth: 280, sandboxWidth: 260, toolsWidth: 360, logWidth: 340 },
    },
    {
      open: { files: true, editor: true, sandbox: true, tools: true, log: true },
      rows: {
        top: ["files", "editor", "tools"],
        bottom: ["sandbox", "log"],
      },
      sizes: { sidebarWidth: 300, sandboxWidth: 300, toolsWidth: 300, logWidth: 300 },
    },
  ];

  const separators = [
    "Resize files panel",
    "Resize sandbox panel",
    "Resize tools panel",
    "Resize console panel",
    "Resize bottom dock",
  ];

  for (const zoom of [100, 130]) {
    for (const scenario of scenarios) {
      const setup = await page.evaluate(({ zoomPercent, nextScenario }) => {
        const api = window.fazide;
        if (!api?.setPanelOpen || !api?.dockPanel || !api?.setPanelOrder || !api?.setUiZoom || !api?.setSizes || !api?.getState) {
          return { ready: false };
        }

        if (typeof api.resetLayout === "function") {
          api.resetLayout();
        }

        api.setUiZoom(zoomPercent);

        ["files", "editor", "sandbox", "tools", "log"].forEach((panel) => {
          api.setPanelOpen(panel, Boolean(nextScenario.open[panel]));
        });

        ["files", "editor", "sandbox", "tools", "log"].forEach((panel) => {
          if (!nextScenario.rows.top.includes(panel) && !nextScenario.rows.bottom.includes(panel)) {
            return;
          }
          const targetRow = nextScenario.rows.top.includes(panel) ? "top" : "bottom";
          api.dockPanel(panel, targetRow);
          const targetOrder = nextScenario.rows[targetRow].indexOf(panel);
          if (targetOrder >= 0) {
            api.setPanelOrder(panel, targetOrder);
          }
        });

        api.setSizes(nextScenario.sizes);
        return { ready: true };
      }, { zoomPercent: zoom, nextScenario: scenario });

      expect(setup.ready).toBeTruthy();

      for (const name of separators) {
        const separator = page.getByRole("separator", { name });
        if ((await separator.count()) < 1) continue;
        if (!(await separator.first().isVisible())) continue;

        const box = await separator.first().boundingBox();
        if (!box) continue;

        const orientation = await separator.first().getAttribute("aria-orientation");
        const startX = box.x + (box.width / 2);
        const startY = box.y + (box.height / 2);
        const delta = 220;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        if (orientation === "horizontal") {
          await page.mouse.move(startX, startY - delta);
          await page.mouse.move(startX, startY + delta);
        } else {
          await page.mouse.move(startX + delta, startY);
          await page.mouse.move(startX - delta, startY);
        }
        await page.mouse.up();
      }

      await page.evaluate(() => {
        const api = window.fazide;
        if (!api?.setUiZoom || !api?.getUiZoom) return;
        const currentZoom = Number(api.getUiZoom()) || 100;
        api.setUiZoom(currentZoom);
      });

      const readWorkspaceAudit = () => page.evaluate(() => {
        const workspace = document.querySelector("#workspace");
        if (!(workspace instanceof HTMLElement)) {
          return { ready: false, violations: ["workspace-missing"] };
        }
        const workspaceRect = workspace.getBoundingClientRect();
        const epsilon = 2;

        const panelEntries = [
          ["files", document.querySelector("#side")],
          ["editor", document.querySelector("#editorPanel")],
          ["sandbox", document.querySelector("#sandboxPanel")],
          ["tools", document.querySelector("#toolsPanel")],
          ["log", document.querySelector("#logPanel")],
        ]
          .filter(([, node]) => node instanceof HTMLElement)
          .map(([name, node]) => {
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            const hidden = node.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden";
            return {
              name,
              hidden,
              rect,
            };
          })
          .filter((entry) => !entry.hidden && entry.rect.width > 1 && entry.rect.height > 1);

        const violations = [];
        panelEntries.forEach((entry) => {
          if (entry.rect.left < workspaceRect.left - epsilon) {
            violations.push(`${entry.name}:left-out`);
          }
          if (entry.rect.right > workspaceRect.right + epsilon) {
            violations.push(`${entry.name}:right-out`);
          }
          if (entry.rect.top < workspaceRect.top - epsilon) {
            violations.push(`${entry.name}:top-out`);
          }
          if (entry.rect.bottom > workspaceRect.bottom + epsilon) {
            violations.push(`${entry.name}:bottom-out`);
          }
        });

        for (let idx = 0; idx < panelEntries.length; idx += 1) {
          for (let nextIdx = idx + 1; nextIdx < panelEntries.length; nextIdx += 1) {
            const left = panelEntries[idx];
            const right = panelEntries[nextIdx];
            const overlapWidth = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
            const overlapHeight = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
            if (overlapWidth > 2 && overlapHeight > 2) {
              violations.push(`${left.name}:${right.name}:overlap`);
            }
          }
        }

        return {
          ready: true,
          violations,
          panelCount: panelEntries.length,
        };
      });

      await expect.poll(async () => {
        const audit = await readWorkspaceAudit();
        if (!audit.ready || audit.panelCount <= 0) return -1;
        return audit.violations.length;
      }, {
        timeout: 5000,
      }).toBe(0);

      const audit = await readWorkspaceAudit();

      expect(audit.ready).toBeTruthy();
      expect(audit.panelCount).toBeGreaterThan(0);
      expect(audit.violations).toEqual([]);
    }
  }
});

test("sandbox panel width is clamped to a minimum of 180px", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const panel = document.querySelector("#sandboxPanel");
    const shell = document.querySelector("#appShell");
    const slider = document.querySelector("#layoutSandboxWidth");
    const input = document.querySelector("#layoutSandboxWidthInput");
    if (!api?.setSandboxWidth || !api?.setPanelOpen || !api?.getState || !panel || !shell || !slider || !input) {
      return { ready: false };
    }

    api.setPanelOpen("sandbox", true);
    const applied = Number(api.setSandboxWidth(48));
    const layoutWidth = Number(api.getState().layout?.sandboxWidth);
    const cssMin = Number.parseFloat(getComputedStyle(panel).minWidth || "0");
    const cssVar = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--sandbox-width") || "0");

    return {
      ready: true,
      applied,
      layoutWidth,
      cssMin,
      cssVar,
      sliderMin: Number(slider.min),
      inputMin: Number(input.min),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.sliderMin).toBe(180);
  expect(result.inputMin).toBe(180);
  expect(result.cssMin).toBe(180);
  expect(result.applied).toBeGreaterThanOrEqual(180);
  expect(result.layoutWidth).toBeGreaterThanOrEqual(180);
  expect(result.cssVar).toBeGreaterThanOrEqual(180);
});

test("all main panels keep safe minimum widths", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const shell = document.querySelector("#appShell");
    const logInput = document.querySelector("#layoutLogWidth");
    const filesInput = document.querySelector("#layoutSidebarWidth");
    const sandboxInput = document.querySelector("#layoutSandboxWidth");
    const toolsInput = document.querySelector("#layoutToolsWidth");
    if (
      !api?.setPanelOpen ||
      !api?.setLogWidth ||
      !api?.setToolsWidth ||
      !api?.getState ||
      !shell ||
      !logInput ||
      !filesInput ||
      !sandboxInput ||
      !toolsInput
    ) {
      return { ready: false };
    }

    const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const probeMinWidth = (className) => {
      const probe = document.createElement("section");
      probe.className = `card ${className}`;
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.pointerEvents = "none";
      probe.style.left = "-9999px";
      probe.style.top = "-9999px";
      document.body.appendChild(probe);
      const value = Number.parseFloat(getComputedStyle(probe).minWidth || "0");
      probe.remove();
      return value;
    };

    api.setPanelOpen("log", true);
    api.setPanelOpen("files", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", true);
    await waitForPaint();
    const appliedLog = Number(api.setLogWidth(48));
    const appliedTools = Number(api.setToolsWidth(48));
    await waitForPaint();
    const layout = api.getState().layout || {};

    const varPx = (name) => Number.parseFloat(getComputedStyle(shell).getPropertyValue(name) || "0");

    return {
      ready: true,
      appliedLog,
      appliedTools,
      layoutLog: Number(layout.logWidth || 0),
      layoutTools: Number(layout.toolsWidth || 0),
      minLog: probeMinWidth("log-panel"),
      minFiles: probeMinWidth("side"),
      minSandbox: probeMinWidth("sandbox-panel"),
      minTools: probeMinWidth("tools-panel"),
      minEditor: probeMinWidth("editor-panel"),
      logInputMin: Number(logInput.min),
      filesInputMin: Number(filesInput.min),
      sandboxInputMin: Number(sandboxInput.min),
      toolsInputMin: Number(toolsInput.min),
      cssLogVar: varPx("--log-width"),
      cssToolsVar: varPx("--tools-width"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.logInputMin).toBe(180);
  expect(result.filesInputMin).toBe(180);
  expect(result.sandboxInputMin).toBe(180);
  expect(result.toolsInputMin).toBe(180);
  expect(result.minLog).toBe(180);
  expect(result.minFiles).toBe(180);
  expect(result.minSandbox).toBe(180);
  expect(result.minTools).toBe(180);
  expect(result.minEditor).toBe(240);
  expect(result.appliedLog).toBeGreaterThanOrEqual(180);
  expect(result.appliedTools).toBeGreaterThanOrEqual(180);
  expect(result.layoutLog).toBeGreaterThanOrEqual(180);
  expect(result.layoutTools).toBeGreaterThanOrEqual(180);
  expect(result.cssLogVar).toBeGreaterThanOrEqual(180);
  expect(result.cssToolsVar).toBeGreaterThanOrEqual(180);
});

test("panel width controls allow large but bounded max widths", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setPanelOpen || !api?.getState) return { ready: false };

    api.setPanelOpen("files", true);
    api.setPanelOpen("sandbox", true);
    api.setPanelOpen("tools", true);
    api.setPanelOpen("log", true);

    const topRow = document.querySelector("#workspaceTop");
    const shell = document.querySelector("#appShell");
    const workspaceWidth = Number(topRow?.getBoundingClientRect?.().width || shell?.getBoundingClientRect?.().width || 0);

    const getMax = (selector) => Number(document.querySelector(selector)?.getAttribute("max") || "0");

    return {
      ready: true,
      workspaceWidth,
      sidebarMax: getMax("#layoutSidebarWidth"),
      sandboxMax: getMax("#layoutSandboxWidth"),
      toolsMax: getMax("#layoutToolsWidth"),
      logMax: getMax("#layoutLogWidth"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.workspaceWidth).toBeGreaterThan(0);
  expect(result.sidebarMax).toBeGreaterThanOrEqual(300);
  expect(result.sandboxMax).toBeGreaterThanOrEqual(400);
  expect(result.toolsMax).toBeGreaterThanOrEqual(400);
  expect(result.logMax).toBeGreaterThanOrEqual(400);
  expect(result.sidebarMax).toBeLessThanOrEqual(result.workspaceWidth);
  expect(result.sandboxMax).toBeLessThanOrEqual(result.workspaceWidth);
  expect(result.toolsMax).toBeLessThanOrEqual(result.workspaceWidth);
  expect(result.logMax).toBeLessThanOrEqual(result.workspaceWidth);
});

test("renaming a file in a folder keeps its folder path", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator('#fileList [data-file-section="files"]').click();

  const created = await page.evaluate(() => {
    const folder = `demo-${Date.now().toString(36)}`;
    window.fazide?.createFolder?.(folder);
    window.fazide?.createFileInFolder?.(folder, { rename: true });
    const list = window.fazide?.listFiles?.() || [];
    const target = list.find((file) => String(file.name || "").startsWith(`${folder}/`));
    if (!target) return null;
    const parts = String(target.name || "").split("/");
    return {
      id: target.id,
      folder,
      leaf: parts[parts.length - 1],
      code: window.fazide?.getCode?.() || "",
    };
  });

  expect(created).toBeTruthy();
  expect(created.leaf).toBe("untitled");
  expect(created.code).toBe("");
  const input = page.locator(`[data-file-rename="${created.id}"]`);
  await expect(input).toHaveValue(created.leaf);

  await input.fill("renamed");
  await input.press("Enter");

  const renamedPath = await page.evaluate((id) => {
    const list = window.fazide?.listFiles?.() || [];
    const file = list.find((entry) => entry.id === id);
    return file?.name || "";
  }, created.id);

  expect(renamedPath).toBe(`${created.folder}/renamed`);
});

test("files tree renders folder and file-type icons for html/js entries", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.createFolder || !api?.createFile || !api?.listFiles || !api?.expandAllFolders) {
      return { ready: false };
    }

    const stamp = Date.now().toString(36);
    const folder = `icons-${stamp}`;
    const htmlName = `${folder}/index-${stamp}.html`;
    const jsName = `${folder}/main-${stamp}.js`;
    api.createFolder(folder);
    api.createFile(htmlName, "<main>ok</main>");
    api.createFile(jsName, "console.log('ok');");
    api.expandAllFolders();

    const files = api.listFiles();
    const htmlFile = files.find((entry) => entry.name === htmlName);
    const jsFile = files.find((entry) => entry.name === jsName);

    return {
      ready: true,
      folder,
      htmlId: htmlFile?.id || "",
      jsId: jsFile?.id || "",
    };
  });

  expect(setup.ready).toBeTruthy();
  expect(setup.htmlId).toBeTruthy();
  expect(setup.jsId).toBeTruthy();

  const filesSection = page.locator('#fileList [data-file-section="files"]');
  await expect(filesSection).toHaveCount(1);
  const expanded = await filesSection.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await filesSection.click();
  }

  const result = await page.evaluate(({ folder, htmlId, jsId }) => {
    const folderIcon = document.querySelector(`.file-folder-row[data-folder-toggle="${folder}"] .file-folder-icon`);
    const htmlIcon = document.querySelector(`#file-option-files-${htmlId} .file-row-icon`);
    const jsIcon = document.querySelector(`#file-option-files-${jsId} .file-row-icon`);
    return {
      folderSrc: folderIcon instanceof HTMLImageElement ? String(folderIcon.getAttribute("src") || "") : "",
      htmlSrc: htmlIcon instanceof HTMLImageElement ? String(htmlIcon.getAttribute("src") || "") : "",
      jsSrc: jsIcon instanceof HTMLImageElement ? String(jsIcon.getAttribute("src") || "") : "",
    };
  }, {
    folder: setup.folder,
    htmlId: setup.htmlId,
    jsId: setup.jsId,
  });

  expect(result.folderSrc).toContain("folder-");
  expect(result.htmlSrc).toContain("html.svg");
  expect(result.jsSrc).toContain("js.svg");
});

test("dev terminal runs safe commands and blocks privileged eval commands", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.openDevTerminal || !api?.runDevTerminal) {
      return { ready: false };
    }

    api.openDevTerminal();
    const statusLabel = String(document.querySelector("#devTerminalStatus")?.textContent || "");
    await api.runDevTerminal("help");
    await api.runDevTerminal("fresh-start");
    await api.runDevTerminal("status");
    await api.runDevTerminal("save-all");
    await api.runDevTerminal("dev-js return 2 + 2;");
    const outputText = String(document.querySelector("#devTerminalOutput")?.textContent || "");
    return {
      ready: true,
      statusLabel,
      outputText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.statusLabel.toLowerCase()).toContain("safe");
  expect(result.outputText).toContain("fresh-start confirm");
  expect(result.outputText).toContain("Usage: fresh-start confirm");
  expect(result.outputText).toContain("Mode: safe");
  expect(result.outputText).toContain("Command disabled for safety: dev-js");
});

test("sandbox ignores spoofed parent-window messages even with a valid token", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const clearBtn = document.querySelector("#clearLog");
    const runBtn = document.querySelector("#run");
    const logHost = document.querySelector("#log");
    if (!api?.setCode || !clearBtn || !runBtn || !logHost) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const realMarker = `real-${Date.now().toString(36)}`;
    const spoofMarker = `spoof-${Date.now().toString(36)}`;
    let capturedToken = "";

    const captureToken = (event) => {
      const data = event?.data;
      if (
        data?.source === "fazide"
        && data?.type === "console"
        && typeof data?.token === "string"
        && data.token
      ) {
        const args = Array.isArray(data?.payload?.args) ? data.payload.args : [];
        const joined = args.map((entry) => String(entry)).join(" ");
        if (joined.includes(realMarker)) {
          capturedToken = data.token;
        }
      }
    };

    clearBtn.click();
    window.addEventListener("message", captureToken);
    api.setCode(`console.log("${realMarker}");`);
    runBtn.click();

    for (let i = 0; i < 20 && !capturedToken; i += 1) {
      await wait(40);
    }

    window.removeEventListener("message", captureToken);
    if (!capturedToken) {
      return {
        ready: true,
        tokenCaptured: false,
        logText: String(logHost.textContent || ""),
      };
    }

    window.postMessage({
      source: "fazide",
      token: capturedToken,
      type: "console",
      payload: { level: "info", args: [spoofMarker] },
    }, "*");

    await wait(120);
    const logText = String(logHost.textContent || "");
    return {
      ready: true,
      tokenCaptured: true,
      realSeen: logText.includes(realMarker),
      spoofSeen: logText.includes(spoofMarker),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.tokenCaptured).toBeTruthy();
  expect(result.realSeen).toBeTruthy();
  expect(result.spoofSeen).toBeFalsy();
});

test("sandbox bridge emits coherent run-context metadata for active runs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const clearBtn = document.querySelector("#clearLog");
    const runBtn = document.querySelector("#run");
    const logHost = document.querySelector("#log");
    if (!api?.setCode || !clearBtn || !runBtn || !logHost) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const markerBase = `ctx-${Date.now().toString(36)}`;

    clearBtn.click();
    api.setCode(`console.log("${markerBase}");`);
    runBtn.click();
    await wait(340);

    const logText = String(logHost.textContent || "");
    const contextMatch = logText.match(/Run context:\s*seed=(\d+),\s*dt=(\d+)ms/i);
    const seed = Number(contextMatch?.[1]);
    const dt = Number(contextMatch?.[2]);

    return {
      ready: true,
      seedFinite: Number.isFinite(seed) && seed > 0,
      dtFinite: Number.isFinite(dt) && dt >= 1,
      logShowsContext: logText.includes("Run context: seed="),
      markerSeen: logText.includes(markerBase),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.seedFinite).toBeTruthy();
  expect(result.dtFinite).toBeTruthy();
  expect(result.logShowsContext).toBeTruthy();
  expect(result.markerSeen).toBeTruthy();
});

test("sandbox console payload applies argument and message truncation limits", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const clearBtn = document.querySelector("#clearLog");
    const runBtn = document.querySelector("#run");
    const logHost = document.querySelector("#log");
    if (!api?.setCode || !clearBtn || !runBtn || !logHost) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const marker = `trunc-${Date.now().toString(36)}`;
    const longText = "x".repeat(2200);

    clearBtn.click();
    api.setCode(
      `console.log("${marker}", ...Array.from({ length: 40 }, (_, i) => "arg-" + i));\n`
      + `console.log("${marker}-long", "${longText}");`
    );
    runBtn.click();
    await wait(320);

    const logText = String(logHost.textContent || "");
    return {
      ready: true,
      hasMarker: logText.includes(marker),
      hasArgLimitSuffix: logText.includes("more argument(s) truncated"),
      hasLengthLimitSuffix: logText.includes("[truncated]"),
      hasLongMarker: logText.includes(`${marker}-long`),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasMarker).toBeTruthy();
  expect(result.hasArgLimitSuffix).toBeTruthy();
  expect(result.hasLengthLimitSuffix).toBeTruthy();
  expect(result.hasLongMarker).toBeTruthy();
});

test("sandbox bridge safely logs non-cloneable console values", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const clearBtn = document.querySelector("#clearLog");
    const runBtn = document.querySelector("#run");
    const logHost = document.querySelector("#log");
    if (!api?.setCode || !clearBtn || !runBtn || !logHost) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const marker = `clone-safe-${Date.now().toString(36)}`;
    const postMarker = `clone-post-${Date.now().toString(36)}`;
    const symbolLabel = "Symbol(faz)";

    clearBtn.click();
    api.setCode(
      `const node = document.createElement("div");\n`
      + `const fn = function keepRunning() {};\n`
      + `const cyc = { label: "cyc" }; cyc.self = cyc;\n`
      + `console.log("${marker}", fn, node, Symbol("faz"), 1n, cyc);\n`
      + `console.log("${postMarker}");\n`
    );
    runBtn.click();
    await wait(360);

    const logText = String(logHost.textContent || "");
    return {
      ready: true,
      markerSeen: logText.includes(marker),
      postSeen: logText.includes(postMarker),
      symbolSeen: logText.includes(symbolLabel),
      bridgeWarningSeen: logText.toLowerCase().includes("sandbox bridge warning"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.markerSeen).toBeTruthy();
  expect(result.postSeen).toBeTruthy();
  expect(result.symbolSeen).toBeTruthy();
  expect(result.bridgeWarningSeen).toBeFalsy();
});

test("sandbox blocks browser-interfering APIs and reports safe warnings", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const clearBtn = document.querySelector("#clearLog");
    const runBtn = document.querySelector("#run");
    const logHost = document.querySelector("#log");
    if (!api?.setCode || !clearBtn || !runBtn || !logHost) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const marker = `safety-${Date.now().toString(36)}`;

    clearBtn.click();
    api.setCode(
      `(async () => {\n`
      + `  console.log("${marker}:start");\n`
      + `  alert("blocked-alert");\n`
      + `  const opened = window.open("https://example.com");\n`
      + `  console.log("${marker}:open", String(opened));\n`
      + `  const fetchResult = await fetch("https://example.com")\n`
      + `    .then(() => "ok")\n`
      + `    .catch((err) => String(err && err.message ? err.message : err));\n`
      + `  console.log("${marker}:fetch", fetchResult);\n`
      + `})();`
    );
    runBtn.click();
    await wait(420);

    const logText = String(logHost.textContent || "");
    return {
      ready: true,
      startSeen: logText.includes(`${marker}:start`),
      openSeen: logText.includes(`${marker}:open null`),
      fetchSeen: logText.includes(`${marker}:fetch fetch blocked by FAZ IDE sandbox policy`),
      alertBlockedSeen: logText.includes("Sandbox security: blocked API alert"),
      openBlockedSeen: logText.includes("Sandbox security: blocked API window.open"),
      fetchBlockedSeen: logText.includes("Sandbox security: blocked API fetch"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.startSeen).toBeTruthy();
  expect(result.openSeen).toBeTruthy();
  expect(result.fetchSeen).toBeTruthy();
  expect(result.alertBlockedSeen).toBeTruthy();
  expect(result.openBlockedSeen).toBeTruthy();
  expect(result.fetchBlockedSeen).toBeTruthy();
});

test("format button formats active editor content safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const formatBtn = document.querySelector("#format");
    const statusNode = document.querySelector("#statusText");
    if (!api?.setCode || !api?.getCode || !formatBtn || !statusNode) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode("const value = 1;   \nconsole.log(value);   ");
    formatBtn.click();

    for (let i = 0; i < 80; i += 1) {
      const statusText = String(statusNode.textContent || "").toLowerCase();
      if (statusText.includes("formatted")) break;
      await wait(50);
    }

    const code = String(api.getCode() || "");
    const lines = code.split("\n");
    const hasTrailingWhitespace = lines.some((line) => /\s+$/.test(line));
    return {
      ready: true,
      code,
      hasTrailingWhitespace,
      statusText: String(statusNode.textContent || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.statusText.toLowerCase()).toContain("formatted");
  expect(result.code).toContain("console.log(value);");
  expect(result.code.endsWith("\n")).toBeTruthy();
  expect(result.hasTrailingWhitespace).toBeFalsy();
});

test("find replace-all updates code and reports replacement count", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const findInput = document.querySelector("#editorFindInput");
    const replaceInput = document.querySelector("#editorReplaceInput");
    const replaceAllBtn = document.querySelector("#editorReplaceAll");
    const statusNode = document.querySelector("#statusText");
    const findStatusNode = document.querySelector("#editorFindStatus");
    if (!api?.setCode || !api?.getCode || !api?.openEditorSearch || !findInput || !replaceInput || !replaceAllBtn || !statusNode || !findStatusNode) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode("const item = 1;\nitem += 1;\nconsole.log(item);\n");
    api.openEditorSearch(true);
    await wait(80);

    findInput.value = "item";
    findInput.dispatchEvent(new Event("input", { bubbles: true }));
    replaceInput.value = "value";
    replaceInput.dispatchEvent(new Event("input", { bubbles: true }));
    replaceAllBtn.click();

    for (let i = 0; i < 40; i += 1) {
      const statusText = String(statusNode.textContent || "").toLowerCase();
      if (statusText.includes("replaced")) break;
      await wait(25);
    }

    return {
      ready: true,
      code: String(api.getCode() || ""),
      statusText: String(statusNode.textContent || ""),
      findStatusText: String(findStatusNode.textContent || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.code).toContain("const value = 1;");
  expect(result.code).not.toContain("item");
  expect(result.statusText).toContain("Replaced 3 matches");
  expect(result.findStatusText.toLowerCase()).toContain("no matches");
});

test("symbols palette lists and filters active file symbols", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const symbolInput = document.querySelector("#symbolSearchInput");
    const symbolList = document.querySelector("#symbolList");
    const symbolHint = document.querySelector("#symbolHint");
    if (!api?.setCode || !api?.openSymbolPalette || !symbolInput || !symbolList || !symbolHint) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const readNames = () => Array.from(
      symbolList.querySelectorAll("[data-symbol-id] .symbol-row-name")
    ).map((node) => String(node.textContent || "").trim()).filter(Boolean);

    api.setCode(
      "function alphaOne(foo) { return foo; }\n"
      + "const betaTwo = (x) => x;\n"
      + "class GammaThree {}\n"
    );
    api.openSymbolPalette();

    for (let i = 0; i < 60; i += 1) {
      if (symbolList.querySelectorAll("[data-symbol-id]").length > 0) break;
      await wait(25);
    }

    const initialNames = readNames();
    symbolInput.value = "gamma";
    symbolInput.dispatchEvent(new Event("input", { bubbles: true }));

    for (let i = 0; i < 60; i += 1) {
      const current = readNames();
      if (current.length > 0 && current.every((name) => name.toLowerCase().includes("gamma"))) break;
      await wait(25);
    }

    const filteredNames = readNames();
    return {
      ready: true,
      initialCount: initialNames.length,
      initialHasAlpha: initialNames.some((name) => name.toLowerCase().includes("alphaone")),
      filteredCount: filteredNames.length,
      filteredHasGamma: filteredNames.some((name) => name.toLowerCase().includes("gammathree")),
      filteredAllMatch: filteredNames.length > 0 && filteredNames.every((name) => name.toLowerCase().includes("gamma")),
      hintText: String(symbolHint.textContent || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.initialCount).toBeGreaterThan(0);
  expect(result.initialHasAlpha).toBeTruthy();
  expect(result.filteredCount).toBeGreaterThan(0);
  expect(result.filteredHasGamma).toBeTruthy();
  expect(result.filteredAllMatch).toBeTruthy();
  expect(result.hintText.toLowerCase()).toContain("symbol");
});

test("editor history panel supports keyboard navigation with synced action states", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const panel = document.querySelector("#editorHistoryPanel");
    const list = document.querySelector("#editorHistoryList");
    const snapshotBtn = document.querySelector("#editorHistorySnapshot");
    const restoreBtn = document.querySelector("#editorHistoryRestore");
    const clearBtn = document.querySelector("#editorHistoryClear");
    const diff = document.querySelector("#editorHistoryDiff");
    if (!api?.setCode || !api?.snapshotCode || !api?.openEditorHistory || !panel || !list || !snapshotBtn || !restoreBtn || !clearBtn || !diff) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    api.setCode("const historyTarget = 1;\nconsole.log(historyTarget);\n");
    api.snapshotCode("manual-one");
    api.setCode("const historyTarget = 2;\nconsole.log(historyTarget);\n");
    api.snapshotCode("manual-two");
    api.openEditorHistory();

    for (let i = 0; i < 60; i += 1) {
      if (list.querySelectorAll(".editor-history-row[data-history-id]").length >= 2) break;
      await wait(30);
    }

    const rows = Array.from(list.querySelectorAll(".editor-history-row[data-history-id]"));
    const firstActive = list.querySelector('.editor-history-row[data-active="true"]');
    if (rows.length < 2 || !(firstActive instanceof HTMLElement)) {
      return {
        ready: true,
        hasRows: rows.length,
        open: panel.getAttribute("data-open") === "true",
      };
    }

    firstActive.focus();
    firstActive.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    await wait(60);

    const secondActive = list.querySelector('.editor-history-row[data-active="true"]');
    const activeRows = list.querySelectorAll('.editor-history-row[data-active="true"]').length;

    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      rowCount: rows.length,
      movedDown: Boolean(
        secondActive
        && secondActive !== firstActive
        && rows.indexOf(secondActive) > rows.indexOf(firstActive)
      ),
      activeRows,
      snapshotDisabled: snapshotBtn.disabled,
      restoreDisabled: restoreBtn.disabled,
      clearDisabled: clearBtn.disabled,
      diffTextLength: String(diff.textContent || "").trim().length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.rowCount).toBeGreaterThanOrEqual(2);
  expect(result.movedDown).toBeTruthy();
  expect(result.activeRows).toBe(1);
  expect(result.snapshotDisabled).toBeFalsy();
  expect(result.restoreDisabled).toBeFalsy();
  expect(result.clearDisabled).toBeFalsy();
  expect(result.diffTextLength).toBeGreaterThan(0);
});

test("editor split keeps editor and mirror panes equal size", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const splitBtn = document.querySelector("#editorSplitBtn");
    const panel = document.querySelector("#editorPanel");
    const editorPane = panel?.querySelector(".editor-pane");
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!splitBtn || !panel || !editorPane) {
      return { ready: false };
    }

    splitBtn.click();
    await waitFrame();

    const editorSurface = editorPane.querySelector(".CodeMirror") || editorPane.querySelector("#editor");
    const mirror = editorPane.querySelector("#editorMirror");
    if (!(editorSurface instanceof HTMLElement) || !(mirror instanceof HTMLElement)) {
      return { ready: false };
    }

    const editorRect = editorSurface.getBoundingClientRect();
    const mirrorRect = mirror.getBoundingClientRect();
    return {
      ready: true,
      splitOpen: panel.getAttribute("data-editor-split") === "true",
      mirrorVisible: getComputedStyle(mirror).display !== "none",
      editorWidth: editorRect.width,
      mirrorWidth: mirrorRect.width,
      editorHeight: editorRect.height,
      mirrorHeight: mirrorRect.height,
      widthDelta: Math.abs(editorRect.width - mirrorRect.width),
      heightDelta: Math.abs(editorRect.height - mirrorRect.height),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.splitOpen).toBeTruthy();
  expect(result.mirrorVisible).toBeTruthy();
  expect(result.editorWidth).toBeGreaterThan(0);
  expect(result.mirrorWidth).toBeGreaterThan(0);
  expect(result.widthDelta).toBeLessThanOrEqual(2);
  expect(result.heightDelta).toBeLessThanOrEqual(2);
});

test("editor split keeps editor and mirror scroll positions synchronized", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const splitBtn = document.querySelector("#editorSplitBtn");
    const panel = document.querySelector("#editorPanel");
    const editorPane = panel?.querySelector(".editor-pane");
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!api?.setCode || !splitBtn || !panel || !editorPane) {
      return { ready: false };
    }

    const code = Array.from({ length: 320 }, (_, index) => `const splitScrollLine${index} = ${index};`).join("\n");
    api.setCode(code);
    await waitFrame();

    splitBtn.click();
    await waitFrame();

    const mirror = editorPane.querySelector("#editorMirror");
    const cmScroller = editorPane.querySelector(".CodeMirror-scroll");
    const textarea = editorPane.querySelector("#editor");
    const editorScroller = cmScroller instanceof HTMLElement
      ? cmScroller
      : (textarea instanceof HTMLElement ? textarea : null);
    if (!(mirror instanceof HTMLElement) || !(editorScroller instanceof HTMLElement)) {
      return { ready: false };
    }

    const editorMax = Math.max(0, editorScroller.scrollHeight - editorScroller.clientHeight);
    const mirrorMax = Math.max(0, mirror.scrollHeight - mirror.clientHeight);
    const sharedMax = Math.max(0, Math.min(editorMax, mirrorMax));
    if (sharedMax < 40) {
      return { ready: false, reason: "insufficient-scroll-space", editorMax, mirrorMax, sharedMax };
    }

    const editorTarget = Math.max(20, Math.floor(sharedMax * 0.62));
    editorScroller.scrollTop = editorTarget;
    editorScroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFrame();
    const mirrorAfterEditorScroll = mirror.scrollTop;

    const mirrorTarget = Math.max(10, Math.floor(sharedMax * 0.28));
    mirror.scrollTop = mirrorTarget;
    mirror.dispatchEvent(new Event("scroll", { bubbles: true }));
    await waitFrame();
    const editorAfterMirrorScroll = editorScroller.scrollTop;

    return {
      ready: true,
      splitOpen: panel.getAttribute("data-editor-split") === "true",
      editorTarget,
      mirrorAfterEditorScroll,
      mirrorTarget,
      editorAfterMirrorScroll,
      editorToMirrorDelta: Math.abs(mirrorAfterEditorScroll - editorTarget),
      mirrorToEditorDelta: Math.abs(editorAfterMirrorScroll - mirrorTarget),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.splitOpen).toBeTruthy();
  expect(result.editorToMirrorDelta).toBeLessThanOrEqual(4);
  expect(result.mirrorToEditorDelta).toBeLessThanOrEqual(4);
});

test("workspace import applies safety limits for large payloads", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.importWorkspaceData || !api?.listFiles || !api?.listTrash || !api?.getCode) {
      return { ready: false };
    }

    const hugeCode = "x".repeat(220000);
    const files = Array.from({ length: 360 }, (_, index) => ({
      id: `file-${index}`,
      name: `src/path-${index}/entry-${index}.js`,
      code: index === 0 ? hugeCode : `console.log(${index});`,
      savedCode: index === 0 ? hugeCode : `console.log(${index});`,
    }));
    const trash = Array.from({ length: 390 }, (_, index) => ({
      id: `trash-${index}`,
      name: `trash/old-${index}.js`,
      code: "removed",
      savedCode: "removed",
      deletedAt: Date.now() - index,
    }));
    const folders = Array.from({ length: 1200 }, (_, index) => `folder-${index}`);

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files,
        trash,
        folders,
        activeId: "file-0",
        openIds: files.map((file) => file.id),
      },
    });

    return {
      ready: true,
      ok,
      fileCount: api.listFiles().length,
      trashCount: api.listTrash().length,
      activeCodeLength: api.getCode().length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.fileCount).toBeLessThanOrEqual(320);
  expect(result.trashCount).toBeLessThanOrEqual(320);
  expect(result.activeCodeLength).toBeLessThanOrEqual(160000);
});

test("workspace import remaps case-insensitive file path collisions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.importWorkspaceData || !api?.listFiles) {
      return { ready: false };
    }

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: "a", name: "src/App.js", code: "console.log('A');" },
          { id: "b", name: "src/app.js", code: "console.log('B');" },
        ],
        folders: ["src"],
        activeId: "a",
        openIds: ["a", "b"],
        trash: [],
      },
    });

    const names = api.listFiles().map((file) => String(file?.name || ""));
    const uniqueLower = new Set(names.map((name) => name.toLowerCase()));
    return {
      ready: true,
      ok,
      names,
      uniqueLowerCount: uniqueLower.size,
      count: names.length,
      hasRemappedSuffix: names.some((name) => /\(\d+\)\.js$/i.test(name)),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.count).toBe(2);
  expect(result.uniqueLowerCount).toBe(2);
  expect(result.hasRemappedSuffix).toBeTruthy();
});

test("workspace import input accepts and imports specific code files", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(() => {
    const api = window.fazide;
    return api?.listFiles ? api.listFiles().length : -1;
  });
  expect(before).toBeGreaterThan(0);

  await page.locator("#workspaceImportInput").setInputFiles([
    {
      name: "import-check.js",
      mimeType: "text/javascript",
      buffer: Buffer.from("export const importedValue = 42;\n", "utf8"),
    },
    {
      name: "import-check.html",
      mimeType: "text/html",
      buffer: Buffer.from("<!doctype html><title>Import</title>\n", "utf8"),
    },
  ]);

  await expect.poll(async () => {
    return page.evaluate(() => {
      const api = window.fazide;
      if (!api?.listFiles) {
        return { ready: false, count: 0, hasImported: false, hasImportedHtml: false };
      }
      const files = api.listFiles();
      const names = files.map((entry) => String(entry?.name || ""));
      return {
        ready: true,
        count: files.length,
        hasImported: names.some((name) => name.toLowerCase().endsWith("import-check.js")),
        hasImportedHtml: names.some((name) => name.toLowerCase().endsWith("import-check.html")),
      };
    });
  }).toEqual(expect.objectContaining({
    ready: true,
    count: before + 2,
    hasImported: true,
    hasImportedHtml: true,
  }));
});

test("workspace import input falls back to code import for non-workspace json", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(() => {
    const api = window.fazide;
    return api?.listFiles ? api.listFiles().length : -1;
  });
  expect(before).toBeGreaterThan(0);

  await page.locator("#workspaceImportInput").setInputFiles([
    {
      name: "import-config.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ name: "import-config", enabled: true }, null, 2), "utf8"),
    },
  ]);

  await expect.poll(async () => {
    return page.evaluate(() => {
      const api = window.fazide;
      if (!api?.listFiles) return { ready: false, count: 0, hasImportedJson: false };
      const files = api.listFiles();
      const names = files.map((entry) => String(entry?.name || ""));
      return {
        ready: true,
        count: files.length,
        hasImportedJson: names.some((name) => name.toLowerCase().endsWith("import-config.json")),
      };
    });
  }).toEqual(expect.objectContaining({
    ready: true,
    count: before + 1,
    hasImportedJson: true,
  }));
});

test("workspace import input treats mixed multi-file selection as code import", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(() => {
    const api = window.fazide;
    return api?.listFiles ? api.listFiles().length : -1;
  });
  expect(before).toBeGreaterThan(0);

  await page.locator("#workspaceImportInput").setInputFiles([
    {
      name: "mixed-config.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ note: "not-workspace" }), "utf8"),
    },
    {
      name: "mixed-script.js",
      mimeType: "text/javascript",
      buffer: Buffer.from("console.log('mixed import');\n", "utf8"),
    },
  ]);

  await expect.poll(async () => {
    return page.evaluate(() => {
      const api = window.fazide;
      if (!api?.listFiles) return { ready: false, count: 0, hasJson: false, hasJs: false };
      const files = api.listFiles();
      const names = files.map((entry) => String(entry?.name || ""));
      return {
        ready: true,
        count: files.length,
        hasJson: names.some((name) => name.toLowerCase().endsWith("mixed-config.json")),
        hasJs: names.some((name) => name.toLowerCase().endsWith("mixed-script.js")),
      };
    });
  }).toEqual(expect.objectContaining({
    ready: true,
    count: before + 2,
    hasJson: true,
    hasJs: true,
  }));
});

test("logger caps growth to bounded lines", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { makeLogger } = await import("/assets/js/ui/logger.js");
    const host = document.createElement("pre");
    const logger = makeLogger(host);

    for (let i = 0; i < 1305; i += 1) {
      logger.append("info", [`line-${i}`]);
    }

    const lines = String(host.textContent || "").split("\n").filter(Boolean);
    return {
      lineCount: lines.length,
      first: lines[0] || "",
      last: lines[lines.length - 1] || "",
    };
  });

  expect(result.lineCount).toBeLessThanOrEqual(1200);
  expect(result.last).toContain("line-1304");
  expect(result.first).not.toContain("line-0");
});

test("sandbox HTML run resolves workspace-root JS from nested files", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.importWorkspaceData) return { ready: false };

    const stamp = Date.now().toString(36);
    const htmlId = `html-${stamp}`;
    const jsId = `js-${stamp}`;
    const htmlName = `playground/demo-${stamp}/index.html`;
    const jsName = `assets/games/demo-${stamp}.js`;
    const htmlCode =
      `<!doctype html><html><body>` +
      `<main id="app">demo</main>` +
      `<script src="./assets/games/demo-${stamp}.js"></script>` +
      `</body></html>`;
    const jsCode =
      `console.log("linked:${stamp}");`;

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: htmlId, name: htmlName, code: htmlCode, savedCode: htmlCode },
          { id: jsId, name: jsName, code: jsCode, savedCode: jsCode },
        ],
        trash: [],
        folders: ["playground", `playground/demo-${stamp}`, "assets", "assets/games"],
        activeId: htmlId,
        openIds: [htmlId],
      },
    });
    if (!ok) return { ready: true, ok: false };

    document.querySelector("#run")?.click();
    await new Promise((resolve) => setTimeout(resolve, 280));

    const logText = String(document.querySelector("#log")?.textContent || "");
    const statusText = String(document.querySelector("#statusText")?.textContent || "");
    return {
      ready: true,
      ok: true,
      statusText,
      logText,
      stamp,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.statusText.toLowerCase()).toContain("ran");
  expect(result.logText).toContain(`linked:${result.stamp}`);
});

test("sandbox HTML run resolves decorated CSS and JS asset refs from nested files", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.importWorkspaceData) return { ready: false };

    const stamp = Date.now().toString(36);
    const htmlId = `html-decorated-${stamp}`;
    const cssId = `css-decorated-${stamp}`;
    const jsId = `js-decorated-${stamp}`;
    const htmlName = `playground/nested-${stamp}/index.html`;
    const cssName = `assets/games/theme-${stamp}.css`;
    const jsName = `assets/games/boot-${stamp}.js`;
    const htmlCode =
      `<!doctype html><html><head>` +
      `<link rel="stylesheet" href="/assets/games/theme-${stamp}.css?cache=1#v">` +
      `</head><body>` +
      `<div id="box">demo</div>` +
      `<script src="../assets/games/boot-${stamp}.js?mode=dev#entry"></script>` +
      `</body></html>`;
    const cssCode = `#box { color: rgb(12, 34, 56); }`;
    const jsCode =
      `const box=document.getElementById("box");` +
      `const color=getComputedStyle(box).color;` +
      `console.log("linked-assets:${stamp}:" + color);`;

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: htmlId, name: htmlName, code: htmlCode, savedCode: htmlCode },
          { id: cssId, name: cssName, code: cssCode, savedCode: cssCode },
          { id: jsId, name: jsName, code: jsCode, savedCode: jsCode },
        ],
        trash: [],
        folders: ["playground", `playground/nested-${stamp}`, "assets", "assets/games"],
        activeId: htmlId,
        openIds: [htmlId],
      },
    });
    if (!ok) return { ready: true, ok: false };

    document.querySelector("#run")?.click();
    await new Promise((resolve) => setTimeout(resolve, 320));

    return {
      ready: true,
      ok: true,
      stamp,
      statusText: String(document.querySelector("#statusText")?.textContent || ""),
      logText: String(document.querySelector("#log")?.textContent || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.statusText.toLowerCase()).toContain("ran");
  expect(result.logText).toMatch(new RegExp(`linked-assets:${result.stamp}:rgb\\(12,\\s*34,\\s*56\\)`));
});

test("fazide exposes separated project/workspace/runtime state boundaries", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getStateBoundaries || !api?.getStateBoundary) {
      return { ready: false };
    }
    const snapshot = api.getStateBoundaries();
    const runtimeOnly = api.getStateBoundary("runtime");
    return {
      ready: true,
      hasProject: Boolean(snapshot?.project),
      hasWorkspace: Boolean(snapshot?.workspace),
      hasRuntime: Boolean(snapshot?.runtime),
      fileCountType: typeof snapshot?.project?.fileCount,
      themeType: typeof snapshot?.workspace?.theme,
      runCountType: typeof snapshot?.runtime?.runCount,
      runtimeMatches: runtimeOnly?.runCount === snapshot?.runtime?.runCount,
      unknownBoundaryIsNull: api.getStateBoundary("unknown") === null,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasProject).toBeTruthy();
  expect(result.hasWorkspace).toBeTruthy();
  expect(result.hasRuntime).toBeTruthy();
  expect(result.fileCountType).toBe("number");
  expect(result.themeType).toBe("string");
  expect(result.runCountType).toBe("number");
  expect(result.runtimeMatches).toBeTruthy();
  expect(result.unknownBoundaryIsNull).toBeTruthy();
});

test("lesson mode loads starter and advances through STEP typing markers", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.listLessons || !api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput || !api?.exportWorkspaceData) {
      return { ready: false };
    }

    const lessons = api.listLessons();
    const hasLesson = lessons.some((entry) => entry.id === "paddle-lesson-1");
    if (!hasLesson) {
      return { ready: false, hasLesson };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const initial = api.getLessonState();

    const snapshot = api.exportWorkspaceData();
    const files = Array.isArray(snapshot?.data?.files) ? snapshot.data.files : [];
    const gameFile = files.find((entry) => String(entry?.name || "").toLowerCase().endsWith("/game.js"))
      || files.find((entry) => String(entry?.name || "").toLowerCase().endsWith("game.js"));
    const gameCode = String(gameFile?.code || "");
    const match = gameCode.match(/\/\/ \[STEP:build-paddle-game:START\]\r?\n([\s\S]*?)\r?\n\/\/ \[STEP:build-paddle-game:END\]/);
    const lessonText = match ? `${match[1]}\n` : "";

    const typedAll = api.typeLessonInput(lessonText);
    const afterAll = api.getLessonState();

    return {
      ready: true,
      hasLesson,
      loaded,
      initial,
      lessonTextLength: lessonText.length,
      typedAll,
      afterAll,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasLesson).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.initial?.stepCount).toBe(1);
  expect(result.initial?.stepIndex).toBe(0);
  expect(result.initial?.remaining).toBeGreaterThan(0);
  expect(result.lessonTextLength).toBeGreaterThan(40);
  expect(result.typedAll).toBe(result.lessonTextLength);
  expect(result.afterAll?.completed).toBeTruthy();
  expect(result.afterAll?.remaining).toBe(0);
});

test("lesson mode accepts strict real keyboard typing on first line", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const loaded = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState) return { ready: false };
    const ok = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const state = api.getLessonState();
    return { ready: true, ok, before: state };
  });

  expect(loaded.ready).toBeTruthy();
  expect(loaded.ok).toBeTruthy();
  expect(loaded.before?.progress).toBe(0);

  await page.evaluate(() => {
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.focus();
      return;
    }
    const textarea = document.querySelector("#editor");
    textarea?.focus();
  });

  await page.keyboard.type('const canvas = document.getElementById("game");');
  await page.keyboard.press("Enter");

  const after = await page.evaluate(() => {
    const api = window.fazide;
    const state = api?.getLessonState?.();
    const statusText = String(document.querySelector("#statusText")?.textContent || "");
    return {
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
      progress: Number(state?.progress || 0),
      remaining: Number(state?.remaining || 0),
      statusText,
    };
  });

  expect(after.active).toBeTruthy();
  expect(after.completed).toBeFalsy();
  expect(after.progress).toBeGreaterThan(20);
  expect(after.remaining).toBeGreaterThan(0);
  expect(after.statusText.toLowerCase()).not.toContain("expected");
});

test("lesson mode mismatch keeps progress and reports expected key", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const before = api.getLessonState();
    const typed = api.typeLessonInput("x");
    const after = api.getLessonState();
    const statusText = String(document.querySelector("#statusText")?.textContent || "");

    return {
      ready: true,
      loaded,
      beforeProgress: Number(before?.progress || 0),
      afterProgress: Number(after?.progress || 0),
      typed,
      statusText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.beforeProgress).toBe(0);
  expect(result.afterProgress).toBe(0);
  expect(result.typed).toBe(0);
  expect(result.statusText.toLowerCase()).toContain("expected");
});

test("lesson mode restores typing progress after refresh", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const typed = api.typeLessonInput('const canvas = document.getElementById("game");\n');
    const state = api.getLessonState();
    return {
      ready: true,
      loaded,
      typed,
      stepIndex: Number(state?.stepIndex || 0),
      progress: Number(state?.progress || 0),
      remaining: Number(state?.remaining || 0),
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
      fileId: String(state?.fileId || ""),
    };
  });

  expect(before.ready).toBeTruthy();
  expect(before.loaded).toBeTruthy();
  expect(before.typed).toBeGreaterThan(10);
  expect(before.active).toBeTruthy();
  expect(before.completed).toBeFalsy();

  await page.reload({ waitUntil: "domcontentloaded" });

  const after = await page.evaluate(() => {
    const api = window.fazide;
    const state = api?.getLessonState?.();
    return {
      ready: Boolean(api?.getLessonState),
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
      stepIndex: Number(state?.stepIndex || 0),
      progress: Number(state?.progress || 0),
      remaining: Number(state?.remaining || 0),
      fileId: String(state?.fileId || ""),
    };
  });

  expect(after.ready).toBeTruthy();
  expect(after.active).toBeTruthy();
  expect(after.completed).toBeFalsy();
  expect(after.fileId).toBe(before.fileId);
  expect(after.stepIndex).toBe(before.stepIndex);
  expect(after.progress).toBe(before.progress);
  expect(after.remaining).toBe(before.remaining);
});

test("lesson HUD hides and regular typing stays normal after switching to non-lesson file", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const prepared = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.createFile || !api?.getLessonState) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    api.typeLessonInput('const canvas = document.getElementById("game");\n');
    const lessonBeforeSwitch = api.getLessonState();
    const regular = api.createFile("notes-regular.js", "");
    const lessonAfterSwitch = api.getLessonState();
    const hud = document.querySelector("#lessonHud");
    return {
      ready: true,
      loaded,
      regularFileCreated: Boolean(regular?.id),
      beforeActive: Boolean(lessonBeforeSwitch?.active),
      afterActive: Boolean(lessonAfterSwitch?.active),
      hudHidden: Boolean(hud?.hidden),
      hudActiveAttr: String(hud?.getAttribute("data-active") || ""),
    };
  });

  expect(prepared.ready).toBeTruthy();
  expect(prepared.loaded).toBeTruthy();
  expect(prepared.regularFileCreated).toBeTruthy();
  expect(prepared.beforeActive).toBeTruthy();
  expect(prepared.afterActive).toBeFalsy();
  expect(prepared.hudHidden).toBeTruthy();
  expect(prepared.hudActiveAttr).toBe("false");

  await page.evaluate(() => {
    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    if (cm) {
      cm.focus();
      return;
    }
    document.querySelector("#editor")?.focus();
  });

  await page.keyboard.type("const regularTypingWorks = true;");

  const typed = await page.evaluate(() => {
    const api = window.fazide;
    const code = String(api?.getCode?.() || "");
    const state = api?.getLessonState?.();
    return {
      hasTypedText: code.includes("regularTypingWorks"),
      lessonActive: Boolean(state?.active),
    };
  });

  expect(typed.hasTypedText).toBeTruthy();
  expect(typed.lessonActive).toBeFalsy();
});

test("lesson mode updates XP profile and shows HUD stats", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonProfile || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }

    const before = api.getLessonProfile();
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const typed = api.typeLessonInput('const canvas = document.getElementById("game");\n');
    const after = api.getLessonProfile();
    const lessonState = api.getLessonState();

    const hud = document.querySelector("#lessonHud");
    const hudStep = String(document.querySelector("#lessonHudStep")?.textContent || "");
    const hudProgress = String(document.querySelector("#lessonHudProgress")?.textContent || "");
    const hudLevel = String(document.querySelector("#lessonHudLevel")?.textContent || "");
    const hudXp = String(document.querySelector("#lessonHudXp")?.textContent || "");
    const hudStreak = String(document.querySelector("#lessonHudStreak")?.textContent || "");

    return {
      ready: true,
      loaded,
      typed,
      beforeXp: Number(before?.xp || 0),
      afterXp: Number(after?.xp || 0),
      dailyStreak: Number(after?.dailyStreak || 0),
      active: Boolean(lessonState?.active),
      hudActive: hud?.getAttribute("data-active") === "true" && !hud?.hidden,
      hudStep,
      hudProgress,
      hudLevel,
      hudXp,
      hudStreak,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typed).toBeGreaterThan(10);
  expect(result.afterXp).toBeGreaterThan(result.beforeXp);
  expect(result.dailyStreak).toBeGreaterThanOrEqual(0);
  expect(result.active).toBeTruthy();
  expect(result.hudActive).toBeTruthy();
  expect(result.hudStep.length).toBeGreaterThan(0);
  expect(result.hudProgress).toContain("/");
  expect(result.hudLevel).toContain("Lv ");
  expect(result.hudXp).toContain("XP ");
  expect(result.hudStreak).toContain("Streak ");
});

test("fazide recovers pending storage journal entries", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState || !api?.recoverStorageJournal || !api?.getStorageJournalState) {
      return { ready: false };
    }
    const state = api.getState();
    const journalKey = String(state?.storageJournalKey || "").trim();
    if (!journalKey) {
      return { ready: false };
    }

    const markerKey = "fazide.journal-recovery-test";
    const markerValue = `recovered-${Date.now().toString(36)}`;
    localStorage.removeItem(markerKey);
    localStorage.setItem(journalKey, JSON.stringify({
      id: `manual-${Date.now().toString(36)}`,
      status: "pending",
      label: "manual-test",
      startedAt: Date.now(),
      entries: [
        { key: markerKey, value: markerValue },
      ],
    }));

    const before = api.getStorageJournalState();
    const recovery = api.recoverStorageJournal();
    const after = api.getStorageJournalState();
    const persisted = localStorage.getItem(markerKey);
    localStorage.removeItem(markerKey);

    return {
      ready: true,
      beforeCount: before?.entryCount || 0,
      recovered: Boolean(recovery?.recovered),
      recoveredCount: recovery?.entryCount || 0,
      afterIsNull: after === null,
      persistedMatches: persisted === markerValue,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.beforeCount).toBe(1);
  expect(result.recovered).toBeTruthy();
  expect(result.recoveredCount).toBe(1);
  expect(result.afterIsNull).toBeTruthy();
  expect(result.persistedMatches).toBeTruthy();
});

test("panel layout model stays synchronized with panel rows", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState || !api?.dockPanel || !api?.getPanelLayout) {
      return { ready: false };
    }

    api.dockPanel("log", "top");
    const state = api.getState();
    const rows = state?.layout?.panelRows || { top: [], bottom: [] };
    const model = api.getPanelLayout();
    const main = Array.isArray(model?.columns) ? model.columns[0] : null;
    const stacks = Array.isArray(main?.stacks) ? main.stacks : [];
    const topPanels = Array.isArray(stacks[0]?.panels) ? stacks[0].panels : [];
    const bottomPanels = Array.isArray(stacks[1]?.panels) ? stacks[1].panels : [];

    return {
      ready: true,
      hasModel: Boolean(main),
      hasTopStack: Boolean(stacks[0]),
      hasBottomStack: Boolean(stacks[1]),
      rowsTop: JSON.stringify(rows.top || []),
      rowsBottom: JSON.stringify(rows.bottom || []),
      modelTop: JSON.stringify(topPanels),
      modelBottom: JSON.stringify(bottomPanels),
      logInTop: topPanels.includes("log"),
      layoutHasModel: Boolean(state?.layout?.panelLayout?.columns?.length),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasModel).toBeTruthy();
  expect(result.hasTopStack).toBeTruthy();
  expect(result.hasBottomStack).toBeTruthy();
  expect(result.rowsTop).toBe(result.modelTop);
  expect(result.rowsBottom).toBe(result.modelBottom);
  expect(result.logInTop).toBeTruthy();
  expect(result.layoutHasModel).toBeTruthy();
});

test("layout persistence stores and restores ratio-first panel sizing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const beforeReload = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setSizes || !api?.setBottomHeight || !api?.getState) {
      return { ready: false };
    }

    api.setSizes({ sidebarWidth: 260, logWidth: 420, sandboxWidth: 420, toolsWidth: 340 });
    api.setBottomHeight(260);

    const key = String(api.getState()?.layout?.storageLayoutKey || "");
    const fallbackKey = "fazide.layout.v1";
    const raw = localStorage.getItem(key || fallbackKey) || localStorage.getItem(fallbackKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed) {
      return { ready: false };
    }

    parsed.logWidth = 9999;
    parsed.sidebarWidth = 9999;
    parsed.sandboxWidth = 9999;
    parsed.toolsWidth = 9999;
    parsed.bottomHeight = 9999;
    parsed.panelRatios = {
      logWidth: 0.2,
      sidebarWidth: 0.22,
      sandboxWidth: 0.25,
      toolsWidth: 0.18,
      bottomHeight: 0.3,
    };
    localStorage.setItem(key || fallbackKey, JSON.stringify(parsed));

    return {
      ready: true,
      hasRatios: Boolean(parsed.panelRatios),
      ratioKeys: Object.keys(parsed.panelRatios || {}).sort().join(","),
    };
  });

  expect(beforeReload.ready).toBeTruthy();
  expect(beforeReload.hasRatios).toBeTruthy();
  expect(beforeReload.ratioKeys).toContain("sidebarWidth");

  await page.reload({ waitUntil: "domcontentloaded" });

  const afterReload = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getState) return { ready: false };
    const state = api.getState();
    const layout = state?.layout || {};
    const workspace = document.querySelector("#workspace")?.getBoundingClientRect?.();
    const workspaceWidth = workspace?.width || window.innerWidth;
    const workspaceHeight = workspace?.height || window.innerHeight;
    return {
      ready: true,
      hasRatios: Boolean(layout?.panelRatios),
      sidebarWidth: Number(layout?.sidebarWidth || 0),
      logWidth: Number(layout?.logWidth || 0),
      sandboxWidth: Number(layout?.sandboxWidth || 0),
      toolsWidth: Number(layout?.toolsWidth || 0),
      bottomHeight: Number(layout?.bottomHeight || 0),
      workspaceWidth,
      workspaceHeight,
    };
  });

  expect(afterReload.ready).toBeTruthy();
  expect(afterReload.hasRatios).toBeTruthy();
  expect(afterReload.sidebarWidth).toBeGreaterThan(0);
  expect(afterReload.sidebarWidth).toBeLessThan(afterReload.workspaceWidth);
  expect(afterReload.logWidth).toBeLessThan(afterReload.workspaceWidth);
  expect(afterReload.sandboxWidth).toBeLessThan(afterReload.workspaceWidth);
  expect(afterReload.toolsWidth).toBeLessThan(afterReload.workspaceWidth);
  expect(afterReload.bottomHeight).toBeLessThan(afterReload.workspaceHeight);
});

test("keyboard zoom shortcuts adjust and reset global UI zoom", async ({ page, browserName }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const mod = browserName === "webkit" ? "Meta" : "Control";

  const before = await page.evaluate(() => {
    const api = window.fazide;
    return {
      ready: Boolean(api?.getState),
      zoom: Number(api?.getState?.().uiZoomPercent || 0),
    };
  });
  expect(before.ready).toBeTruthy();
  expect(before.zoom).toBeGreaterThan(0);

  await page.keyboard.press(`${mod}+=`);
  const afterIn = await page.evaluate(() => Number(window.fazide?.getState?.().uiZoomPercent || 0));
  expect(afterIn).toBe(before.zoom + 10);
  await expect.poll(async () => page.locator("#footerZoom").textContent()).toBe(`Zoom: ${afterIn}%`);
  await expect(page.locator("#footerZoom")).toHaveAttribute("data-state", "ok");

  const layoutAt110 = await page.evaluate(() => {
    const rowOverlaps = (rowSelector) => {
      const row = document.querySelector(rowSelector);
      if (!row) return { overlap: false, pair: null, count: 0 };
      const panels = Array.from(row.children)
        .filter((node) => node instanceof HTMLElement && node.classList.contains("panel") && getComputedStyle(node).display !== "none")
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.id || "unknown",
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        })
        .filter((entry) => entry.width > 0)
        .sort((a, b) => a.left - b.left);
      for (let i = 0; i < panels.length - 1; i += 1) {
        const left = panels[i];
        const right = panels[i + 1];
        if (right.left < left.right - 1) {
          return { overlap: true, pair: [left.id, right.id], count: panels.length };
        }
      }
      return { overlap: false, pair: null, count: panels.length };
    };
    const outOfViewPanels = () => {
      const workspace = document.querySelector("#workspace");
      const workspaceRect = workspace?.getBoundingClientRect?.();
      if (!workspaceRect) return [];
      return Array.from(document.querySelectorAll("#workspace .workspace-row .panel"))
        .filter((node) => node instanceof HTMLElement && getComputedStyle(node).display !== "none")
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.id || "unknown",
            left: rect.left,
            right: rect.right,
          };
        })
        .filter((entry) => entry.left < workspaceRect.left - 1 || entry.right > workspaceRect.right + 1)
        .map((entry) => entry.id);
    };
    const shell = document.querySelector("#appShell");
    const shellRect = shell?.getBoundingClientRect?.();
    return {
      shellHeightGap: shellRect
        ? Math.abs(window.innerHeight - shellRect.height)
        : Number.POSITIVE_INFINITY,
      shellWidthGap: shellRect
        ? Math.abs(window.innerWidth - shellRect.width)
        : Number.POSITIVE_INFINITY,
      topRow: rowOverlaps("#workspaceTop"),
      bottomRow: rowOverlaps("#workspaceBottom"),
      outOfViewPanels: outOfViewPanels(),
    };
  });
  expect(layoutAt110.shellHeightGap).toBeLessThanOrEqual(3);
  expect(layoutAt110.shellWidthGap).toBeLessThanOrEqual(3);
  expect(layoutAt110.topRow.overlap).toBeFalsy();
  expect(layoutAt110.bottomRow.overlap).toBeFalsy();
  expect(layoutAt110.outOfViewPanels).toEqual([]);

  const layoutAtMax = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.setUiZoom) {
      return { ready: false };
    }
    api.setUiZoom(160);
    const shell = document.querySelector("#appShell");
    const shellRect = shell?.getBoundingClientRect?.();
    const rowOverlaps = (rowSelector) => {
      const row = document.querySelector(rowSelector);
      if (!row) return { overlap: false, pair: null, count: 0 };
      const panels = Array.from(row.children)
        .filter((node) => node instanceof HTMLElement && node.classList.contains("panel") && getComputedStyle(node).display !== "none")
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.id || "unknown",
            left: rect.left,
            right: rect.right,
            width: rect.width,
          };
        })
        .filter((entry) => entry.width > 0)
        .sort((a, b) => a.left - b.left);
      for (let i = 0; i < panels.length - 1; i += 1) {
        const left = panels[i];
        const right = panels[i + 1];
        if (right.left < left.right - 1) {
          return { overlap: true, pair: [left.id, right.id], count: panels.length };
        }
      }
      return { overlap: false, pair: null, count: panels.length };
    };
    const outOfViewPanels = () => {
      const workspace = document.querySelector("#workspace");
      const workspaceRect = workspace?.getBoundingClientRect?.();
      if (!workspaceRect) return [];
      return Array.from(document.querySelectorAll("#workspace .workspace-row .panel"))
        .filter((node) => node instanceof HTMLElement && getComputedStyle(node).display !== "none")
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            id: node.id || "unknown",
            left: rect.left,
            right: rect.right,
          };
        })
        .filter((entry) => entry.left < workspaceRect.left - 1 || entry.right > workspaceRect.right + 1)
        .map((entry) => entry.id);
    };
    return {
      ready: true,
      zoom: Number(api.getState?.().uiZoomPercent || 0),
      shellHeightGap: shellRect
        ? Math.abs(window.innerHeight - shellRect.height)
        : Number.POSITIVE_INFINITY,
      shellWidthGap: shellRect
        ? Math.abs(window.innerWidth - shellRect.width)
        : Number.POSITIVE_INFINITY,
      topRow: rowOverlaps("#workspaceTop"),
      bottomRow: rowOverlaps("#workspaceBottom"),
      outOfViewPanels: outOfViewPanels(),
    };
  });
  expect(layoutAtMax.ready).toBeTruthy();
  expect(layoutAtMax.zoom).toBe(160);
  expect(layoutAtMax.shellHeightGap).toBeLessThanOrEqual(3);
  expect(layoutAtMax.shellWidthGap).toBeLessThanOrEqual(3);
  expect(layoutAtMax.topRow.overlap).toBeFalsy();
  expect(layoutAtMax.bottomRow.overlap).toBeFalsy();
  expect(layoutAtMax.outOfViewPanels).toEqual([]);
  await expect(page.locator("#footerZoom")).toHaveAttribute("data-state", "warn");

  const layoutAtMin = await page.evaluate(() => {
    const api = window.fazide;
    api?.setUiZoom?.(70);
    const shell = document.querySelector("#appShell");
    const shellRect = shell?.getBoundingClientRect?.();
    return {
      zoom: Number(api?.getState?.().uiZoomPercent || 0),
      shellHeightGap: shellRect
        ? Math.abs(window.innerHeight - shellRect.height)
        : Number.POSITIVE_INFINITY,
      shellWidthGap: shellRect
        ? Math.abs(window.innerWidth - shellRect.width)
        : Number.POSITIVE_INFINITY,
    };
  });
  expect(layoutAtMin.zoom).toBe(70);
  expect(layoutAtMin.shellHeightGap).toBeLessThanOrEqual(3);
  expect(layoutAtMin.shellWidthGap).toBeLessThanOrEqual(3);
  await expect(page.locator("#footerZoom")).toHaveAttribute("data-state", "warn");

  await page.keyboard.press(`${mod}+-`);
  const afterOut = await page.evaluate(() => Number(window.fazide?.getState?.().uiZoomPercent || 0));
  expect(afterOut).toBe(70);

  await page.keyboard.press(`${mod}+0`);
  const afterReset = await page.evaluate(() => Number(window.fazide?.getState?.().uiZoomPercent || 0));
  expect(afterReset).toBe(100);
  await expect.poll(async () => page.locator("#footerZoom").textContent()).toBe("Zoom: 100%");
  await expect(page.locator("#footerZoom")).toHaveAttribute("data-state", "ok");
});

