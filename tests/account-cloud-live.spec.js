const { test, expect } = require("@playwright/test");

const liveCloudEnabled = process.env.FAZ_LIVE_CLOUD_TEST === "1";

test.describe("account cloud live (opt-in)", () => {
  test("connected cloud account shows sync status and controls", async ({ page }) => {
    if (!liveCloudEnabled) return;

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#accountBtn").click();

    const connectionText = String(await page.locator("#accountConnectionValue").textContent() || "").trim().toLowerCase();
    if (!connectionText.includes("google connected")) return;

    await expect(page.locator("#accountMeta")).toBeVisible();
    await expect(page.locator("#accountConnectionValue")).toHaveText(/google connected/i);
    await expect(page.locator("#accountSyncValue")).not.toHaveText(/^\s*never\s*$/i);
    await expect(page.locator("#accountSyncNow")).toBeEnabled();
    await expect(page.locator("#accountEmailValue")).not.toHaveText(/^\s*--\s*$/);
  });
});
