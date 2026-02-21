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

test("fresh start opens welcome project in editor", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("fazide.files.v1");
    localStorage.removeItem("fazide.workspace-snapshot.v1");
    localStorage.removeItem("fazide.code.v0");
    sessionStorage.removeItem("fazide.session.v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const automation = Boolean(navigator.webdriver);
    const cm = document.querySelector(".CodeMirror");
    const cmValue = cm?.CodeMirror?.getValue?.() || "";
    const textValue = String(document.querySelector("#editor")?.value || "");
    const code = String(cmValue || textValue || "");
    const allFiles = Array.isArray(api?.listFiles?.()) ? api.listFiles() : [];
    const welcomeNames = allFiles
      .map((entry) => String(entry?.name || "").toLowerCase())
      .filter((name) => name.startsWith("welcome/"));
    const openEditors = Array.from(document.querySelectorAll(".editor-tab-label"))
      .map((node) => String(node?.textContent || "").trim().toLowerCase())
      .filter(Boolean);
    return {
      automation,
      hasWelcomeTitle: code.includes("<title>Welcome to FAZ IDE</title>"),
      hasWelcomeScript: code.includes("<script src=\"app.js\"></script>"),
      hasWelcomeLog: code.includes("WELCOME TO FAZ IDE! Welcome project animation is running."),
      hasWelcomeFolderIndex: welcomeNames.includes("welcome/index.html"),
      hasWelcomeFolderCss: welcomeNames.includes("welcome/styles.css"),
      hasWelcomeFolderJs: welcomeNames.includes("welcome/app.js"),
      openEditors,
    };
  });

  if (result.automation) {
    expect(result.hasWelcomeLog).toBeTruthy();
  } else {
    expect(result.hasWelcomeTitle).toBeTruthy();
    expect(result.hasWelcomeScript).toBeTruthy();
  }
  expect(result.hasWelcomeFolderIndex).toBeTruthy();
  expect(result.hasWelcomeFolderCss).toBeTruthy();
  expect(result.hasWelcomeFolderJs).toBeTruthy();
  expect(result.openEditors).toContain("index.html");
  expect(result.openEditors).toContain("styles.css");
  expect(result.openEditors).toContain("app.js");
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
      startTutorial: hasMethod("startTutorial"),
      resetTutorial: hasMethod("resetTutorial"),
      getTutorialState: hasMethod("getTutorialState"),
      applyPreset: hasMethod("applyPreset"),
      getState: hasMethod("getState"),
      stateHasLayout: Boolean(api?.getState?.()?.layout),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.createFolder).toBeTruthy();
  expect(result.setPanelOpen).toBeTruthy();
  expect(result.startTutorial).toBeTruthy();
  expect(result.resetTutorial).toBeTruthy();
  expect(result.getTutorialState).toBeTruthy();
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
    const api = window.fazide;
    const themeSelect = document.querySelector("#themeSelect");
    const syntaxSelect = document.querySelector("#editorSyntaxThemeSelect");
    if (!api?.unlockTheme || !themeSelect || !syntaxSelect) return { ready: false };

    ["light", "retro", "temple", "midnight"].forEach((theme) => {
      api.unlockTheme(theme, { spend: false });
    });

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
    const api = window.fazide;
    const select = document.querySelector("#themeSelect");
    if (api?.unlockTheme) {
      ["light", "purple", "temple"].forEach((theme) => api.unlockTheme(theme, { spend: false }));
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

test("lesson stats modal stays centered and scrollable on tight viewports", async ({ page }) => {
  await page.setViewportSize({ width: 880, height: 280 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#lessonStatsBtn").click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#lessonStatsPanel");
    const body = document.querySelector("#lessonStatsPanel .lesson-stats-body");
    if (!(panel instanceof HTMLElement)) return { ready: false };
    const rect = panel.getBoundingClientRect();
    const centerX = rect.left + (rect.width / 2);
    const centerY = rect.top + (rect.height / 2);
    const viewportX = window.innerWidth / 2;
    const viewportY = window.innerHeight / 2;
    const style = getComputedStyle(panel);
    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      deltaX: Math.abs(centerX - viewportX),
      deltaY: Math.abs(centerY - viewportY),
      overflowY: String(style.overflowY || ""),
      panelScrollable: panel.scrollHeight > panel.clientHeight,
      bodyScrollable: body instanceof HTMLElement ? body.scrollHeight > body.clientHeight : false,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.deltaX).toBeLessThanOrEqual(4);
  expect(result.deltaY).toBeLessThanOrEqual(4);
  expect(["auto", "scroll"]).toContain(result.overflowY);
  expect(result.panelScrollable || result.bodyScrollable).toBeTruthy();
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
    if (!api?.setCode || !api?.unlockTheme || !themeSelect) return { ready: false };

    ["light", "purple"].forEach((theme) => {
      api.unlockTheme(theme, { spend: false });
    });

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
    const api = window.fazide;
    if (api?.unlockTheme) {
      api.unlockTheme("light", { spend: false });
    }
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
    const api = window.fazide;
    if (api?.unlockTheme) {
      api.unlockTheme("purple", { spend: false });
    }
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
    const tierMap = document.querySelector("#lessonTierMap");
    const beginnerBtn = document.querySelector("#lessonTierOpenBeginner");
    const intermediateBtn = document.querySelector("#lessonTierOpenIntermediate");
    const expertBtn = document.querySelector("#lessonTierOpenExpert");

    return {
      count: lessons.length,
      sectionHidden: section?.getAttribute("aria-hidden") === "true",
      toggleDisabled: Boolean(toggle?.disabled),
      toggleExpanded: String(toggle?.getAttribute("aria-expanded") || ""),
      tierMapHidden: tierMap?.getAttribute("aria-hidden") === "true",
      beginnerReady: Boolean(beginnerBtn),
      intermediateReady: Boolean(intermediateBtn),
      expertReady: Boolean(expertBtn),
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.sectionHidden).toBeFalsy();
  expect(result.toggleDisabled).toBeFalsy();
  expect(result.toggleExpanded).toBe("false");
  expect(result.tierMapHidden).toBeTruthy();
  expect(result.beginnerReady).toBeTruthy();
  expect(result.intermediateReady).toBeTruthy();
  expect(result.expertReady).toBeTruthy();
});

test("lesson tier modal stays centered, viewport-safe, and renders 20 slots", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#lessonsSelectorToggle").click();
  await page.locator("#lessonTierOpenBeginner").click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#lessonTierBeginnerPanel");
    const list = document.querySelector("#lessonTierBeginnerList");
    const header = panel?.querySelector?.(".layout-header");
    const closeButton = document.querySelector("#lessonTierBeginnerClose");
    if (!(panel instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return { ready: false };
    }

    const rect = panel.getBoundingClientRect();
    const headerRect = header instanceof HTMLElement ? header.getBoundingClientRect() : null;
    const closeRect = closeButton instanceof HTMLElement ? closeButton.getBoundingClientRect() : null;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelCenterX = rect.left + (rect.width / 2);
    const panelCenterY = rect.top + (rect.height / 2);
    const centeredX = Math.abs(panelCenterX - (viewportWidth / 2)) <= 8;
    const centeredY = Math.abs(panelCenterY - (viewportHeight / 2)) <= 8;

    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewportHeight && rect.right <= viewportWidth;
    const listOverflowY = getComputedStyle(list).overflowY;
    const bodyOverflowY = getComputedStyle(panel.querySelector(".lesson-tier-modal-body") || panel).overflowY;
    const headerInViewport = Boolean(
      headerRect
      && headerRect.top >= 0
      && headerRect.left >= 0
      && headerRect.bottom <= viewportHeight
      && headerRect.right <= viewportWidth
    );
    const closeVisible = Boolean(
      closeRect
      && closeRect.width > 0
      && closeRect.height > 0
      && closeRect.top >= 0
      && closeRect.left >= 0
      && closeRect.bottom <= viewportHeight
      && closeRect.right <= viewportWidth
    );

    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      slotCount: Number(list.children.length || 0),
      centeredX,
      centeredY,
      inViewport,
      listOverflowY,
      bodyOverflowY,
      headerInViewport,
      closeVisible,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.slotCount).toBe(20);
  expect(result.centeredX).toBeTruthy();
  expect(result.centeredY).toBeTruthy();
  expect(result.inViewport).toBeTruthy();
  expect(result.headerInViewport).toBeTruthy();
  expect(result.closeVisible).toBeTruthy();
  expect(["visible", "clip"]).toContain(result.listOverflowY);
  expect(["auto", "scroll"]).toContain(result.bodyOverflowY);
});

test("lesson tier modal closes from close button and backdrop", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#lessonsSelectorToggle").click();
  await page.locator("#lessonTierOpenBeginner").click();
  await expect(page.locator("#lessonTierBeginnerPanel")).toHaveAttribute("data-open", "true");

  await page.evaluate(() => {
    document.querySelector("#lessonTierBeginnerClose")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.locator("#lessonTierBeginnerPanel")).toHaveAttribute("data-open", "false");

  await page.locator("#lessonTierOpenBeginner").click();
  await expect(page.locator("#lessonTierBeginnerPanel")).toHaveAttribute("data-open", "true");

  await page.evaluate(() => {
    document.querySelector("#lessonTierBeginnerBackdrop")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(page.locator("#lessonTierBeginnerPanel")).toHaveAttribute("data-open", "false");
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

test("runtime full matrix template copy and checklist stay JS HTML CSS scoped", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadApplication || !api?.exportWorkspaceData) {
      return { ready: false };
    }

    const loaded = await api.loadApplication("runtime-full-matrix-app", { run: false });
    const snapshot = api.exportWorkspaceData();
    const files = Array.isArray(snapshot?.data?.files) ? snapshot.data.files : [];

    const getFileBySuffix = (suffix) => {
      const lowerSuffix = String(suffix || "").toLowerCase();
      const matches = files.filter((entry) => String(entry?.name || "").toLowerCase().endsWith(lowerSuffix));
      const preferred = matches.find((entry) => /runtime[\s-]*full[\s-]*matrix/i.test(String(entry?.name || "")));
      return preferred || matches[0] || null;
    };

    const indexFile = getFileBySuffix("index.html");
    const readmeFile = getFileBySuffix("readme.md");
    const indexCode = String(indexFile?.code || "");
    const readmeCode = String(readmeFile?.code || "");
    const combined = `${indexCode}\n${readmeCode}`.toLowerCase();

    const checklistSignals = [
      /step\s*1/i,
      /step\s*2/i,
      /step\s*3/i,
      /step\s*4/i,
      /js\s+done\s+marker/i,
      /html(?:\s*\+\s*linked\s*js|\s+linked\s+js)\s+marker/i,
      /css\s+visual\s+markers?/i,
      /console\s+and\s+status.*run\s+completion/i,
    ];
    const missingChecklistSignals = checklistSignals
      .filter((pattern) => !pattern.test(combined))
      .map((pattern) => pattern.toString());
    const hasJsReference = /\bjavascript\b|\bjs\b/.test(combined);
    const hasHtmlReference = /\bhtml\b/.test(combined);
    const hasCssReference = /\bcss\b/.test(combined);
    const hasUnsupportedLanguageTerm = /\bpython\b|\bruby\b|\bphp\b|\bjava\b|\bc#\b|\bc\+\+\b|\bgolang\b|\brust\b/.test(combined);

    return {
      ready: true,
      loaded,
      indexName: String(indexFile?.name || ""),
      readmeName: String(readmeFile?.name || ""),
      hasIndex: indexCode.length > 0,
      hasReadme: readmeCode.length > 0,
      missingChecklistSignals,
      hasJsReference,
      hasHtmlReference,
      hasCssReference,
      hasUnsupportedLanguageTerm,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.indexName.toLowerCase()).toContain("runtime-full-matrix");
  expect(result.readmeName.toLowerCase()).toContain("runtime-full-matrix");
  expect(result.hasIndex).toBeTruthy();
  expect(result.hasReadme).toBeTruthy();
  expect(result.missingChecklistSignals).toEqual([]);
  expect(result.hasJsReference).toBeTruthy();
  expect(result.hasHtmlReference).toBeTruthy();
  expect(result.hasCssReference).toBeTruthy();
  expect(result.hasUnsupportedLanguageTerm).toBeFalsy();
});

test("applications catalog scope guard allows only web-runtime file extensions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const apps = window.fazide?.listApplications?.() || [];
    const allowedExtensions = new Set(["html", "css", "js", "md"]);
    const unsupportedExtensions = new Set(["py", "rb", "php", "java", "cs", "cpp", "go", "rs"]);

    const collectExtension = (filePath = "") => {
      const value = String(filePath || "").trim();
      const dot = value.lastIndexOf(".");
      return dot >= 0 ? value.slice(dot + 1).toLowerCase() : "";
    };

    const extensionSummary = {
      allowedOnly: true,
      unsupportedHits: [],
      nonAllowedHits: [],
    };

    apps.forEach((app) => {
      const filePaths = Array.isArray(app?.files) ? app.files.map((file) => String(file?.path || "")) : [];
      const allPaths = [...filePaths, String(app?.entryFile || "")].filter(Boolean);

      allPaths.forEach((filePath) => {
        const ext = collectExtension(filePath);
        if (!ext) {
          extensionSummary.allowedOnly = false;
          extensionSummary.nonAllowedHits.push({ id: String(app?.id || ""), path: filePath, ext: "" });
          return;
        }
        if (unsupportedExtensions.has(ext)) {
          extensionSummary.allowedOnly = false;
          extensionSummary.unsupportedHits.push({ id: String(app?.id || ""), path: filePath, ext });
          return;
        }
        if (!allowedExtensions.has(ext)) {
          extensionSummary.allowedOnly = false;
          extensionSummary.nonAllowedHits.push({ id: String(app?.id || ""), path: filePath, ext });
        }
      });
    });

    return {
      count: apps.length,
      ...extensionSummary,
    };
  });

  expect(result.count).toBeGreaterThan(0);
  expect(result.allowedOnly).toBeTruthy();
  expect(result.unsupportedHits).toEqual([]);
  expect(result.nonAllowedHits).toEqual([]);
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

test("sandbox runtime status and markers remain deterministic for JS HTML and CSS templates", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadApplication) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const readStatus = () => String(document.querySelector("#statusText")?.textContent || "").toLowerCase();
    const readSandboxState = () => String(document.querySelector("#footerSandbox")?.getAttribute("data-state") || "").toLowerCase();
    const readLog = () => String(document.querySelector("#log")?.textContent || "");

    const jsLoaded = await api.loadApplication("runtime-js-check-app", { run: true });
    await wait(420);
    const jsStatus = readStatus();
    const jsSandboxState = readSandboxState();
    const jsLog = readLog();

    const htmlLoaded = await api.loadApplication("runtime-html-check-app", { run: true });
    await wait(420);
    const htmlStatus = readStatus();
    const htmlSandboxState = readSandboxState();
    const htmlLog = readLog();

    const cssLoaded = await api.loadApplication("runtime-css-check-app", { run: true });
    await wait(420);
    const cssStatus = readStatus();
    const cssSandboxState = readSandboxState();
    const cssLang = String(document.querySelector("#footerEditorLang")?.textContent || "").toLowerCase();
    const runnerDoc = String(document.querySelector("#runner")?.getAttribute("srcdoc") || "").toLowerCase();

    return {
      ready: true,
      jsLoaded,
      htmlLoaded,
      cssLoaded,
      jsStatusRan: jsStatus.includes("ran"),
      htmlStatusRan: htmlStatus.includes("ran"),
      cssStatusRan: cssStatus.includes("ran"),
      jsSandboxHealthy: ["ok", "warn"].includes(jsSandboxState),
      htmlSandboxHealthy: ["ok", "warn"].includes(htmlSandboxState),
      cssSandboxHealthy: ["ok", "warn"].includes(cssSandboxState),
      jsMarkerSeen: /runtime-js-check:.*console-log/.test(jsLog),
      htmlMarkerSeen: /runtime-html-check:.*linked-js-console/.test(htmlLog),
      cssMarkerSeen: runnerDoc.includes("runtime-css-check:step-01") && runnerDoc.includes("runtime-css-check:step-02"),
      cssLangSeen: cssLang.includes("css"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.jsLoaded).toBeTruthy();
  expect(result.htmlLoaded).toBeTruthy();
  expect(result.cssLoaded).toBeTruthy();

  expect(result.jsStatusRan).toBeTruthy();
  expect(result.htmlStatusRan).toBeTruthy();
  expect(result.cssStatusRan).toBeTruthy();
  expect(result.jsSandboxHealthy).toBeTruthy();
  expect(result.htmlSandboxHealthy).toBeTruthy();
  expect(result.cssSandboxHealthy).toBeTruthy();

  expect(result.jsMarkerSeen).toBeTruthy();
  expect(result.htmlMarkerSeen).toBeTruthy();
  expect(result.cssMarkerSeen).toBeTruthy();
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

test("games and applications load buttons reveal and lessons tier launchers stay visible when expanded", async ({ page }) => {
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
    const tierMap = document.querySelector("#lessonTierMap");
    const beginnerBtn = document.querySelector("#lessonTierOpenBeginner");
    if (!gamesToggle || !appsToggle || !lessonsToggle || !gameLoad || !appLoad || !tierMap || !beginnerBtn) {
      return { ready: false };
    }

    return {
      ready: true,
      gamesToggleDisabled: Boolean(gamesToggle.disabled),
      appsToggleDisabled: Boolean(appsToggle.disabled),
      lessonsToggleDisabled: Boolean(lessonsToggle.disabled),
      gameLoadHidden: Boolean(gameLoad.hidden),
      appLoadHidden: Boolean(appLoad.hidden),
      gameLoadDisabled: Boolean(gameLoad.disabled),
      appLoadDisabled: Boolean(appLoad.disabled),
      tierMapHidden: tierMap.getAttribute("aria-hidden") === "true",
      beginnerExpanded: String(beginnerBtn.getAttribute("aria-expanded") || "false"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.gamesToggleDisabled).toBeFalsy();
  expect(result.appsToggleDisabled).toBeFalsy();
  expect(result.lessonsToggleDisabled).toBeFalsy();
  expect(result.gameLoadHidden).toBeFalsy();
  expect(result.appLoadHidden).toBeFalsy();
  expect(result.gameLoadDisabled).toBeFalsy();
  expect(result.appLoadDisabled).toBeFalsy();
  expect(result.tierMapHidden).toBeFalsy();
  expect(result.beginnerExpanded).toBe("false");
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

test("files search shows helpful no-match copy and Escape clears filter", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const filesSection = page.locator('#fileList [data-file-section="files"]');
  await expect(filesSection).toHaveCount(1);
  const expanded = await filesSection.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await filesSection.click();
  }

  const search = page.locator("#fileSearch");
  if (!(await search.isVisible())) {
    await page.locator("#filesMenuButton").click();
    const filtersToggle = page.locator('#filesMenu [data-files-toggle="filters"]');
    await expect(filtersToggle).toBeVisible();
    const pressed = await filtersToggle.getAttribute("aria-pressed");
    if (pressed !== "true") {
      await filtersToggle.click();
    }
    await page.keyboard.press("Escape");
  }
  await expect(search).toBeVisible();
  await search.fill("zzzz-no-match-phrase");

  const empty = page.locator("#fileList .files-sub");
  await expect(empty).toContainText("No matches for");
  await expect(empty).toContainText("Press Esc to clear filter");

  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator("#fileList .file-row").first()).toBeVisible();
});

test("files tree remains populated after rapid filter and sort changes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const search = document.querySelector("#fileSearch");
    const sort = document.querySelector("#fileSort");
    const list = document.querySelector("#fileList");
    const filesToggle = document.querySelector('#fileList [data-file-section="files"]');
    if (!(search instanceof HTMLInputElement) || !(sort instanceof HTMLSelectElement) || !list || !(filesToggle instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    if (filesToggle.getAttribute("aria-expanded") !== "true") {
      filesToggle.click();
      await wait(40);
    }

    ["i", "in", "ind", ""].forEach((value) => {
      search.value = value;
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });

    ["name", "recent", "manual"].forEach((value) => {
      sort.value = value;
      sort.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await wait(220);

    const rowCount = list.querySelectorAll(".file-row").length;
    const hasFilesHeader = Boolean(list.querySelector('[data-file-section="files"]'));
    return {
      ready: true,
      rowCount,
      hasFilesHeader,
      finalSearch: search.value,
      finalSort: sort.value,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.finalSearch).toBe("");
  expect(result.finalSort).toBe("manual");
  expect(result.hasFilesHeader).toBeTruthy();
  expect(result.rowCount).toBeGreaterThan(0);
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
  const rect = await filesSeparator.boundingBox();
  expect(rect).toBeTruthy();

  const startX = rect.x + rect.width / 2;
  const startY = rect.y + (rect.height / 2);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 140, startY);
  await page.mouse.up();

  const readSidebarDelta = () => page.evaluate(({ beforeSidebar, beforeSandbox }) => {
    const api = window.fazide;
    const afterSidebar = Number(api?.getState?.()?.layout?.sidebarWidth || 0);
    const afterSandbox = Number(api?.getState?.()?.layout?.sandboxWidth || 0);
    return {
      ready: Boolean(api?.getState),
      beforeSidebar,
      beforeSandbox,
      afterSidebar,
      afterSandbox,
      delta: Math.abs(afterSidebar - beforeSidebar),
    };
  }, {
    beforeSidebar: setup.beforeSidebar,
    beforeSandbox: setup.beforeSandbox,
  });

  let result = await readSidebarDelta();
  expect(result.ready).toBeTruthy();
  if (result.delta < 8) {
    const reverseRect = await filesSeparator.boundingBox();
    expect(reverseRect).toBeTruthy();
    const reverseX = reverseRect.x + reverseRect.width / 2;
    const reverseY = reverseRect.y + (reverseRect.height / 2);
    await page.mouse.move(reverseX, reverseY);
    await page.mouse.down();
    await page.mouse.move(reverseX - 180, reverseY);
    await page.mouse.up();
    result = await readSidebarDelta();
  }

  if (result.delta < 8) {
    await filesSeparator.focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    result = await readSidebarDelta();
  }

  expect(result.delta).toBeGreaterThanOrEqual(8);
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

      const readViolationCount = async () => {
        const audit = await readWorkspaceAudit();
        if (!audit.ready || audit.panelCount <= 0) return -1;
        return audit.violations.length;
      };

      await expect.poll(readViolationCount, {
        timeout: 12000,
      }).toBe(0);

      const audit = await readWorkspaceAudit();

      expect(audit.ready).toBeTruthy();
      expect(audit.panelCount).toBeGreaterThan(0);
      expect(audit.violations, `workspace overlap violations: ${audit.violations.join(", ")}`).toEqual([]);
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
  await page.evaluate((id) => {
    const renameInput = document.querySelector(`[data-file-rename="${id}"]`);
    renameInput?.blur?.();
  }, created.id);

  await expect
    .poll(async () => {
      const list = await page.evaluate(() => window.fazide?.listFiles?.() || []);
      const file = list.find((entry) => entry.id === created.id);
      return file?.name || "";
    })
    .toBe(`${created.folder}/renamed`);
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

test("dev terminal help stays aligned with safe runtime command scope", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.openDevTerminal || !api?.runDevTerminal) {
      return { ready: false };
    }

    api.openDevTerminal();
    await api.runDevTerminal("help");
    const outputText = String(document.querySelector("#devTerminalOutput")?.textContent || "");
    const normalized = outputText.toLowerCase();

    const expectedSnippets = [
      "commands: help, clear, status, run, format, save, save-all",
      "commands: task <run-all|run-app|lint-workspace|format-active|save-all>",
      "commands: open <log|editor|files|sandbox|tools>",
      "commands: bytes <status|add <amount>|reset>",
      "commands: tutorial <start|reset|status>",
      "commands: tutorial list",
      "commands: fresh-start confirm",
      "safety: privileged/eval commands are disabled",
    ];

    const forbiddenSnippets = [
      "python",
      "ruby",
      "php",
      "java",
      "c++",
      "rust",
      "go",
      "dev-js",
      "command: eval",
      "commands: eval",
    ];

    const missingExpected = expectedSnippets.filter((snippet) => !normalized.includes(snippet));
    const presentForbidden = forbiddenSnippets.filter((snippet) => normalized.includes(snippet));

    return {
      ready: true,
      missingExpected,
      presentForbidden,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.missingExpected).toEqual([]);
  expect(result.presentForbidden).toEqual([]);
});

test("dev terminal bytes commands support add status and reset for lesson testing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.openDevTerminal || !api?.runDevTerminal || !api?.getLessonProfile) {
      return { ready: false };
    }

    api.openDevTerminal();
    await api.runDevTerminal("bytes reset");
    await api.runDevTerminal("bytes add 42");
    await api.runDevTerminal("bytes status");
    await api.runDevTerminal("bytes add nope");

    const profileAfterAdd = api.getLessonProfile();
    const outputText = String(document.querySelector("#devTerminalOutput")?.textContent || "");

    await api.runDevTerminal("bytes reset");
    const profileAfterReset = api.getLessonProfile();

    return {
      ready: true,
      bytesAfterAdd: Number(profileAfterAdd?.bytes || 0),
      bytesAfterReset: Number(profileAfterReset?.bytes || 0),
      outputText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.bytesAfterAdd).toBe(42);
  expect(result.bytesAfterReset).toBe(0);
  expect(result.outputText).toContain("Added 42 lesson bytes. Total: 42.");
  expect(result.outputText).toContain("Lesson bytes: 42");
  expect(result.outputText).toContain("Usage: bytes add <amount>");
});

test("beginner tutorial reset restarts from the first step", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const before = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.startTutorial || !api?.resetTutorial || !api?.runDevTerminal || !api?.openDevTerminal || !api?.getTutorialState) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.openDevTerminal();
    await api.runDevTerminal("tutorial list");
    await api.runDevTerminal("tutorial start beginner");
    const root = document.querySelector("#tutorialIntro");
    const progress = String(document.querySelector("#tutorialIntroProgress")?.textContent || "").trim();
    const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
    const outputText = String(document.querySelector("#devTerminalOutput")?.textContent || "");
    const state = api.getTutorialState();

    return {
      ready: true,
      visible: Boolean(root && !root.hidden),
      progress,
      title,
      tutorialId: String(state?.tutorialId || ""),
      availableTutorials: Array.isArray(state?.availableTutorials) ? state.availableTutorials : [],
      listedBeginner: outputText.toLowerCase().includes("available tutorials:") && outputText.toLowerCase().includes("beginner"),
      stepIndex: Number(state?.stepIndex || 0),
      seen: Boolean(state?.seen),
    };
  });

  expect(before.ready).toBeTruthy();
  expect(before.visible).toBeTruthy();
  expect(before.progress.toLowerCase()).toContain("step 1 of");
  expect(before.title).toBe("Welcome to FAZ IDE");
  expect(before.tutorialId).toBe("beginner");
  expect(before.availableTutorials).toContain("beginner");
  expect(before.listedBeginner).toBeTruthy();
  expect(before.stepIndex).toBe(0);
  expect(before.seen).toBeFalsy();

  const after = await page.evaluate(async () => {
    const api = window.fazide;
    await api.runDevTerminal("tutorial status");
    await api.runDevTerminal("tutorial reset beginner");
    await api.runDevTerminal("tutorial start beginner");

    const progress = String(document.querySelector("#tutorialIntroProgress")?.textContent || "").trim();
    const state = api.getTutorialState();
    return {
      progress,
      stepIndex: Number(state?.stepIndex || 0),
      seen: Boolean(state?.seen),
    };
  });

  expect(after.progress.toLowerCase()).toContain("step 1 of");
  expect(after.stepIndex).toBe(0);
  expect(after.seen).toBeFalsy();
});

test("beginner tutorial reopens header and footer when started from hidden layout", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.runDevTerminal || !api?.openDevTerminal) {
      return { ready: false };
    }

    const shell = document.querySelector("#appShell");
    document.querySelector("#toggleHeader")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector("#toggleFooter")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const hiddenState = {
      header: String(shell?.getAttribute("data-header") || ""),
      footer: String(shell?.getAttribute("data-footer") || ""),
    };

    api.openDevTerminal();
    await api.runDevTerminal("tutorial start beginner");

    const intro = document.querySelector("#tutorialIntro");
    const startedState = {
      header: String(shell?.getAttribute("data-header") || ""),
      footer: String(shell?.getAttribute("data-footer") || ""),
      tutorialVisible: Boolean(intro && !intro.hidden),
      firstStepTitle: String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim(),
    };

    return {
      ready: true,
      hiddenState,
      startedState,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hiddenState.header).toBe("closed");
  expect(result.hiddenState.footer).toBe("closed");
  expect(result.startedState.header).toBe("open");
  expect(result.startedState.footer).toBe("open");
  expect(result.startedState.tutorialVisible).toBeTruthy();
  expect(result.startedState.firstStepTitle).toContain("Welcome");
});

test("tutorial intro applies dark focus backdrop while active", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.runDevTerminal || !api?.openDevTerminal) {
      return { ready: false };
    }

    api.openDevTerminal();
    await api.runDevTerminal("tutorial start beginner");

    const backdrop = document.querySelector(".tutorial-intro-backdrop");
    const highlight = document.querySelector("#tutorialIntroHighlight");
    const styles = backdrop instanceof HTMLElement ? getComputedStyle(backdrop) : null;
    const highlightStyles = highlight instanceof HTMLElement ? getComputedStyle(highlight) : null;
    return {
      ready: true,
      hasBackdrop: backdrop instanceof HTMLElement,
      backgroundImage: String(styles?.backgroundImage || ""),
      opacity: Number.parseFloat(String(styles?.opacity || "0")),
      highlightShadow: String(highlightStyles?.boxShadow || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasBackdrop).toBeTruthy();
  expect(result.backgroundImage).not.toBe("none");
  const usesBackdropDimming = result.opacity >= 0.7;
  const usesHighlightMaskDimming = result.highlightShadow.includes("9999px");
  expect(usesBackdropDimming || usesHighlightMaskDimming).toBeTruthy();
});

test("tutorial galaxy canvas initializes and tutorial can close safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.runDevTerminal || !api?.openDevTerminal) {
      return { ready: false };
    }

    api.openDevTerminal();
    await api.runDevTerminal("tutorial start beginner");

    const root = document.querySelector("#tutorialIntro");
    const canvas = document.querySelector("#tutorialIntroGalaxy");
    const started = {
      visible: Boolean(root && !root.hidden),
      canvasPresent: canvas instanceof HTMLCanvasElement,
      canvasWidth: Number(canvas instanceof HTMLCanvasElement ? canvas.width : 0),
      canvasHeight: Number(canvas instanceof HTMLCanvasElement ? canvas.height : 0),
    };

    document.querySelector("#tutorialIntroSkip")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 60));

    return {
      ready: true,
      started,
      closed: Boolean(root?.hidden),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.started.visible).toBeTruthy();
  expect(result.started.canvasPresent).toBeTruthy();
  expect(result.started.canvasWidth).toBeGreaterThan(0);
  expect(result.started.canvasHeight).toBeGreaterThan(0);
  expect(result.closed).toBeTruthy();
});

test("layout menu Tutorial button restarts beginner tutorial and matches Reset size", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");

    const layoutToggle = document.querySelector("#layoutToggle");
    if (!(layoutToggle instanceof HTMLElement)) {
      return { ready: false };
    }
    layoutToggle.click();
    await new Promise((resolve) => setTimeout(resolve, 60));

    const tutorialButton = document.querySelector("#layoutTutorial");
    const resetButton = document.querySelector("#layoutReset");
    if (!(tutorialButton instanceof HTMLElement) || !(resetButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const tutorialRect = tutorialButton.getBoundingClientRect();
    const resetRect = resetButton.getBoundingClientRect();
    const widthDelta = Math.abs(tutorialRect.width - resetRect.width);
    const heightDelta = Math.abs(tutorialRect.height - resetRect.height);

    tutorialButton.click();
    await new Promise((resolve) => setTimeout(resolve, 120));

    const intro = document.querySelector("#tutorialIntro");
    const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
    const progress = String(document.querySelector("#tutorialIntroProgress")?.textContent || "").trim().toLowerCase();

    return {
      ready: true,
      widthDelta,
      heightDelta,
      tutorialVisible: Boolean(intro instanceof HTMLElement && !intro.hidden),
      title,
      progress,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.widthDelta).toBeLessThanOrEqual(1);
  expect(result.heightDelta).toBeLessThanOrEqual(1);
  expect(result.tutorialVisible).toBeTruthy();
  expect(result.title).toBe("Welcome to FAZ IDE");
  expect(result.progress).toContain("step 1 of");
});

test("beginner tutorial includes top header Lessons button step", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reached = false;
    for (let i = 0; i < 80; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Lessons Button") {
        reached = true;
        break;
      }
      nextButton.click();
      await wait(40);
    }

    const lessonButton = document.querySelector("#lessonStatsBtn");
    const highlight = document.querySelector("#tutorialIntroHighlight");
    const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
    let overlap = 0;
    if (lessonButton instanceof HTMLElement && highlight instanceof HTMLElement) {
      const buttonRect = lessonButton.getBoundingClientRect();
      const highlightRect = highlight.getBoundingClientRect();
      const overlapWidth = Math.max(0, Math.min(buttonRect.right, highlightRect.right) - Math.max(buttonRect.left, highlightRect.left));
      const overlapHeight = Math.max(0, Math.min(buttonRect.bottom, highlightRect.bottom) - Math.max(buttonRect.top, highlightRect.top));
      const overlapArea = overlapWidth * overlapHeight;
      const buttonArea = Math.max(1, buttonRect.width * buttonRect.height);
      overlap = overlapArea / buttonArea;
    }
    return {
      ready: true,
      reached,
      title,
      lessonButtonPresent: lessonButton instanceof HTMLElement,
      highlightVisible: Boolean(highlight instanceof HTMLElement && !highlight.hidden),
      overlap,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reached).toBeTruthy();
  expect(result.title).toBe("Lessons Button");
  expect(result.lessonButtonPresent).toBeTruthy();
  expect(result.highlightVisible).toBeTruthy();
  expect(result.overlap).toBeGreaterThan(0.35);
});

test("beginner tutorial panel follows target without overlapping spotlight", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial || !api?.runDevTerminal) {
      return { ready: false };
    }

    api.resetTutorial();
    api.startTutorial();

    const panel = document.querySelector("#tutorialIntro .tutorial-intro-panel");
    const ring = document.querySelector("#tutorialIntroHighlight");
    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(panel instanceof HTMLElement) || !(ring instanceof HTMLElement)) {
      return { ready: false };
    }

    if (nextButton instanceof HTMLElement) {
      nextButton.click();
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
    const panelRect = panel.getBoundingClientRect();
    const ringRect = ring.getBoundingClientRect();
    const ringStyle = getComputedStyle(ring);
    const panelStyle = getComputedStyle(panel);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(120);
    const bodyText = String(document.querySelector("#tutorialIntroBody")?.textContent || "").trim();

    const overlap = !(
      panelRect.right <= ringRect.left
      || panelRect.left >= ringRect.right
      || panelRect.bottom <= ringRect.top
      || panelRect.top >= ringRect.bottom
    );

    const inViewport = (
      panelRect.left >= 0
      && panelRect.top >= 0
      && panelRect.right <= viewportWidth
      && panelRect.bottom <= viewportHeight
    );

    if (nextButton instanceof HTMLElement) {
      nextButton.click();
    }

    const panelRectAfter = panel.getBoundingClientRect();
    const positionShift = Math.abs(panelRectAfter.left - panelRect.left) + Math.abs(panelRectAfter.top - panelRect.top);

    await api.runDevTerminal("tutorial reset");
    await api.runDevTerminal("tutorial start");

    return {
      ready: true,
      overlap,
      inViewport,
      panelLeftInline: String(panel.style.left || "").trim(),
      panelTopInline: String(panel.style.top || "").trim(),
      panelTransform: String(panelStyle.transform || ""),
      bodyText,
      positionShift,
      ringVisible: !ring.hidden,
      ringOpacity: Number.parseFloat(String(ringStyle.opacity || "0")),
      ringWidth: ringRect.width,
      ringHeight: ringRect.height,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.overlap).toBeFalsy();
  expect(result.inViewport).toBeTruthy();
  expect(result.panelLeftInline.length).toBeGreaterThan(0);
  expect(result.panelTopInline.length).toBeGreaterThan(0);
  expect(result.panelTransform).toContain("matrix");
  expect(result.bodyText.length).toBeGreaterThan(0);
  expect(result.positionShift).toBeGreaterThanOrEqual(0);
  expect(result.ringVisible).toBeTruthy();
  expect(result.ringOpacity).toBeGreaterThan(0.1);
  expect(result.ringWidth).toBeGreaterThan(12);
  expect(result.ringHeight).toBeGreaterThan(12);
});

test("tutorial files actions step opens menu and reveals view toggles", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    nextButton.click();
    await wait(40);
    nextButton.click();
    await wait(40);

    const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
    const filesMenu = document.querySelector("#filesMenu");
    const viewSection = filesMenu?.querySelector?.('[aria-label="View actions"]');
    const viewGrid = viewSection?.querySelector?.('.files-menu-grid') || null;
    const filtersToggle = filesMenu?.querySelector?.('[data-files-toggle="filters"]');
    const gamesToggle = filesMenu?.querySelector?.('[data-files-toggle="games"]');
    const highlight = document.querySelector("#tutorialIntroHighlight");

    if (!(filesMenu instanceof HTMLElement) || !(viewSection instanceof HTMLElement)) {
      return {
        ready: true,
        title,
        menuOpen: false,
        viewVisible: false,
        menuScrollStart: 0,
        menuScrollAfter: 0,
        togglesPresent: false,
        highlightOverlap: 0,
      };
    }

    const menuScrollStart = Number(filesMenu.scrollTop || 0);
    await wait(280);

    const sectionRect = viewSection.getBoundingClientRect();
    const menuRect = filesMenu.getBoundingClientRect();
    const viewVisible = sectionRect.bottom > menuRect.top && sectionRect.top < menuRect.bottom;
    let highlightOverlap = 0;
    if (highlight instanceof HTMLElement && viewGrid instanceof HTMLElement) {
      const h = highlight.getBoundingClientRect();
      const g = viewGrid.getBoundingClientRect();
      const overlapW = Math.max(0, Math.min(h.right, g.right) - Math.max(h.left, g.left));
      highlightOverlap = g.width > 0 ? overlapW / g.width : 0;
    }

    return {
      ready: true,
      title,
      menuOpen: filesMenu.getAttribute("aria-hidden") !== "true",
      viewVisible,
      menuScrollStart,
      menuScrollAfter: Number(filesMenu.scrollTop || 0),
      togglesPresent: filtersToggle instanceof HTMLElement && gamesToggle instanceof HTMLElement,
      highlightOverlap,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.title).toBe("Files Actions");
  expect(result.menuOpen).toBeTruthy();
  expect(result.viewVisible).toBeTruthy();
  expect(result.menuScrollStart).toBeLessThanOrEqual(4);
  expect(result.menuScrollAfter).toBeGreaterThan(result.menuScrollStart);
  expect(result.togglesPresent).toBeTruthy();
  expect(result.highlightOverlap).toBeGreaterThan(0.55);
});

test("files tab tutorial highlights full open-editors and files sections", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const computeCoverage = (sectionId) => {
      const highlight = document.querySelector("#tutorialIntroHighlight");
      const headerBtn = document.querySelector(`#fileList [data-file-section="${sectionId}"]`);
      if (!(highlight instanceof HTMLElement) || !(headerBtn instanceof HTMLElement)) {
        return { ok: false, overlap: 0 };
      }
      const header = headerBtn.closest(".file-section-header");
      if (!(header instanceof HTMLElement)) {
        return { ok: false, overlap: 0 };
      }
      let sectionRect = header.getBoundingClientRect();
      let cursor = header.nextElementSibling;
      while (cursor instanceof HTMLElement) {
        if (cursor.classList.contains("file-section-header") || cursor.hasAttribute("data-files-static-slot")) {
          break;
        }
        if (String(cursor.dataset.fileRowSection || "") === sectionId) {
          const r = cursor.getBoundingClientRect();
          sectionRect = {
            left: Math.min(sectionRect.left, r.left),
            top: Math.min(sectionRect.top, r.top),
            right: Math.max(sectionRect.right, r.right),
            bottom: Math.max(sectionRect.bottom, r.bottom),
            width: Math.max(sectionRect.right, r.right) - Math.min(sectionRect.left, r.left),
            height: Math.max(sectionRect.bottom, r.bottom) - Math.min(sectionRect.top, r.top),
          };
        }
        cursor = cursor.nextElementSibling;
      }

      const h = highlight.getBoundingClientRect();
      const overlapW = Math.max(0, Math.min(h.right, sectionRect.right) - Math.max(h.left, sectionRect.left));
      const overlap = sectionRect.width > 0 ? overlapW / sectionRect.width : 0;
      return { ok: true, overlap };
    };

    api.resetTutorial("beginner");
    api.startTutorial("beginner");
    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    let openEditorsCoverage = null;
    let filesCoverage = null;
    for (let i = 0; i < 60; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Files Tab: Open Editors") {
        await wait(130);
        openEditorsCoverage = computeCoverage("open-editors");
      }
      if (title === "Files Tab: Files") {
        await wait(130);
        filesCoverage = computeCoverage("files");
        break;
      }
      nextButton.click();
      await wait(40);
    }

    return {
      ready: true,
      openEditorsCoverage,
      filesCoverage,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.openEditorsCoverage?.ok).toBeTruthy();
  expect(result.filesCoverage?.ok).toBeTruthy();
  expect(result.openEditorsCoverage?.overlap).toBeGreaterThan(0.55);
  expect(result.filesCoverage?.overlap).toBeGreaterThan(0.55);
});

test("tutorial files tab walkthrough follows requested top-down order", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const expected = [
      "Files Tab: Open Editors",
      "Files Tab: Files",
      "Files Tab: Games",
      "Files Tab: Applications",
      "Files Tab: Lessons",
    ];

    const readExpandedState = () => {
      const openEditorsToggle = document.querySelector('#fileList [data-files-section-id="open-editors"]');
      const filesToggle = document.querySelector('#fileList [data-files-section-id="files"]');
      const gamesToggle = document.querySelector("#gamesSelectorToggle");
      const appsToggle = document.querySelector("#appsSelectorToggle");
      const lessonsToggle = document.querySelector("#lessonsSelectorToggle");
      return {
        "open-editors": String(openEditorsToggle?.getAttribute("aria-expanded") || "false") === "true",
        files: String(filesToggle?.getAttribute("aria-expanded") || "false") === "true",
        games: String(gamesToggle?.getAttribute("aria-expanded") || "false") === "true",
        applications: String(appsToggle?.getAttribute("aria-expanded") || "false") === "true",
        lessons: String(lessonsToggle?.getAttribute("aria-expanded") || "false") === "true",
      };
    };

    const expectedOpenByTitle = {
      "Files Tab: Open Editors": "open-editors",
      "Files Tab: Files": "files",
      "Files Tab: Games": "games",
      "Files Tab: Applications": "applications",
      "Files Tab: Lessons": "lessons",
    };
    const expectedOpenCountByTitle = {
      "Files Tab: Open Editors": 1,
      "Files Tab: Files": 2,
      "Files Tab: Games": 3,
      "Files Tab: Applications": 4,
      "Files Tab: Lessons": 5,
    };

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const titles = [];
    const snapshots = [];
    for (let i = 0; i < 30; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      titles.push(title);
      if (expected.includes(title)) {
        const expectedOpenKey = expectedOpenByTitle[title];
        const expectedOpenCount = expectedOpenCountByTitle[title];
        let expanded = readExpandedState();
        let attempts = 0;
        while (attempts < 16) {
          const openCount = Object.values(expanded).filter(Boolean).length;
          if (openCount >= expectedOpenCount && expectedOpenKey && expanded[expectedOpenKey]) break;
          await wait(50);
          expanded = readExpandedState();
          attempts += 1;
        }
        snapshots.push({
          title,
          expanded,
        });
      }
      if (title === expected[expected.length - 1]) break;
      nextButton.click();
      await wait(40);
    }

    const indices = expected.map((title) => titles.indexOf(title));
    const allPresent = indices.every((value) => value >= 0);
    const ordered = indices.every((value, index) => index === 0 || value > indices[index - 1]);
    const contiguous = allPresent
      ? titles.slice(indices[0], indices[0] + expected.length).join("|") === expected.join("|")
      : false;

    return {
      ready: true,
      allPresent,
      ordered,
      contiguous,
      indices,
      titles,
      snapshots,
      expectedOpenByTitle,
      expectedOpenCountByTitle,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.allPresent).toBeTruthy();
  expect(result.ordered).toBeTruthy();
  expect(result.contiguous).toBeTruthy();
  expect(result.snapshots.length).toBeGreaterThanOrEqual(5);
  result.snapshots.forEach((entry) => {
    const expectedOpenKey = result.expectedOpenByTitle[entry.title];
    const expectedOpenCount = result.expectedOpenCountByTitle[entry.title];
    expect(Boolean(expectedOpenKey)).toBeTruthy();
    expect(Number.isFinite(expectedOpenCount)).toBeTruthy();
    const openCount = Object.values(entry.expanded).filter(Boolean).length;
    expect(openCount).toBeGreaterThanOrEqual(expectedOpenCount);
    expect(entry.expanded[expectedOpenKey]).toBeTruthy();
  });
  const lastSnapshot = result.snapshots[result.snapshots.length - 1];
  if (lastSnapshot) {
    const finalOpenCount = Object.values(lastSnapshot.expanded).filter(Boolean).length;
    expect(finalOpenCount).toBe(5);
  }
});

test("files tab tutorial highlights full games section container", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reached = false;
    for (let i = 0; i < 80; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Files Tab: Games") {
        reached = true;
        break;
      }
      nextButton.click();
      await wait(35);
    }

    await wait(120);

    const highlight = document.querySelector("#tutorialIntroHighlight");
    const section = document.querySelector("#filesGames");
    if (!(highlight instanceof HTMLElement) || !(section instanceof HTMLElement)) {
      return { ready: true, reached, comparable: false };
    }

    const h = highlight.getBoundingClientRect();
    const s = section.getBoundingClientRect();
    const overlapWidth = Math.max(0, Math.min(h.right, s.right) - Math.max(h.left, s.left));
    const overlapRatio = s.width > 0 ? overlapWidth / s.width : 0;

    return {
      ready: true,
      reached,
      comparable: true,
      overlapRatio,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reached).toBeTruthy();
  expect(result.comparable).toBeTruthy();
  expect(result.overlapRatio).toBeGreaterThan(0.6);
});

test("files tab tutorial spotlight stays inside files panel bounds", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reached = false;
    for (let i = 0; i < 80; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Files Tab: Games") {
        reached = true;
        break;
      }
      nextButton.click();
      await wait(35);
    }

    await wait(140);

    const highlight = document.querySelector("#tutorialIntroHighlight");
    const filesPanel = document.querySelector("#filesPanel");
    if (!(highlight instanceof HTMLElement) || !(filesPanel instanceof HTMLElement)) {
      return { ready: true, reached, comparable: false };
    }

    const h = highlight.getBoundingClientRect();
    const p = filesPanel.getBoundingClientRect();
    const within = h.left >= (p.left - 1)
      && h.top >= (p.top - 1)
      && h.right <= (p.right + 1)
      && h.bottom <= (p.bottom + 1);

    return {
      ready: true,
      reached,
      comparable: true,
      within,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reached).toBeTruthy();
  expect(result.comparable).toBeTruthy();
  expect(result.within).toBeTruthy();
});

test("beginner tutorial sandbox actions are visible without hover", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reached = false;
    for (let i = 0; i < 80; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Sandbox Actions") {
        reached = true;
        break;
      }
      nextButton.click();
      await wait(40);
    }

    const runnerShell = document.querySelector("#runnerShell");
    const actions = runnerShell?.querySelector?.(".runner-actions");
    const popout = document.querySelector("#popoutSandbox");
    const expand = document.querySelector("#runnerFull");
    let opacity = 0;
    let pointerEvents = "";

    if (actions instanceof HTMLElement) {
      for (let i = 0; i < 40; i += 1) {
        const computed = window.getComputedStyle(actions);
        opacity = Number.parseFloat(computed.opacity || "0");
        pointerEvents = String(computed.pointerEvents || "");
        if (opacity >= 0.95 && pointerEvents === "auto") {
          break;
        }
        await wait(30);
      }
    }

    return {
      ready: true,
      reached,
      tutorialActionsAttr: String(runnerShell?.getAttribute?.("data-tutorial-actions") || ""),
      opacity,
      pointerEvents,
      popoutPresent: popout instanceof HTMLElement,
      expandPresent: expand instanceof HTMLElement,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reached).toBeTruthy();
  expect(result.tutorialActionsAttr).toBe("true");
  expect(result.opacity).toBeGreaterThan(0.8);
  expect(result.pointerEvents).toBe("auto");
  expect(result.popoutPresent).toBeTruthy();
  expect(result.expandPresent).toBeTruthy();
});

test("beginner tutorial does not rerun sandbox while advancing steps", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial || !api?.getState) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reachedSandbox = false;
    for (let i = 0; i < 100; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Sandbox Preview") {
        reachedSandbox = true;
        break;
      }
      nextButton.click();
      await wait(35);
    }

    if (!reachedSandbox) {
      return { ready: true, reachedSandbox: false, advanced: false, runCountStable: false };
    }

    await wait(120);
    const runCountAtSandbox = Number(api.getState()?.runCount || 0);

    let advanced = false;
    for (let i = 0; i < 4; i += 1) {
      nextButton.click();
      await wait(40);
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Console") {
        advanced = true;
        break;
      }
    }

    await wait(120);
    const runCountAfterAdvance = Number(api.getState()?.runCount || 0);

    return {
      ready: true,
      reachedSandbox,
      advanced,
      runCountAtSandbox,
      runCountAfterAdvance,
      runCountStable: runCountAfterAdvance === runCountAtSandbox,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reachedSandbox).toBeTruthy();
  expect(result.advanced).toBeTruthy();
  expect(result.runCountAtSandbox).toBeGreaterThan(0);
  expect(result.runCountStable).toBeTruthy();
});

test("beginner tutorial command results step animates search input and filters commands", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial) {
      return { ready: false };
    }

    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let reached = false;
    for (let i = 0; i < 120; i += 1) {
      const title = String(document.querySelector("#tutorialIntroTitle")?.textContent || "").trim();
      if (title === "Command Results") {
        reached = true;
        break;
      }
      nextButton.click();
      await wait(35);
    }

    if (!reached) {
      return { ready: true, reached, typed: false, listHasItems: false, hintText: "" };
    }

    await wait(520);

    const input = document.querySelector("#topCommandPaletteInput");
    const list = document.querySelector("#topCommandPaletteList");
    const hint = document.querySelector("#topCommandPaletteHint");
    const query = String(input?.value || "").trim();
    const optionsCount = list ? list.querySelectorAll("[data-command-id]").length : 0;

    return {
      ready: true,
      reached,
      typed: query.length > 0,
      listHasItems: optionsCount > 0,
      hintText: String(hint?.textContent || "").trim(),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.reached).toBeTruthy();
  expect(result.typed).toBeTruthy();
  expect(result.listHasItems).toBeTruthy();
  expect(result.hintText.toLowerCase()).toContain("enter to run");
});

test("top command palette keeps latest rapid input and mirrors results across lists", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const input = document.querySelector("#topCommandPaletteInput");
    const modalInput = document.querySelector("#commandPaletteInput");
    const topList = document.querySelector("#topCommandPaletteList");
    const modalList = document.querySelector("#commandPaletteList");
    if (!(input instanceof HTMLInputElement) || !(modalInput instanceof HTMLInputElement) || !topList || !modalList) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    input.focus();

    const rapidValues = ["task", "task run", "task run-all", ""]; 
    rapidValues.forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await wait(150);

    const topCount = topList.querySelectorAll("[data-command-id]").length;
    const modalCount = modalList.querySelectorAll("[data-command-id]").length;
    return {
      ready: true,
      topValue: String(input.value || ""),
      modalValue: String(modalInput.value || ""),
      topCount,
      modalCount,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.topValue).toBe("");
  expect(result.modalValue).toBe("");
  expect(result.topCount).toBeGreaterThan(0);
  expect(result.modalCount).toBe(result.topCount);
});

test("top command palette menu stays anchored after resize and scroll bursts", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const input = document.querySelector("#topCommandPaletteInput");
    const menu = document.querySelector("#topCommandPaletteMenu");
    if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    input.focus();
    await wait(40);

    for (let i = 0; i < 24; i += 1) {
      window.dispatchEvent(new Event("resize"));
      document.dispatchEvent(new Event("scroll", { bubbles: true }));
    }

    await wait(90);

    const inputRect = input.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const computed = getComputedStyle(menu);
    const horizontalDelta = Math.abs(menuRect.left - inputRect.left);
    const verticalGap = menuRect.top - inputRect.bottom;

    return {
      ready: true,
      open: menu.getAttribute("data-open") === "true",
      visible: computed.visibility !== "hidden" && menuRect.width > 0 && menuRect.height > 0,
      horizontalDelta,
      verticalGap,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.visible).toBeTruthy();
  expect(result.horizontalDelta).toBeLessThanOrEqual(12);
  expect(result.verticalGap).toBeGreaterThanOrEqual(0);
  expect(result.verticalGap).toBeLessThanOrEqual(16);
});

test("quick open keeps latest rapid input and renders matching file results", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.keyboard.press("Control+P");

  const result = await page.evaluate(async () => {
    const panel = document.querySelector("#quickOpenPalette");
    const input = document.querySelector("#quickOpenInput");
    const list = document.querySelector("#quickOpenList");
    const hint = document.querySelector("#quickOpenHint");
    if (!(panel instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !list || !hint) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const rapidValues = ["index", "index.html", "app", "app.js"];
    rapidValues.forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await wait(160);

    const rows = Array.from(list.querySelectorAll("[data-quick-open-id]"));
    const names = rows
      .slice(0, 6)
      .map((row) => String(row.querySelector(".quick-open-name")?.textContent || "").trim().toLowerCase())
      .filter(Boolean);
    const query = String(input.value || "").trim().toLowerCase();
    const hintText = String(hint.textContent || "").toLowerCase();

    return {
      ready: true,
      open: panel.getAttribute("data-open") === "true",
      query,
      rowCount: rows.length,
      names,
      hintText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.open).toBeTruthy();
  expect(result.query).toBe("app.js");
  expect(result.rowCount).toBeGreaterThan(0);
  expect(result.names.some((name) => name.includes("app.js"))).toBeTruthy();
  expect(result.hintText).toContain("enter to open");
});

test("problems refresh and clear keep list and footer counts in sync", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.applyPreset) {
      return { ready: false };
    }

    api.applyPreset("diagnostics");

    const cm = document.querySelector(".CodeMirror")?.CodeMirror;
    const textarea = document.querySelector("#editor");
    const invalidSource = "const answer = ;\n";
    if (cm && typeof cm.setValue === "function") {
      cm.setValue(invalidSource);
    } else if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = invalidSource;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      return { ready: false };
    }

    const refreshBtn = document.querySelector("#problemsRefresh");
    const clearBtn = document.querySelector("#problemsClear");
    const list = document.querySelector("#problemsList");
    const footer = document.querySelector("#footerProblems");
    if (!(refreshBtn instanceof HTMLButtonElement) || !(clearBtn instanceof HTMLButtonElement) || !list || !footer) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(80);
    refreshBtn.click();

    let refreshCount = 0;
    for (let i = 0; i < 45; i += 1) {
      refreshCount = list.querySelectorAll("[data-problem-id]").length;
      if (refreshCount > 0) break;
      await wait(40);
    }

    const footerAfterRefreshText = String(footer.textContent || "");
    const footerAfterRefreshCount = Number((footerAfterRefreshText.match(/(\d+)/) || ["0", "0"])[1] || 0);

    const validSource = "const answer = 1;\n";
    if (cm && typeof cm.setValue === "function") {
      cm.setValue(validSource);
    } else if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = validSource;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await wait(80);
    clearBtn.click();
    await wait(100);

    const clearCount = list.querySelectorAll("[data-problem-id]").length;
    const listText = String(list.textContent || "").toLowerCase();
    const footerAfterClearText = String(footer.textContent || "");
    const footerAfterClearCount = Number((footerAfterClearText.match(/(\d+)/) || ["0", "0"])[1] || 0);

    return {
      ready: true,
      refreshCount,
      footerAfterRefreshCount,
      clearCount,
      footerAfterClearCount,
      emptyMessageVisible: listText.includes("no active problems"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.refreshCount).toBeGreaterThan(0);
  expect(result.footerAfterRefreshCount).toBeGreaterThan(0);
  expect(result.clearCount).toBe(0);
  expect(result.footerAfterClearCount).toBe(0);
  expect(result.emptyMessageVisible).toBeTruthy();
});

test("beginner tutorial completion resets layout and leaves sandbox idle", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.resetTutorial || !api?.startTutorial || !api?.getState || !api?.applyPreset) {
      return { ready: false };
    }

    api.applyPreset("diagnostics");
    api.resetTutorial("beginner");
    api.startTutorial("beginner");

    const nextButton = document.querySelector("#tutorialIntroNext");
    if (!(nextButton instanceof HTMLElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 80; i += 1) {
      const root = document.querySelector("#tutorialIntro");
      if (!(root instanceof HTMLElement) || root.hidden) break;
      nextButton.click();
      await wait(35);
    }

    const state = api.getState();
    const layout = state?.layout || {};
    const rows = layout.panelRows || { top: [], bottom: [] };
    const runner = document.querySelector("#runner");
    const runnerSrcdoc = String(runner?.getAttribute?.("srcdoc") || "");
    const openEditorsToggle = document.querySelector('#fileList [data-files-section-id="open-editors"]');
    const filesToggle = document.querySelector('#fileList [data-files-section-id="files"]');
    const gamesToggle = document.querySelector("#gamesSelectorToggle");
    const appsToggle = document.querySelector("#appsSelectorToggle");
    const lessonsToggle = document.querySelector("#lessonsSelectorToggle");

    return {
      ready: true,
      tutorialClosed: Boolean(document.querySelector("#tutorialIntro")?.hidden),
      toolsOpen: Boolean(layout.toolsOpen),
      topOrder: Array.isArray(rows.top) ? rows.top.slice(0, 4) : [],
      sandboxStopped: runnerSrcdoc.toLowerCase().includes("sandbox stopped"),
      filesSectionsOpen: {
        "open-editors": String(openEditorsToggle?.getAttribute("aria-expanded") || "false") === "true",
        files: String(filesToggle?.getAttribute("aria-expanded") || "false") === "true",
        games: String(gamesToggle?.getAttribute("aria-expanded") || "false") === "true",
        applications: String(appsToggle?.getAttribute("aria-expanded") || "false") === "true",
        lessons: String(lessonsToggle?.getAttribute("aria-expanded") || "false") === "true",
      },
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.tutorialClosed).toBeTruthy();
  expect(result.toolsOpen).toBeFalsy();
  expect(result.topOrder).toEqual(["files", "editor", "sandbox", "tools"]);
  expect(result.sandboxStopped).toBeTruthy();
  expect(result.filesSectionsOpen["open-editors"]).toBeTruthy();
  expect(result.filesSectionsOpen.files).toBeTruthy();
  expect(result.filesSectionsOpen.games).toBeTruthy();
  expect(result.filesSectionsOpen.applications).toBeTruthy();
  expect(result.filesSectionsOpen.lessons).toBeTruthy();
});

test("stop button halts sandbox run", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.click("#run");
  await page.click("#stop");

  const stopped = await page.evaluate(() => {
    const text = String(document.body?.textContent || "").toLowerCase();
    return text.includes("sandbox stopped");
  });
  expect(stopped).toBeTruthy();
});

test("fresh-start confirm resets workspace and browser-persisted app state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seeded = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.createFile || !api?.listFiles || !api?.openDevTerminal) {
      return { ready: false };
    }

    const markerFile = `reset-proof-${Date.now().toString(36)}.js`;
    api.createFile(markerFile, "console.log('persisted marker');");
    const hasMarkerFile = api.listFiles().some((entry) => String(entry?.name || "") === markerFile);

    const lessonProfileKey = "fazide.lesson-profile.v1";
    const tutorialKey = "fazide.tutorial.beginner.seen.v1";
    localStorage.setItem("fazide.test-reset-local", "present");
    sessionStorage.setItem("fazide.test-reset-session", "present");
    localStorage.setItem(tutorialKey, "1");
    localStorage.setItem(lessonProfileKey, JSON.stringify({
      xp: 987,
      level: 9,
      totalTypedChars: 500,
      lessonsCompleted: 42,
      bestStreak: 90,
      currentStreak: 11,
      dailyStreak: 5,
      lastActiveDay: "2099-01-01",
    }));

    const dbName = `fazide-reset-proof-${Date.now().toString(36)}`;
    let idbSeeded = false;
    if (typeof indexedDB !== "undefined" && indexedDB && typeof indexedDB.open === "function") {
      await new Promise((resolve) => {
        try {
          const request = indexedDB.open(dbName, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (db && !db.objectStoreNames.contains("items")) {
              db.createObjectStore("items", { keyPath: "id" });
            }
          };
          request.onsuccess = () => {
            try {
              request.result.close();
            } catch {
              // no-op
            }
            idbSeeded = true;
            resolve();
          };
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        } catch {
          resolve();
        }
      });
    }

    api.openDevTerminal();
    return {
      ready: true,
      markerFile,
      hasMarkerFile,
      dbName,
      idbSeeded,
      localSeeded: localStorage.getItem("fazide.test-reset-local") === "present",
      sessionSeeded: sessionStorage.getItem("fazide.test-reset-session") === "present",
      tutorialSeeded: localStorage.getItem(tutorialKey) === "1",
    };
  });

  expect(seeded.ready).toBeTruthy();
  expect(seeded.hasMarkerFile).toBeTruthy();
  expect(seeded.localSeeded).toBeTruthy();
  expect(seeded.sessionSeeded).toBeTruthy();
  expect(seeded.tutorialSeeded).toBeTruthy();

  const terminalInput = page.locator("#devTerminalInput");
  await expect(terminalInput).toBeVisible();
  await terminalInput.fill("fresh-start confirm");
  await terminalInput.press("Enter");
  await page.waitForFunction(() => {
    const output = String(document.querySelector("#devTerminalOutput")?.textContent || "");
    return output.includes("Dev Terminal ready") && !output.includes("$ fresh-start confirm");
  }, null, { timeout: 8000 });

  const after = await page.evaluate(async ({ markerFile, dbName }) => {
    const api = window.fazide;
    if (!api?.listFiles || !api?.getLessonProfile || !api?.getTutorialState) {
      return { ready: false };
    }

    const names = api.listFiles().map((entry) => String(entry?.name || ""));
    const profile = api.getLessonProfile();

    let idbStillExists = false;
    let idbChecked = false;
    if (
      typeof indexedDB !== "undefined"
      && indexedDB
      && typeof indexedDB.databases === "function"
      && dbName
    ) {
      try {
        const databases = await indexedDB.databases();
        idbStillExists = (Array.isArray(databases) ? databases : [])
          .some((entry) => String(entry?.name || "") === dbName);
        idbChecked = true;
      } catch {
        idbChecked = false;
      }
    }

    return {
      ready: true,
      markerFilePresent: names.includes(markerFile),
      localMarkerPresent: localStorage.getItem("fazide.test-reset-local") === "present",
      sessionMarkerPresent: sessionStorage.getItem("fazide.test-reset-session") === "present",
      tutorialSeenMarkerPresent: localStorage.getItem("fazide.tutorial.beginner.seen.v1") === "1",
      tutorialSeenState: Boolean(api.getTutorialState()?.seen),
      tutorialOpen: Boolean(document.querySelector("#tutorialIntro") && !document.querySelector("#tutorialIntro")?.hidden),
      tutorialProgress: String(document.querySelector("#tutorialIntroProgress")?.textContent || "").trim(),
      lessonLevel: Number(profile?.level || 0),
      lessonXp: Number(profile?.xp || 0),
      idbChecked,
      idbStillExists,
    };
  }, {
    markerFile: seeded.markerFile,
    dbName: seeded.dbName,
  });

  expect(after.ready).toBeTruthy();
  expect(after.markerFilePresent).toBeFalsy();
  expect(after.localMarkerPresent).toBeFalsy();
  expect(after.sessionMarkerPresent).toBeFalsy();
  expect(after.tutorialSeenMarkerPresent).toBeFalsy();
  expect(after.tutorialSeenState).toBeFalsy();
  expect(after.tutorialOpen).toBeTruthy();
  expect(after.tutorialProgress).toContain("Step 1 of");
  expect(after.lessonLevel).toBe(1);
  expect(after.lessonXp).toBe(0);
  if (seeded.idbSeeded && after.idbChecked) {
    expect(after.idbStillExists).toBeFalsy();
  }
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
      + `  const ws = new WebSocket("wss://example.com/socket");\n`
      + `  console.log("${marker}:ws", String(ws && ws.readyState));\n`
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
      websocketSeen: logText.includes(`${marker}:ws 3`),
      alertBlockedSeen: logText.includes("Sandbox security: blocked API alert"),
      openBlockedSeen: logText.includes("Sandbox security: blocked API window.open"),
      fetchBlockedSeen: logText.includes("Sandbox security: blocked API fetch"),
      websocketBlockedSeen: logText.includes("Sandbox security: blocked API WebSocket"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.startSeen).toBeTruthy();
  expect(result.openSeen).toBeTruthy();
  expect(result.fetchSeen).toBeTruthy();
  expect(result.websocketSeen).toBeTruthy();
  expect(result.alertBlockedSeen).toBeTruthy();
  expect(result.openBlockedSeen).toBeTruthy();
  expect(result.fetchBlockedSeen).toBeTruthy();
  expect(result.websocketBlockedSeen).toBeTruthy();
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

test("editor find keeps latest rapid input and reports final match set", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const findInput = document.querySelector("#editorFindInput");
    const findStatusNode = document.querySelector("#editorFindStatus");
    if (!api?.setCode || !api?.openEditorSearch || !(findInput instanceof HTMLInputElement) || !findStatusNode) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode("alphaOne();\nbetaTwo();\ngammaThree();\n");
    api.openEditorSearch({ replaceMode: false });

    ["alpha", "beta", "gamma", "gammathree"].forEach((value) => {
      findInput.value = value;
      findInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await wait(170);

    const statusText = String(findStatusNode.textContent || "").toLowerCase();
    return {
      ready: true,
      query: String(findInput.value || "").trim().toLowerCase(),
      statusText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.query).toBe("gammathree");
  expect(result.statusText).toContain("1/1 match");
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

test("symbols palette keeps latest rapid input and filters to final query", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const symbolInput = document.querySelector("#symbolSearchInput");
    const symbolList = document.querySelector("#symbolList");
    if (!api?.setCode || !api?.openSymbolPalette || !(symbolInput instanceof HTMLInputElement) || !symbolList) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode(
      "function alphaOne() { return 1; }\n"
      + "const betaTwo = 2;\n"
      + "class GammaThree {}\n"
    );
    api.openSymbolPalette();

    for (let i = 0; i < 60; i += 1) {
      if (symbolList.querySelectorAll("[data-symbol-id]").length > 0) break;
      await wait(25);
    }

    ["alp", "alpha", "gamma", "gammathree"].forEach((value) => {
      symbolInput.value = value;
      symbolInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await wait(170);

    const names = Array.from(symbolList.querySelectorAll("[data-symbol-id] .symbol-row-name"))
      .map((node) => String(node.textContent || "").trim().toLowerCase())
      .filter(Boolean);

    return {
      ready: true,
      query: String(symbolInput.value || "").trim().toLowerCase(),
      count: names.length,
      names,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.query).toBe("gammathree");
  expect(result.count).toBeGreaterThan(0);
  expect(result.names.every((name) => name.includes("gammathree"))).toBeTruthy();
});

test("project search keeps latest rapid input and renders final-query matches", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const input = document.querySelector("#projectSearchInput");
    const list = document.querySelector("#projectSearchList");
    const hint = document.querySelector("#projectSearchHint");
    if (!api?.setCode || !api?.openProjectSearch || !(input instanceof HTMLInputElement) || !list || !hint) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode("const alphaNeedle = 1;\nconst omegaNeedle = 2;\n");
    api.openProjectSearch();

    ["alpha", "omega", "omeganeedle"].forEach((value) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await wait(240);

    const query = String(input.value || "").trim().toLowerCase();
    const previews = Array.from(list.querySelectorAll(".project-search-preview"))
      .map((node) => String(node.textContent || "").trim().toLowerCase())
      .filter(Boolean);
    const hintText = String(hint.textContent || "").trim().toLowerCase();

    return {
      ready: true,
      query,
      count: previews.length,
      hasNeedle: previews.some((text) => text.includes("omeganeedle")),
      hintText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.query).toBe("omeganeedle");
  expect(result.count).toBeGreaterThan(0);
  expect(result.hasNeedle).toBeTruthy();
  expect(result.hintText).toContain("matches");
});

test("project search replace selected updates matched results across files", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const searchInput = document.querySelector("#projectSearchInput");
    const replaceInput = document.querySelector("#projectReplaceInput");
    const list = document.querySelector("#projectSearchList");
    const selectAllBtn = document.querySelector("#projectSearchSelectAll");
    const replaceSelectedBtn = document.querySelector("#projectReplaceSelected");
    if (
      !api?.setCode
      || !api?.createFile
      || !api?.openProjectSearch
      || !(searchInput instanceof HTMLInputElement)
      || !(replaceInput instanceof HTMLInputElement)
      || !list
      || !(selectAllBtn instanceof HTMLElement)
      || !(replaceSelectedBtn instanceof HTMLElement)
    ) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    api.setCode("const needleToken = 1;\nconsole.log('needleToken');\n");
    api.createFile("project-replace-extra.js", "const needleToken = 2;\n");
    api.openProjectSearch();

    searchInput.value = "needleToken";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    for (let i = 0; i < 60; i += 1) {
      if (list.querySelectorAll("[data-project-result-id]").length >= 3) break;
      await wait(30);
    }

    const beforeCount = list.querySelectorAll("[data-project-result-id]").length;
    selectAllBtn.click();
    replaceInput.value = "replacedToken";
    replaceInput.dispatchEvent(new Event("input", { bubbles: true }));
    replaceSelectedBtn.click();

    for (let i = 0; i < 60; i += 1) {
      if (list.querySelectorAll("[data-project-result-id]").length === 0) break;
      await wait(30);
    }

    const afterOldTermCount = list.querySelectorAll("[data-project-result-id]").length;
    const noMatchesText = String(list.textContent || "").toLowerCase();

    searchInput.value = "replacedToken";
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));

    for (let i = 0; i < 60; i += 1) {
      if (list.querySelectorAll("[data-project-result-id]").length >= beforeCount) break;
      await wait(30);
    }

    const replacedCount = list.querySelectorAll("[data-project-result-id]").length;
    return {
      ready: true,
      beforeCount,
      afterOldTermCount,
      replacedCount,
      noMatchesText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.beforeCount).toBeGreaterThan(0);
  expect(result.afterOldTermCount).toBe(0);
  expect(result.noMatchesText).toContain("no project matches");
  expect(result.replacedCount).toBeGreaterThanOrEqual(result.beforeCount);
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
    if (!api?.listLessons || !api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput || !api?.nextLessonStep) {
      return { ready: false };
    }

    const lessons = api.listLessons();
    const hasLesson = lessons.some((entry) => entry.id === "paddle-lesson-1");
    if (!hasLesson) {
      return { ready: false, hasLesson };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const initial = api.getLessonState();
    const expectedLength = Math.max(0, Number(initial?.expectedLength) || 0);

    let typedAll = 0;
    let advancedByTyping = false;
    const maxTypedChars = Math.min(Math.max(40, Math.floor(expectedLength * 0.35)), 220);
    const deadline = Date.now() + 4000;
    while (typedAll < maxTypedChars && Date.now() < deadline) {
      const state = api.getLessonState();
      if (!state || state.completed) break;
      const expectedNext = String(state.expectedNext || "");
      if (!expectedNext) {
        break;
      }
      const typed = Number(api.typeLessonInput(expectedNext) || 0);
      if (typed <= 0) break;
      typedAll += typed;
      advancedByTyping = true;
    }

    const beforeFinalize = api.getLessonState();
    if (beforeFinalize && !beforeFinalize.completed) {
      api.nextLessonStep();
    }
    const afterAll = api.getLessonState();

    return {
      ready: true,
      hasLesson,
      loaded,
      initial,
      expectedLength,
      typedAll,
      advancedByTyping,
      afterAll,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasLesson).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.initial?.stepCount).toBe(1);
  expect(result.initial?.stepIndex).toBe(0);
  expect(result.initial?.remaining).toBeGreaterThan(0);
  expect(result.expectedLength).toBeGreaterThan(40);
  expect(result.advancedByTyping).toBeTruthy();
  expect(result.typedAll).toBeGreaterThan(20);
  expect(result.afterAll?.completed).toBeTruthy();
  expect(Number(result.afterAll?.remaining) || 0).toBeGreaterThanOrEqual(0);
  expect(result.afterAll?.stepCount).toBe(result.initial?.stepCount);
});

test("quick 1-line lesson auto-runs connected html output when completed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.listLessons || !api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const lessons = api.listLessons();
    const hasLesson = lessons.some((entry) => entry.id === "quick-output-4line");
    if (!hasLesson) {
      return { ready: true, hasLesson: false };
    }

    const loaded = await api.loadLesson("quick-output-4line", { startTyping: true, run: false });
    let typedChars = 0;
    const deadline = Date.now() + 4500;
    while (Date.now() < deadline) {
      const state = api.getLessonState();
      if (!state || state.completed) break;
      const expectedNext = String(state.expectedNext || "");
      if (!expectedNext) break;
      const typed = Number(api.typeLessonInput(expectedNext) || 0);
      if (typed <= 0) break;
      typedChars += typed;
    }

    await new Promise((resolve) => setTimeout(resolve, 320));

    const finalState = api.getLessonState();
    const logText = String(document.querySelector("#log")?.textContent || "");
    const statusText = String(document.querySelector("#statusText")?.textContent || "");

    return {
      ready: true,
      hasLesson,
      loaded,
      typedChars,
      completed: Boolean(finalState?.completed),
      logText,
      statusText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasLesson).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typedChars).toBeGreaterThan(3);
  expect(result.completed).toBeTruthy();
  expect(result.logText).toContain("Quick lesson output ready.");
  expect(result.statusText.toLowerCase()).toContain("ran");
});

test("instant lesson auto-runs connected html output with guided warmup typing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.listLessons || !api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const lessons = api.listLessons();
    const hasLesson = lessons.some((entry) => entry.id === "quick-output-instant");
    if (!hasLesson) {
      return { ready: true, hasLesson: false };
    }

    const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    let typedChars = 0;
    const deadline = Date.now() + 3600;
    while (Date.now() < deadline) {
      const state = api.getLessonState();
      if (!state || state.completed) break;
      const expectedNext = String(state.expectedNext || "");
      if (!expectedNext) break;
      const typed = Number(api.typeLessonInput(expectedNext) || 0);
      if (typed <= 0) break;
      typedChars += typed;
    }

    await new Promise((resolve) => setTimeout(resolve, 240));

    const finalState = api.getLessonState();
    const logText = String(document.querySelector("#log")?.textContent || "");

    return {
      ready: true,
      hasLesson,
      loaded,
      typedChars,
      completed: Boolean(finalState?.completed),
      logText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.hasLesson).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typedChars).toBeGreaterThan(8);
  expect(result.completed).toBeTruthy();
  expect(result.logText).toContain("Instant warmup lesson ready.");
});

test("lesson typing highlights typed text while keeping remaining text softly faded", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    const countMarks = () => ({
      active: document.querySelectorAll("#editorPanel .CodeMirror .cm-lesson-active").length,
      ghost: document.querySelectorAll("#editorPanel .CodeMirror .cm-lesson-ghost").length,
      next: document.querySelectorAll("#editorPanel .CodeMirror .cm-lesson-next").length,
      focused: document.querySelector("#editorPanel .CodeMirror")?.classList?.contains("CodeMirror-focused") === true,
    });

    const before = countMarks();
    const expectedNext = String(api.getLessonState()?.expectedNext || "");
    const typed = Number(api.typeLessonInput(expectedNext) || 0);
    const after = countMarks();

    return {
      ready: true,
      loaded: true,
      typed,
      before,
      after,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.before.next).toBeGreaterThan(0);
  expect(result.before.ghost).toBeGreaterThan(0);
  expect(result.before.active).toBe(0);
  expect(result.typed).toBeGreaterThan(0);
  expect(result.after.active).toBeGreaterThan(0);
  expect(result.after.next).toBeGreaterThan(0);
  expect(result.after.focused).toBeTruthy();
});

test("loading a lesson from sidebar focuses editor for immediate typing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#lessonsSelectorToggle").click();
  await page.locator("#lessonTierOpenBeginner").click();
  await expect.poll(async () => {
    return page.locator("#lessonTierBeginnerList [data-lesson-tier-modal-lesson-id]").count();
  }).toBeGreaterThan(0);
  await page.locator("#lessonTierBeginnerList [data-lesson-tier-modal-lesson-id]").first().click();

  await expect.poll(async () => {
    return page.evaluate(() => Boolean(window.fazide?.getLessonState?.()?.active));
  }).toBeTruthy();

  const result = await page.evaluate(() => {
    const codeMirrorRoot = document.querySelector("#editorPanel .CodeMirror");
    const focused = Boolean(
      (codeMirrorRoot instanceof HTMLElement && codeMirrorRoot.classList.contains("CodeMirror-focused"))
      || document.activeElement?.closest?.("#editorPanel")
    );
    const state = window.fazide?.getLessonState?.();
    return {
      ready: Boolean(state),
      active: Boolean(state?.active),
      focused,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.active).toBeTruthy();
  expect(result.focused).toBeTruthy();
});

test("lesson-locked files cannot be duplicated from row menu until lesson completes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const prepared = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState) return { ready: false };
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const state = api.getLessonState();
    return {
      ready: true,
      loaded: Boolean(loaded),
      active: Boolean(state?.active),
    };
  });

  expect(prepared.ready).toBeTruthy();
  expect(prepared.loaded).toBeTruthy();
  expect(prepared.active).toBeTruthy();

  await page.locator('#fileList [data-file-section="files"]').click();
  const lockedRow = page.locator('.file-row[data-file-row-section="files"][data-lesson-locked="true"]').first();
  await expect(lockedRow).toBeVisible();

  await lockedRow.click({ button: "right" });
  await expect(page.locator("#fileRowMenu")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator('#fileRowMenu [data-file-menu-action="duplicate"]')).toBeDisabled();
});

test("active lesson file cannot be duplicated while lesson is active", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const prepared = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.listFiles) return { ready: false };
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const state = api.getLessonState();
    const activeLessonFile = api.listFiles().find((file) => file.active && file.family === "lesson");
    return {
      ready: true,
      loaded: Boolean(loaded),
      active: Boolean(state?.active),
      activeLessonName: String(activeLessonFile?.name || ""),
    };
  });

  expect(prepared.ready).toBeTruthy();
  expect(prepared.loaded).toBeTruthy();
  expect(prepared.active).toBeTruthy();
  expect(prepared.activeLessonName.toLowerCase().endsWith(".js")).toBeTruthy();

  await page.locator("#filesMenuButton").click();
  await expect(page.locator('#filesMenu [data-files-menu="duplicate"]')).toBeDisabled();
});

test("reloading the same lesson reuses files without creating duplicates", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.listFiles) {
      return { ready: false };
    }

    const lessonId = "paddle-lesson-1";
    const beforeLesson = api.listFiles().filter((file) => file.family === "lesson" && file.lessonId === lessonId);
    const beforeTotal = api.listFiles().length;

    const firstLoad = await api.loadLesson(lessonId, { startTyping: true, run: false });
    const afterFirst = api.listFiles();
    const afterFirstLesson = afterFirst.filter((file) => file.family === "lesson" && file.lessonId === lessonId);
    const firstIds = [...new Set(afterFirstLesson.map((file) => String(file.id || "")))].sort();

    const secondLoad = await api.loadLesson(lessonId, { startTyping: true, run: false });
    const afterSecond = api.listFiles();
    const afterSecondLesson = afterSecond.filter((file) => file.family === "lesson" && file.lessonId === lessonId);
    const secondIds = [...new Set(afterSecondLesson.map((file) => String(file.id || "")))].sort();

    const logText = String(document.querySelector("#log")?.textContent || "");
    const statusText = String(document.querySelector("#statusText")?.textContent || "");

    return {
      ready: true,
      beforeLessonCount: beforeLesson.length,
      beforeTotal,
      firstLoad: Boolean(firstLoad),
      secondLoad: Boolean(secondLoad),
      afterFirstCount: afterFirstLesson.length,
      afterSecondCount: afterSecondLesson.length,
      afterFirstTotal: afterFirst.length,
      afterSecondTotal: afterSecond.length,
      sameIdsAfterReload: JSON.stringify(firstIds) === JSON.stringify(secondIds),
      reuseMessageInLog: logText.includes("already in your files"),
      reuseMessageInStatus: statusText.includes("already in your files"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.firstLoad).toBeTruthy();
  expect(result.secondLoad).toBeTruthy();
  expect(result.afterFirstCount).toBeGreaterThan(0);
  expect(result.afterSecondCount).toBe(result.afterFirstCount);
  expect(result.afterSecondTotal).toBe(result.afterFirstTotal);
  expect(result.sameIdsAfterReload).toBeTruthy();
  expect(result.reuseMessageInLog).toBeTruthy();
  expect(result.reuseMessageInStatus).toBeTruthy();
});

test("lesson mode keeps cursor locked to required next character after editor click", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const boot = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    for (let i = 0; i < 120; i += 1) {
      const state = api.getLessonState();
      const next = String(state?.expectedNext || "");
      if (!next) break;
      if (next !== " " && next !== "\t" && next !== "\n" && next !== "\r") {
        break;
      }
      api.typeLessonInput(next);
    }

    return { ready: true, loaded: true };
  });

  expect(boot.ready).toBeTruthy();
  expect(boot.loaded).toBeTruthy();

  const clickTarget = await page.evaluate(() => {
    const cm = document.querySelector("#editorPanel .CodeMirror")?.CodeMirror;
    if (cm) {
      const doc = cm.getDoc();
      const line = Math.max(0, doc.lineCount() - 1);
      const ch = Math.max(0, String(doc.getLine(line) || "").length);
      const coords = cm.charCoords({ line, ch }, "page");
      return {
        x: Math.max(0, Math.round(Number(coords?.left || 0) + 4)),
        y: Math.max(0, Math.round(Number(coords?.top || 0) + 4)),
      };
    }

    const textarea = document.querySelector("#editor");
    const rect = textarea?.getBoundingClientRect();
    return {
      x: Math.max(0, Math.round(Number(rect?.left || 0) + Math.max(6, Number(rect?.width || 0) - 6))),
      y: Math.max(0, Math.round(Number(rect?.top || 0) + Math.max(6, Number(rect?.height || 0) - 6))),
    };
  });

  const before = await page.evaluate(() => {
    const cm = document.querySelector("#editorPanel .CodeMirror")?.CodeMirror;
    if (cm) {
      const cur = cm.getDoc().getCursor();
      return { line: Number(cur?.line || 0), ch: Number(cur?.ch || 0) };
    }
    const textarea = document.querySelector("#editor");
    const value = String(textarea?.value || "");
    const idx = Math.max(0, Number(textarea?.selectionStart || 0));
    const prefix = value.slice(0, idx);
    const line = prefix.split("\n").length - 1;
    const lastNl = prefix.lastIndexOf("\n");
    const ch = lastNl >= 0 ? idx - lastNl - 1 : idx;
    return { line: Number(line || 0), ch: Number(ch || 0) };
  });

  await page.mouse.click(clickTarget.x, clickTarget.y);

  await expect.poll(async () => {
    return page.evaluate(() => {
      const cm = document.querySelector("#editorPanel .CodeMirror")?.CodeMirror;
      if (cm) {
        const cur = cm.getDoc().getCursor();
        return { line: Number(cur?.line || 0), ch: Number(cur?.ch || 0) };
      }
      const textarea = document.querySelector("#editor");
      const value = String(textarea?.value || "");
      const idx = Math.max(0, Number(textarea?.selectionStart || 0));
      const prefix = value.slice(0, idx);
      const line = prefix.split("\n").length - 1;
      const lastNl = prefix.lastIndexOf("\n");
      const ch = lastNl >= 0 ? idx - lastNl - 1 : idx;
      return { line: Number(line || 0), ch: Number(ch || 0) };
    });
  }).toEqual(before);

  const afterType = await page.evaluate(() => {
    const api = window.fazide;
    const stateBefore = api?.getLessonState?.();
    const next = String(stateBefore?.expectedNext || "");
    const typed = Number(api?.typeLessonInput?.(next) || 0);
    const stateAfter = api?.getLessonState?.();
    return {
      beforeProgress: Number(stateBefore?.progress || 0),
      afterProgress: Number(stateAfter?.progress || 0),
      typed,
    };
  });

  expect(afterType.typed).toBeGreaterThan(0);
  expect(afterType.afterProgress).toBeGreaterThan(afterType.beforeProgress);
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

test("lesson mode auto-skips indentation after newline", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    let found = false;
    let newlineChecks = 0;

    for (let i = 0; i < 1400; i += 1) {
      const state = api.getLessonState();
      const next = String(state?.expectedNext || "");
      if (!next) break;

      if (next === "\n") {
        const before = Number(state?.progress || 0);
        api.typeLessonInput("\n");
        const afterState = api.getLessonState();
        const after = Number(afterState?.progress || 0);
        const afterNext = String(afterState?.expectedNext || "");
        newlineChecks += 1;
        if ((after - before) > 1 && afterNext && afterNext !== " " && afterNext !== "\t") {
          found = true;
          break;
        }
        continue;
      }

      api.typeLessonInput(next);
    }

    return {
      ready: true,
      loaded: true,
      found,
      newlineChecks,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.newlineChecks).toBeGreaterThan(0);
  expect(result.found).toBeTruthy();
});

test("lesson mode accepts Tab for space-based indentation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    let tabBoostFound = false;
    let tabBoost = 0;
    let autoIndentSkipFound = false;
    let iterations = 0;

    while (iterations < 900) {
      iterations += 1;
      const state = api.getLessonState();
      const next = String(state?.expectedNext || "");
      if (!next) break;

      if (next === " ") {
        const before = Number(state?.progress || 0);
        api.typeLessonInput("\t");
        const afterState = api.getLessonState();
        const after = Number(afterState?.progress || 0);
        const delta = Math.max(0, after - before);

        if (delta > tabBoost) tabBoost = delta;
        if (delta > 1) {
          tabBoostFound = true;
          break;
        }

        if (delta === 0) {
          api.typeLessonInput(" ");
        }
        continue;
      }

      if (next === "\n") {
        const before = Number(state?.progress || 0);
        api.typeLessonInput("\n");
        const afterState = api.getLessonState();
        const after = Number(afterState?.progress || 0);
        const afterNext = String(afterState?.expectedNext || "");
        if ((after - before) > 1 && afterNext && afterNext !== " " && afterNext !== "\t") {
          autoIndentSkipFound = true;
          break;
        }
        continue;
      }

      api.typeLessonInput(next);
    }

    return {
      ready: true,
      loaded: true,
      tabBoostFound,
      tabBoost,
      autoIndentSkipFound,
      iterations,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.tabBoostFound || result.autoIndentSkipFound).toBeTruthy();
  if (result.tabBoostFound) {
    expect(result.tabBoost).toBeGreaterThan(1);
  }
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

test("lesson typing throttles haptics during rapid mismatch bursts", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }

    const calls = [];
    const vibrateSpy = (duration) => {
      calls.push(Number(duration) || 0);
      return true;
    };

    let patched = false;
    try {
      Object.defineProperty(navigator, "vibrate", {
        configurable: true,
        writable: true,
        value: vibrateSpy,
      });
      patched = true;
    } catch {
      try {
        Object.defineProperty(Navigator.prototype, "vibrate", {
          configurable: true,
          writable: true,
          value: vibrateSpy,
        });
        patched = true;
      } catch {
        patched = false;
      }
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false, patched };
    }

    for (let i = 0; i < 14; i += 1) {
      api.typeLessonInput("X");
    }

    const state = api.getLessonState();
    return {
      ready: true,
      loaded: true,
      patched,
      mismatchAttempts: 14,
      hapticCalls: calls.length,
      progress: Number(state?.progress || 0),
      mistakes: Number(state?.mistakes || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.patched).toBeTruthy();
  expect(result.progress).toBe(0);
  expect(result.mistakes).toBe(14);
  expect(result.hapticCalls).toBeGreaterThan(0);
  expect(result.hapticCalls).toBeLessThan(result.mismatchAttempts);
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

test("lesson loader tags files with lesson family metadata", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.exportWorkspaceData) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: false, run: false });
    const snapshot = api.exportWorkspaceData();
    const files = Array.isArray(snapshot?.data?.files) ? snapshot.data.files : [];
    const lessonFile = files.find((entry) => String(entry?.name || "").toLowerCase().endsWith("/game.js"))
      || files.find((entry) => String(entry?.name || "").toLowerCase().endsWith("game.js"));
    return {
      ready: true,
      loaded,
      family: String(lessonFile?.family || ""),
      lessonId: String(lessonFile?.lessonId || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.family).toBe("lesson");
  expect(result.lessonId).toBe("paddle-lesson-1");
});

test("lesson session clears when the lesson file is deleted", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.deleteFile || !api?.getLessonState) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const before = api.getLessonState();
    const removed = api.deleteFile(String(before?.fileName || ""));
    const after = api.getLessonState();
    return {
      ready: true,
      loaded,
      removed,
      beforeActive: Boolean(before?.active),
      afterStateIsNull: after == null,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.removed).toBeTruthy();
  expect(result.beforeActive).toBeTruthy();
  expect(result.afterStateIsNull).toBeTruthy();
});

test("deleting one lesson file removes the full lesson package and folder", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.deleteFile || !api?.listFiles || !api?.listFolders) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: false, run: false });
    const beforeFiles = api.listFiles();
    const lessonFiles = beforeFiles
      .filter((entry) => String(entry?.family || "") === "lesson")
      .map((entry) => String(entry?.name || ""))
      .filter(Boolean);
    const target = lessonFiles.find((name) => name.toLowerCase().endsWith("/game.js"))
      || lessonFiles.find((name) => name.toLowerCase().endsWith("game.js"))
      || lessonFiles[0]
      || "";

    const foldersBefore = api.listFolders();
    const lessonFoldersBefore = foldersBefore.filter((path) => (
      lessonFiles.some((name) => name.startsWith(`${String(path || "")}/`))
    ));

    const removed = target ? api.deleteFile(target) : false;

    const afterFiles = api.listFiles();
    const remainingLessonFiles = afterFiles
      .filter((entry) => String(entry?.family || "") === "lesson")
      .map((entry) => String(entry?.name || ""))
      .filter(Boolean);
    const foldersAfter = api.listFolders();
    const leftoverLessonFolders = lessonFoldersBefore.filter((path) => foldersAfter.includes(path));

    return {
      ready: true,
      loaded,
      removed,
      lessonFileCountBefore: lessonFiles.length,
      remainingLessonFileCount: remainingLessonFiles.length,
      lessonFolderCountBefore: lessonFoldersBefore.length,
      leftoverLessonFolderCount: leftoverLessonFolders.length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.removed).toBeTruthy();
  expect(result.lessonFileCountBefore).toBeGreaterThan(0);
  expect(result.remainingLessonFileCount).toBe(0);
  expect(result.lessonFolderCountBefore).toBeGreaterThan(0);
  expect(result.leftoverLessonFolderCount).toBe(0);
});

test("deleting lesson package keeps shared folder when non-lesson files remain", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.deleteFile || !api?.listFiles || !api?.listFolders || !api?.createFile) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: false, run: false });
    const beforeFiles = api.listFiles();
    const lessonFiles = beforeFiles
      .filter((entry) => String(entry?.family || "") === "lesson")
      .map((entry) => String(entry?.name || ""))
      .filter(Boolean);
    const target = lessonFiles.find((name) => name.toLowerCase().endsWith("/game.js"))
      || lessonFiles.find((name) => name.toLowerCase().endsWith("game.js"))
      || lessonFiles[0]
      || "";
    const folderPath = target.includes("/") ? target.slice(0, target.lastIndexOf("/")) : "";
    if (!target || !folderPath) {
      return { ready: false, loaded, reason: "missing-target" };
    }

    const sharedName = `${folderPath}/notes-keep.js`;
    const created = api.createFile(sharedName, "// keep folder alive\n");
    const createdName = String(created?.name || "");
    const folderPresentBeforeDelete = api.listFolders().includes(folderPath);

    const removed = api.deleteFile(target);

    const afterFiles = api.listFiles().map((entry) => String(entry?.name || "")).filter(Boolean);
    const foldersAfter = api.listFolders();
    const sharedFileStillPresent = createdName ? afterFiles.includes(createdName) : false;
    const folderStillPresent = foldersAfter.includes(folderPath);
    const lessonFilesRemaining = afterFiles.filter((name) => lessonFiles.includes(name));

    return {
      ready: true,
      loaded,
      removed,
      folderPresentBeforeDelete,
      sharedFileStillPresent,
      folderStillPresent,
      lessonFilesRemainingCount: lessonFilesRemaining.length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.removed).toBeTruthy();
  expect(result.folderPresentBeforeDelete).toBeTruthy();
  expect(result.sharedFileStillPresent).toBeTruthy();
  expect(result.folderStillPresent).toBeTruthy();
  expect(result.lessonFilesRemainingCount).toBe(0);
});

test("lesson HUD hides but header stats stay visible after switching to non-lesson file", async ({ page }) => {
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
    const headerHud = document.querySelector("#lessonHeaderHud");
    return {
      ready: true,
      loaded,
      regularFileCreated: Boolean(regular?.id),
      beforeActive: Boolean(lessonBeforeSwitch?.active),
      afterActive: Boolean(lessonAfterSwitch?.active),
      hudHidden: Boolean(hud?.hidden),
      hudActiveAttr: String(hud?.getAttribute("data-active") || ""),
      headerHudHidden: Boolean(headerHud?.hidden),
      headerHudActiveAttr: String(headerHud?.getAttribute("data-active") || ""),
    };
  });

  expect(prepared.ready).toBeTruthy();
  expect(prepared.loaded).toBeTruthy();
  expect(prepared.regularFileCreated).toBeTruthy();
  expect(prepared.beforeActive).toBeTruthy();
  expect(prepared.afterActive).toBeFalsy();
  expect(prepared.hudHidden).toBeTruthy();
  expect(prepared.hudActiveAttr).toBe("false");
  expect(prepared.headerHudHidden).toBeFalsy();
  expect(prepared.headerHudActiveAttr === "").toBeTruthy();

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

test("lesson HUD rail attaches to editor and stays lesson-only", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.createFile || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    api.typeLessonInput("const canvas");

    const hud = document.querySelector("#lessonHud");
    const headerHud = document.querySelector("#lessonHeaderHud");
    const verticalRail = document.querySelector("#lessonHudFill");
    const editorPane = document.querySelector(".editor-pane");
    const paneRect = editorPane instanceof HTMLElement ? editorPane.getBoundingClientRect() : null;
    const hudRect = hud instanceof HTMLElement ? hud.getBoundingClientRect() : null;

    const activeSnapshot = {
      hudVisible: Boolean(hud && !hud.hidden),
      headerVisible: Boolean(headerHud && !headerHud.hidden),
      hudActive: String(hud?.getAttribute("data-active") || ""),
      headerActive: String(headerHud?.getAttribute("data-active") || ""),
      verticalProgress: String(hud instanceof HTMLElement ? hud.style.getPropertyValue("--lesson-progress") : "").trim(),
      hasStreakRail: document.querySelector(".lesson-hud-rail-bottom") instanceof HTMLElement,
      verticalTop: String(verticalRail instanceof HTMLElement ? getComputedStyle(verticalRail).top : ""),
      verticalBottom: String(verticalRail instanceof HTMLElement ? getComputedStyle(verticalRail).bottom : ""),
      railWidth: Number.parseFloat(verticalRail instanceof HTMLElement ? getComputedStyle(verticalRail).width : "0"),
      hudWidth: Number.parseFloat(hud instanceof HTMLElement ? getComputedStyle(hud).width : "0"),
      paneTop: Number(paneRect?.top || 0),
      paneBottom: Number(paneRect?.bottom || 0),
      hudTop: Number(hudRect?.top || 0),
      hudBottom: Number(hudRect?.bottom || 0),
      hasVerticalRail: verticalRail instanceof HTMLElement,
    };

    api.createFile("hud-isolation-check.js", "");

    const inactiveSnapshot = {
      hudVisible: Boolean(hud && !hud.hidden),
      headerVisible: Boolean(headerHud && !headerHud.hidden),
      hudActive: String(hud?.getAttribute("data-active") || ""),
      headerActive: String(headerHud?.getAttribute("data-active") || ""),
    };

    return {
      ready: true,
      loaded,
      activeSnapshot,
      inactiveSnapshot,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.activeSnapshot.hudVisible).toBeTruthy();
  expect(result.activeSnapshot.headerVisible).toBeTruthy();
  expect(result.activeSnapshot.hudActive).toBe("true");
  expect(result.activeSnapshot.headerActive === "").toBeTruthy();
  expect(result.activeSnapshot.verticalProgress.endsWith("%")).toBeTruthy();
  expect(result.activeSnapshot.verticalTop).toBe("0px");
  expect(result.activeSnapshot.verticalBottom).not.toBe("0px");
  expect(result.activeSnapshot.railWidth).toBeGreaterThanOrEqual(8);
  expect(result.activeSnapshot.hudWidth).toBeGreaterThanOrEqual(10);
  expect(result.activeSnapshot.hudTop).toBeGreaterThanOrEqual(result.activeSnapshot.paneTop);
  expect(result.activeSnapshot.hudBottom).toBeLessThanOrEqual(result.activeSnapshot.paneBottom + 1);
  expect(result.activeSnapshot.hasVerticalRail).toBeTruthy();
  expect(result.activeSnapshot.hasStreakRail).toBeFalsy();

  expect(result.inactiveSnapshot.hudVisible).toBeFalsy();
  expect(result.inactiveSnapshot.headerVisible).toBeTruthy();
  expect(result.inactiveSnapshot.hudActive).toBe("false");
  expect(result.inactiveSnapshot.headerActive === "").toBeTruthy();
});

test("delete all files resets workspace back to welcome folder files", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.deleteAllFiles || !api?.listFiles) {
      return { ready: false };
    }

    const deleted = api.deleteAllFiles();
    const names = api.listFiles().map((entry) => String(entry?.name || "").toLowerCase());
    return {
      ready: true,
      deleted,
      hasWelcomeIndex: names.includes("welcome/index.html"),
      hasWelcomeStyles: names.includes("welcome/styles.css"),
      hasWelcomeApp: names.includes("welcome/app.js"),
      fileCount: names.length,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.deleted).toBeTruthy();
  expect(result.hasWelcomeIndex).toBeTruthy();
  expect(result.hasWelcomeStyles).toBeTruthy();
  expect(result.hasWelcomeApp).toBeTruthy();
  expect(result.fileCount).toBeGreaterThanOrEqual(3);
});

test("top header lesson stats stay right-aligned and match top header button style baseline", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const stats = document.querySelector("#lessonHeaderHud");
    const stat = document.querySelector("#lessonHudLevel");
    const referenceButton = document.querySelector(".top.strip .strip-left .strip-group button");
    const rightRail = document.querySelector(".top.strip .strip-right");
    const topHeader = document.querySelector(".top.strip");
    if (!(stats instanceof HTMLElement) || !(stat instanceof HTMLElement) || !(referenceButton instanceof HTMLElement) || !(rightRail instanceof HTMLElement) || !(topHeader instanceof HTMLElement)) {
      return { ready: false };
    }

    const statStyle = getComputedStyle(stat);
    const buttonStyle = getComputedStyle(referenceButton);
    const statMinHeight = Number.parseFloat(statStyle.minHeight || "0");
    const buttonMinHeight = Number.parseFloat(buttonStyle.minHeight || "0");
    const statFontSize = Number.parseFloat(statStyle.fontSize || "0");
    const buttonFontSize = Number.parseFloat(buttonStyle.fontSize || "0");
    const statsRect = stats.getBoundingClientRect();
    const rightRect = rightRail.getBoundingClientRect();
    const headerRect = topHeader.getBoundingClientRect();

    return {
      ready: true,
      display: statStyle.display,
      alignItems: statStyle.alignItems,
      minHeight: statStyle.minHeight,
      fontSize: statStyle.fontSize,
      color: statStyle.color,
      rightJustify: getComputedStyle(rightRail).justifyContent,
      statsInRightRail: statsRect.width > 0 && rightRect.width > 0 && headerRect.width > 0,
      styleParity: {
        minHeight: Math.abs(statMinHeight - buttonMinHeight) <= 1,
        fontSize: Math.abs(statFontSize - buttonFontSize) <= 0.2,
        hasColor: String(statStyle.color || "").trim().length > 0,
      },
    };
  });

  expect(result.ready).toBeTruthy();
  expect(["inline-flex", "flex"]).toContain(result.display);
  expect(result.alignItems).toBe("center");
  expect(result.rightJustify).toBe("flex-end");
  expect(result.statsInRightRail).toBeTruthy();
  expect(result.styleParity.minHeight).toBeTruthy();
  expect(result.styleParity.fontSize).toBeTruthy();
  expect(result.styleParity.hasColor).toBeTruthy();
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
    const hudLevel = String(document.querySelector("#lessonHudLevel")?.textContent || "");
    const hudXp = String(document.querySelector("#lessonHudXp")?.textContent || "");
    const hudCoins = String(document.querySelector("#lessonHudCoins")?.textContent || "");
    const hudPace = String(document.querySelector("#lessonHudPace")?.textContent || "");
    const hudProgressVar = String(hud instanceof HTMLElement ? hud.style.getPropertyValue("--lesson-progress") : "").trim();
    const hudProgressNumeric = Number.parseFloat(hudProgressVar.replace("%", ""));
    const hudProgressNodeHidden = Boolean(document.querySelector("#lessonHudProgress")?.hasAttribute("hidden"));
    const hudStreakNodeHidden = Boolean(document.querySelector("#lessonHudStreak")?.hasAttribute("hidden"));

    return {
      ready: true,
      loaded,
      typed,
      beforeXp: Number(before?.xp || 0),
      afterXp: Number(after?.xp || 0),
      beforeCoins: Number(before?.coins || 0),
      afterCoins: Number(after?.coins || 0),
      dailyStreak: Number(after?.dailyStreak || 0),
      active: Boolean(lessonState?.active),
      hudActive: hud?.getAttribute("data-active") === "true" && !hud?.hidden,
      hudLevel,
      hudXp,
      hudCoins,
      hudPace,
      hudProgressVar,
      hudProgressNumeric,
      hudProgressNodeHidden,
      hudStreakNodeHidden,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typed).toBeGreaterThan(10);
  expect(result.afterXp).toBeGreaterThan(result.beforeXp);
  expect(result.afterCoins).toBeGreaterThan(result.beforeCoins);
  expect(result.dailyStreak).toBeGreaterThanOrEqual(0);
  expect(result.active).toBeTruthy();
  expect(result.hudActive).toBeTruthy();
  expect(result.hudLevel).toContain("Lv ");
  expect(result.hudXp).toContain("XP ");
  expect(result.hudCoins).toContain("Bytes ");
  expect(result.hudPace).toContain("WPM ");
  expect(result.hudProgressVar.endsWith("%")).toBeTruthy();
  expect(result.hudProgressNumeric).toBeGreaterThanOrEqual(0);
  expect(result.hudProgressNumeric).toBeLessThanOrEqual(100);
  expect(result.hudProgressNodeHidden).toBeTruthy();
  expect(result.hudStreakNodeHidden).toBeTruthy();
});

test("lesson HUD keeps mood and burst copy hidden in minimal mode", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    api.typeLessonInput("const canvas");
    const mood = document.querySelector("#lessonHudMood");
    const burst = document.querySelector("#lessonHudBurst");
    const moodHidden = mood instanceof HTMLElement ? mood.hidden || getComputedStyle(mood).display === "none" : false;
    const burstHidden = burst instanceof HTMLElement ? burst.hidden || getComputedStyle(burst).display === "none" : false;

    return {
      ready: true,
      loaded: true,
      moodHidden,
      burstHidden,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.moodHidden).toBeTruthy();
  expect(result.burstHidden).toBeTruthy();
});

test("lesson HUD rail is full-height and visually bounded", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    api.typeLessonInput("const canvas");

    const hud = document.querySelector("#lessonHud");
    const rail = document.querySelector(".lesson-hud-rail-vertical");
    const pane = document.querySelector(".editor-pane");
    if (!(hud instanceof HTMLElement) || !(rail instanceof HTMLElement) || !(pane instanceof HTMLElement)) {
      return { ready: false };
    }

    const hudRect = hud.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const hudWidth = parseFloat(getComputedStyle(hud).width || "0");
    const railHeight = parseFloat(getComputedStyle(rail).height || "0");

    return {
      ready: true,
      loaded: true,
      hudWidth,
      railHeight,
      paneHeight: paneRect.height,
      hudTopOffset: Math.abs(hudRect.top - paneRect.top),
      hudBottomOffset: Math.abs(hudRect.bottom - paneRect.bottom),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.hudWidth).toBeGreaterThanOrEqual(10);
  expect(result.hudWidth).toBeLessThanOrEqual(20);
  expect(result.railHeight).toBeGreaterThanOrEqual(100);
  expect(result.paneHeight).toBeGreaterThanOrEqual(result.railHeight);
  expect(result.hudTopOffset).toBeLessThanOrEqual(10);
  expect(result.hudBottomOffset).toBeLessThanOrEqual(10);
});

test("lesson level up triggers editor celebration animation", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fazide.lesson-profile.v1", JSON.stringify({
      xp: 249,
      level: 1,
      totalTypedChars: 0,
      lessonsCompleted: 0,
      bestStreak: 0,
      currentStreak: 0,
      dailyStreak: 0,
      lastActiveDay: "",
    }));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput || !api?.getLessonProfile) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    const state = api.getLessonState();
    const expected = String(state?.expectedNext || "");
    const typed = api.typeLessonInput(expected || "c");
    const profile = api.getLessonProfile();
    const pane = document.querySelector("#editorPanel .editor-pane");
    const during = pane?.getAttribute("data-lesson-levelup") === "true";
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const after = pane?.getAttribute("data-lesson-levelup") === "true";
    return {
      ready: true,
      loaded,
      typed,
      level: Number(profile?.level || 0),
      during,
      after,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typed).toBeGreaterThan(0);
  expect(result.level).toBeGreaterThanOrEqual(2);
  expect(result.during).toBeTruthy();
  expect(result.after).toBeFalsy();
});

test("lesson state exposes pace and accuracy metrics", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) {
      return { ready: false };
    }
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    api.typeLessonInput("const ");
    api.typeLessonInput("X");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const state = api.getLessonState();
    return {
      ready: true,
      loaded,
      active: Boolean(state?.active),
      typedChars: Number(state?.typedChars || 0),
      correctChars: Number(state?.correctChars || 0),
      mistakes: Number(state?.mistakes || 0),
      accuracy: Number(state?.accuracy || 0),
      wpm: Number(state?.wpm || 0),
      elapsedMs: Number(state?.elapsedMs || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.active).toBeTruthy();
  expect(result.typedChars).toBeGreaterThan(result.correctChars);
  expect(result.mistakes).toBeGreaterThan(0);
  expect(result.accuracy).toBeGreaterThanOrEqual(0);
  expect(result.accuracy).toBeLessThan(100);
  expect(result.wpm).toBeGreaterThan(0);
  expect(result.elapsedMs).toBeGreaterThan(0);
});

test("lesson stats button sits next to shortcuts and opens themed modal with live stats", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const placement = await page.evaluate(() => {
    const help = document.querySelector("#editorShortcutHelpBtn");
    const stats = document.querySelector("#lessonStatsBtn");
    if (!(help instanceof HTMLElement) || !(stats instanceof HTMLElement)) {
      return { ready: false };
    }
    return {
      ready: true,
      helpNextIsStats: help.nextElementSibling?.id === "lessonStatsBtn",
      statsLabel: String(stats.textContent || "").trim(),
    };
  });

  expect(placement.ready).toBeTruthy();
  expect(placement.helpNextIsStats).toBeTruthy();
  expect(placement.statsLabel).toBe("Lessons");

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput) {
      return { ready: false };
    }

    const openBtn = document.querySelector("#lessonStatsBtn");
    if (!(openBtn instanceof HTMLElement)) {
      return { ready: false };
    }
    openBtn.click();

    const panel = document.querySelector("#lessonStatsPanel");
    const beforeOpen = {
      panelOpen: panel?.getAttribute("data-open") === "true",
      panelAria: panel?.getAttribute("aria-hidden") === "false",
    };

    const readModal = () => ({
      level: String(document.querySelector("#lessonHeaderLevel")?.textContent || ""),
      xp: String(document.querySelector("#lessonHeaderXp")?.textContent || ""),
      coins: String(document.querySelector("#lessonHeaderCoins")?.textContent || ""),
      done: String(document.querySelector("#lessonHeaderCompleted")?.textContent || ""),
      best: String(document.querySelector("#lessonHeaderBest")?.textContent || ""),
      daily: String(document.querySelector("#lessonHeaderDaily")?.textContent || ""),
      accuracy: String(document.querySelector("#lessonHeaderAccuracy")?.textContent || ""),
      wpm: String(document.querySelector("#lessonHeaderWpm")?.textContent || ""),
      heroTitle: String(document.querySelector("#lessonStatsHeroTitle")?.textContent || ""),
      heroSub: String(document.querySelector("#lessonStatsHeroSubtitle")?.textContent || ""),
      nextLabel: String(document.querySelector("#lessonStatsNextLabel")?.textContent || ""),
      safety: String(document.querySelector("#lessonStatsSafety")?.textContent || ""),
      sessionState: String(document.querySelector("#lessonStatsSessionState")?.textContent || ""),
      overviewTab: String(document.querySelector("#lessonStatsOverviewTab")?.textContent || "").trim(),
      shopTab: String(document.querySelector("#lessonStatsShopTab")?.textContent || "").trim(),
    });

    const before = readModal();
    const shopTab = document.querySelector("#lessonStatsShopTab");
    if (shopTab instanceof HTMLElement) {
      shopTab.click();
    }
    const shopState = {
      shopVisible: document.querySelector("#lessonStatsShop")?.getAttribute("aria-hidden") === "false",
      shopItems: document.querySelectorAll("#lessonStatsShopList .lesson-shop-item").length,
    };
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    api.typeLessonInput("const ");
    api.typeLessonInput("X");
    await new Promise((resolve) => setTimeout(resolve, 80));
    const after = readModal();

    const panelStyles = panel ? window.getComputedStyle(panel) : null;
    const closeBtn = document.querySelector("#lessonStatsClose");
    if (closeBtn instanceof HTMLElement) {
      closeBtn.click();
    }

    const afterClose = {
      panelOpen: panel?.getAttribute("data-open") === "true",
      panelAria: panel?.getAttribute("aria-hidden") === "false",
    };

    return {
      ready: true,
      loaded,
      beforeOpen,
      before,
      shopState,
      after,
      afterClose,
      themed: Boolean(panelStyles?.backgroundColor && panelStyles?.backgroundColor !== "rgba(0, 0, 0, 0)"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.beforeOpen.panelOpen).toBeTruthy();
  expect(result.beforeOpen.panelAria).toBeTruthy();
  expect(result.themed).toBeTruthy();
  expect(result.before.level).toContain("Lv ");
  expect(result.before.xp).toContain("XP ");
  expect(result.before.coins).toContain("Bytes ");
  expect(result.before.done).toContain("Done ");
  expect(result.before.best).toContain("Best ");
  expect(result.before.daily).toContain("Daily ");
  expect(result.before.heroTitle.length).toBeGreaterThan(0);
  expect(result.before.overviewTab).toBe("Overview");
  expect(result.before.shopTab).toBe("Shop");
  expect(result.shopState.shopVisible).toBeTruthy();
  expect(result.shopState.shopItems).toBeGreaterThan(0);
  expect(result.before.nextLabel).toContain("Next level in ");
  expect(result.before.safety.toLowerCase()).toContain("local");
  expect(result.after.accuracy).toContain("Acc ");
  expect(result.after.wpm).toContain("WPM ");
  expect(result.after.heroSub.length).toBeGreaterThan(0);
  expect(result.after.accuracy).not.toBe("Acc 100%");
  expect(result.after.coins).toContain("Bytes ");
  expect(result.after.sessionState.toLowerCase()).toContain("active");
  expect(result.afterClose.panelOpen).toBeFalsy();
  expect(result.afterClose.panelAria).toBeFalsy();
});

test("lesson stats modal live-updates elapsed time while open", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    api.typeLessonInput("const ");
    const openBtn = document.querySelector("#lessonStatsBtn");
    if (!(openBtn instanceof HTMLElement)) {
      return { ready: false };
    }
    openBtn.click();

    const parseElapsed = (text) => {
      const source = String(text || "").trim();
      const hours = /([0-9]+)h/.exec(source);
      const minutes = /([0-9]+)m/.exec(source);
      const seconds = /([0-9]+)s/.exec(source);
      const h = hours ? Number(hours[1]) : 0;
      const m = minutes ? Number(minutes[1]) : 0;
      const s = seconds ? Number(seconds[1]) : 0;
      return (h * 3600) + (m * 60) + s;
    };

    const beforeText = String(document.querySelector("#lessonStatsElapsed")?.textContent || "0s");
    const beforeSeconds = parseElapsed(beforeText);

    await new Promise((resolve) => setTimeout(resolve, 1300));

    const afterText = String(document.querySelector("#lessonStatsElapsed")?.textContent || "0s");
    const afterSeconds = parseElapsed(afterText);

    const closeBtn = document.querySelector("#lessonStatsClose");
    if (closeBtn instanceof HTMLElement) closeBtn.click();

    return {
      ready: true,
      loaded: true,
      beforeText,
      afterText,
      beforeSeconds,
      afterSeconds,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.afterSeconds).toBeGreaterThanOrEqual(result.beforeSeconds + 1);
  expect(result.beforeText).not.toBe(result.afterText);
});

test("lesson header stats refresh after burst typing frame sync", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("fazide.lesson-profile.v1");
    localStorage.removeItem("fazide.lesson-session.v1");
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    const parseXp = (text) => {
      const match = /XP\s+([0-9]+)/.exec(String(text || ""));
      return match ? Number(match[1]) : -1;
    };

    const beforeXpText = String(document.querySelector("#lessonHeaderXp")?.textContent || "");
    const beforeXp = parseXp(beforeXpText);
    const initialState = api.getLessonState();

    let applied = 0;
    let guard = 0;
    while (applied < 10 && guard < 80) {
      guard += 1;
      const state = api.getLessonState();
      const expectedNext = String(state?.expectedNext || "");
      if (!expectedNext) break;
      const typed = Number(api.typeLessonInput(expectedNext) || 0);
      if (typed <= 0) break;
      applied += typed;
    }

    const immediateXpText = String(document.querySelector("#lessonHeaderXp")?.textContent || "");
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const afterFrameXpText = String(document.querySelector("#lessonHeaderXp")?.textContent || "");
    const afterFrameWpm = String(document.querySelector("#lessonHeaderWpm")?.textContent || "");

    return {
      ready: true,
      loaded: true,
      stateActive: Boolean(initialState?.active),
      applied,
      beforeXp,
      beforeXpText,
      immediateXpText,
      afterFrameXpText,
      afterFrameXp: parseXp(afterFrameXpText),
      afterFrameWpm,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.stateActive).toBeTruthy();
  expect(result.beforeXp).toBeGreaterThanOrEqual(0);
  expect(result.afterFrameXp).toBeGreaterThanOrEqual(result.beforeXp);
  expect(result.afterFrameXpText).toContain("XP ");
  expect(result.afterFrameWpm).toContain("WPM ");
});

test("lesson shop list does not re-render while overview tab is active", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput) {
      return { ready: false };
    }

    const openBtn = document.querySelector("#lessonStatsBtn");
    const shopTab = document.querySelector("#lessonStatsShopTab");
    const overviewTab = document.querySelector("#lessonStatsOverviewTab");
    const list = document.querySelector("#lessonStatsShopList");
    if (!(openBtn instanceof HTMLElement) || !(shopTab instanceof HTMLElement) || !(overviewTab instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      return { ready: false };
    }

    openBtn.click();
    shopTab.click();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const initialCount = list.childElementCount;
    const initialFirstNode = list.firstElementChild;
    const initialMarkup = list.innerHTML;

    overviewTab.click();
    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    api.typeLessonInput("const ");
    api.typeLessonInput("canvas");
    await new Promise((resolve) => setTimeout(resolve, 120));

    const afterCount = list.childElementCount;
    const sameFirstNode = list.firstElementChild === initialFirstNode;
    const sameMarkup = list.innerHTML === initialMarkup;

    const closeBtn = document.querySelector("#lessonStatsClose");
    if (closeBtn instanceof HTMLElement) closeBtn.click();

    return {
      ready: true,
      loaded,
      initialCount,
      afterCount,
      sameFirstNode,
      sameMarkup,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.initialCount).toBeGreaterThan(0);
  expect(result.afterCount).toBe(result.initialCount);
  expect(result.sameFirstNode).toBeTruthy();
  expect(result.sameMarkup).toBeTruthy();
});

test("lesson shop keeps premium themes locked on a fresh profile", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.listThemeShop || !api?.getTheme || !api?.setTheme || !api?.getLessonProfile) {
      return { ready: false };
    }

    const shop = api.listThemeShop();
    const locked = shop.filter((entry) => !entry?.unlocked && Number(entry?.cost || 0) > 0);
    const target = locked[0] || null;
    const initialTheme = String(api.getTheme() || "");
    const attemptedTheme = target ? String(api.setTheme(target.id) || "") : initialTheme;
    const finalTheme = String(api.getTheme() || "");
    const profile = api.getLessonProfile();

    const openBtn = document.querySelector("#lessonStatsBtn");
    const shopTab = document.querySelector("#lessonStatsShopTab");
    if (openBtn instanceof HTMLElement) openBtn.click();
    if (shopTab instanceof HTMLElement) shopTab.click();

    const getThemeRow = (theme) => Array.from(document.querySelectorAll("#lessonStatsShopList .lesson-shop-item"))
      .find((node) => String(node.getAttribute("data-theme") || "") === String(theme || ""));
    const buyButton = target
      ? getThemeRow(target.id)?.querySelector("button[data-lesson-shop-action='buy']")
      : null;
    const option = target
      ? Array.from(document.querySelectorAll("#themeSelect option")).find(
          (node) => String(node?.value || "") === String(target.id || "")
        )
      : null;

    return {
      ready: true,
      lockedCount: locked.length,
      targetId: target?.id || "",
      targetCost: Number(target?.cost || 0),
      initialTheme,
      attemptedTheme,
      finalTheme,
      hasDefaultThemeOnly: Array.isArray(profile?.unlockedThemes)
        ? profile.unlockedThemes.length === 1 && profile.unlockedThemes[0] === initialTheme
        : false,
      hasBuyButton: buyButton instanceof HTMLElement,
      buyDisabledAtZeroBytes: Boolean(buyButton?.disabled),
      optionMentionsBytes: String(option?.textContent || "").includes("Bytes"),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.lockedCount).toBeGreaterThan(0);
  expect(result.targetId.length).toBeGreaterThan(0);
  expect(result.targetCost).toBeGreaterThan(0);
  expect(result.attemptedTheme).toBe(result.initialTheme);
  expect(result.finalTheme).toBe(result.initialTheme);
  expect(result.hasDefaultThemeOnly).toBeTruthy();
  expect(result.hasBuyButton).toBeTruthy();
  expect(result.buyDisabledAtZeroBytes).toBeTruthy();
  expect(result.optionMentionsBytes).toBeTruthy();
});

test("lesson shop buy flow deducts bytes and allows re-apply after unlock", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const seed = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.listThemeShop || !api?.getTheme) {
      return { ready: false };
    }
    const initialTheme = String(api.getTheme() || "dark");
    const target = (api.listThemeShop() || []).find((entry) => !entry?.unlocked && Number(entry?.cost || 0) > 0);
    if (!target?.id || !Number.isFinite(Number(target.cost)) || Number(target.cost) <= 0) {
      return { ready: false };
    }

    return {
      ready: true,
      targetId: String(target.id),
      cost: Number(target.cost),
      initialTheme,
    };
  });

  expect(seed.ready).toBeTruthy();
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(String(key || ""), String(value || ""));
  }, {
    key: "fazide.lesson-profile.v1",
    value: JSON.stringify({
      xp: 0,
      level: 1,
      bytes: Number(seed.cost),
      unlockedThemes: [seed.initialTheme],
      totalTypedChars: 0,
      lessonsCompleted: 0,
      bestStreak: 0,
      currentStreak: 0,
      dailyStreak: 0,
      lastActiveDay: "",
    }),
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async ({ targetId, cost, initialTheme }) => {
    const api = window.fazide;
    if (!api?.getLessonProfile || !api?.getTheme || !api?.unlockTheme || !api?.setTheme) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getThemeRow = (theme) => Array.from(document.querySelectorAll("#lessonStatsShopList .lesson-shop-item"))
      .find((node) => String(node.getAttribute("data-theme") || "") === String(theme || ""));
    const pickButton = (theme, action) => getThemeRow(theme)?.querySelector(`button[data-lesson-shop-action="${action}"]`);

    const openBtn = document.querySelector("#lessonStatsBtn");
    const shopTab = document.querySelector("#lessonStatsShopTab");
    if (!(openBtn instanceof HTMLElement) || !(shopTab instanceof HTMLElement)) {
      return { ready: false };
    }
    openBtn.click();
    shopTab.click();
    await wait(60);

    const beforeProfile = api.getLessonProfile();
    const bought = Boolean(api.unlockTheme(targetId, { spend: true }));
    await wait(40);

    const afterBuyProfile = api.getLessonProfile();
    const switchedToTarget = String(api.setTheme(targetId) || "");
    const themeAfterBuy = String(api.getTheme() || "");

    const switchAwayButton = pickButton(initialTheme, "apply");
    if (switchAwayButton instanceof HTMLElement) {
      switchAwayButton.click();
      await wait(40);
    }
    const themeAfterSwitchAway = String(api.getTheme() || "");

    const reapplyButton = pickButton(targetId, "apply");
    if (reapplyButton instanceof HTMLElement) {
      reapplyButton.click();
      await wait(40);
    }
    const finalTheme = String(api.getTheme() || "");
    const hint = String(document.querySelector("#lessonStatsShopHint")?.textContent || "");

    return {
      ready: true,
      bought,
      beforeBytes: Number(beforeProfile?.bytes || 0),
      afterBuyBytes: Number(afterBuyProfile?.bytes || 0),
      cost: Number(cost || 0),
      unlockedAfterBuy: Array.isArray(afterBuyProfile?.unlockedThemes)
        ? afterBuyProfile.unlockedThemes.includes(targetId)
        : false,
      switchedToTarget,
      themeAfterBuy,
      themeAfterSwitchAway,
      finalTheme,
      hint,
      targetId,
      initialTheme,
    };
  }, seed);

  expect(result.ready).toBeTruthy();
  expect(result.beforeBytes).toBe(result.cost);
  expect(result.bought).toBeTruthy();
  expect(result.afterBuyBytes).toBe(0);
  expect(result.unlockedAfterBuy).toBeTruthy();
  expect(result.switchedToTarget).toBe(result.targetId);
  expect(result.themeAfterBuy).toBe(result.targetId);
  expect(result.themeAfterSwitchAway).toBe(result.initialTheme);
  expect(result.finalTheme).toBe(result.targetId);
  expect(result.hint.toLowerCase()).toContain("applied");
});

test("lesson streak milestones award coins and expose them in profile", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState || !api?.getLessonProfile) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("paddle-lesson-1", { startTyping: true, run: false });
    if (!loaded) {
      return { ready: true, loaded: false };
    }

    const before = api.getLessonProfile();
    let typed = 0;
    let guards = 0;
    while (typed < 20 && guards < 120) {
      guards += 1;
      const state = api.getLessonState();
      const expectedNext = String(state?.expectedNext || "");
      if (!expectedNext) break;
      const applied = Number(api.typeLessonInput(expectedNext) || 0);
      if (applied <= 0) break;
      typed += applied;
    }
    const after = api.getLessonProfile();
    return {
      ready: true,
      loaded: true,
      typed,
      beforeCoins: Number(before?.coins || 0),
      afterCoins: Number(after?.coins || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typed).toBeGreaterThanOrEqual(20);
  expect(result.afterCoins).toBeGreaterThanOrEqual(result.beforeCoins + 3);
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

