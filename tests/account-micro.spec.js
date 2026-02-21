const { test, expect } = require("@playwright/test");

test("account micro: header account button is right-aligned and lesson divider is removed", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#accountBtn")).toHaveCount(1);

  const result = await page.evaluate(() => {
    const stripRight = document.querySelector(".top .strip-right");
    const accountBtn = document.querySelector("#accountBtn");
    const lessonHud = document.querySelector("#lessonHeaderHud");
    const lessonStyle = lessonHud ? getComputedStyle(lessonHud) : null;
    const accountStyle = accountBtn ? getComputedStyle(accountBtn) : null;
    return {
      hasStripRight: Boolean(stripRight),
      accountInStripRight: Boolean(stripRight && accountBtn && stripRight.contains(accountBtn)),
      lessonBorderLeftWidth: lessonStyle?.borderLeftWidth || "",
      lessonBorderLeftStyle: lessonStyle?.borderLeftStyle || "",
      accountHeight: accountStyle?.height || "",
    };
  });

  expect(result.hasStripRight).toBeTruthy();
  expect(result.accountInStripRight).toBeTruthy();
  expect(result.lessonBorderLeftWidth).toBe("0px");
  expect(result.lessonBorderLeftStyle).toBe("none");
  expect(result.accountHeight).toBe("30px");
});

test("account micro: account modal opens centered and closes via escape", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#accountPanel")).toHaveAttribute("aria-hidden", "true");
  await page.locator("#accountBtn").click();

  await expect(page.locator("#accountPanel")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#accountBackdrop")).toHaveAttribute("aria-hidden", "false");
  await expect(page.locator("#accountBtn")).toHaveAttribute("aria-expanded", "true");

  const centered = await page.evaluate(() => {
    const panel = document.querySelector("#accountPanel");
    if (!panel) return false;
    const rect = panel.getBoundingClientRect();
    const viewportX = window.innerWidth / 2;
    const viewportY = window.innerHeight / 2;
    const panelX = rect.left + rect.width / 2;
    const panelY = rect.top + rect.height / 2;
    return Math.abs(panelX - viewportX) <= 4 && Math.abs(panelY - viewportY) <= 4;
  });

  expect(centered).toBeTruthy();

  await page.keyboard.press("Escape");
  await expect(page.locator("#accountPanel")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#accountBtn")).toHaveAttribute("aria-expanded", "false");
});

test("account micro: account status rows render for signed-out and signed-in states", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#accountBtn").click();
  await expect(page.locator("#accountMeta")).toBeHidden();

  await page.evaluate(() => {
    localStorage.setItem("fazide.account-profile.v1", JSON.stringify({
      displayName: "QA Tester",
      email: "qa@test.local",
      showEmail: true,
      accountType: "sandbox",
      signedIn: true,
      updatedAt: Date.now(),
    }));
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#accountBtn").click();
  await expect(page.locator("#accountMeta")).toBeHidden();
});

test("account micro: email field stays hidden while disconnected", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#accountBtn").click();
  await expect(page.locator("#accountEmailGroup")).toHaveAttribute("aria-hidden", "true");
});

test("account micro: test account save persists locally and sign out clears", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator("#accountBtn").click();
  await page.locator("#accountNameInput").fill("QA Tester");
  await page.locator("#accountModeSelect").selectOption("sandbox");
  await page.locator("#accountForm").dispatchEvent("submit");

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("fazide.account-profile.v1") || "";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      parsed = {};
    }
    const buttonText = String(document.querySelector("#accountBtn")?.textContent || "").trim();
    const statusText = String(document.querySelector("#accountStatus")?.textContent || "").trim();
    return {
      displayName: String(parsed.displayName || ""),
      email: String(parsed.email || ""),
      accountType: String(parsed.accountType || ""),
      signedIn: Boolean(parsed.signedIn),
      buttonText,
      statusText,
    };
  });

  expect(saved.displayName).toBe("QA Tester");
  expect(saved.email).toBe("");
  expect(saved.accountType).toBe("sandbox");
  expect(saved.signedIn).toBeTruthy();
  expect(saved.buttonText).toBe("QA Tester");
  expect(saved.statusText).toContain("QA Tester");

  await page.locator("#accountSignOut").click();

  const signedOut = await page.evaluate(() => {
    const raw = localStorage.getItem("fazide.account-profile.v1") || "";
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (_err) {
      parsed = {};
    }
    const buttonText = String(document.querySelector("#accountBtn")?.textContent || "").trim();
    const statusText = String(document.querySelector("#accountStatus")?.textContent || "").trim();
    return {
      signedIn: Boolean(parsed.signedIn),
      displayName: String(parsed.displayName || ""),
      buttonText,
      statusText,
    };
  });

  expect(signedOut.signedIn).toBeFalsy();
  expect(signedOut.displayName).toBe("");
  expect(signedOut.buttonText).toBe("Account");
  expect(signedOut.statusText).toBe("Signed out");
});
