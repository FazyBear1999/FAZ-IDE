const { test, expect } = require("@playwright/test");

test("file contract: core files panel controls exist and are wired", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#filesPanel")).toBeVisible();
  await expect(page.locator("#filesToolbar")).toHaveAttribute("aria-label", "Files toolbar");

  await expect(page.locator("#filesMenuButton")).toHaveAttribute("aria-haspopup", "true");
  await expect(page.locator("#filesMenuButton")).toHaveAttribute("aria-controls", "filesMenu");
  await expect(page.locator("#filesMenuButton")).toHaveAttribute("aria-expanded", "false");

  await expect(page.locator("#fileSearch")).toHaveAttribute("placeholder", "Filter files");
  await expect(page.locator("#fileSearch")).toHaveAttribute("autocomplete", "off");
  await expect(page.locator("#fileSearchClear")).toHaveAttribute("aria-label", "Clear filter");

  await expect(page.locator("#workspaceImportInput")).toHaveAttribute("type", "file");
  await expect(page.locator("#workspaceImportInput")).toHaveAttribute("multiple", "");
  const accept = await page.locator("#workspaceImportInput").getAttribute("accept");
  expect(String(accept || "")).toContain(".json");
  expect(String(accept || "")).toContain(".js");
  expect(String(accept || "")).toContain(".html");
  expect(String(accept || "")).toContain(".css");
  await page.locator("#filesMenuButton").click();
  await expect(page.locator('#filesMenu [data-files-menu="import-workspace"]')).toHaveAttribute("title", /workspace JSON|code files/i);
});

test("file contract: sort options are complete and ordered", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const sortValues = await page.locator("#fileSort option").evaluateAll((nodes) =>
    nodes.map((node) => ({ value: node.getAttribute("value"), label: node.textContent?.trim() || "" })),
  );

  expect(sortValues).toEqual([
    { value: "manual", label: "Manual" },
    { value: "name", label: "Name" },
    { value: "recent", label: "Recent" },
  ]);
});

test("file contract: library toggles map to listbox controls", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#gamesSelectorToggle")).toHaveAttribute("aria-controls", "gamesList");
  await expect(page.locator("#gamesSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#gamesSelectorToggle")).toHaveAttribute("data-files-section-id", "games");
  await expect(page.locator("#gamesList")).toHaveAttribute("role", "listbox");
  await expect(page.locator("#gamesList")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#appsSelectorToggle")).toHaveAttribute("aria-controls", "applicationsList");
  await expect(page.locator("#appsSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#appsSelectorToggle")).toHaveAttribute("data-files-section-id", "applications");
  await expect(page.locator("#applicationsList")).toHaveAttribute("role", "listbox");
  await expect(page.locator("#applicationsList")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#lessonsSelectorToggle")).toHaveAttribute("aria-controls", "lessonsList");
  await expect(page.locator("#lessonsSelectorToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#lessonsSelectorToggle")).toHaveAttribute("data-files-section-id", "lessons");
  await expect(page.locator("#lessonsList")).toHaveAttribute("role", "listbox");
  await expect(page.locator("#lessonsList")).toHaveAttribute("aria-hidden", "true");

  await expect(page.locator("#gameLoad")).toBeHidden();
  await expect(page.locator("#appLoad")).toBeHidden();
  await expect(page.locator("#lessonLoad")).toBeHidden();
});

test("file contract: files menu starts closed and opens from button", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const filesMenuButton = page.locator("#filesMenuButton");
  const filesMenu = page.locator("#filesMenu");

  await expect(filesMenu).toHaveAttribute("aria-hidden", "true");
  await expect(filesMenuButton).toHaveAttribute("aria-expanded", "false");

  await filesMenuButton.click();
  await expect(filesMenuButton).toHaveAttribute("aria-expanded", "true");
  await expect(filesMenu).toHaveAttribute("aria-hidden", "false");

  await filesMenuButton.click();
  await expect(filesMenuButton).toHaveAttribute("aria-expanded", "false");
  await expect(filesMenu).toHaveAttribute("aria-hidden", "true");
});

test("file contract: files menu contains required file and history actions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const fileActions = [
    "new",
    "new-folder",
    "duplicate",
    "rename",
    "delete-all",
    "save-file",
    "save-all",
    "export-workspace",
    "import-workspace",
  ];

  for (const action of fileActions) {
    await expect(page.locator(`#filesMenu [data-files-menu=\"${action}\"]`)).toHaveCount(1);
  }

  await expect(page.locator('#filesMenu [data-files-menu="delete-all"]')).toHaveAttribute("data-variant", "danger");

  await expect(page.locator('#filesMenu [data-files-menu="undo-action"]')).toHaveCount(1);
  await expect(page.locator('#filesMenu [data-files-menu="redo-action"]')).toHaveCount(1);
});

test("file contract: files menu contains required selection and trash actions", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const selectionActions = [
    "select-all",
    "clear-selection",
    "trash-selected",
    "move-selected",
    "duplicate-selected",
    "pin-selected",
    "unpin-selected",
    "lock-selected",
    "unlock-selected",
  ];

  for (const action of selectionActions) {
    await expect(page.locator(`#filesMenu [data-files-menu=\"${action}\"]`)).toHaveCount(1);
  }

  await expect(page.locator('#filesMenu [data-files-menu="trash-selected"]')).toHaveAttribute("data-variant", "danger");

  const trashActions = ["undo-delete", "restore-last", "restore-all", "empty-trash"];
  for (const action of trashActions) {
    await expect(page.locator(`#filesMenu [data-files-menu=\"${action}\"]`)).toHaveCount(1);
  }

  await expect(page.locator('#filesMenu [data-files-menu="empty-trash"]')).toHaveAttribute("data-variant", "danger");
});

test("file contract: files view toggles expose expected default pressed state", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const expectedPressed = {
    filters: "false",
    games: "false",
    applications: "false",
    lessons: "false",
    "open-editors": "true",
    files: "true",
    trash: "false",
  };

  for (const [toggleName, pressed] of Object.entries(expectedPressed)) {
    await expect(page.locator(`#filesMenu [data-files-toggle=\"${toggleName}\"]`)).toHaveAttribute("aria-pressed", pressed);
  }
});

test("file contract: row and folder context menus are closed and complete", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#fileRowMenu")).toHaveAttribute("role", "menu");
  await expect(page.locator("#fileRowMenu")).toHaveAttribute("aria-hidden", "true");

  const rowActions = ["pin", "lock", "rename", "duplicate", "delete"];
  for (const action of rowActions) {
    await expect(page.locator(`#fileRowMenu [data-file-menu-action=\"${action}\"]`)).toHaveCount(1);
  }
  await expect(page.locator('#fileRowMenu [data-file-menu-action="delete"]')).toHaveAttribute("data-variant", "danger");

  await expect(page.locator("#fileFolderMenu")).toHaveAttribute("role", "menu");
  await expect(page.locator("#fileFolderMenu")).toHaveAttribute("aria-hidden", "true");

  const folderActions = ["rename", "new-file", "new-folder", "delete", "collapse-all", "expand-all"];
  for (const action of folderActions) {
    await expect(page.locator(`#fileFolderMenu [data-folder-menu-action=\"${action}\"]`)).toHaveCount(1);
  }
  await expect(page.locator('#fileFolderMenu [data-folder-menu-action="delete"]')).toHaveAttribute("data-variant", "danger");
});

test("file contract: saved-files list is a listbox with seeded sections", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#fileList")).toHaveAttribute("role", "listbox");
  await expect(page.locator("#fileList")).toHaveAttribute("aria-label", "Saved files");

  await expect(page.locator('#fileList [data-file-section="open-editors"]')).toHaveCount(1);
  await expect(page.locator('#fileList [data-file-section="files"]')).toHaveCount(1);

  await expect(page.locator('#fileList [data-file-section="open-editors"]')).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('#fileList [data-file-section="files"]')).toHaveAttribute("aria-expanded", "false");
});
