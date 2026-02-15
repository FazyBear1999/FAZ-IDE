const { test, expect } = require("@playwright/test");

test("manifest is reachable and valid", async ({ request }) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBeTruthy();

  const manifest = await response.json();
  expect(Boolean(manifest.name || manifest.short_name)).toBeTruthy();
  expect(Array.isArray(manifest.icons)).toBeTruthy();
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test("critical static assets are reachable", async ({ request }) => {
  const requiredAssets = [
    "/assets/js/app.js",
    "/assets/js/config.js",
    "/assets/css/base.css",
    "/assets/css/components.css",
    "/assets/vendor/acorn/acorn.mjs",
    "/favicon.ico",
  ];

  for (const assetPath of requiredAssets) {
    const response = await request.get(assetPath);
    expect(response.ok(), `${assetPath} should be reachable`).toBeTruthy();
  }
});
