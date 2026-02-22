const { test, expect } = require("@playwright/test");

test("lesson micro: catalog report stays authoring-safe", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.listLessons || !api?.getLessonsCatalogReport) {
      return { ready: false };
    }

    const lessons = api.listLessons();
    const report = api.getLessonsCatalogReport();
    const tiers = new Set(lessons.map((entry) => String(entry?.tier || "")));

    return {
      ready: true,
      totalLessons: Number(lessons.length || 0),
      allHaveTier: lessons.every((entry) => ["beginner", "intermediate", "expert"].includes(String(entry?.tier || ""))),
      tierCount: tiers.size,
      reportTotalConfigured: Number(report?.totalConfigured || 0),
      reportTotalAvailable: Number(report?.totalAvailable || 0),
      duplicateCount: Number((report?.duplicateIds || []).length || 0),
      invalidTierCount: Number((report?.invalidTiers || []).length || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.totalLessons).toBeGreaterThan(0);
  expect(result.allHaveTier).toBeTruthy();
  expect(result.tierCount).toBeGreaterThan(0);
  expect(result.reportTotalConfigured).toBeGreaterThanOrEqual(result.reportTotalAvailable);
  expect(result.reportTotalAvailable).toBe(result.totalLessons);
  expect(result.duplicateCount).toBe(0);
  expect(result.invalidTierCount).toBe(0);
});

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
      expectedNext: String(state?.expectedNext || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.active).toBeTruthy();
  expect(result.completed).toBeFalsy();
  expect(result.stepCount).toBeGreaterThanOrEqual(1);
  expect(result.stepId).toBe("instant-output-warmup");
  expect(result.progress).toBeGreaterThan(0);
  expect(result.expectedNext).toBe("c");
  expect(result.expectedLength).toBeGreaterThan(80);
});

test("lesson micro: typing session uses a single completion target per lesson", async ({ page }) => {
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
      stepCount: Number(state?.stepCount || 0),
      expectedLength: Number(state?.expectedLength || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.active).toBeTruthy();
  expect(result.stepCount).toBe(1);
  expect(result.expectedLength).toBeGreaterThan(0);
});

test("lesson micro: instructional comments are auto-skipped so typing starts on code", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const before = api.getLessonState();
    const firstExpected = String(before?.expectedNext || "");

    const typed = Number(api.typeLessonInput(firstExpected) || 0);
    const after = api.getLessonState();

    return {
      ready: true,
      loaded: Boolean(loaded),
      firstExpected,
      typed,
      progressAfter: Number(after?.progress || 0),
      expectedLength: Number(after?.expectedLength || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.firstExpected).toBe("c");
  expect(result.typed).toBeGreaterThanOrEqual(1);
  expect(result.progressAfter).toBeGreaterThan(0);
  expect(result.expectedLength).toBeGreaterThan(result.progressAfter);
});

test("lesson micro: after typing code line and pressing enter, comments are skipped to next code char", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const firstLine = 'const learnerName = "FAZ Student";\n';
    const typed = Number(api.typeLessonInput(firstLine) || 0);
    const state = api.getLessonState();

    return {
      ready: true,
      loaded: Boolean(loaded),
      typed,
      expectedNext: String(state?.expectedNext || ""),
      progress: Number(state?.progress || 0),
      expectedLength: Number(state?.expectedLength || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.typed).toBeGreaterThanOrEqual(1);
  expect(result.expectedNext).toBe("c");
  expect(result.progress).toBeGreaterThan(0);
  expect(result.expectedLength).toBeGreaterThan(result.progress);
});

test("lesson micro: first beginner lesson uses a modern multi-line warmup step", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.getLessonState || !api?.typeLessonInput) {
      return { ready: false };
    }

    const loaded = await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const before = api.getLessonState();
    const seed = String(before?.expectedNext || "").slice(0, 12);
    const typed = Number(api.typeLessonInput(seed) || 0);
    const after = api.getLessonState();

    return {
      ready: true,
      loaded: Boolean(loaded),
      stepId: String(before?.stepId || ""),
      expectedLength: Number(before?.expectedLength || 0),
      typed,
      progressAfter: Number(after?.progress || 0),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.loaded).toBeTruthy();
  expect(result.stepId).toBe("instant-output-warmup");
  expect(result.expectedLength).toBeGreaterThan(80);
  expect(result.typed).toBeGreaterThan(0);
  expect(result.progressAfter).toBeGreaterThan(0);
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

test("lesson micro: non-js lesson files lock during typing and unlock after completion", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.listFiles || !api?.nextLessonStep || !api?.getLessonState) {
      return { ready: false };
    }

    const lessonId = "paddle-lesson-1";
    await api.loadLesson(lessonId, { startTyping: true, run: false });

    const filesBefore = api.listFiles().filter((file) => file.family === "lesson" && file.lessonId === lessonId);
    const otherLessonFilesBefore = api.listFiles().filter((file) => file.family === "lesson" && file.lessonId !== lessonId);
    const lockableBefore = filesBefore.filter((file) => /\.(html|css)$/i.test(String(file.name || "")));
    const jsBefore = filesBefore.filter((file) => /\.(js|mjs|cjs|jsx)$/i.test(String(file.name || "")));
    const activeBefore = filesBefore.find((file) => file.active);

    const advanced = api.nextLessonStep();
    const stateAfter = api.getLessonState();

    const filesAfter = api.listFiles().filter((file) => file.family === "lesson" && file.lessonId === lessonId);
    const lockableAfter = filesAfter.filter((file) => /\.(html|css)$/i.test(String(file.name || "")));

    return {
      ready: true,
      lessonFileCount: filesBefore.length,
      lockableCount: lockableBefore.length,
      jsCount: jsBefore.length,
      activeIsJs: Boolean(activeBefore && /\.(js|mjs|cjs|jsx)$/i.test(String(activeBefore.name || ""))),
      lockableLockedDuring: lockableBefore.every((file) => Boolean(file.locked) && Boolean(file.lessonLocked)),
      jsUnlockedDuring: jsBefore.every((file) => !file.locked),
      otherLessonsUnlockedDuring: otherLessonFilesBefore.every((file) => !file.lessonLocked),
      advanced: Boolean(advanced),
      completed: Boolean(stateAfter?.completed),
      lockableUnlockedAfter: lockableAfter.every((file) => !file.lessonLocked),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.lessonFileCount).toBeGreaterThan(0);
  expect(result.lockableCount).toBeGreaterThan(0);
  expect(result.jsCount).toBeGreaterThan(0);
  expect(result.activeIsJs).toBeTruthy();
  expect(result.lockableLockedDuring).toBeTruthy();
  expect(result.jsUnlockedDuring).toBeTruthy();
  expect(result.otherLessonsUnlockedDuring).toBeTruthy();
  expect(result.advanced).toBeTruthy();
  expect(result.completed).toBeTruthy();
  expect(result.lockableUnlockedAfter).toBeTruthy();
});

test("lesson micro: partial session resumes after reload", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const beforeReload = await page.evaluate(async () => {
    const api = window.fazide;
    if (!api?.loadLesson || !api?.typeLessonInput || !api?.getLessonState) return { ready: false };

    await api.loadLesson("quick-output-instant", { startTyping: true, run: false });
    const firstState = api.getLessonState();
    const expectedNext = String(firstState?.expectedNext || "");
    const typed = api.typeLessonInput(expectedNext);
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
  expect(beforeReload.typed).toBeGreaterThanOrEqual(1);
  expect(beforeReload.progress).toBeGreaterThanOrEqual(1);
  expect(beforeReload.stepId).toBe("instant-output-warmup");
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
  expect(afterReload.stepId).toBe("instant-output-warmup");
  expect(afterReload.progress).toBeGreaterThanOrEqual(1);
  expect(afterReload.expectedLength).toBeGreaterThan(afterReload.progress);
});

test("lesson micro: malformed stored lesson day is sanitized on load", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("fazide.lesson-profile.v1", JSON.stringify({
      xp: 50,
      level: 1,
      bytes: 10,
      totalTypedChars: 12,
      lessonsCompleted: 1,
      bestStreak: 2,
      currentStreak: 1,
      dailyStreak: 1,
      lastActiveDay: "2026-99-77-extra",
    }));
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(() => {
    const api = window.fazide;
    if (!api?.getLessonProfile) return { ready: false };
    const profile = api.getLessonProfile();
    return {
      ready: true,
      xp: Number(profile?.xp || 0),
      lastActiveDay: String(profile?.lastActiveDay || ""),
    };
  });

  expect(result.ready).toBeTruthy();
  expect(result.xp).toBe(50);
  expect(result.lastActiveDay).toBe("");
});
