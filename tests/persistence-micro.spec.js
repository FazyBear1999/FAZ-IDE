const { test, expect } = require("@playwright/test");

test("persistence micro: theme selection persists to storage and root dataset", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const themeSelect = document.querySelector("#themeSelect");
    if (!api?.unlockTheme || !themeSelect) return { ready: false };

    api.unlockTheme("light", { spend: false });

    themeSelect.value = "light";
    themeSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    return {
      ready: true,
      rootTheme: document.documentElement.getAttribute("data-theme") || "",
      storedTheme: localStorage.getItem("fazide.theme.v1") || "",
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.rootTheme).toBe("light");
  expect(result.storedTheme).toBe("light");
});

test("persistence micro: layout width setters sync css vars and persisted layout", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    const shell = document.querySelector("#appShell");
    if (!api?.setSizes || !api?.setPanelGap || !shell) return { ready: false };

    api.setSizes({ logWidth: 322, sidebarWidth: 262, sandboxWidth: 462 });
    api.setPanelGap(9);

    const cssLog = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--log-width") || "0");
    const cssSidebar = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--sidebar-width") || "0");
    const cssSandbox = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--sandbox-width") || "0");
    const cssGap = Number.parseFloat(getComputedStyle(shell).getPropertyValue("--panel-gap") || "0");

    let persisted = {};
    try {
      persisted = JSON.parse(localStorage.getItem("fazide.layout.v1") || "{}");
    } catch (_err) {
      persisted = {};
    }

    return {
      ready: true,
      cssLog,
      cssSidebar,
      cssSandbox,
      cssGap,
      persistedLog: Number(persisted.logWidth),
      persistedSidebar: Number(persisted.sidebarWidth),
      persistedSandbox: Number(persisted.sandboxWidth),
      persistedGap: Number(persisted.panelGap),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.cssLog).toBeGreaterThanOrEqual(180);
  expect(result.cssSidebar).toBeGreaterThanOrEqual(180);
  expect(result.cssSandbox).toBeGreaterThanOrEqual(180);
  expect(result.cssGap).toBeGreaterThanOrEqual(0);
  expect(result.persistedLog).toBe(result.cssLog);
  expect(result.persistedSidebar).toBe(result.cssSidebar);
  expect(result.persistedSandbox).toBe(result.cssSandbox);
  expect(result.persistedGap).toBe(result.cssGap);
});

test("persistence micro: panel open flags persist after toggle sequence", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#toggleTools").click();
  await page.locator("#toggleSandbox").click();
  await page.locator("#toggleHeader").click();

  const result = await page.evaluate(() => {
    let persisted = {};
    try {
      persisted = JSON.parse(localStorage.getItem("fazide.layout.v1") || "{}");
    } catch (_err) {
      persisted = {};
    }

    const shell = document.querySelector("#appShell");
    return {
      toolsAttr: shell?.getAttribute("data-tools") || "",
      sandboxAttr: shell?.getAttribute("data-sandbox") || "",
      headerAttr: shell?.getAttribute("data-header") || "",
      toolsOpen: Boolean(persisted.toolsOpen),
      sandboxOpen: Boolean(persisted.sandboxOpen),
      headerOpen: Boolean(persisted.headerOpen),
    };
  });

  expect(result.toolsAttr).toBe("open");
  expect(result.sandboxAttr).toBe("closed");
  expect(result.headerAttr).toBe("closed");
  expect(result.toolsOpen).toBeTruthy();
  expect(result.sandboxOpen).toBeFalsy();
  expect(result.headerOpen).toBeFalsy();
});

test("persistence micro: editor scalar settings persist from settings controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#editorSettingsBtn").click();
  await expect(page.locator("#editorSettingsPanel")).toHaveAttribute("data-open", "true");

  await page.locator("#editorTabSize").fill("4");
  await page.locator("#editorTabSize").dispatchEvent("change");
  await page.locator("#editorFontSize").fill("15");
  await page.locator("#editorFontSize").dispatchEvent("change");
  await page.locator("#editorWrapToggle").check();

  const result = await page.evaluate(() => {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem("fazide.editor-settings.v1") || "{}");
    } catch (_err) {
      stored = {};
    }
    return {
      tabSize: Number(stored.tabSize),
      fontSize: Number(stored.fontSize),
      lineWrapping: Boolean(stored.lineWrapping),
    };
  });

  expect(result.tabSize).toBe(4);
  expect(result.fontSize).toBe(15);
  expect(result.lineWrapping).toBeTruthy();
});

test("persistence micro: files filters visibility toggle is reflected and persisted", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#filesMenuButton").click();
  await page.locator('#filesMenu [data-files-toggle="filters"]').click();

  const result = await page.evaluate(() => {
    const panel = document.querySelector("#filesPanel");
    let persisted = {};
    try {
      persisted = JSON.parse(localStorage.getItem("fazide.layout.v1") || "{}");
    } catch (_err) {
      persisted = {};
    }

    return {
      filtersAttr: panel?.getAttribute("data-filters") || "",
      filtersOpen: Boolean(persisted.filesFiltersOpen),
    };
  });

  expect(result.filtersAttr).toBe("open");
  expect(result.filtersOpen).toBeTruthy();
});

test("persistence micro: system font selection persists in layout storage", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#layoutToggle").click();
  await expect(page.locator("#layoutPanel")).toHaveAttribute("aria-hidden", "false");
  await page.locator("#layoutSystemFontSelect").selectOption("cascadia-mono");

  const result = await page.evaluate(() => {
    let persisted = {};
    try {
      persisted = JSON.parse(localStorage.getItem("fazide.layout.v1") || "{}");
    } catch (_err) {
      persisted = {};
    }
    return {
      systemFontFamily: String(persisted.systemFontFamily || ""),
      runtimeFont: document.documentElement.style.getPropertyValue("--font").trim(),
    };
  });

  expect(result.systemFontFamily).toBe("cascadia-mono");
  expect(result.runtimeFont).toContain("Cascadia Mono");
});
