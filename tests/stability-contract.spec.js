const { test, expect } = require("@playwright/test");

test("boot has no fatal runtime errors and exposes critical API contract", async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(String(msg.text() || ""));
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message || err || ""));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#appShell")).toBeVisible();

  const state = await page.evaluate(() => {
    const api = window.fazide;
    const hasMethod = (name) => typeof api?.[name] === "function";
    const shell = document.querySelector("#appShell");
    return {
      apiReady: Boolean(api),
      createFolder: hasMethod("createFolder"),
      setPanelOpen: hasMethod("setPanelOpen"),
      applyPreset: hasMethod("applyPreset"),
      getState: hasMethod("getState"),
      runSample: hasMethod("runSample"),
      shellVisible: shell instanceof HTMLElement,
      hasLayout: Boolean(api?.getState?.()?.layout),
    };
  });

  expect(state.apiReady).toBeTruthy();
  expect(state.createFolder).toBeTruthy();
  expect(state.setPanelOpen).toBeTruthy();
  expect(state.applyPreset).toBeTruthy();
  expect(state.getState).toBeTruthy();
  expect(state.runSample).toBeTruthy();
  expect(state.shellVisible).toBeTruthy();
  expect(state.hasLayout).toBeTruthy();

  const fatalBootErrors = consoleErrors.filter((line) => line.includes("FAZ IDE boot failed"));
  expect(fatalBootErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("first sandbox run reaches ready/ok health without crashing", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(() => {
    const api = window.fazide;
    const runBtn = document.querySelector("#run");
    if (!api?.setCode || !api?.setPanelOpen || !(runBtn instanceof HTMLElement)) {
      return { ready: false };
    }
    api.setPanelOpen("sandbox", true);
    api.setCode("console.log('stability-sandbox-ready');");
    runBtn.click();
    return { ready: true };
  });

  expect(setup.ready).toBeTruthy();

  await expect.poll(async () => page.evaluate(() => {
    const node = document.querySelector("#footerSandbox");
    if (!(node instanceof HTMLElement)) return "";
    const state = String(node.dataset.state || "").toLowerCase();
    const label = String(node.textContent || "").toLowerCase();
    return `${state}|${label}`;
  }), {
    timeout: 7000,
    intervals: [100, 200, 400],
  }).toMatch(/(ok|warn)\|sandbox:\s*(ready|running|idle)/i);

  const result = await page.evaluate(() => {
    const footer = document.querySelector("#footerSandbox");
    const status = document.querySelector("#statusText");
    const runner = document.querySelector("#runner");
    return {
      footerState: String(footer?.dataset?.state || ""),
      footerText: String(footer?.textContent || ""),
      statusText: String(status?.textContent || ""),
      runnerHasContent: Boolean(runner && (String(runner.getAttribute("srcdoc") || "").length > 20 || runner.contentDocument)),
    };
  });

  expect(["ok", "warn"]).toContain(result.footerState);
  expect(result.footerText.toLowerCase()).toContain("sandbox:");
  expect(result.statusText.toLowerCase()).toContain("ran");
  expect(result.runnerHasContent).toBeTruthy();
});

test("sandbox run sanitizes malformed theme token safely", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const setup = await page.evaluate(() => {
    const api = window.fazide;
    const runBtn = document.querySelector("#run");
    if (!api?.setCode || !api?.setPanelOpen || !(runBtn instanceof HTMLElement)) {
      return { ready: false };
    }
    document.documentElement.setAttribute("data-theme", "\"<invalid-theme>\"");
    api.setPanelOpen("sandbox", true);
    api.setCode("console.log('stability-theme-sanitize');");
    runBtn.click();
    return { ready: true };
  });

  expect(setup.ready).toBeTruthy();

  await expect.poll(async () => page.evaluate(() => {
    const status = document.querySelector("#statusText");
    return String(status?.textContent || "").toLowerCase();
  }), {
    timeout: 7000,
    intervals: [100, 200, 400],
  }).toContain("ran");

  const result = await page.evaluate(() => {
    const runner = document.querySelector("#runner");
    const srcdoc = String(runner?.getAttribute("srcdoc") || "");
    return {
      hasRunnerDoc: srcdoc.length > 20,
      usesDarkThemeFallback: srcdoc.includes('data-theme="dark"'),
      containsUnsafeToken: srcdoc.includes("<invalid-theme>"),
    };
  });

  expect(result.hasRunnerDoc).toBeTruthy();
  expect(result.usesDarkThemeFallback).toBeTruthy();
  expect(result.containsUnsafeToken).toBeFalsy();
});

test("sandbox document assembly keeps security and bridge invariants for js and html runs", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const runBtn = document.querySelector("#run");
    const runner = document.querySelector("#runner");
    if (!api?.setCode || !api?.setPanelOpen || !api?.loadApplication || !(runBtn instanceof HTMLElement) || !(runner instanceof HTMLIFrameElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const hasCoreInjections = (srcdoc = "") => {
      const text = String(srcdoc || "");
      return {
        hasDoc: text.length > 20,
        hasCsp: text.includes("Content-Security-Policy"),
        hasStorageShim: text.includes("__fazStorageShim"),
        hasSecurityLock: text.includes("__fazSecurityLock"),
        hasBridgeToken: text.includes("const TOKEN ="),
      };
    };

    api.setPanelOpen("sandbox", true);
    api.setCode("console.log('assembly-contract-js');");
    runBtn.click();
    await wait(260);
    const jsDoc = hasCoreInjections(runner.getAttribute("srcdoc"));

    const htmlLoaded = await api.loadApplication("runtime-html-check-app", { run: true });
    await wait(420);
    const htmlDoc = hasCoreInjections(runner.getAttribute("srcdoc"));

    return {
      ready: true,
      htmlLoaded: Boolean(htmlLoaded),
      jsDoc,
      htmlDoc,
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.htmlLoaded).toBeTruthy();
  expect(result.jsDoc.hasDoc).toBeTruthy();
  expect(result.jsDoc.hasCsp).toBeTruthy();
  expect(result.jsDoc.hasStorageShim).toBeTruthy();
  expect(result.jsDoc.hasSecurityLock).toBeTruthy();
  expect(result.jsDoc.hasBridgeToken).toBeTruthy();
  expect(result.htmlDoc.hasDoc).toBeTruthy();
  expect(result.htmlDoc.hasCsp).toBeTruthy();
  expect(result.htmlDoc.hasStorageShim).toBeTruthy();
  expect(result.htmlDoc.hasSecurityLock).toBeTruthy();
  expect(result.htmlDoc.hasBridgeToken).toBeTruthy();
});

test("runner fallback path writes complete sandbox document when srcdoc is unavailable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { runInSandbox } = await import("/assets/js/sandbox/runner.js");
    const writes = [];
    let openCount = 0;
    let closeCount = 0;

    const mockDocument = {
      open() { openCount += 1; },
      write(value) { writes.push(String(value || "")); },
      close() { closeCount += 1; },
    };

    const iframeMock = {
      contentWindow: { document: mockDocument },
    };

    runInSandbox(iframeMock, "console.log('fallback-write-path');", "fallback-token", {
      mode: "unexpected-mode",
      runContext: { source: "stability-contract" },
    });

    const html = writes.join("\n");
    return {
      openCount,
      closeCount,
      writeCount: writes.length,
      hasDoctype: /^<!doctype html>/i.test(html.trim()),
      hasCsp: html.includes("Content-Security-Policy"),
      hasStorageShim: html.includes("__fazStorageShim"),
      hasSecurityLock: html.includes("__fazSecurityLock"),
      hasBridgeToken: html.includes("const TOKEN ="),
      hasUserCode: html.includes("fallback-write-path"),
    };
  });

  expect(result.openCount).toBe(1);
  expect(result.closeCount).toBe(1);
  expect(result.writeCount).toBeGreaterThanOrEqual(1);
  expect(result.hasDoctype).toBeTruthy();
  expect(result.hasCsp).toBeTruthy();
  expect(result.hasStorageShim).toBeTruthy();
  expect(result.hasSecurityLock).toBeTruthy();
  expect(result.hasBridgeToken).toBeTruthy();
  expect(result.hasUserCode).toBeTruthy();
});

test("runner fallback path throws clear error when document is inaccessible", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const { runInSandbox } = await import("/assets/js/sandbox/runner.js");
    try {
      runInSandbox({ contentWindow: {} }, "console.log('x');", "token", { mode: "javascript" });
      return { threw: false, message: "" };
    } catch (err) {
      return {
        threw: true,
        message: String(err?.message || err || ""),
      };
    }
  });

  expect(result.threw).toBeTruthy();
  expect(result.message).toContain("Cannot access sandbox document");
});

test("sandbox bridge sanitizes malformed parent theme update token", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    const runBtn = document.querySelector("#run");
    const runner = document.querySelector("#runner");
    if (!api?.setCode || !api?.setPanelOpen || !(runBtn instanceof HTMLElement) || !(runner instanceof HTMLIFrameElement)) {
      return { ready: false };
    }

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let token = "";
    let appliedTheme = "";

    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.source !== "fazide") return;
      if (!token && typeof data.token === "string" && data.token) {
        token = data.token;
      }
      if (data.type === "theme_applied") {
        appliedTheme = String(data?.payload?.theme || "");
      }
    };

    window.addEventListener("message", onMessage);
    try {
      api.setPanelOpen("sandbox", true);
      api.setCode("console.log('bridge-theme-sanitize');");
      runBtn.click();

      for (let i = 0; i < 24 && !token; i += 1) {
        await wait(80);
      }
      if (!token || !runner.contentWindow) {
        return { ready: true, tokenCaptured: false, appliedTheme: "" };
      }

      runner.contentWindow.postMessage({
        source: "fazide-parent",
        token,
        type: "theme_update",
        payload: {
          theme: "\"<bad-theme-token>\"",
          surface: {
            background: "#10131a",
          },
        },
      }, "*");

      for (let i = 0; i < 20 && !appliedTheme; i += 1) {
        await wait(60);
      }

      return {
        ready: true,
        tokenCaptured: Boolean(token),
        appliedTheme,
      };
    } finally {
      window.removeEventListener("message", onMessage);
    }
  });

  expect(result.ready).toBeTruthy();
  expect(result.tokenCaptured).toBeTruthy();
  expect(result.appliedTheme).toBe("dark");
});
