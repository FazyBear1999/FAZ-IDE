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

  test("lesson progress persists after cloud sync and reload", async ({ page }) => {
    if (!liveCloudEnabled) return;

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.locator("#accountBtn").click();

    const connectionText = String(await page.locator("#accountConnectionValue").textContent() || "").trim().toLowerCase();
    if (!connectionText.includes("google connected")) return;

    const before = await page.evaluate(async () => {
      const api = window.fazide;
      if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonProfile || !api?.getLessonState) {
        return { ready: false };
      }
      const profileBefore = api.getLessonProfile();
      const beforeXp = Number(profileBefore?.xp || 0);
      const beforeTyped = Number(profileBefore?.totalTypedChars || 0);
      const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
      const state = api.getLessonState();
      const expected = String(state?.expectedNext || "");
      const applied = api.typeLessonInput(expected || "0");
      const profileAfter = api.getLessonProfile();
      return {
        ready: true,
        loaded,
        applied,
        beforeXp,
        beforeTyped,
        afterXp: Number(profileAfter?.xp || 0),
        afterTyped: Number(profileAfter?.totalTypedChars || 0),
      };
    });

    if (!before.ready || !before.loaded || before.applied <= 0) return;

    const syncBefore = String(await page.locator("#accountSyncValue").textContent() || "").trim();
    await page.locator("#accountSyncNow").click();
    await expect
      .poll(async () => String(await page.locator("#accountSyncValue").textContent() || "").trim(), {
        timeout: 20000,
      })
      .not.toBe(syncBefore);

    await page.reload({ waitUntil: "domcontentloaded" });

    const after = await page.evaluate(() => {
      const api = window.fazide;
      if (!api?.getLessonProfile) return { ready: false };
      const profile = api.getLessonProfile();
      return {
        ready: true,
        xp: Number(profile?.xp || 0),
        totalTypedChars: Number(profile?.totalTypedChars || 0),
      };
    });

    expect(after.ready).toBeTruthy();
    expect(after.xp).toBeGreaterThanOrEqual(before.afterXp);
    expect(after.totalTypedChars).toBeGreaterThanOrEqual(before.afterTyped);
  });
});
