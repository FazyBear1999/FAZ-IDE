const { test, expect } = require("@playwright/test");

test("loads the IDE shell with files and editor", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#appShell")).toBeVisible();
  await expect(page.locator("#fileList")).toBeVisible();
  await expect(page.locator("#gamesSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#appsSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('#fileList [data-file-section="files"]')).toHaveAttribute("aria-expanded", "false");

  const hasEditorSurface = await page.evaluate(() => {
    return Boolean(document.querySelector(".CodeMirror") || document.querySelector("textarea"));
  });
  expect(hasEditorSurface).toBeTruthy();

  await page.locator('#fileList [data-file-section="files"]').click();
  const fileRows = await page.locator("#fileList .file-row").count();
  expect(fileRows).toBeGreaterThan(0);
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
    const stripRight = document.querySelector(".strip-right");
    const actionsGroup = stripRight?.querySelector('[aria-label="Workspace actions"]');
    const themeGroup = stripRight?.querySelector(".strip-theme-group");
    const health = stripRight?.querySelector('.health[aria-label="System health"]');
    const themeSelect = document.querySelector("#themeSelect");
    if (!stripRight || !actionsGroup || !themeGroup || !themeSelect) {
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

    const children = Array.from(stripRight.children);
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

test("editor settings syntax selector includes curated ten presets", async ({ page }) => {
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
  expect(result.count).toBe(10);
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
  expect(result.count).toBe(10);
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
  expect(result.entries.length).toBe(10);
  result.entries.forEach((entry) => {
    expect(entry.hasSummary).toBeTruthy();
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

test("games and applications load buttons reveal and enable when catalogs are expanded", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const gamesToggle = document.querySelector("#gamesSelectorToggle");
    const appsToggle = document.querySelector("#appsSelectorToggle");
    gamesToggle?.click();
    appsToggle?.click();

    const gameLoad = document.querySelector("#gameLoad");
    const appLoad = document.querySelector("#appLoad");
    if (!gamesToggle || !appsToggle || !gameLoad || !appLoad) {
      return { ready: false };
    }

    return {
      ready: true,
      gamesToggleDisabled: Boolean(gamesToggle.disabled),
      appsToggleDisabled: Boolean(appsToggle.disabled),
      gameLoadHidden: Boolean(gameLoad.hidden),
      appLoadHidden: Boolean(appLoad.hidden),
      gameLoadDisabled: Boolean(gameLoad.disabled),
      appLoadDisabled: Boolean(appLoad.disabled),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.gamesToggleDisabled).toBeFalsy();
  expect(result.appsToggleDisabled).toBeFalsy();
  expect(result.gameLoadHidden).toBeFalsy();
  expect(result.appLoadHidden).toBeFalsy();
  expect(result.gameLoadDisabled).toBeFalsy();
  expect(result.appLoadDisabled).toBeFalsy();
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
  expect(result.sectionOrder.slice(0, 4)).toEqual(["applications", "open-editors", "files", "games"]);
  expect(result.persistedOrder).toEqual(["applications", "open-editors", "files", "games"]);
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

test("all main panels use a reasonable minimum width of 180px", async ({ page }) => {
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
  expect(result.minEditor).toBe(180);
  expect(result.appliedLog).toBeGreaterThanOrEqual(180);
  expect(result.appliedTools).toBeGreaterThanOrEqual(180);
  expect(result.layoutLog).toBeGreaterThanOrEqual(180);
  expect(result.layoutTools).toBeGreaterThanOrEqual(180);
  expect(result.cssLogVar).toBeGreaterThanOrEqual(180);
  expect(result.cssToolsVar).toBeGreaterThanOrEqual(180);
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

test("dev terminal runs safe commands and blocks privileged eval commands", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.openDevTerminal || !api?.runDevTerminal) {
      return { ready: false };
    }

    api.openDevTerminal();
    const statusLabel = String(document.querySelector("#devTerminalStatus")?.textContent || "");
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
    const marker = `ctx-${Date.now().toString(36)}`;
    let bridgePayload = null;
    let consolePayload = null;

    const capture = (event) => {
      const data = event?.data;
      if (!data || data.source !== "fazide") return;
      if (data.type === "bridge_ready" && !bridgePayload) {
        bridgePayload = {
          token: String(data.token || ""),
          runContext: data.runContext || data?.payload?.runContext || null,
        };
      }
      if (data.type === "console") {
        const args = Array.isArray(data?.payload?.args) ? data.payload.args : [];
        const joined = args.map((entry) => String(entry)).join(" ");
        if (joined.includes(marker)) {
          consolePayload = {
            token: String(data.token || ""),
            runContext: data.runContext || null,
          };
        }
      }
    };

    clearBtn.click();
    window.addEventListener("message", capture);
    api.setCode(`console.log("${marker}");`);
    runBtn.click();

    for (let i = 0; i < 30 && (!bridgePayload || !consolePayload); i += 1) {
      await wait(30);
    }
    window.removeEventListener("message", capture);

    const logText = String(logHost.textContent || "");
    const context = bridgePayload?.runContext || consolePayload?.runContext || null;
    const seed = Number(context?.seed);
    const runNumber = Number(context?.runNumber);

    return {
      ready: true,
      bridgeSeen: Boolean(bridgePayload),
      consoleSeen: Boolean(consolePayload),
      tokenConsistent: Boolean(
        bridgePayload?.token
        && consolePayload?.token
        && bridgePayload.token === consolePayload.token
        && bridgePayload.token === String(context?.token || "")
      ),
      hasContextObject: Boolean(context && typeof context === "object"),
      hasContextId: typeof context?.id === "string" && context.id.startsWith("run-"),
      seedFinite: Number.isFinite(seed) && seed > 0,
      runNumberFinite: Number.isFinite(runNumber) && runNumber >= 1,
      logShowsContext: logText.includes("Run context: seed="),
      markerSeen: logText.includes(marker),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.bridgeSeen).toBeTruthy();
  expect(result.consoleSeen).toBeTruthy();
  expect(result.tokenConsistent).toBeTruthy();
  expect(result.hasContextObject).toBeTruthy();
  expect(result.hasContextId).toBeTruthy();
  expect(result.seedFinite).toBeTruthy();
  expect(result.runNumberFinite).toBeTruthy();
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

test("python phase-1 run works with filesystem icon/language wiring and safe mocked runtime", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.importWorkspaceData) return { ready: false };

    window.__FAZIDE_PYTHON_EXECUTE__ = async ({ code }) => {
      const text = String(code || "");
      const lines = text
        .split("\n")
        .filter((line) => line.includes("print"))
        .map((line) => line.trim());
      return {
        stdout: lines.length ? lines : ["python mock: no print statements"],
        stderr: [],
        result: "python mock: ok",
      };
    };

    const stamp = Date.now().toString(36);
    const pyId = `py-${stamp}`;
    const pyName = `games/demo-${stamp}/main.py`;
    const pyCode = "print('hello from python')\n";

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: pyId, name: pyName, code: pyCode, savedCode: pyCode },
        ],
        trash: [],
        folders: ["games", `games/demo-${stamp}`],
        activeId: pyId,
        openIds: [pyId],
      },
    });
    if (!ok) return { ready: true, ok: false };

    document.querySelector("#run")?.click();
    await new Promise((resolve) => setTimeout(resolve, 320));

    document.querySelector('#fileList [data-file-section="files"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const iconSrc = String(document.querySelector(`#fileList .file-row[data-file-id="${pyId}"] .file-row-icon`)?.getAttribute("src") || "");
    const lang = String(document.querySelector("#footerEditorLang")?.textContent || "");
    const statusText = String(document.querySelector("#statusText")?.textContent || "");
    const logText = String(document.querySelector("#log")?.textContent || "");

    return {
      ready: true,
      ok: true,
      iconSrc,
      lang,
      statusText,
      logText,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.iconSrc.toLowerCase()).toContain("python.svg");
  expect(result.lang.toLowerCase()).toContain("python");
  expect(result.statusText.toLowerCase()).toContain("ran");
  expect(result.logText.toLowerCase()).toContain("python mock: ok");
});

test("python phase-1 timeout surfaces error and subsequent js run still works", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.importWorkspaceData) return { ready: false };

    window.__FAZIDE_PYTHON_EXECUTE__ = async () => {
      await new Promise((resolve) => setTimeout(resolve, 11_500));
      return { stdout: ["late"], stderr: [], result: "late" };
    };

    const stamp = Date.now().toString(36);
    const pyId = `py-timeout-${stamp}`;
    const jsId = `js-after-py-${stamp}`;
    const pyName = `games/timeout-${stamp}/main.py`;
    const jsName = `games/timeout-${stamp}/main.js`;
    const pyCode = "print('start timeout test')\n";
    const jsCode = `console.log('js-after-python:${stamp}')`;

    const ok = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: pyId, name: pyName, code: pyCode, savedCode: pyCode },
          { id: jsId, name: jsName, code: jsCode, savedCode: jsCode },
        ],
        trash: [],
        folders: ["games", `games/timeout-${stamp}`],
        activeId: pyId,
        openIds: [pyId, jsId],
      },
    });
    if (!ok) return { ready: true, ok: false };

    document.querySelector("#run")?.click();
    await new Promise((resolve) => setTimeout(resolve, 10_600));
    const afterPythonStatus = String(document.querySelector("#statusText")?.textContent || "");
    const afterPythonLog = String(document.querySelector("#log")?.textContent || "");

    const switchOk = api.importWorkspaceData({
      format: "fazide-workspace",
      version: 1,
      data: {
        files: [
          { id: jsId, name: jsName, code: jsCode, savedCode: jsCode },
        ],
        trash: [],
        folders: ["games", `games/timeout-${stamp}`],
        activeId: jsId,
        openIds: [jsId],
      },
    });
    if (!switchOk) {
      return {
        ready: true,
        ok: false,
        afterPythonStatus,
        afterPythonLog,
        afterJsStatus: "",
        afterJsLog: "",
        stamp,
      };
    }

    document.querySelector("#run")?.click();
    await new Promise((resolve) => setTimeout(resolve, 320));
    const afterJsStatus = String(document.querySelector("#statusText")?.textContent || "");
    const afterJsLog = String(document.querySelector("#log")?.textContent || "");

    return {
      ready: true,
      ok: true,
      afterPythonStatus,
      afterPythonLog,
      afterJsStatus,
      afterJsLog,
      stamp,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.afterPythonStatus.toLowerCase()).toContain("error");
  expect(result.afterPythonLog.toLowerCase()).toContain("python execution timed out");
  expect(result.afterJsStatus.toLowerCase()).toContain("ran");
  expect(result.afterJsLog).toContain(`js-after-python:${result.stamp}`);
});

test("python phase-1 codemirror mode produces syntax tokens for existing theme colors", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const cmHost = document.querySelector(".CodeMirror");
    const cm = cmHost?.CodeMirror;
    if (!api?.createFile || !cm) return { ready: false };

    const stamp = Date.now().toString(36);
    const file = api.createFile(`python-mode-${stamp}.py`, "def add(a, b):\n    return a + b\n");
    if (!file?.id) return { ready: true, ok: false };

    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    cm.refresh();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const hasKeyword = Boolean(document.querySelector(".CodeMirror .cm-keyword"));
    const hasDef = Boolean(document.querySelector(".CodeMirror .cm-def"));
    return {
      ready: true,
      ok: true,
      hasKeyword,
      hasDef,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.ok).toBeTruthy();
  expect(result.hasKeyword || result.hasDef).toBeTruthy();
});
