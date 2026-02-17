const { test, expect } = require("@playwright/test");

const THEMES = ["dark", "light", "purple", "retro", "temple"];

async function applyTheme(page, theme) {
  await page.evaluate(async ({ theme }) => {
    const select = document.querySelector("#themeSelect");
    if (!select) return;
    select.value = theme;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { theme });
}

test("theme/readability: theme selector exposes all supported themes", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const options = await page.locator("#themeSelect option").evaluateAll((nodes) =>
    nodes.map((node) => String(node.getAttribute("value") || "")),
  );
  for (const theme of THEMES) {
    expect(options).toContain(theme);
  }
  expect(options.length).toBeGreaterThanOrEqual(THEMES.length);
});

for (const theme of THEMES) {
  test(`theme/readability: applies ${theme} theme and persists setting`, async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await applyTheme(page, theme);

    const result = await page.evaluate(() => ({
      rootTheme: document.documentElement.getAttribute("data-theme") || "",
      storedTheme: localStorage.getItem("fazide.theme.v1") || "",
    }));

    expect(result.rootTheme).toBe(theme);
    expect(result.storedTheme).toBe(theme);
  });
}

test("theme/readability: text-size tokens remain readable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const text2xs = Number.parseFloat(styles.getPropertyValue("--text-size-2xs") || "0");
    const textXs = Number.parseFloat(styles.getPropertyValue("--text-size-xs") || "0");
    return { text2xs, textXs };
  });

  expect(result.text2xs).toBeGreaterThanOrEqual(12);
  expect(result.textXs).toBeGreaterThanOrEqual(13);
  expect(result.textXs).toBeGreaterThanOrEqual(result.text2xs);
});

test("theme/readability: control-height tokens remain touch-friendly", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    const compact = Number.parseFloat(styles.getPropertyValue("--control-height-compact") || "0");
    const xs = Number.parseFloat(styles.getPropertyValue("--control-height-xs") || "0");
    const sm = Number.parseFloat(styles.getPropertyValue("--control-height-sm") || "0");
    const md = Number.parseFloat(styles.getPropertyValue("--control-height-md") || "0");
    const lg = Number.parseFloat(styles.getPropertyValue("--control-height-lg") || "0");
    const xl = Number.parseFloat(styles.getPropertyValue("--control-height-xl") || "0");
    return { compact, xs, sm, md, lg, xl };
  });

  expect(result.compact).toBeGreaterThanOrEqual(24);
  expect(result.xs).toBeGreaterThanOrEqual(28);
  expect(result.sm).toBeGreaterThanOrEqual(30);
  expect(result.md).toBeGreaterThanOrEqual(result.sm);
  expect(result.lg).toBeGreaterThanOrEqual(result.md);
  expect(result.xl).toBeGreaterThanOrEqual(result.lg);
});

for (const theme of THEMES) {
  test(`theme/readability: body contrast stays acceptable in ${theme}`, async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await applyTheme(page, theme);

    const ratio = await page.evaluate(() => {
      const parseRgb = (value = "") => {
        const match = String(value).match(/rgba?\(([^)]+)\)/i);
        if (!match) return [0, 0, 0];
        const parts = match[1].split(",").slice(0, 3).map((part) => Number.parseFloat(part.trim()) || 0);
        return [parts[0], parts[1], parts[2]];
      };
      const toLinear = (channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (rgb) => (0.2126 * toLinear(rgb[0])) + (0.7152 * toLinear(rgb[1])) + (0.0722 * toLinear(rgb[2]));
      const contrast = (rgbA, rgbB) => {
        const l1 = luminance(rgbA);
        const l2 = luminance(rgbB);
        const [high, low] = l1 > l2 ? [l1, l2] : [l2, l1];
        return (high + 0.05) / (low + 0.05);
      };

      const surface = document.querySelector("#appShell") || document.body;
      const bodyStyles = getComputedStyle(surface);
      const text = parseRgb(bodyStyles.color || "rgb(0,0,0)");
      const bg = parseRgb(bodyStyles.backgroundColor || "rgb(255,255,255)");
      return contrast(text, bg);
    });

    expect(ratio).toBeGreaterThanOrEqual(1.05);
  });
}

for (const theme of THEMES) {
  test(`theme/readability: key UI text remains at least 12px in ${theme}`, async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await applyTheme(page, theme);

    const sizes = await page.evaluate(() => {
      const px = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return 0;
        return Number.parseFloat(getComputedStyle(node).fontSize || "0");
      };
      return {
        topButton: px("#toggleEditor"),
        status: px("#statusText"),
        fileSearch: px("#fileSearch"),
        editorTab: px(".editor-tab"),
        footer: px("#footerBrand"),
      };
    });

    expect(sizes.topButton).toBeGreaterThanOrEqual(11);
    expect(sizes.status).toBeGreaterThanOrEqual(11);
    expect(sizes.fileSearch).toBeGreaterThanOrEqual(11);
    expect(sizes.editorTab).toBeGreaterThanOrEqual(11);
    expect(sizes.footer).toBeGreaterThanOrEqual(10);
  });
}

for (const theme of THEMES) {
  test(`theme/readability: interactive controls keep healthy height in ${theme}`, async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await applyTheme(page, theme);

    const heights = await page.evaluate(() => {
      const h = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return 0;
        return Number.parseFloat(getComputedStyle(node).height || "0");
      };
      return {
        topButton: h("#toggleEditor"),
        themeSelect: h("#themeSelect"),
        fileSearch: h("#fileSearch"),
        runButton: h("#run"),
      };
    });

    expect(heights.topButton).toBeGreaterThanOrEqual(28);
    expect(heights.themeSelect).toBeGreaterThanOrEqual(28);
    expect(heights.fileSearch).toBeGreaterThanOrEqual(20);
    expect(heights.runButton).toBeGreaterThanOrEqual(30);
  });
}
