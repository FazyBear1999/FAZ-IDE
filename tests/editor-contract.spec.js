const { test, expect } = require("@playwright/test");

test("editor contract: primary controls and tool actions exist", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const primaryButtons = [
    ["#run", "Run code in sandbox"],
    ["#clear", "Clear editor contents"],
    ["#format", "Format active file"],
  ];

  for (const [selector, title] of primaryButtons) {
    await expect(page.locator(selector)).toHaveCount(1);
    await expect(page.locator(selector)).toHaveAttribute("title", title);
  }

  const toolButtons = [
    ["#editorFindBtn", "Find and replace"],
    ["#editorSymbolsBtn", "Outline and symbols"],
    ["#projectSearchBtn", "Search across files"],
    ["#editorSplitBtn", "Split compare view"],
    ["#editorHistoryBtn", "Local code history"],
    ["#editorSettingsBtn", "Editor settings"],
  ];

  for (const [selector, title] of toolButtons) {
    await expect(page.locator(selector)).toHaveCount(1);
    await expect(page.locator(selector)).toHaveAttribute("title", title);
  }
});

test("editor contract: editor surface, tablist, and mirror are wired", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#editorTabs")).toHaveAttribute("role", "tablist");
  await expect(page.locator("#editor")).toHaveAttribute("spellcheck", "false");
  await expect(page.locator("#editor")).toHaveAttribute("aria-label", "Code editor");
  await expect(page.locator("#editorMirror")).toHaveAttribute("aria-label", "Saved version preview");

  const hasEditorSurface = await page.evaluate(() => Boolean(document.querySelector(".CodeMirror") || document.querySelector("#editor")));
  expect(hasEditorSurface).toBeTruthy();
});

test("editor contract: find panel defaults are deterministic", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#editorSearchPanel")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#editorSearchPanel")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#editorFindInput")).toHaveAttribute("placeholder", "Find...");
  await expect(page.locator("#editorReplaceInput")).toHaveAttribute("placeholder", "Replace with...");

  const toggleButtons = ["#editorFindCase", "#editorFindWord", "#editorFindRegex", "#editorFindSelection"];
  for (const selector of toggleButtons) {
    await expect(page.locator(selector)).toHaveAttribute("aria-pressed", "false");
  }

  await expect(page.locator("#editorFindStatus")).toContainText("Type to search the active file.");
});

test("editor contract: symbols panel and actions are present", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#symbolPalette")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#symbolPalette")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#symbolSearchInput")).toHaveAttribute("placeholder", "Filter symbols...");
  await expect(page.locator("#symbolList")).toHaveAttribute("role", "listbox");
  await expect(page.locator("#symbolRefsList")).toHaveAttribute("role", "listbox");

  await expect(page.locator("#symbolGoLine")).toHaveCount(1);
  await expect(page.locator("#symbolRename")).toHaveCount(1);
  await expect(page.locator("#symbolFindRefs")).toHaveCount(1);
});

test("editor contract: project search panel controls are complete", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#projectSearchPanel")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#projectSearchPanel")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#projectSearchInput")).toHaveAttribute("placeholder", "Search in files...");
  await expect(page.locator("#projectReplaceInput")).toHaveAttribute("placeholder", "Replace with...");

  for (const selector of ["#projectSearchCase", "#projectSearchWord", "#projectSearchRegex"]) {
    await expect(page.locator(selector)).toHaveAttribute("aria-pressed", "false");
  }

  for (const selector of ["#projectSearchRun", "#projectSearchSelectAll", "#projectSearchClearSel", "#projectReplaceSelected"]) {
    await expect(page.locator(selector)).toHaveCount(1);
  }

  await expect(page.locator("#projectSearchList")).toHaveAttribute("role", "listbox");
});

test("editor contract: settings panel defaults and option groups are valid", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#editorSettingsPanel")).toHaveAttribute("data-open", "false");
  await expect(page.locator("#editorSettingsPanel")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#editorProfileSelect option")).toHaveCount(3);
  await expect(page.locator("#editorFormatterSelect option")).toHaveCount(3);
  await expect(page.locator("#editorFontFamilySelect option")).toHaveCount(9);
  await expect(page.locator("#snippetScopeSelect option")).toHaveCount(8);
  await expect(page.locator('#snippetScopeSelect option[value="python"]')).toHaveCount(0);

  await expect(page.locator("#editorTabSize")).toHaveAttribute("min", "2");
  await expect(page.locator("#editorTabSize")).toHaveAttribute("max", "8");
  await expect(page.locator("#editorFontSize")).toHaveAttribute("min", "11");
  await expect(page.locator("#editorFontSize")).toHaveAttribute("max", "22");
  await expect(page.locator("#editorAutoSaveMs")).toHaveAttribute("step", "100");

  for (const selector of ["#editorWrapToggle", "#editorLintToggle", "#editorErrorLensToggle", "#editorSnippetToggle"]) {
    await expect(page.locator(selector)).toHaveAttribute("type", "checkbox");
  }

  await expect(page.locator("#snippetTriggerInput")).toHaveAttribute("placeholder", "Trigger (ex: clg)");
  await expect(page.locator("#snippetTemplateInput")).toHaveAttribute("spellcheck", "false");
  await expect(page.locator("#snippetList")).toHaveAttribute("role", "list");
}
);
