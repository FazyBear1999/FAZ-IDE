const { test, expect } = require("@playwright/test");

test("tools contract: tools panel and section shells exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#toolsPanel")).toHaveCount(1);
  await expect(page.locator("#toolsPanel")).toHaveAttribute("aria-label", "Tools panel");

  for (const selector of ["#taskRunnerPanel", "#problemsPanel", "#inspectPanel", "#debugPanel"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }
});

test("tools contract: task runner controls and defaults are valid", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#taskRunnerStatus")).toHaveAttribute("data-state", "idle");
  await expect(page.locator("#taskRunnerStatus")).toContainText("Idle");

  for (const selector of ["#taskRunnerClear", "#taskRunAll", "#taskRunApp", "#taskRunLint", "#taskRunFormat", "#taskRunSaveAll"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }

  await expect(page.locator("#taskRunnerOutput")).toHaveAttribute("role", "list");
});

test("tools contract: problems and diagnostics defaults are deterministic", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#toolsProblemsDock")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#toolsProblemsToggle")).toHaveAttribute("aria-controls", "problemsPanel");
  await expect(page.locator("#toolsProblemsToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#toolsProblemsToggle")).toContainText("Hide Problems");
  await expect(page.locator("#problemsPanel")).toHaveAttribute("data-open", "true");
  await expect(page.locator("#problemsPanel")).toHaveAttribute("aria-hidden", "false");

  for (const selector of ["#problemsRefresh", "#problemsClear", "#clearDiagnostics"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }

  await expect(page.locator("#problemsList")).toHaveAttribute("role", "list");
  await expect(page.locator("#diagnosticsList")).toHaveAttribute("role", "list");

  await expect(page.locator("#toggleDiagnostics")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#toggleDiagnostics")).toContainText("Verbose: Off");
});

test("tools contract: tools tabs include only primary views (problems docked below)", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#toolsTabs [role='tab']")).toHaveCount(4);
  await expect(page.locator("#toolsTabTaskRunner")).toHaveCount(1);
  await expect(page.locator("#toolsTabDiagnostics")).toHaveCount(1);
  await expect(page.locator("#toolsTabInspector")).toHaveCount(1);
  await expect(page.locator("#toolsTabDebugger")).toHaveCount(1);
  await expect(page.locator("#toolsTabProblems")).toHaveCount(0);
});

test("tools contract: inspect controls and status defaults are valid", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#inspect")).toHaveCount(1);
  await expect(page.locator("#inspectCopy")).toHaveCount(1);
  await expect(page.locator("#inspectStatus")).toContainText("Off");

  const inspectText = page.locator("#inspectDetails");
  await expect(inspectText).toContainText("Run code, then toggle Inspect");
});

test("tools contract: debugger controls are present and safe by default", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#debugModeToggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#debugModeToggle")).toContainText("Debug: Off");

  for (const selector of ["#debugRun", "#debugClearBreakpoints", "#debugClearWatches", "#debugWatchAdd"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }

  await expect(page.locator("#debugWatchInput")).toHaveAttribute("placeholder", "Watch expression (e.g. playerHP)");
  await expect(page.locator("#debugBreakpointList")).toHaveAttribute("role", "list");
  await expect(page.locator("#debugWatchList")).toHaveAttribute("role", "list");
});

test("tools contract: sandbox and console core nodes are wired", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#runnerShell")).toHaveAttribute("data-fullscreen", "false");
  await expect(page.locator("#runner")).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.locator("#runner")).toHaveAttribute("title", "FAZ IDE sandbox runner");
  await expect(page.locator("#runnerExit")).toHaveAttribute("aria-label", "Exit fullscreen");

  for (const selector of ["#popoutSandbox", "#runnerFull", "#copyLog", "#clearLog"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }

  await expect(page.locator("#log")).toHaveAttribute("aria-live", "polite");
}
);
