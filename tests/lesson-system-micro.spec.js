const { test, expect } = require("@playwright/test");

test("lesson micro: loading a lesson starts an active typed-step session", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState) return { ready: false };

    const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const state = api.getLessonState();

    return {
      ready: true,
      loaded: Boolean(loaded),
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
      stepCount: Number(state?.stepCount || 0),
      stepId: String(state?.stepId || ""),
      progress: Number(state?.progress || 0),
      expectedLength: Number(state?.expectedLength || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.active).toBeTruthy();
  expect(result.completed).toBeFalsy();
  expect(result.stepCount).toBeGreaterThanOrEqual(1);
  expect(result.stepId).toBe("instant-output-smoke");
  expect(result.progress).toBe(0);
  expect(result.expectedLength).toBeGreaterThan(0);
});

test("lesson micro: typing expected content completes lesson and updates profile", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState || !api?.getLessonProfile || !api?.getState) {
      return { ready: false };
    }

    const beforeProfile = api.getLessonProfile();
    const beforeCompleted = Number(beforeProfile?.lessonsCompleted || 0);
    const beforeXp = Number(beforeProfile?.xp || 0);

    await api.loadLesson("quick-output-4line", { startTyping: true, run: false });

    const stateBefore = api.getLessonState();
    const markerId = String(stateBefore?.stepId || "");
    const expected = 'document.getElementById("out").textContent = "Lesson complete output is running!";console.log("Quick lesson output ready.");\n';

    const applied = api.typeLessonInput(expected);
    const stateAfter = api.getLessonState();
    const afterProfile = api.getLessonProfile();

    return {
      ready: true,
      markerId,
      expectedLength: expected.length,
      applied,
      completed: Boolean(stateAfter?.completed),
      lessonsCompletedDelta: Number(afterProfile?.lessonsCompleted || 0) - beforeCompleted,
      xpDelta: Number(afterProfile?.xp || 0) - beforeXp,
      level: Number(afterProfile?.level || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.markerId).toBe("quick-output-smoke");
  expect(result.expectedLength).toBeGreaterThan(0);
  expect(result.applied).toBeGreaterThanOrEqual(result.expectedLength);
  expect(result.completed).toBeTruthy();
  expect(result.lessonsCompletedDelta).toBe(1);
  expect(result.xpDelta).toBeGreaterThan(0);
  expect(result.level).toBeGreaterThanOrEqual(1);
});

test("lesson micro: partial session resumes after reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const beforeReload = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) return { ready: false };

    await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const typed = api.typeLessonInput("0");
    const state = api.getLessonState();

    return {
      ready: true,
      typed,
      progress: Number(state?.progress || 0),
      stepId: String(state?.stepId || ""),
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
    };
  });

  expect(beforeReload.ready).toBeTruthy();
  expect(beforeReload.typed).toBe(1);
  expect(beforeReload.progress).toBeGreaterThanOrEqual(1);
  expect(beforeReload.stepId).toBe("instant-output-smoke");
  expect(beforeReload.active).toBeTruthy();
  expect(beforeReload.completed).toBeFalsy();

  await page.reload({ waitUntil: "domcontentloaded" });

  const afterReload = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getLessonState) return { ready: false };
    const state = api.getLessonState();
    return {
      ready: true,
      active: Boolean(state?.active),
      completed: Boolean(state?.completed),
      progress: Number(state?.progress || 0),
      stepId: String(state?.stepId || ""),
      expectedLength: Number(state?.expectedLength || 0),
    };
  });

  expect(afterReload.ready).toBeTruthy();
  expect(afterReload.active).toBeTruthy();
  expect(afterReload.completed).toBeFalsy();
  expect(afterReload.stepId).toBe("instant-output-smoke");
  expect(afterReload.progress).toBeGreaterThanOrEqual(1);
  expect(afterReload.expectedLength).toBeGreaterThan(afterReload.progress);
});
