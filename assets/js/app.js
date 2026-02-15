// assets/js/app.js
// FAZ IDE orchestrator:
// - Loads/saves code
// - Wires buttons + shortcuts
// - Executes sandbox runs
// - Receives sandbox console/errors
//
// Architecture rules:
// - ui/* modules: helpers only
// - sandbox/* modules: execution only
// - editors/* modules: editor abstraction only
//
// Notes:
// - app.js is the "glue": it coordinates modules but avoids heavy logic.
// - Any UI behavior should stay here or in ui/* (not in sandbox/*).
// - Any execution behavior must stay in sandbox/* (isolated + testable).
// - Keeping IDs centralized + fail-fast checks makes HTML refactors safe.

import { APP, STORAGE, DEFAULT_CODE, GAMES } from "./config.js";
import { getRequiredElements } from "./ui/elements.js";
import { load, save } from "./ui/store.js";
import { makeLogger } from "./ui/logger.js";
import { makeStatus } from "./ui/status.js";
import { makeDiagnostics } from "./ui/diagnostics.js";
import { normalizeTheme, applyThemeState, DEFAULT_THEME } from "./ui/theme.js";
import { buildExportWorkspaceData, buildWorkspaceExportFilename, triggerWorkspaceExportDownload, normalizeImportedWorkspacePayload, parseWorkspaceImportText, buildImportWorkspaceConfirmMessage } from "./ui/workspaceTransfer.js";
import { DEFAULT_LAYOUT_STATE, LAYOUT_PRESETS, normalizePanelRows, cloneLayoutState } from "./ui/layoutState.js";
import { runInSandbox } from "./sandbox/runner.js";
import { makeTextareaEditor } from "./editors/textarea.js";
import { makeCodeMirrorEditor } from "./editors/codemirror5.js";
import { createCommandRegistry } from "./core/commandRegistry.js";
import { createDebouncedTask } from "./core/debounce.js";
import { createFormatter } from "./core/formatting.js";
import { createAstClient } from "./core/astClient.js";
import {
    isRunShortcut,
    isSaveShortcut,
    isSaveAllShortcut,
    isClearLogShortcut,
    isNewFileShortcut,
    isUndoShortcut,
    isRedoShortcut,
    isQuickOpenShortcut,
    isCommandPaletteShortcut,
    isFindShortcut,
    isReplaceShortcut,
    isGoToLineShortcut,
    isSymbolShortcut,
    isProjectSearchShortcut,
    isAddCursorDownShortcut,
    isAddCursorUpShortcut,
} from "./ui/shortcuts.js";

// DOM references kept centralized (easy maintenance)
// Notes:
// - Every key maps to a required element ID in index.html.
// - Keeping them in one object makes it easy to see the app's "surface area".
const el = getRequiredElements();

// Create our small controllers/adapters.
// - editor: abstracts text editing (CodeMirror if available, else textarea)
// - logger: writes to console panel + provides clear/copy
// - status: updates the status chip text
const editor = makeCodeMirrorEditor(el.editor) || makeTextareaEditor(el.editor);
const logger = makeLogger(el.log);
const status = makeStatus(el.statusText);
const diagnostics = makeDiagnostics(el.diagnosticsList);
const commandRegistry = createCommandRegistry({
    onChange() {
        if (commandPaletteOpen) {
            updateCommandPaletteResults(commandPaletteQuery);
        }
    },
});
const formatter = createFormatter({ fallbackFormat: formatBasic });
const astClient = createAstClient();

const health = {
    editor: el.healthEditor,
    sandbox: el.healthSandbox,
    storage: el.healthStorage,
};

function setHealth(node, state, text) {
    if (!node) return;
    node.dataset.state = state;
    node.textContent = text;
}

let diagnosticsVerbose = false;

function setDiagnosticsVerbose(next) {
    diagnosticsVerbose = next;
    if (el.btnToggleDiagnostics) {
        el.btnToggleDiagnostics.setAttribute("aria-pressed", diagnosticsVerbose ? "true" : "false");
        el.btnToggleDiagnostics.textContent = diagnosticsVerbose ? "Verbose: On" : "Verbose: Off";
    }
}

function pushDiag(level, message) {
    if (level === "info" && !diagnosticsVerbose) return;
    diagnostics.push(level, message);
}

function ensureSandboxOpen(reason) {
    if (isSandboxWindowOpen()) {
        sandboxWindow.focus();
        if (reason) pushDiag("info", reason);
        return;
    }
    if (!layoutState.sandboxOpen) {
        setPanelOpen("sandbox", true);
        if (reason) pushDiag("info", reason);
    }
}

// Token gating: only accept messages from current run
// Notes:
// - Each "Run" generates a fresh token.
// - Sandbox includes the token in postMessage().
// - Parent ignores messages that don't match currentToken (prevents stale logs).
let currentToken = null;

// For master-level readability: show run numbers in the log
// Notes:
// - Helps when running multiple times quickly so you can see boundaries.
let runCount = 0;
let inspectEnabled = false;
let debugMode = false;
let debugBreakpoints = new Set();
let debugWatches = [];
let debugWatchValues = new Map();
let runnerFullscreen = false;
let sandboxWindow = null;
let sandboxPopoutFrame = null;
let sandboxWindowMonitor = null;
let sandboxRestoreState = { shouldRestore: false };
let projectDirectoryHandle = null;
const FILE_DEFAULT_NAME = "main.js";
let files = [];
let folders = [];
let activeFileId = null;
let editingFileId = null;
let editingDraft = null;
let editingError = "";
let pendingNewFileRenameId = null;
let editingFolderPath = null;
let editingFolderDraft = null;
let editingFolderError = "";
let editingFolderIsNew = false;
let fileFilter = "";
let fileSort = "manual";
const FILE_ROW_SELECTOR = ".file-row[data-file-id]";
const FILE_FOLDER_ROW_SELECTOR = ".file-folder-row[data-folder-toggle]";
let fileMenuTargetId = null;
let openTabIds = [];
let selectedFileIds = new Set();
let selectedFolderPaths = new Set();
let selectionAnchorFileId = null;
let trashFiles = [];
const TRASH_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;
const UNDO_DELETE_WINDOW_MS = 1000 * 15;
const FILE_HISTORY_LIMIT = 120;
const SNAPSHOT_RECOVERY_GRACE_MS = 1500;
const EDITOR_HISTORY_LIMIT = 80;
const EDITOR_MARK_KIND_DIAGNOSTIC = "diagnostic";
const EDITOR_MARK_KIND_ERROR_LENS = "error-lens";
const EDITOR_MARK_KIND_FIND = "find";
const EDITOR_MARK_KIND_SYMBOL = "symbol";
const EDITOR_LINT_DEBOUNCE_MS = 220;
const EDITOR_AUTOSAVE_DEFAULT_MS = 650;
const PROBLEM_ENTRY_LIMIT = 260;
const RUNTIME_PROBLEM_LIMIT = 80;
const TASK_RUNNER_OUTPUT_LIMIT = 180;
const FILE_FILTER_RENDER_DEBOUNCE_MS = 90;
const PROJECT_SEARCH_SCAN_DEBOUNCE_MS = 140;
const LOCAL_FOLDER_IMPORT_EXTENSIONS = new Set([
    "js",
    "mjs",
    "cjs",
    "jsx",
    "ts",
    "tsx",
    "json",
    "css",
    "scss",
    "sass",
    "less",
    "html",
    "htm",
    "md",
    "markdown",
    "txt",
    "svg",
    "xml",
]);

const DEFAULT_SNIPPETS = [
    { trigger: "clg", template: "console.log(${1:value});${0}", scope: "javascript" },
    { trigger: "fn", template: "function ${1:name}(${2:params}) {\n  ${0}\n}", scope: "javascript" },
    { trigger: "afn", template: "const ${1:name} = (${2:params}) => {\n  ${0}\n};", scope: "javascript" },
    { trigger: "fori", template: "for (let ${1:i} = 0; ${1:i} < ${2:count}; ${1:i} += 1) {\n  ${0}\n}", scope: "javascript" },
    { trigger: "if", template: "if (${1:condition}) {\n  ${0}\n}", scope: "javascript" },
];
const SNIPPET_SCOPE_VALUES = new Set(["*", "javascript", "typescript", "json", "html", "css", "markdown", "text"]);

const EDITOR_PROFILES = {
    balanced: {
        tabSize: 2,
        fontSize: 13,
        fontFamily: "default",
        lineWrapping: true,
        lintEnabled: true,
        errorLensEnabled: true,
        snippetEnabled: true,
        autosaveMs: 650,
        formatterMode: "auto",
    },
    focus: {
        tabSize: 2,
        fontSize: 14,
        fontFamily: "default",
        lineWrapping: false,
        lintEnabled: true,
        errorLensEnabled: true,
        snippetEnabled: true,
        autosaveMs: 420,
        formatterMode: "prettier",
    },
    presentation: {
        tabSize: 2,
        fontSize: 16,
        fontFamily: "default",
        lineWrapping: true,
        lintEnabled: false,
        errorLensEnabled: false,
        snippetEnabled: false,
        autosaveMs: 900,
        formatterMode: "basic",
    },
};

const EDITOR_FONT_FAMILY_OPTIONS = {
    default: 'ui-monospace, "Cascadia Mono", "Consolas", "SFMono-Regular", Menlo, Monaco, monospace',
    "jetbrains-mono": '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
    "fira-code": '"Fira Code", "Cascadia Mono", "Consolas", monospace',
    "source-code-pro": '"Source Code Pro", "Cascadia Mono", "Consolas", monospace',
    "ibm-plex-mono": '"IBM Plex Mono", "Cascadia Mono", "Consolas", monospace',
    "roboto-mono": '"Roboto Mono", "Cascadia Mono", "Consolas", monospace',
    inconsolata: '"Inconsolata", "Cascadia Mono", "Consolas", monospace',
    "ubuntu-mono": '"Ubuntu Mono", "Cascadia Mono", "Consolas", monospace',
    "cascadia-mono": '"Cascadia Mono", "Consolas", monospace',
};

let pendingDeleteUndo = null;
let pendingDeleteUndoTimer = null;
let quickOpenOpen = false;
let quickOpenQuery = "";
let quickOpenResults = [];
let quickOpenIndex = 0;
let promptDialogOpen = false;
let promptDialogState = null;
let commandPaletteOpen = false;
let commandPaletteQuery = "";
let commandPaletteResults = [];
let commandPaletteIndex = 0;
let shortcutHelpOpen = false;
let editorSearchOpen = false;
let symbolPaletteOpen = false;
let projectSearchOpen = false;
let editorHistoryOpen = false;
let editorSettingsOpen = false;
let editorSplitOpen = false;
let symbolResults = [];
let symbolIndex = 0;
let symbolRequestId = 0;
let symbolReferenceResults = [];
let symbolReferenceRequestId = 0;
let lastInspectInfo = null;
let projectSearchResults = [];
let projectSearchSelectedIds = new Set();
let findResults = [];
let findIndex = 0;
let findDecorationsActive = false;
let lintWorker = null;
let lintRequestId = 0;
let lintTimer = null;
let activeDiagnostics = [];
let currentRunFileId = null;
const collapsedFolderPaths = new Set();
const fileDiagnosticsById = new Map();
let runtimeProblems = [];
let problemsById = new Map();
let problemsRefreshRequestId = 0;
let problemsRenderFrame = null;
let taskRunnerEntries = [];
let taskRunnerBusy = false;
let editorAutosaveTimer = null;
let snippetSession = null;
let snippetRegistry = [...DEFAULT_SNIPPETS];
let fileCodeHistory = {};
let selectedHistoryEntryId = null;
let editorSettings = { ...EDITOR_PROFILES.balanced, profile: "balanced" };
let fileHistory = [];
let fileHistoryIndex = -1;
let historyDepth = 0;
const games = normalizeGames(GAMES);
let openFileMenu = null;
let folderMenuTargetPath = null;
let dragFileId = null;
let dragFolderPath = null;
let dragFolderHoverPath = null;
let dragFileIds = [];
let dragFolderPaths = [];
let newFileTypePreference = "auto";
let currentTheme = DEFAULT_THEME;
let layoutState = cloneLayoutState(DEFAULT_LAYOUT_STATE);
let suppressChange = false;

const debouncedFileFilterRender = createDebouncedTask(() => renderFileList(), FILE_FILTER_RENDER_DEBOUNCE_MS);
const debouncedProjectSearchScan = createDebouncedTask(() => {
    if (!projectSearchOpen) return;
    runProjectSearchScan();
}, PROJECT_SEARCH_SCAN_DEBOUNCE_MS);

const EDGE_RESIZE_GRAB = 12;
const EDITOR_SOFT_MIN_WIDTH = 260;
const FILES_PANEL_MIN_WIDTH = 120;
const RESIZE_GUIDE_COLOR = "var(--resize-guide-color)";
let rowGuide = null;
let colGuide = null;

function makeToken() {
    // Simple unique-enough token for a local sandbox run.
    // Not meant for cryptographic security; it's a run correlator + noise filter.
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function loadLayout(raw = load(STORAGE.LAYOUT)) {
    if (!raw) return { ...layoutState };

    try {
        const parsed = JSON.parse(raw);
        return sanitizeLayoutState(parsed);
    } catch (err) {
        console.warn("FAZ IDE: invalid layout store", err);
        return { ...layoutState };
    }
}

function persistLayout() {
    // Persist only layout UI state (not code) so refresh keeps user preferences.
    save(STORAGE.LAYOUT, JSON.stringify(layoutState));
}

function getPanelRow(panel) {
    const rows = layoutState.panelRows;
    if (rows?.top?.includes(panel)) return "top";
    if (rows?.bottom?.includes(panel)) return "bottom";
    return "top";
}

function rowHasOpenPanels(row) {
    const order = layoutState.panelRows?.[row] || [];
    return order.some((name) => isPanelOpen(name));
}

function applyPanelOrder() {
    const rows = normalizePanelRows(layoutState.panelRows);
    layoutState.panelRows = rows;
    const panels = {
        log: el.logPanel,
        editor: el.editorPanel,
        files: el.side,
        sandbox: el.sandboxPanel,
        tools: el.toolsPanel,
    };
    const resetPanelSize = (panel) => {
        if (!panel) return;
        panel.style.width = "";
        panel.style.flex = "";
        panel.style.minWidth = "";
    };
    const splitters = {
        log: el.splitLog,
        files: el.splitFiles,
        sandbox: el.splitSandbox,
        tools: el.splitTools,
    };
    const usedSplitters = new Set();
    const pickSplitter = (leftName, rightName) => {
        const leftSplitter = splitters[leftName];
        if (leftSplitter && !usedSplitters.has(leftSplitter)) return leftSplitter;
        const rightSplitter = splitters[rightName];
        if (rightSplitter && !usedSplitters.has(rightSplitter)) return rightSplitter;
        return null;
    };
    Object.values(splitters).forEach((splitter) => {
        if (splitter) {
            splitter.style.display = "none";
            splitter.removeAttribute("data-resize-left");
            splitter.removeAttribute("data-resize-right");
        }
    });
    const renderRow = (rowName, container) => {
        if (!container) return;
        const order = rows[rowName] || [];
        const openPanels = order.filter((name) => isPanelOpen(name));
        openPanels.forEach((name, idx) => {
            const panel = panels[name];
            resetPanelSize(panel);
            if (panel) container.appendChild(panel);
            if (idx < openPanels.length - 1) {
                const leftName = name;
                const rightName = openPanels[idx + 1];
                const splitter = pickSplitter(leftName, rightName);
                if (splitter) {
                    usedSplitters.add(splitter);
                    splitter.style.display = "";
                    splitter.dataset.resizeLeft = leftName;
                    splitter.dataset.resizeRight = rightName;
                    container.appendChild(splitter);
                }
            }
        });

        if (openPanels.length && !openPanels.includes("editor")) {
            const fillName = openPanels[openPanels.length - 1];
            const fillPanel = panels[fillName];
            if (fillPanel) {
                fillPanel.style.flex = "1 1 auto";
                fillPanel.style.minWidth = "0";
            }
        }
    };
    renderRow("top", el.workspaceTop);
    renderRow("bottom", el.workspaceBottom);

    const bottomOpen = rows.bottom.filter((name) => isPanelOpen(name));
    if (bottomOpen.length === 1) {
        const solo = panels[bottomOpen[0]];
        if (solo) {
            solo.style.flex = "1 1 auto";
            solo.style.minWidth = "0";
        }
    }
}

function applyLayout() {
    // Single place to update DOM based on layout state.
    normalizeLayoutWidths();
    if (el.appShell) {
        el.appShell.setAttribute("data-log", layoutState.logOpen ? "open" : "closed");
        el.appShell.setAttribute("data-editor", layoutState.editorOpen ? "open" : "closed");
        el.appShell.setAttribute("data-files", layoutState.filesOpen ? "open" : "closed");
        el.appShell.setAttribute("data-sandbox", layoutState.sandboxOpen ? "open" : "closed");
        el.appShell.setAttribute("data-tools", layoutState.toolsOpen ? "open" : "closed");
        el.appShell.setAttribute("data-header", layoutState.headerOpen ? "open" : "closed");
        el.appShell.setAttribute("data-footer", layoutState.footerOpen ? "open" : "closed");
        el.appShell.style.setProperty("--log-width", `${layoutState.logWidth}px`);
        el.appShell.style.setProperty("--sidebar-width", `${layoutState.sidebarWidth}px`);
        el.appShell.style.setProperty("--sandbox-width", `${layoutState.sandboxWidth}px`);
        el.appShell.style.setProperty("--tools-width", `${layoutState.toolsWidth}px`);
        el.appShell.style.setProperty("--panel-gap", `${layoutState.panelGap}px`);
        const bottomOpen = rowHasOpenPanels("bottom");
        el.appShell.style.setProperty("--bottom-height", bottomOpen ? `${layoutState.bottomHeight}px` : "0px");
    }
    if (el.appShell) {
        el.appShell.setAttribute("data-sandbox-window", isSandboxWindowOpen() ? "open" : "closed");
    }
    if (el.logPanel) el.logPanel.setAttribute("aria-hidden", layoutState.logOpen ? "false" : "true");
    if (el.editorPanel) el.editorPanel.setAttribute("aria-hidden", layoutState.editorOpen ? "false" : "true");
    if (el.side) el.side.setAttribute("aria-hidden", layoutState.filesOpen ? "false" : "true");
    if (el.sandboxPanel) el.sandboxPanel.setAttribute("aria-hidden", layoutState.sandboxOpen ? "false" : "true");
    if (el.toolsPanel) el.toolsPanel.setAttribute("aria-hidden", layoutState.toolsOpen ? "false" : "true");
    if (el.workspaceBottom) {
        const bottomOpen = rowHasOpenPanels("bottom");
        el.workspaceBottom.style.display = bottomOpen ? "" : "none";
    }
    if (el.splitRow) {
        const bottomOpen = rowHasOpenPanels("bottom");
        el.splitRow.style.display = bottomOpen ? "" : "none";
    }
    const header = document.querySelector(".top");
    if (header) header.setAttribute("aria-hidden", layoutState.headerOpen ? "false" : "true");
    const footer = document.querySelector(".foot");
    if (footer) footer.setAttribute("aria-hidden", layoutState.footerOpen ? "false" : "true");
    if (document.documentElement) {
        document.documentElement.style.setProperty("--radius", `${layoutState.panelRadius}px`);
        document.documentElement.style.setProperty("--radius-sm", `${Math.max(0, Math.round(layoutState.panelRadius * 0.8))}px`);
    }
    applyFilesLayout();
    applyPanelOrder();
    syncPanelToggles();
    syncQuickBar();
    syncLayoutControls();
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function setSidebarWidth(next) {
    layoutState.sidebarWidth = Math.round(next);
    if (el.appShell) {
        el.appShell.style.setProperty("--sidebar-width", `${layoutState.sidebarWidth}px`);
    }
}

function setLogWidth(next) {
    layoutState.logWidth = Math.round(next);
    if (el.appShell) {
        el.appShell.style.setProperty("--log-width", `${layoutState.logWidth}px`);
    }
}

function setSandboxWidth(next) {
    layoutState.sandboxWidth = Math.round(next);
    if (el.appShell) {
        el.appShell.style.setProperty("--sandbox-width", `${layoutState.sandboxWidth}px`);
    }
}

function setToolsWidth(next) {
    layoutState.toolsWidth = Math.round(next);
    if (el.appShell) {
        el.appShell.style.setProperty("--tools-width", `${layoutState.toolsWidth}px`);
    }
}

function setBottomHeight(next) {
    layoutState.bottomHeight = Math.round(next);
    if (el.appShell) {
        el.appShell.style.setProperty("--bottom-height", `${layoutState.bottomHeight}px`);
    }
}

function applyTheme(theme, { persist = true } = {}) {
    currentTheme = applyThemeState(theme, {
        themeSelect: el.themeSelect,
        editor,
        persist,
        saveTheme(nextTheme) {
            save(STORAGE.THEME, nextTheme);
        },
        sandboxWindow,
        isSandboxWindowOpen,
        onSandboxThemeError(err) {
            console.warn("FAZ IDE: failed to sync sandbox theme", err);
        },
    });
    syncSandboxTheme();
}

function applyFilesLayout() {
    if (el.filesPanel) {
        el.filesPanel.setAttribute("data-filters", layoutState.filesFiltersOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-games", layoutState.filesGamesOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-open-editors", layoutState.filesOpenEditorsOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-files-list", layoutState.filesListOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-trash", layoutState.filesTrashOpen ? "open" : "closed");
    }
    if (el.filesToolbar) {
        el.filesToolbar.setAttribute("aria-hidden", layoutState.filesFiltersOpen ? "false" : "true");
    }
    syncGamesUI();
}

function setFilesFiltersOpen(open) {
    layoutState.filesFiltersOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
}

function setFilesGamesOpen(open) {
    layoutState.filesGamesOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
}

function setFilesSectionOpen(section, open) {
    const next = Boolean(open);
    if (section === "open-editors") {
        layoutState.filesOpenEditorsOpen = next;
    }
    if (section === "files") {
        layoutState.filesListOpen = next;
    }
    if (section === "trash") {
        layoutState.filesTrashOpen = next;
    }
    applyFilesLayout();
    persistLayout();
    renderFileList();
}

function syncDefaultEditorSandboxWidth({ persist = true } = {}) {
    if (!el.workspaceTop || !el.editorPanel || !el.sandboxPanel) return;
    if (!layoutState.sandboxOpen) return;
    if (getPanelRow("editor") !== "top" || getPanelRow("sandbox") !== "top") return;

    const container = el.workspaceTop;
    const totalWidth = container.getBoundingClientRect().width;
    if (!Number.isFinite(totalWidth) || totalWidth <= 0) return;

    const style = getComputedStyle(container);
    const gap = parseFloat(style.columnGap || style.gap) || 0;
    const childCount = container.children.length;
    const totalGaps = gap * Math.max(0, childCount - 1);

    let occupied = 0;
    Array.from(container.children).forEach((child) => {
        if (child === el.editorPanel || child === el.sandboxPanel) return;
        const rect = child.getBoundingClientRect();
        occupied += rect.width;
    });

    const available = Math.max(0, totalWidth - totalGaps - occupied);
    if (!available) return;

    const bounds = getLayoutBounds().sandboxWidth;
    const target = clamp(Math.round(available * 0.4), bounds.min, bounds.max);
    setSandboxWidth(target);
    if (persist) {
        persistLayout();
    }
    syncLayoutControls();
}

function getPanelNameFromElement(panelEl) {
    if (!panelEl) return null;
    if (panelEl === el.logPanel) return "log";
    if (panelEl === el.editorPanel) return "editor";
    if (panelEl === el.side) return "files";
    if (panelEl === el.sandboxPanel) return "sandbox";
    if (panelEl === el.toolsPanel) return "tools";
    return null;
}

function getPanelElement(name) {
    if (name === "log") return el.logPanel;
    if (name === "editor") return el.editorPanel;
    if (name === "files") return el.side;
    if (name === "sandbox") return el.sandboxPanel;
    if (name === "tools") return el.toolsPanel;
    return null;
}

function setResizeActive(list, active) {
    const items = Array.isArray(list) ? list : [list];
    items.forEach((item) => {
        if (!item) return;
        if (active) {
            item.setAttribute("data-resize-active", "true");
        } else {
            item.removeAttribute("data-resize-active");
        }
    });
}

function getWidthControl(panel) {
    if (panel === "log") {
        return { get: () => layoutState.logWidth, set: setLogWidth, boundsKey: "logWidth" };
    }
    if (panel === "files") {
        return { get: () => layoutState.sidebarWidth, set: setSidebarWidth, boundsKey: "sidebar" };
    }
    if (panel === "sandbox") {
        return { get: () => layoutState.sandboxWidth, set: setSandboxWidth, boundsKey: "sandboxWidth" };
    }
    if (panel === "tools") {
        return { get: () => layoutState.toolsWidth, set: setToolsWidth, boundsKey: "toolsWidth" };
    }
    return null;
}

function getLayoutBounds() {
    const workspaceRect = el.workspace?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
    const maxSidebar = Math.min(720, Math.max(200, workspaceRect.width * 0.6));
    const minSidebar = Math.min(maxSidebar, FILES_PANEL_MIN_WIDTH);
    const maxLog = Math.min(820, Math.max(220, workspaceRect.width * 0.65));
    const maxSandbox = Math.min(980, Math.max(260, workspaceRect.width * 0.7));
    const maxTools = Math.min(820, Math.max(220, workspaceRect.width * 0.5));
    const maxBottom = Math.max(160, Math.round(workspaceRect.height * 0.7));
    return {
        logWidth: { min: 160, max: maxLog },
        sidebar: { min: minSidebar, max: maxSidebar },
        sandboxWidth: { min: 240, max: maxSandbox },
        toolsWidth: { min: 200, max: maxTools },
        panelGap: { min: 0, max: 24 },
        cornerRadius: { min: 0, max: 16 },
        bottomHeight: { min: 120, max: maxBottom },
    };
}

function getOpenPanelsInRow(row) {
    const list = layoutState.panelRows?.[row] || [];
    return list.filter((name) => isPanelOpen(name));
}

function getRowWidth(row) {
    const node = row === "bottom" ? el.workspaceBottom : el.workspaceTop;
    return node?.getBoundingClientRect().width || el.workspace?.getBoundingClientRect().width || window.innerWidth;
}

function getEditorMinWidth(row) {
    if (!row) return 0;
    if (!getOpenPanelsInRow(row).includes("editor")) return 0;
    const editorWidth = el.editorPanel?.getBoundingClientRect().width || 0;
    if (editorWidth > 0) {
        return Math.min(EDITOR_SOFT_MIN_WIDTH, Math.floor(editorWidth));
    }
    return EDITOR_SOFT_MIN_WIDTH;
}

function getEffectiveBounds(panel, row, baseBounds) {
    if (!row) return baseBounds;
    const openPanels = getOpenPanelsInRow(row);
    if (!openPanels.length) return baseBounds;
    const editorMin = getEditorMinWidth(row);
    const gapCount = Math.max(0, openPanels.length - 1) * 2;
    const gapTotal = gapCount * (layoutState.panelGap || 0);
    let fixedOthers = 0;
    openPanels.forEach((name) => {
        if (name === "editor" || name === panel) return;
        const control = getWidthControl(name);
        if (control) fixedOthers += control.get();
    });
    const rowWidth = getRowWidth(row);
    const maxByRow = rowWidth - gapTotal - fixedOthers - editorMin;
    const max = Math.min(baseBounds.max, Math.max(baseBounds.min, maxByRow));
    return { min: baseBounds.min, max };
}

function ensureRowGuide() {
    if (!el.workspace) return null;
    if (rowGuide && el.workspace.contains(rowGuide)) return rowGuide;
    rowGuide = el.workspace.querySelector(".resize-guide-row");
    if (!rowGuide) {
        rowGuide = document.createElement("div");
        rowGuide.className = "resize-guide resize-guide-row";
        el.workspace.appendChild(rowGuide);
    }
    return rowGuide;
}

function ensureColGuide() {
    if (!el.workspace) return null;
    if (colGuide && el.workspace.contains(colGuide)) return colGuide;
    colGuide = el.workspace.querySelector(".resize-guide-col");
    if (!colGuide) {
        colGuide = document.createElement("div");
        colGuide.className = "resize-guide resize-guide-col";
        el.workspace.appendChild(colGuide);
    }
    return colGuide;
}

function showRowGuideAt(y) {
    const guide = ensureRowGuide();
    if (!guide || !el.workspace) return;
    const workspaceRect = el.workspace.getBoundingClientRect();
    const offset = Math.max(0, Math.round(y - workspaceRect.top));
    guide.style.top = `${offset}px`;
    guide.setAttribute("data-active", "true");
}

function hideRowGuide() {
    if (!rowGuide) return;
    rowGuide.removeAttribute("data-active");
}

function showColGuideAt(leftX, rightX = null) {
    const guide = ensureColGuide();
    if (!guide || !el.workspace) return;
    const workspaceRect = el.workspace.getBoundingClientRect();
    const leftOffset = Math.round(leftX - workspaceRect.left);
    guide.style.left = `${leftOffset}px`;
    if (Number.isFinite(rightX)) {
        const gap = Math.max(0, Math.round(rightX - leftX));
        guide.style.boxShadow = gap >= 1 ? `${gap}px 0 0 0 ${RESIZE_GUIDE_COLOR}` : "none";
    } else {
        guide.style.boxShadow = "none";
    }
    guide.setAttribute("data-active", "true");
}

function hideColGuide() {
    if (!colGuide) return;
    colGuide.removeAttribute("data-active");
    colGuide.style.boxShadow = "none";
}

function showColGuideForPanels(leftEl, rightEl) {
    const leftRect = leftEl?.getBoundingClientRect() || null;
    const rightRect = rightEl?.getBoundingClientRect() || null;
    if (leftRect && rightRect) {
        showColGuideAt(leftRect.right, rightRect.left);
        return;
    }
    if (leftRect) {
        showColGuideAt(leftRect.right);
        return;
    }
    if (rightRect) {
        showColGuideAt(rightRect.left);
    }
}

function getRowBoundaryY() {
    if (!rowHasOpenPanels("bottom")) return null;
    const bottomRect = el.workspaceBottom?.getBoundingClientRect();
    if (bottomRect) return bottomRect.top;
    const topRect = el.workspaceTop?.getBoundingClientRect();
    return topRect ? topRect.bottom : null;
}

function sanitizeLayoutState(state = {}) {
    const bounds = getLayoutBounds();
    const safeNumber = (value, fallback) => (Number.isFinite(value) ? value : fallback);
    const legacyOrder = Array.isArray(state.panelOrder) ? state.panelOrder : layoutState.panelRows?.top;
    const normalizedRows = normalizePanelRows(state.panelRows ?? { top: legacyOrder, bottom: ["log"] });

    const next = {
        ...layoutState,
        ...state,
        panelRows: normalizedRows,
    };

    const legacyOutputOpen = state.outputOpen !== undefined ? Boolean(state.outputOpen) : undefined;
    const legacySidebarCollapsed = state.sidebarCollapsed !== undefined ? Boolean(state.sidebarCollapsed) : undefined;

    next.logOpen = state.logOpen !== undefined ? Boolean(state.logOpen) : legacyOutputOpen ?? layoutState.logOpen;
    next.editorOpen = state.editorOpen !== undefined ? Boolean(state.editorOpen) : layoutState.editorOpen;
    next.sandboxOpen = state.sandboxOpen !== undefined ? Boolean(state.sandboxOpen) : legacyOutputOpen ?? layoutState.sandboxOpen;
    next.filesOpen = state.filesOpen !== undefined
        ? Boolean(state.filesOpen)
        : legacySidebarCollapsed !== undefined
            ? !legacySidebarCollapsed
            : layoutState.filesOpen;
    next.toolsOpen = state.toolsOpen !== undefined ? Boolean(state.toolsOpen) : layoutState.toolsOpen;
    next.headerOpen = state.headerOpen !== undefined ? Boolean(state.headerOpen) : layoutState.headerOpen;
    next.footerOpen = state.footerOpen !== undefined ? Boolean(state.footerOpen) : layoutState.footerOpen;
    next.filesFiltersOpen = state.filesFiltersOpen !== undefined ? Boolean(state.filesFiltersOpen) : layoutState.filesFiltersOpen;
    next.filesGamesOpen = state.filesGamesOpen !== undefined ? Boolean(state.filesGamesOpen) : layoutState.filesGamesOpen;
    next.filesOpenEditorsOpen = state.filesOpenEditorsOpen !== undefined
        ? Boolean(state.filesOpenEditorsOpen)
        : layoutState.filesOpenEditorsOpen;
    next.filesListOpen = state.filesListOpen !== undefined
        ? Boolean(state.filesListOpen)
        : layoutState.filesListOpen;
    next.filesTrashOpen = state.filesTrashOpen !== undefined
        ? Boolean(state.filesTrashOpen)
        : layoutState.filesTrashOpen;

    const fallbackWidth = safeNumber(state.outputWidth, null);
    next.logWidth = clamp(safeNumber(state.logWidth ?? fallbackWidth, layoutState.logWidth), bounds.logWidth.min, bounds.logWidth.max);
    next.sidebarWidth = clamp(safeNumber(state.sidebarWidth, layoutState.sidebarWidth), bounds.sidebar.min, bounds.sidebar.max);
    next.sandboxWidth = clamp(safeNumber(state.sandboxWidth ?? fallbackWidth, layoutState.sandboxWidth), bounds.sandboxWidth.min, bounds.sandboxWidth.max);
    next.toolsWidth = clamp(safeNumber(state.toolsWidth, layoutState.toolsWidth), bounds.toolsWidth.min, bounds.toolsWidth.max);
    next.bottomHeight = clamp(safeNumber(state.bottomHeight, layoutState.bottomHeight), bounds.bottomHeight.min, bounds.bottomHeight.max);
    next.panelGap = clamp(safeNumber(state.panelGap, layoutState.panelGap), bounds.panelGap.min, bounds.panelGap.max);
    next.panelRadius = clamp(safeNumber(state.panelRadius, layoutState.panelRadius), bounds.cornerRadius.min, bounds.cornerRadius.max);
    return next;
}

function normalizeRowWidths(row) {
    const openPanels = getOpenPanelsInRow(row);
    if (!openPanels.length) return;
    const items = openPanels
        .map((name) => {
            const control = getWidthControl(name);
            if (!control) return null;
            return { name, control, bounds: getLayoutBounds()[control.boundsKey] };
        })
        .filter(Boolean);
    if (!items.length) return;

    const gapCount = Math.max(0, openPanels.length - 1) * 2;
    const gapTotal = gapCount * (layoutState.panelGap || 0);
    const editorMin = getEditorMinWidth(row);
    const rowWidth = getRowWidth(row);
    let total = items.reduce((sum, item) => sum + item.control.get(), 0);
    let over = total + gapTotal + editorMin - rowWidth;
    if (over <= 0) return;

    let guard = 0;
    while (over > 0.5 && guard < 8) {
        const shrinkers = items
            .map((item) => {
                const min = item.bounds.min;
                const can = item.control.get() - min;
                return can > 0.5 ? { ...item, min, can } : null;
            })
            .filter(Boolean);
        if (!shrinkers.length) break;
        const capacity = shrinkers.reduce((sum, item) => sum + item.can, 0);
        if (capacity <= 0) break;
        shrinkers.forEach((item) => {
            const share = item.can / capacity;
            const delta = Math.min(item.can, over * share);
            if (delta <= 0) return;
            item.control.set(item.control.get() - delta);
            over -= delta;
        });
        guard += 1;
    }
}

function normalizeBottomHeight() {
    if (!rowHasOpenPanels("bottom")) return;
    const bounds = getLayoutBounds().bottomHeight;
    const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
    const minTop = rowHasOpenPanels("top") ? 180 : 0;
    const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
    const next = clamp(layoutState.bottomHeight, bounds.min, maxBottom);
    if (next !== layoutState.bottomHeight) {
        setBottomHeight(next);
    }
}

function normalizeLayoutWidths() {
    normalizeRowWidths("top");
    normalizeRowWidths("bottom");
    normalizeBottomHeight();
}

function setLayoutPanelOpen(open) {
    if (!el.layoutPanel || !el.layoutBackdrop) return;
    el.layoutPanel.setAttribute("data-open", open ? "true" : "false");
    el.layoutPanel.setAttribute("aria-hidden", open ? "false" : "true");
    el.layoutBackdrop.setAttribute("data-open", open ? "true" : "false");
    el.layoutBackdrop.setAttribute("aria-hidden", open ? "false" : "true");
    if (el.layoutToggle) {
        el.layoutToggle.setAttribute("aria-expanded", open ? "true" : "false");
    }
    if (open) {
        const first = el.layoutPanel.querySelector("select, input, button");
        if (first) first.focus();
    } else if (layoutState.headerOpen && el.layoutToggle) {
        el.layoutToggle.focus();
    } else if (el.quickLayout) {
        el.quickLayout.focus();
    }
}

function syncLayoutControls() {
    if (!el.layoutPanel) return;
    const bounds = getLayoutBounds();
    const logBounds = getEffectiveBounds("log", getPanelRow("log"), bounds.logWidth);
    const sidebarBounds = getEffectiveBounds("files", getPanelRow("files"), bounds.sidebar);
    const sandboxBounds = getEffectiveBounds("sandbox", getPanelRow("sandbox"), bounds.sandboxWidth);
    const toolsBounds = getEffectiveBounds("tools", getPanelRow("tools"), bounds.toolsWidth);
    const rows = layoutState.panelRows || { top: [], bottom: [] };
    const idx = (name) => {
        const row = getPanelRow(name);
        const list = rows[row] || [];
        return Math.max(0, list.indexOf(name));
    };
    if (el.layoutOrderLog) el.layoutOrderLog.value = String(idx("log"));
    if (el.layoutOrderEditor) el.layoutOrderEditor.value = String(idx("editor"));
    if (el.layoutOrderFiles) el.layoutOrderFiles.value = String(idx("files"));
    if (el.layoutOrderSandbox) el.layoutOrderSandbox.value = String(idx("sandbox"));
    if (el.layoutLogOpen) el.layoutLogOpen.checked = layoutState.logOpen;
    if (el.layoutEditorOpen) el.layoutEditorOpen.checked = layoutState.editorOpen;
    if (el.layoutFilesOpen) el.layoutFilesOpen.checked = layoutState.filesOpen;
    if (el.layoutSandboxOpen) el.layoutSandboxOpen.checked = layoutState.sandboxOpen;
    if (el.layoutToolsOpen) el.layoutToolsOpen.checked = layoutState.toolsOpen;
    if (el.layoutHeaderOpen) el.layoutHeaderOpen.checked = layoutState.headerOpen;
    if (el.layoutFooterOpen) el.layoutFooterOpen.checked = layoutState.footerOpen;
    if (el.layoutPreset) el.layoutPreset.value = "";

    if (el.layoutLogWidth) {
        el.layoutLogWidth.min = logBounds.min;
        el.layoutLogWidth.max = logBounds.max;
        el.layoutLogWidth.value = layoutState.logWidth;
    }
    if (el.layoutLogWidthInput) {
        el.layoutLogWidthInput.min = logBounds.min;
        el.layoutLogWidthInput.max = logBounds.max;
        el.layoutLogWidthInput.value = layoutState.logWidth;
    }
    if (el.layoutSidebarWidth) {
        el.layoutSidebarWidth.min = sidebarBounds.min;
        el.layoutSidebarWidth.max = sidebarBounds.max;
        el.layoutSidebarWidth.value = layoutState.sidebarWidth;
    }
    if (el.layoutSidebarWidthInput) {
        el.layoutSidebarWidthInput.min = sidebarBounds.min;
        el.layoutSidebarWidthInput.max = sidebarBounds.max;
        el.layoutSidebarWidthInput.value = layoutState.sidebarWidth;
    }
    if (el.layoutSandboxWidth) {
        el.layoutSandboxWidth.min = sandboxBounds.min;
        el.layoutSandboxWidth.max = sandboxBounds.max;
        el.layoutSandboxWidth.value = layoutState.sandboxWidth;
    }
    if (el.layoutSandboxWidthInput) {
        el.layoutSandboxWidthInput.min = sandboxBounds.min;
        el.layoutSandboxWidthInput.max = sandboxBounds.max;
        el.layoutSandboxWidthInput.value = layoutState.sandboxWidth;
    }
    if (el.layoutToolsWidth) {
        el.layoutToolsWidth.min = toolsBounds.min;
        el.layoutToolsWidth.max = toolsBounds.max;
        el.layoutToolsWidth.value = layoutState.toolsWidth;
    }
    if (el.layoutToolsWidthInput) {
        el.layoutToolsWidthInput.min = toolsBounds.min;
        el.layoutToolsWidthInput.max = toolsBounds.max;
        el.layoutToolsWidthInput.value = layoutState.toolsWidth;
    }

    if (el.layoutPanelGap) {
        el.layoutPanelGap.min = bounds.panelGap.min;
        el.layoutPanelGap.max = bounds.panelGap.max;
        el.layoutPanelGap.value = layoutState.panelGap;
    }
    if (el.layoutPanelGapInput) {
        el.layoutPanelGapInput.min = bounds.panelGap.min;
        el.layoutPanelGapInput.max = bounds.panelGap.max;
        el.layoutPanelGapInput.value = layoutState.panelGap;
    }
    if (el.layoutCornerRadius) {
        el.layoutCornerRadius.min = bounds.cornerRadius.min;
        el.layoutCornerRadius.max = bounds.cornerRadius.max;
        el.layoutCornerRadius.value = layoutState.panelRadius;
    }
    if (el.layoutCornerRadiusInput) {
        el.layoutCornerRadiusInput.min = bounds.cornerRadius.min;
        el.layoutCornerRadiusInput.max = bounds.cornerRadius.max;
        el.layoutCornerRadiusInput.value = layoutState.panelRadius;
    }

    if (el.layoutLogWidth) el.layoutLogWidth.disabled = !layoutState.logOpen;
    if (el.layoutLogWidthInput) el.layoutLogWidthInput.disabled = !layoutState.logOpen;
    if (el.layoutSidebarWidth) el.layoutSidebarWidth.disabled = !layoutState.filesOpen;
    if (el.layoutSidebarWidthInput) el.layoutSidebarWidthInput.disabled = !layoutState.filesOpen;
    if (el.layoutSandboxWidth) el.layoutSandboxWidth.disabled = !layoutState.sandboxOpen || isSandboxWindowOpen();
    if (el.layoutSandboxWidthInput) el.layoutSandboxWidthInput.disabled = !layoutState.sandboxOpen || isSandboxWindowOpen();
    if (el.layoutToolsWidth) el.layoutToolsWidth.disabled = !layoutState.toolsOpen;
    if (el.layoutToolsWidthInput) el.layoutToolsWidthInput.disabled = !layoutState.toolsOpen;
    if (el.layoutSandboxOpen) el.layoutSandboxOpen.disabled = isSandboxWindowOpen();
}

function setEditorValue(value, { silent = false, lint = true } = {}) {
    clearSnippetSession();
    applyEditorLanguageForActiveFile();
    if (!silent) {
        editor.set(value);
        editor.refresh?.();
        refreshEditorBreakpointMarkers();
        if (lint) queueEditorLint("set-editor");
        return;
    }

    suppressChange = true;
    try {
        editor.set(value);
    } finally {
        suppressChange = false;
    }
    editor.refresh?.();
    refreshEditorBreakpointMarkers();
    if (lint) queueEditorLint("set-editor");
}

function clearEditor({ silent = false } = {}) {
    setEditorValue("", { silent });
}

function checkStorageHealth() {
    if (!health.storage) return;
    try {
        const key = "__fazide_storage_test__";
        localStorage.setItem(key, "1");
        localStorage.removeItem(key);
        setHealth(health.storage, "ok", "Storage: OK");
        pushDiag("info", "Storage check passed.");
    } catch (err) {
        setHealth(health.storage, "error", "Storage: Blocked");
        pushDiag("error", "Storage unavailable. Browser blocked localStorage.");
    }
}

function registerServiceWorker() {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./assets/js/sw.js").catch((err) => {
        pushDiag("warn", `Service worker registration failed: ${String(err?.message || err)}`);
    });
}

function wireDiagnostics() {
    window.addEventListener("fazide:storage-error", (event) => {
        const detail = event.detail || {};
        setHealth(health.storage, "error", "Storage: Blocked");
        pushDiag("error", `Storage ${detail.op || "op"} failed (${detail.key || "unknown"}).`);
        ensureToolsOpen("Tools opened for diagnostics.");
    });

    window.addEventListener("fazide:clipboard-error", (event) => {
        const detail = event.detail || {};
        pushDiag("warn", detail.reason || "Clipboard blocked.");
        ensureToolsOpen("Tools opened for diagnostics.");
    });
}

function ensureLogOpen(reason) {
    if (!layoutState.logOpen) {
        setPanelOpen("log", true);
        if (reason) pushDiag("info", reason);
    }
}

function ensureToolsOpen(reason) {
    if (!layoutState.toolsOpen) {
        setPanelOpen("tools", true);
        if (reason) pushDiag("info", reason);
    }
}

function queueProblemsRender() {
    if (problemsRenderFrame != null) return;
    const schedule = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : ((fn) => setTimeout(fn, 16));
    problemsRenderFrame = schedule(() => {
        problemsRenderFrame = null;
        renderProblemsList();
        renderFileList();
    });
}

function pruneProblemDiagnostics() {
    const validIds = new Set(files.map((file) => file.id));
    [...fileDiagnosticsById.keys()].forEach((fileId) => {
        if (!validIds.has(fileId)) {
            fileDiagnosticsById.delete(fileId);
        }
    });
}

function normalizeProblemLevel(level) {
    if (level === "error" || level === "warn") return level;
    return "info";
}

function normalizeProblemDiagnostic(entry = {}) {
    const line = Math.max(0, Number(entry.line) || 0);
    const ch = Math.max(0, Number(entry.ch) || 0);
    const rawEnd = Number(entry.endCh);
    const endCh = Number.isFinite(rawEnd) ? Math.max(ch + 1, rawEnd) : ch + 1;
    return {
        level: normalizeProblemLevel(entry.level),
        message: String(entry.message || "Diagnostic"),
        line,
        ch,
        endCh,
    };
}

function setLintProblemsForFile(fileId, diagnosticsList = []) {
    if (!fileId) return;
    const normalized = (Array.isArray(diagnosticsList) ? diagnosticsList : [])
        .map((entry) => normalizeProblemDiagnostic(entry))
        .filter(Boolean)
        .slice(0, 220);
    if (!normalized.length) {
        fileDiagnosticsById.delete(fileId);
        queueProblemsRender();
        return;
    }
    fileDiagnosticsById.set(fileId, {
        updatedAt: Date.now(),
        items: normalized,
    });
    queueProblemsRender();
}

function pushRuntimeProblem({
    message = "Runtime error",
    fileId = null,
    fileName = "",
    line = null,
    ch = null,
    endCh = null,
    level = "error",
    kind = "runtime",
} = {}) {
    const normalizedLine = Number.isFinite(line) ? Math.max(0, Number(line)) : null;
    const normalizedCh = Number.isFinite(ch) ? Math.max(0, Number(ch)) : null;
    const normalizedEnd = Number.isFinite(endCh)
        ? Math.max((normalizedCh ?? 0) + 1, Number(endCh))
        : null;
    runtimeProblems.unshift({
        id: `runtime-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`,
        source: kind === "promise" ? "promise" : "runtime",
        level: normalizeProblemLevel(level),
        message: String(message || "Runtime error"),
        fileId: fileId || null,
        fileName: fileName || "",
        line: normalizedLine,
        ch: normalizedCh,
        endCh: normalizedEnd,
        at: Date.now(),
    });
    if (runtimeProblems.length > RUNTIME_PROBLEM_LIMIT) {
        runtimeProblems = runtimeProblems.slice(0, RUNTIME_PROBLEM_LIMIT);
    }
    queueProblemsRender();
}

function getProblemSeverity(level) {
    if (level === "error") return 3;
    if (level === "warn") return 2;
    return 1;
}

function collectProblemEntries() {
    pruneProblemDiagnostics();
    const entries = [];
    fileDiagnosticsById.forEach((payload, fileId) => {
        const file = getFileById(fileId);
        const fileName = file?.name || String(payload?.fileName || "unknown");
        const items = Array.isArray(payload?.items) ? payload.items : [];
        items.forEach((diag, index) => {
            entries.push({
                id: `lint:${fileId}:${index}:${diag.line}:${diag.ch}:${diag.message}`,
                source: "lint",
                fileId,
                fileName,
                message: String(diag.message || "Diagnostic"),
                level: normalizeProblemLevel(diag.level),
                line: Number.isFinite(diag.line) ? diag.line : null,
                ch: Number.isFinite(diag.ch) ? diag.ch : null,
                endCh: Number.isFinite(diag.endCh) ? diag.endCh : null,
                at: Number(payload?.updatedAt) || 0,
            });
        });
    });
    runtimeProblems.forEach((problem, index) => {
        entries.push({
            ...problem,
            id: problem.id || `runtime:${index}:${problem.at || 0}`,
        });
    });
    entries.sort((a, b) => {
        const severity = getProblemSeverity(b.level) - getProblemSeverity(a.level);
        if (severity !== 0) return severity;
        const timeDiff = (b.at || 0) - (a.at || 0);
        if (timeDiff !== 0) return timeDiff;
        return String(a.fileName || "").localeCompare(String(b.fileName || ""));
    });
    return entries.slice(0, PROBLEM_ENTRY_LIMIT);
}

function renderProblemsList() {
    if (!el.problemsList) return;
    const entries = collectProblemEntries();
    problemsById = new Map(entries.map((entry) => [entry.id, entry]));
    if (!entries.length) {
        el.problemsList.innerHTML = `<li class="diagnostics-empty">No active problems.</li>`;
        return;
    }
    el.problemsList.innerHTML = entries
        .map((entry) => {
            const hasLine = Number.isFinite(entry.line);
            const hasCh = Number.isFinite(entry.ch);
            const lineLabel = hasLine ? Number(entry.line) + 1 : null;
            const chLabel = hasCh ? Number(entry.ch) + 1 : null;
            const location = entry.fileName
                ? (lineLabel != null
                    ? `${entry.fileName}:${lineLabel}:${chLabel != null ? chLabel : 1}`
                    : entry.fileName)
                : "Runtime";
            const sourceLabel = entry.source === "lint"
                ? "Lint"
                : (entry.source === "promise" ? "Promise" : "Runtime");
            return `
                <li class="problem-item-wrap">
                    <button
                        type="button"
                        class="diagnostics-item problem-item"
                        data-level="${entry.level}"
                        data-problem-id="${escapeHTML(entry.id)}"
                    >
                        <span class="problem-item-top">
                            <span class="problem-item-source">${sourceLabel}</span>
                            <span class="problem-item-location">${escapeHTML(location)}</span>
                        </span>
                        <span class="problem-item-message">${escapeHTML(entry.message)}</span>
                    </button>
                </li>
            `;
        })
        .join("");
}

function clearProblemsPanel() {
    fileDiagnosticsById.clear();
    runtimeProblems = [];
    queueProblemsRender();
    status.set("Problems cleared");
}

function setProblemsRefreshBusy(active) {
    if (!el.btnProblemsRefresh) return;
    el.btnProblemsRefresh.disabled = Boolean(active);
    el.btnProblemsRefresh.textContent = active ? "Refreshing..." : "Refresh";
}

async function refreshWorkspaceProblems({ announce = true } = {}) {
    const requestId = ++problemsRefreshRequestId;
    setProblemsRefreshBusy(true);
    const snapshots = files.map((file) => ({
        id: file.id,
        code: file.id === activeFileId ? editor.get() : file.code,
    }));
    try {
        const results = await Promise.all(
            snapshots.map(async (file) => {
                try {
                    const diagnosticsList = await astClient.diagnostics(String(file.code ?? ""));
                    return {
                        fileId: file.id,
                        diagnostics: Array.isArray(diagnosticsList) ? diagnosticsList : [],
                    };
                } catch {
                    return {
                        fileId: file.id,
                        diagnostics: [],
                    };
                }
            })
        );
        if (requestId !== problemsRefreshRequestId) return false;
        fileDiagnosticsById.clear();
        let lintCount = 0;
        results.forEach((result) => {
            const normalized = (Array.isArray(result.diagnostics) ? result.diagnostics : [])
                .map((entry) => normalizeProblemDiagnostic(entry))
                .filter(Boolean)
                .slice(0, 220);
            if (!normalized.length) return;
            lintCount += normalized.length;
            fileDiagnosticsById.set(result.fileId, {
                updatedAt: Date.now(),
                items: normalized,
            });
        });
        queueProblemsRender();
        if (announce) {
            status.set(lintCount ? `Problems refreshed (${lintCount})` : "No lint problems");
        }
        return true;
    } finally {
        if (requestId === problemsRefreshRequestId) {
            setProblemsRefreshBusy(false);
        }
    }
}

function jumpToProblem(problemId) {
    const problem = problemsById.get(problemId);
    if (!problem) return false;
    if (problem.fileId && getFileById(problem.fileId)) {
        setSingleSelection(problem.fileId);
        selectFile(problem.fileId);
    }
    const hasLine = Number.isFinite(problem.line);
    if (hasLine) {
        const maxLine = Math.max(0, (editor.lineCount?.() || 1) - 1);
        const line = clamp(Number(problem.line), 0, maxLine);
        const lineText = editor.getLine?.(line) || "";
        const maxCh = Math.max(0, lineText.length);
        const ch = clamp(Number(problem.ch) || 0, 0, maxCh);
        const endTarget = Number.isFinite(problem.endCh) ? Number(problem.endCh) : ch + 1;
        const endCh = clamp(endTarget, ch + 1, maxCh + 1);
        const from = { line, ch };
        const to = { line, ch: endCh };
        editor.setSelections?.([{ anchor: from, head: to }]);
        editor.scrollIntoView?.(from, 120);
    }
    ensureToolsOpen("Tools opened for problems.");
    editor.focus();
    return true;
}

function wireProblemsPanel() {
    renderProblemsList();
    el.btnProblemsRefresh?.addEventListener("click", async () => {
        ensureToolsOpen("Tools opened for problems.");
        await refreshWorkspaceProblems({ announce: true });
    });
    el.btnProblemsClear?.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for problems.");
        clearProblemsPanel();
    });
    el.problemsList?.addEventListener("click", (event) => {
        const item = event.target.closest("[data-problem-id]");
        if (!item) return;
        const id = item.dataset.problemId;
        if (!id) return;
        jumpToProblem(id);
    });
}

function formatTaskRunnerTime(timestamp = Date.now()) {
    try {
        return new Date(timestamp).toLocaleTimeString([], {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return "";
    }
}

function formatTaskRunnerDuration(ms = 0) {
    const safe = Math.max(0, Number(ms) || 0);
    if (safe < 1000) return `${Math.round(safe)}ms`;
    return `${(safe / 1000).toFixed(2)}s`;
}

function findFileByTaskRunnerPath(rawPath = "") {
    const target = normalizePathSlashes(String(rawPath || "").trim());
    if (!target) return null;
    const exact = files.find((file) => file.name === target);
    if (exact) return exact;
    const withoutDot = target.replace(/^\.\//, "");
    const second = files.find((file) => file.name === withoutDot);
    if (second) return second;
    const byBase = files.filter((file) => getFileBaseName(file.name) === getFileBaseName(withoutDot));
    if (byBase.length === 1) return byBase[0];
    return null;
}

function inferTaskRunnerLocation(message = "") {
    const text = String(message || "");
    const match = text.match(/([A-Za-z0-9._/-]+\.js):(\d+)(?::(\d+))?/);
    if (!match) return null;
    const file = findFileByTaskRunnerPath(match[1]);
    if (!file) return null;
    const line = Math.max(0, Number(match[2] || 1) - 1);
    const ch = Math.max(0, Number(match[3] || 1) - 1);
    return {
        fileId: file.id,
        fileName: file.name,
        line,
        ch,
    };
}

function jumpToFileLocation(fileId, line = 0, ch = 0) {
    const file = getFileById(fileId);
    if (!file) return false;
    setSingleSelection(file.id);
    selectFile(file.id);
    const maxLine = Math.max(0, (editor.lineCount?.() || 1) - 1);
    const safeLine = clamp(Number(line) || 0, 0, maxLine);
    const lineText = editor.getLine?.(safeLine) || "";
    const safeCh = clamp(Number(ch) || 0, 0, Math.max(0, lineText.length));
    const from = { line: safeLine, ch: safeCh };
    const to = { line: safeLine, ch: Math.min(lineText.length, safeCh + 1) };
    editor.setSelections?.([{ anchor: from, head: to }]);
    editor.scrollIntoView?.(from, 120);
    editor.focus();
    return true;
}

function setTaskRunnerBusy(active, label = "") {
    taskRunnerBusy = Boolean(active);
    const text = label || (taskRunnerBusy ? "Running..." : "Idle");
    if (el.taskRunnerStatus) {
        el.taskRunnerStatus.dataset.state = taskRunnerBusy ? "busy" : "idle";
        el.taskRunnerStatus.textContent = text;
    }
    [el.taskRunAll, el.taskRunApp, el.taskRunLint, el.taskRunFormat, el.taskRunSaveAll].forEach((button) => {
        if (!button) return;
        button.disabled = taskRunnerBusy;
    });
    if (commandPaletteOpen) {
        updateCommandPaletteResults(commandPaletteQuery);
    }
}

function appendTaskRunnerOutput(level = "info", message = "", { task = "", location = null } = {}) {
    const explicitLocation = location && location.fileId
        ? {
            fileId: location.fileId,
            fileName: location.fileName || getFileById(location.fileId)?.name || "",
            line: Math.max(0, Number(location.line) || 0),
            ch: Math.max(0, Number(location.ch) || 0),
        }
        : null;
    const inferredLocation = explicitLocation || inferTaskRunnerLocation(message);
    const entry = {
        id: `task-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`,
        at: Date.now(),
        level: normalizeProblemLevel(level),
        task: String(task || ""),
        message: String(message || ""),
        location: inferredLocation,
    };
    taskRunnerEntries = [...taskRunnerEntries, entry].slice(-TASK_RUNNER_OUTPUT_LIMIT);
    renderTaskRunnerOutput();
    return entry;
}

function renderTaskRunnerOutput() {
    if (!el.taskRunnerOutput) return;
    if (!taskRunnerEntries.length) {
        el.taskRunnerOutput.innerHTML = `<li class="diagnostics-empty">No task output yet.</li>`;
        return;
    }
    el.taskRunnerOutput.innerHTML = taskRunnerEntries
        .map((entry) => {
            const meta = `${formatTaskRunnerTime(entry.at)}${entry.task ? ` • ${entry.task}` : ""}`;
            const hasLocation = Boolean(entry.location?.fileId);
            const locationAttr = hasLocation
                ? `data-task-open-file-id="${escapeHTML(entry.location.fileId)}" data-task-open-line="${Number(entry.location.line) || 0}" data-task-open-ch="${Number(entry.location.ch) || 0}"`
                : "";
            const body = `
                <span class="task-runner-meta">${escapeHTML(meta)}</span>
                <span class="task-runner-message">${escapeHTML(entry.message)}</span>
            `;
            if (hasLocation) {
                return `
                    <li class="problem-item-wrap">
                        <button type="button" class="diagnostics-item problem-item task-runner-item" data-level="${entry.level}" ${locationAttr}>
                            ${body}
                        </button>
                    </li>
                `;
            }
            return `
                <li class="problem-item-wrap">
                    <div class="diagnostics-item task-runner-item" data-level="${entry.level}">
                        ${body}
                    </div>
                </li>
            `;
        })
        .join("");
    const last = el.taskRunnerOutput.lastElementChild;
    if (last && typeof last.scrollIntoView === "function") {
        last.scrollIntoView({ block: "nearest" });
    }
}

async function runTaskRunnerTask(taskId = "") {
    if (taskRunnerBusy) return false;
    const id = String(taskId || "").trim();
    if (!id) return false;
    ensureToolsOpen("Tools opened for tasks.");
    const startedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    const labels = {
        "run-all": "Run All",
        "run-app": "Run App",
        "lint-workspace": "Lint Workspace",
        "format-active": "Format Active",
        "save-all": "Save All",
    };
    const label = labels[id] || "Task";
    setTaskRunnerBusy(true, label);
    appendTaskRunnerOutput("info", `${label} started`, { task: label });

    try {
        if (id === "run-all") {
            const steps = [];

            const dirtyBefore = getDirtyFiles().length;
            const saved = saveAllFiles({ announce: false });
            if (saved) {
                appendTaskRunnerOutput("info", `Saved ${dirtyBefore} file(s)`, { task: `${label} • Save All` });
            } else {
                appendTaskRunnerOutput("info", "No unsaved files", { task: `${label} • Save All` });
            }
            steps.push(`save:${saved ? "ok" : "noop"}`);

            const active = getActiveFile();
            if (!active) {
                appendTaskRunnerOutput("warn", "No active file", { task: `${label} • Format Active` });
                steps.push("format:skip");
            } else {
                const formatted = await formatCurrentEditor({ announce: false });
                appendTaskRunnerOutput(
                    formatted ? "info" : "warn",
                    formatted ? `Formatted ${active.name}` : "Format skipped",
                    {
                        task: `${label} • Format Active`,
                        location: formatted ? { fileId: active.id, fileName: active.name, line: 0, ch: 0 } : null,
                    }
                );
                steps.push(`format:${formatted ? "ok" : "skip"}`);
            }

            await refreshWorkspaceProblems({ announce: false });
            const lintEntries = collectProblemEntries().filter((entry) => entry.source === "lint");
            const errors = lintEntries.filter((entry) => entry.level === "error").length;
            const warns = lintEntries.filter((entry) => entry.level === "warn").length;
            if (!lintEntries.length) {
                appendTaskRunnerOutput("info", "No lint problems", { task: `${label} • Lint Workspace` });
                steps.push("lint:clean");
            } else {
                appendTaskRunnerOutput(
                    errors > 0 ? "error" : "warn",
                    `Lint found ${lintEntries.length} issue(s): ${errors} error(s), ${warns} warning(s)`,
                    { task: `${label} • Lint Workspace` }
                );
                steps.push(`lint:${lintEntries.length}`);
            }

            run();
            appendTaskRunnerOutput("info", "Sandbox run launched", { task: `${label} • Run App` });
            steps.push("run:launched");
            appendTaskRunnerOutput("info", `Run All summary • ${steps.join(" • ")}`, { task: label });
            return true;
        }

        if (id === "run-app") {
            run();
            appendTaskRunnerOutput("info", "Sandbox run launched", { task: label });
            return true;
        }

        if (id === "lint-workspace") {
            await refreshWorkspaceProblems({ announce: false });
            const lintEntries = collectProblemEntries().filter((entry) => entry.source === "lint");
            const errors = lintEntries.filter((entry) => entry.level === "error").length;
            const warns = lintEntries.filter((entry) => entry.level === "warn").length;
            if (!lintEntries.length) {
                appendTaskRunnerOutput("info", "No lint problems", { task: label });
            } else {
                appendTaskRunnerOutput(
                    errors > 0 ? "error" : "warn",
                    `Lint found ${lintEntries.length} issue(s): ${errors} error(s), ${warns} warning(s)`,
                    { task: label }
                );
                lintEntries.slice(0, 24).forEach((entry) => {
                    const line = Number.isFinite(entry.line) ? Number(entry.line) + 1 : 1;
                    const ch = Number.isFinite(entry.ch) ? Number(entry.ch) + 1 : 1;
                    appendTaskRunnerOutput(entry.level, `${entry.fileName}:${line}:${ch} ${entry.message}`, {
                        task: label,
                        location: {
                            fileId: entry.fileId,
                            fileName: entry.fileName,
                            line: Number(entry.line) || 0,
                            ch: Number(entry.ch) || 0,
                        },
                    });
                });
            }
            return true;
        }

        if (id === "format-active") {
            const active = getActiveFile();
            if (!active) {
                appendTaskRunnerOutput("warn", "No active file", { task: label });
                return false;
            }
            const ok = await formatCurrentEditor({ announce: false });
            appendTaskRunnerOutput(ok ? "info" : "warn", ok ? `Formatted ${active.name}` : "Format skipped", {
                task: label,
                location: ok ? { fileId: active.id, fileName: active.name, line: 0, ch: 0 } : null,
            });
            return ok;
        }

        if (id === "save-all") {
            const dirtyBefore = getDirtyFiles().length;
            const saved = saveAllFiles({ announce: false });
            if (saved) {
                appendTaskRunnerOutput("info", `Saved ${dirtyBefore} file(s)`, { task: label });
            } else {
                appendTaskRunnerOutput("info", "No unsaved files", { task: label });
            }
            return saved;
        }

        appendTaskRunnerOutput("warn", `Unknown task: ${id}`, { task: label });
        return false;
    } catch (err) {
        appendTaskRunnerOutput("error", `${label} failed: ${String(err?.message || err)}`, { task: label });
        return false;
    } finally {
        const endedAt = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        const duration = formatTaskRunnerDuration(endedAt - startedAt);
        appendTaskRunnerOutput("info", `${label} finished in ${duration}`, { task: label });
        setTaskRunnerBusy(false, "Idle");
    }
}

function clearTaskRunnerOutput() {
    taskRunnerEntries = [];
    renderTaskRunnerOutput();
    status.set("Task output cleared");
}

function wireTaskRunner() {
    renderTaskRunnerOutput();
    setTaskRunnerBusy(false, "Idle");
    el.taskRunAll?.addEventListener("click", async () => {
        await runTaskRunnerTask("run-all");
    });
    el.taskRunApp?.addEventListener("click", async () => {
        await runTaskRunnerTask("run-app");
    });
    el.taskRunLint?.addEventListener("click", async () => {
        await runTaskRunnerTask("lint-workspace");
    });
    el.taskRunFormat?.addEventListener("click", async () => {
        await runTaskRunnerTask("format-active");
    });
    el.taskRunSaveAll?.addEventListener("click", async () => {
        await runTaskRunnerTask("save-all");
    });
    el.taskRunnerClear?.addEventListener("click", () => clearTaskRunnerOutput());
    el.taskRunnerOutput?.addEventListener("click", (event) => {
        const row = event.target.closest("[data-task-open-file-id]");
        if (!row) return;
        const fileId = row.dataset.taskOpenFileId;
        if (!fileId) return;
        const line = Number(row.dataset.taskOpenLine || 0);
        const ch = Number(row.dataset.taskOpenCh || 0);
        jumpToFileLocation(fileId, line, ch);
    });
}

function isSandboxWindowOpen() {
    return Boolean(sandboxWindow && !sandboxWindow.closed);
}

function getRunnerFrame() {
    if (isSandboxWindowOpen()) {
        if (!sandboxPopoutFrame) {
            sandboxPopoutFrame = sandboxWindow?.document?.getElementById("runnerPopout") || null;
        }
        if (sandboxPopoutFrame) return sandboxPopoutFrame;
    }
    return el.runner;
}

function getRunnerWindow() {
    return getRunnerFrame()?.contentWindow;
}

function buildSandboxPopoutHtml() {
    const title = `${APP.NAME} Sandbox`;
    return `<!doctype html>
<html lang="en" data-theme="${currentTheme}">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <style>
            :root {
                color-scheme: dark;
                --bg: #0b0f14;
                --surface: #0f1117;
                --bar-bg: rgba(10, 14, 20, 0.96);
                --text: #e6edf3;
                --muted: rgba(164, 176, 192, 0.9);
                --border: rgba(148, 163, 184, 0.28);
                --border-strong: rgba(148, 163, 184, 0.45);
                --button-bg: rgba(12, 18, 26, 0.82);
                --button-hover: rgba(20, 28, 38, 0.9);
                --runner-bg: #0b0f14;
            }
            :root[data-theme="light"] {
                color-scheme: light;
                --bg: #f6f7fb;
                --surface: #ffffff;
                --bar-bg: #ffffff;
                --text: #0f172a;
                --muted: rgba(71, 85, 105, 0.8);
                --border: rgba(148, 163, 184, 0.45);
                --border-strong: rgba(148, 163, 184, 0.6);
                --button-bg: #ffffff;
                --button-hover: #f1f5f9;
                --runner-bg: #f8fafc;
            }
            :root[data-theme="purple"] {
                color-scheme: dark;
                --bg: #120a1f;
                --surface: #1b1230;
                --bar-bg: rgba(18, 10, 31, 0.96);
                --text: #f3e8ff;
                --muted: rgba(196, 181, 253, 0.86);
                --border: rgba(167, 139, 250, 0.36);
                --border-strong: rgba(192, 132, 252, 0.6);
                --button-bg: rgba(36, 21, 61, 0.86);
                --button-hover: rgba(52, 30, 87, 0.92);
                --runner-bg: #140b24;
            }
            * { box-sizing: border-box; }
            html, body { margin: 0; height: 100%; }
            body {
                background: var(--bg);
                color: var(--text);
                font-family: "Space Grotesk", "Segoe UI", system-ui, sans-serif;
            }
            .bar {
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 12px;
                border-bottom: 1px solid var(--border);
                background: var(--bar-bg);
                position: relative;
            }
            .label {
                font-size: 12px;
                letter-spacing: 0.3px;
                text-transform: uppercase;
                color: var(--muted);
                position: absolute;
                left: 12px;
            }
            .actions {
                display: inline-flex;
                gap: 6px;
                align-items: center;
            }
            button {
                appearance: none;
                border: 1px solid var(--border);
                background: var(--button-bg);
                color: var(--text);
                padding: 6px 10px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                position: relative;
            }
            button:hover {
                border-color: var(--border-strong);
                background: var(--button-hover);
            }
            button[data-tip]::after {
                content: attr(data-tip);
                position: absolute;
                left: 50%;
                top: calc(100% + 8px);
                transform: translateX(-50%) translateY(-2px);
                padding: 6px 8px;
                border-radius: 8px;
                border: 1px solid var(--border);
                background: var(--surface);
                color: var(--text);
                font-size: 11px;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                box-shadow: 0 12px 26px rgba(15, 23, 42, 0.18);
                transition: opacity 0.12s ease, transform 0.12s ease;
                z-index: 2;
            }
            button[data-tip]::before {
                content: "";
                position: absolute;
                left: 50%;
                top: calc(100% + 2px);
                transform: translateX(-50%);
                border: 6px solid transparent;
                border-bottom: 0;
                border-top-color: var(--border);
                opacity: 0;
                transition: opacity 0.12s ease;
            }
            button[data-tip]:hover::after,
            button[data-tip]:focus-visible::after {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            button[data-tip]:hover::before,
            button[data-tip]:focus-visible::before {
                opacity: 1;
            }
            #runnerPopout {
                width: 100%;
                height: calc(100% - 36px);
                border: 0;
                display: block;
                background: transparent;
            }
        </style>
    </head>
    <body>
        <div class="bar">
            <div class="label">Sandbox</div>
            <div class="actions">
                <button id="dockBtn" type="button" data-tip="Dock the sandbox back into the IDE" aria-label="Dock the sandbox back into the IDE">Dock back</button>
            </div>
        </div>
        <iframe id="runnerPopout" sandbox="allow-scripts" title="${title}"></iframe>
        <script>
            const openerRef = window.opener;
            const dockBtn = document.getElementById("dockBtn");
            const setTheme = (theme) => {
                document.documentElement.setAttribute("data-theme", theme || "dark");
            };
            setTheme("${currentTheme}");
            const forward = (payload) => {
                if (openerRef && !openerRef.closed) {
                    openerRef.postMessage(payload, "*");
                }
            };
            dockBtn.addEventListener("click", () => {
                forward({ source: "fazide-popout", type: "dock_request" });
                window.close();
            });
            window.addEventListener("message", (event) => {
                const data = event.data;
                if (data && data.source === "fazide-theme") {
                    setTheme(data.theme);
                    return;
                }
                if (!data || data.source !== "fazide") return;
                forward(data);
            });
            window.addEventListener("beforeunload", () => {
                forward({ source: "fazide-popout", type: "closed" });
            });
        </script>
    </body>
</html>`;
}

function setSandboxPopoutUI() {
    if (el.btnPopoutSandbox) {
        el.btnPopoutSandbox.textContent = isSandboxWindowOpen() ? "Dock" : "Pop out";
    }
    if (el.btnRunnerFull) {
        const disabled = isSandboxWindowOpen();
        el.btnRunnerFull.disabled = disabled;
        el.btnRunnerFull.title = disabled ? "Sandbox is popped out" : "";
    }
    if (el.appShell) {
        el.appShell.setAttribute("data-sandbox-window", isSandboxWindowOpen() ? "open" : "closed");
    }
}

function stopSandboxWindowMonitor() {
    if (!sandboxWindowMonitor) return;
    clearInterval(sandboxWindowMonitor);
    sandboxWindowMonitor = null;
}

function cleanupSandboxWindow() {
    stopSandboxWindowMonitor();
    sandboxWindow = null;
    sandboxPopoutFrame = null;
    setSandboxPopoutUI();
}

function startSandboxWindowMonitor() {
    stopSandboxWindowMonitor();
    sandboxWindowMonitor = setInterval(() => {
        if (!isSandboxWindowOpen()) {
            closeSandboxWindow({ focusMain: false });
        }
    }, 400);
}

function openSandboxWindow() {
    if (isSandboxWindowOpen()) {
        sandboxWindow.focus();
        return;
    }
    if (runnerFullscreen) {
        setRunnerFullscreen(false);
    }
    sandboxRestoreState = { shouldRestore: layoutState.sandboxOpen };
    sandboxWindow = window.open("", "fazide-sandbox", "width=520,height=640");
    if (!sandboxWindow) {
        logger.append("error", ["Pop-out blocked by the browser. Allow pop-ups to use this."]);
        return;
    }
    sandboxWindow.document.open();
    sandboxWindow.document.write(buildSandboxPopoutHtml());
    sandboxWindow.document.close();
    sandboxPopoutFrame = sandboxWindow.document.getElementById("runnerPopout");
    if (sandboxPopoutFrame) {
        sandboxPopoutFrame.addEventListener("load", syncInspectAfterLoad);
    }
    startSandboxWindowMonitor();
    setSandboxPopoutUI();
    if (layoutState.sandboxOpen) {
        setPanelOpen("sandbox", false);
    }
}

function closeSandboxWindow({ focusMain = true } = {}) {
    const shouldRestore = sandboxRestoreState.shouldRestore;
    sandboxRestoreState.shouldRestore = false;
    if (!isSandboxWindowOpen()) {
        cleanupSandboxWindow();
        if (shouldRestore) setPanelOpen("sandbox", true);
        return;
    }
    sandboxWindow.close();
    cleanupSandboxWindow();
    if (shouldRestore) setPanelOpen("sandbox", true);
    if (focusMain) window.focus();
}

function toggleSandboxPopout() {
    if (isSandboxWindowOpen()) {
        closeSandboxWindow();
    } else {
        openSandboxWindow();
    }
}

function onPopoutMessage(event) {
    const data = event.data;
    if (!data || data.source !== "fazide-popout") return;
    if (data.type === "dock_request") {
        closeSandboxWindow();
        return;
    }
    if (data.type === "closed") {
        closeSandboxWindow({ focusMain: false });
    }
}

function initDocking() {
    if (!el.dockOverlay) return;
    const overlay = el.dockOverlay;
    const zones = Array.from(overlay.querySelectorAll(".dock-zone"));
    const handles = Array.from(document.querySelectorAll(".drag-handle[data-panel]"));
    const getPanelEl = (panel) => {
        if (panel === "files") return el.side;
        if (panel === "editor") return el.editorPanel;
        if (panel === "sandbox") return el.sandboxPanel;
        if (panel === "log") return el.logPanel;
        if (panel === "tools") return el.toolsPanel;
        return null;
    };
    const panelLabels = {
        files: "Files",
        editor: "Editor",
        sandbox: "Sandbox",
        log: "Console",
        tools: "Tools",
    };

    if (!zones.length || !handles.length) return;

    const setOverlayOpen = (open) => {
        overlay.setAttribute("data-active", open ? "true" : "false");
        overlay.setAttribute("aria-hidden", open ? "false" : "true");
    };

    let activeZone = null;
    let activePanel = null;
    let activePanelEl = null;
    let dragGhost = null;
    let dragOffset = { x: 0, y: 0 };

    const updateActiveZone = (zone) => {
        if (activeZone === zone) return;
        if (activeZone) activeZone.removeAttribute("data-active");
        activeZone = zone;
        if (activeZone) activeZone.setAttribute("data-active", "true");
    };

    const applyDrop = () => {
        if (!activeZone || !activePanel) return;
        const zoneName = activeZone.getAttribute("data-dock-zone");
        if (!zoneName) return;
        if (zoneName === "center") {
            applyLayoutPreset("studio");
            return;
        }
        if (zoneName === "left") {
            movePanelToRow(activePanel, "top", 0);
            return;
        }
        if (zoneName === "right") {
            movePanelToRow(activePanel, "top", (layoutState.panelRows?.top || []).length);
            return;
        }
        if (zoneName === "bottom") {
            movePanelToRow(activePanel, "bottom", 0);
        }
    };

    handles.forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            const panel = handle.getAttribute("data-panel");
            if (!panel) return;
            event.preventDefault();
            activePanel = panel;
            activePanelEl = getPanelEl(panel);
            if (activePanelEl) {
                activePanelEl.classList.add("panel-floating", "panel-drag-source");
                const rect = activePanelEl.getBoundingClientRect();
                dragOffset = {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top,
                };
                dragGhost = document.createElement("div");
                dragGhost.className = "panel-ghost";
                dragGhost.setAttribute("data-panel", panel);
                dragGhost.style.width = `${rect.width}px`;
                dragGhost.style.height = `${rect.height}px`;
                dragGhost.innerHTML = `<div class="panel-ghost-title">${panelLabels[panel] || panel}</div>`;
                document.body.appendChild(dragGhost);
                dragGhost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(-0.35deg) scale(1.02)`;
            }
            setOverlayOpen(true);
            document.body?.classList.add("dock-dragging");
            handle.setPointerCapture(event.pointerId);

            const onMove = (moveEvent) => {
                const elAt = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
                const zone = elAt ? elAt.closest(".dock-zone") : null;
                updateActiveZone(zone);
                if (dragGhost) {
                    const nextX = moveEvent.clientX - dragOffset.x;
                    const nextY = moveEvent.clientY - dragOffset.y;
                    dragGhost.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) rotate(-0.35deg) scale(1.02)`;
                }
            };

            const onEnd = () => {
                handle.releasePointerCapture(event.pointerId);
                handle.removeEventListener("pointermove", onMove);
                handle.removeEventListener("pointerup", onEnd);
                handle.removeEventListener("pointercancel", onEnd);
                document.body?.classList.remove("dock-dragging");
                applyDrop();
                updateActiveZone(null);
                setOverlayOpen(false);
                if (activePanelEl) activePanelEl.classList.remove("panel-floating", "panel-drag-source");
                if (dragGhost) {
                    dragGhost.remove();
                    dragGhost = null;
                }
                activePanel = null;
                activePanelEl = null;
            };

            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onEnd);
            handle.addEventListener("pointercancel", onEnd);
        });
    });
}

function initSplitters() {
    const wireSplitter = (splitter, panel, getWidth, setWidth, boundsKey, label) => {
        if (!splitter) return;
        splitter.addEventListener("pointerdown", (event) => {
            if (!isPanelOpen(panel)) return;
            event.preventDefault();
            document.body?.setAttribute("data-resize", "col");
            const startX = event.clientX;
            const startWidth = getWidth();
            const bounds = getLayoutBounds()[boundsKey];
            const leftName = splitter.dataset.resizeLeft;
            const rightName = splitter.dataset.resizeRight;
            const leftControl = getWidthControl(leftName);
            const rightControl = getWidthControl(rightName);
            const row = getPanelRow(leftName || rightName || panel);
            const leftBounds = leftControl ? getLayoutBounds()[leftControl.boundsKey] : null;
            const rightBounds = rightControl ? getLayoutBounds()[rightControl.boundsKey] : null;
            const leftEffective = leftControl && !rightControl ? getEffectiveBounds(leftName, row, leftBounds) : leftBounds;
            const rightEffective = rightControl && !leftControl ? getEffectiveBounds(rightName, row, rightBounds) : rightBounds;
            const startLeft = leftControl ? leftControl.get() : 0;
            const startRight = rightControl ? rightControl.get() : 0;
            const leftEl = getPanelElement(leftName);
            const rightEl = getPanelElement(rightName);
            setResizeActive([leftEl, rightEl], true);
            hideRowGuide();
            showColGuideForPanels(leftEl, rightEl);
            const onMove = (moveEvent) => {
                const delta = moveEvent.clientX - startX;
                if (leftControl && rightControl) {
                    const minDelta = Math.max(
                        leftBounds.min - startLeft,
                        startRight - rightBounds.max
                    );
                    const maxDelta = Math.min(
                        leftBounds.max - startLeft,
                        startRight - rightBounds.min
                    );
                    const clamped = clamp(delta, minDelta, maxDelta);
                    leftControl.set(startLeft + clamped);
                    rightControl.set(startRight - clamped);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                if (leftControl && !rightControl) {
                    const next = clamp(startLeft + delta, leftEffective.min, leftEffective.max);
                    leftControl.set(next);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                if (!leftControl && rightControl) {
                    const next = clamp(startRight - delta, rightEffective.min, rightEffective.max);
                    rightControl.set(next);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                const next = clamp(startWidth + delta, bounds.min, bounds.max);
                setWidth(next);
                showColGuideForPanels(leftEl, rightEl);
            };

            const onCancel = () => {
                splitter.releasePointerCapture(event.pointerId);
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                document.body?.removeAttribute("data-resize");
                setResizeActive([leftEl, rightEl], false);
                hideColGuide();
                hideRowGuide();
                persistLayout();
            };

            const onUp = () => {
                splitter.releasePointerCapture(event.pointerId);
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                document.body?.removeAttribute("data-resize");
                setResizeActive([leftEl, rightEl], false);
                hideColGuide();
                hideRowGuide();
                persistLayout();
            };

            splitter.setPointerCapture(event.pointerId);
            splitter.addEventListener("pointermove", onMove);
            splitter.addEventListener("pointerup", onUp);
            splitter.addEventListener("pointercancel", onCancel);
        });

        splitter.addEventListener("dblclick", () => {
            const fallback = LAYOUT_PRESETS.studio;
            if (panel === "log") setWidth(fallback.logWidth);
            if (panel === "files") setWidth(fallback.sidebarWidth);
            if (panel === "sandbox") setWidth(fallback.sandboxWidth);
            persistLayout();
            pushDiag("info", `${label} width reset.`);
        });

        splitter.addEventListener("keydown", (event) => {
            const step = event.altKey ? 1 : event.shiftKey ? 40 : 12;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                const dir = event.key === "ArrowRight" ? 1 : -1;
                const leftName = splitter.dataset.resizeLeft;
                const rightName = splitter.dataset.resizeRight;
                const row = getPanelRow(leftName || rightName || panel);
                const leftControl = getWidthControl(leftName);
                const rightControl = getWidthControl(rightName);
                if (leftControl && rightControl) {
                    const leftBounds = getLayoutBounds()[leftControl.boundsKey];
                    const rightBounds = getLayoutBounds()[rightControl.boundsKey];
                    const delta = dir * step;
                    const minDelta = Math.max(
                        leftBounds.min - leftControl.get(),
                        rightControl.get() - rightBounds.max
                    );
                    const maxDelta = Math.min(
                        leftBounds.max - leftControl.get(),
                        rightControl.get() - rightBounds.min
                    );
                    const clamped = clamp(delta, minDelta, maxDelta);
                    leftControl.set(leftControl.get() + clamped);
                    rightControl.set(rightControl.get() - clamped);
                } else if (leftControl && !rightControl) {
                    const leftBounds = getLayoutBounds()[leftControl.boundsKey];
                    const leftEffective = getEffectiveBounds(leftName, row, leftBounds);
                    const next = clamp(leftControl.get() + dir * step, leftEffective.min, leftEffective.max);
                    leftControl.set(next);
                } else if (!leftControl && rightControl) {
                    const rightBounds = getLayoutBounds()[rightControl.boundsKey];
                    const rightEffective = getEffectiveBounds(rightName, row, rightBounds);
                    const next = clamp(rightControl.get() - dir * step, rightEffective.min, rightEffective.max);
                    rightControl.set(next);
                } else {
                    const bounds = getLayoutBounds()[boundsKey];
                    const next = clamp(getWidth() + dir * step, bounds.min, bounds.max);
                    setWidth(next);
                }
                persistLayout();
                event.preventDefault();
            }
        });
    };

    wireSplitter(el.splitLog, "log", () => layoutState.logWidth, setLogWidth, "logWidth", "Console");
    wireSplitter(el.splitFiles, "files", () => layoutState.sidebarWidth, setSidebarWidth, "sidebar", "Files");
    wireSplitter(el.splitSandbox, "sandbox", () => layoutState.sandboxWidth, setSandboxWidth, "sandboxWidth", "Sandbox");
    wireSplitter(el.splitTools, "tools", () => layoutState.toolsWidth, setToolsWidth, "toolsWidth", "Tools");

    const wireRowSplitter = (splitter) => {
        if (!splitter) return;
        splitter.addEventListener("pointerdown", (event) => {
            if (!rowHasOpenPanels("bottom")) return;
            event.preventDefault();
            document.body?.setAttribute("data-resize", "row");
            const startY = event.clientY;
            const startHeight = layoutState.bottomHeight;
            const bounds = getLayoutBounds().bottomHeight;
            const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
            const minTop = rowHasOpenPanels("top") ? 180 : 0;
            const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
            setResizeActive([el.workspaceTop, el.workspaceBottom], true);
            hideColGuide();
            const boundaryStart = getRowBoundaryY();
            if (boundaryStart !== null) showRowGuideAt(boundaryStart);

            const onMove = (moveEvent) => {
                const delta = moveEvent.clientY - startY;
                const next = clamp(startHeight - delta, bounds.min, maxBottom);
                setBottomHeight(next);
                const boundary = getRowBoundaryY();
                if (boundary !== null) showRowGuideAt(boundary);
            };

            const onCancel = () => {
                splitter.releasePointerCapture(event.pointerId);
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                document.body?.removeAttribute("data-resize");
                setResizeActive([el.workspaceTop, el.workspaceBottom], false);
                hideRowGuide();
                hideColGuide();
                persistLayout();
            };

            const onUp = () => {
                splitter.releasePointerCapture(event.pointerId);
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                document.body?.removeAttribute("data-resize");
                setResizeActive([el.workspaceTop, el.workspaceBottom], false);
                hideRowGuide();
                hideColGuide();
                persistLayout();
            };

            splitter.setPointerCapture(event.pointerId);
            splitter.addEventListener("pointermove", onMove);
            splitter.addEventListener("pointerup", onUp);
            splitter.addEventListener("pointercancel", onCancel);
        });

        splitter.addEventListener("keydown", (event) => {
            const step = event.altKey ? 1 : event.shiftKey ? 40 : 12;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                const dir = event.key === "ArrowDown" ? 1 : -1;
                const bounds = getLayoutBounds().bottomHeight;
                const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
                const minTop = rowHasOpenPanels("top") ? 180 : 0;
                const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
                const next = clamp(layoutState.bottomHeight - dir * step, bounds.min, maxBottom);
                setBottomHeight(next);
                persistLayout();
                event.preventDefault();
            }
        });
    };

    wireRowSplitter(el.splitRow);
}

function initEdgeResizing() {
    if (!el.workspace) return;

    ensureRowGuide();
    ensureColGuide();

    const getEdgeDir = (rect, x) => {
        if (x - rect.left <= EDGE_RESIZE_GRAB) return "left";
        if (rect.right - x <= EDGE_RESIZE_GRAB) return "right";
        return null;
    };

    const getNeighbor = (row, panel, dir) => {
        const list = layoutState.panelRows?.[row] || [];
        const idx = list.indexOf(panel);
        if (idx === -1) return null;
        const step = dir === "left" ? -1 : 1;
        let i = idx + step;
        while (i >= 0 && i < list.length) {
            const name = list[i];
            if (isPanelOpen(name)) return name;
            i += step;
        }
        return null;
    };

    const startRowResize = (startEvent) => {
        if (!rowHasOpenPanels("bottom")) return;
        const bounds = getLayoutBounds().bottomHeight;
        const startY = startEvent.clientY;
        const startHeight = layoutState.bottomHeight;
        const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
        const minTop = rowHasOpenPanels("top") ? 180 : 0;
        const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));

        document.body?.setAttribute("data-resize", "row");
        document.body?.removeAttribute("data-resize-preview");
        hideColGuide();
        const boundaryStart = getRowBoundaryY();
        if (boundaryStart !== null) showRowGuideAt(boundaryStart);
        const onMove = (moveEvent) => {
            const delta = moveEvent.clientY - startY;
            const next = clamp(startHeight - delta, bounds.min, maxBottom);
            setBottomHeight(next);
            const boundary = getRowBoundaryY();
            if (boundary !== null) showRowGuideAt(boundary);
        };

        const onEnd = (event) => {
            el.workspace.removeEventListener("pointermove", onMove);
            el.workspace.removeEventListener("pointerup", onEnd);
            el.workspace.removeEventListener("pointercancel", onEnd);
            document.body?.removeAttribute("data-resize");
            document.body?.removeAttribute("data-resize-preview");
            hideRowGuide();
            hideColGuide();
            persistLayout();
            if (event?.pointerId) {
                try {
                    el.workspace.releasePointerCapture(event.pointerId);
                } catch (err) {
                    // no-op
                }
            }
        };

        if (startEvent.pointerId) {
            try {
                el.workspace.setPointerCapture(startEvent.pointerId);
            } catch (err) {
                // no-op
            }
        }
        el.workspace.addEventListener("pointermove", onMove);
        el.workspace.addEventListener("pointerup", onEnd);
        el.workspace.addEventListener("pointercancel", onEnd);
    };

    const startResize = (panel, dir, startEvent) => {
        const row = getPanelRow(panel);
        const neighbor = getNeighbor(row, panel, dir);

        const leftName = dir === "right" ? panel : neighbor;
        const rightName = dir === "right" ? neighbor : panel;
        const leftControl = getWidthControl(leftName);
        const rightControl = getWidthControl(rightName);

        if (!leftControl && !rightControl) return;

        const leftBounds = leftControl ? getLayoutBounds()[leftControl.boundsKey] : null;
        const rightBounds = rightControl ? getLayoutBounds()[rightControl.boundsKey] : null;
        const leftEffective = leftControl && !rightControl ? getEffectiveBounds(leftName, row, leftBounds) : leftBounds;
        const rightEffective = rightControl && !leftControl ? getEffectiveBounds(rightName, row, rightBounds) : rightBounds;
        const startLeft = leftControl ? leftControl.get() : 0;
        const startRight = rightControl ? rightControl.get() : 0;
        const leftEl = getPanelElement(leftName);
        const rightEl = getPanelElement(rightName);
        const startX = startEvent.clientX;

        document.body?.setAttribute("data-resize", "col");
        document.body?.removeAttribute("data-resize-preview");
        hideRowGuide();
        showColGuideForPanels(leftEl, rightEl);
        const onMove = (moveEvent) => {
            const delta = moveEvent.clientX - startX;
            if (leftControl && rightControl) {
                const minDelta = Math.max(
                    leftBounds.min - startLeft,
                    startRight - rightBounds.max
                );
                const maxDelta = Math.min(
                    leftBounds.max - startLeft,
                    startRight - rightBounds.min
                );
                const clamped = clamp(delta, minDelta, maxDelta);
                leftControl.set(startLeft + clamped);
                rightControl.set(startRight - clamped);
                showColGuideForPanels(leftEl, rightEl);
                return;
            }
            if (leftControl && !rightControl) {
                const next = clamp(startLeft + delta, leftEffective.min, leftEffective.max);
                leftControl.set(next);
                showColGuideForPanels(leftEl, rightEl);
                return;
            }
            if (!leftControl && rightControl) {
                const next = clamp(startRight - delta, rightEffective.min, rightEffective.max);
                rightControl.set(next);
                showColGuideForPanels(leftEl, rightEl);
            }
        };

        const onEnd = (event) => {
            el.workspace.removeEventListener("pointermove", onMove);
            el.workspace.removeEventListener("pointerup", onEnd);
            el.workspace.removeEventListener("pointercancel", onEnd);
            document.body?.removeAttribute("data-resize");
            document.body?.removeAttribute("data-resize-preview");
            hideColGuide();
            hideRowGuide();
            persistLayout();
            if (event?.pointerId) {
                try {
                    el.workspace.releasePointerCapture(event.pointerId);
                } catch (err) {
                    // no-op
                }
            }
        };

        if (startEvent.pointerId) {
            try {
                el.workspace.setPointerCapture(startEvent.pointerId);
            } catch (err) {
                // no-op
            }
        }
        el.workspace.addEventListener("pointermove", onMove);
        el.workspace.addEventListener("pointerup", onEnd);
        el.workspace.addEventListener("pointercancel", onEnd);
    };

    el.workspace.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        if (event.target.closest(".drag-handle")) return;
        const boundary = getRowBoundaryY();
        if (boundary !== null && Math.abs(event.clientY - boundary) <= EDGE_RESIZE_GRAB) {
            event.preventDefault();
            startRowResize(event);
            return;
        }
        const panelEl = event.target.closest(".card");
        if (!panelEl || !el.workspace.contains(panelEl)) return;
        const panel = getPanelNameFromElement(panelEl);
        if (!panel) return;
        const rect = panelEl.getBoundingClientRect();
        const dir = getEdgeDir(rect, event.clientX);
        if (!dir) return;
        event.preventDefault();
        startResize(panel, dir, event);
    });

    el.workspace.addEventListener("pointermove", (event) => {
        if (rowHasOpenPanels("bottom")) {
            const boundary = getRowBoundaryY();
            if (boundary !== null && Math.abs(event.clientY - boundary) <= EDGE_RESIZE_GRAB) {
                document.body?.setAttribute("data-resize-preview", "row");
                showRowGuideAt(boundary);
                hideColGuide();
                return;
            }
        }
        hideRowGuide();
        const panelEl = event.target.closest(".card");
        if (!panelEl || !el.workspace.contains(panelEl)) {
            document.body?.removeAttribute("data-resize-preview");
            hideColGuide();
            return;
        }
        const rect = panelEl.getBoundingClientRect();
        const dir = getEdgeDir(rect, event.clientX);
        if (dir) {
            document.body?.setAttribute("data-resize-preview", "col");
            const edgeX = dir === "left" ? rect.left : rect.right;
            showColGuideAt(edgeX);
        } else {
            document.body?.removeAttribute("data-resize-preview");
            hideColGuide();
        }
    });

    el.workspace.addEventListener("pointerleave", () => {
        document.body?.removeAttribute("data-resize-preview");
        hideRowGuide();
        hideColGuide();
    });
}

function isPanelOpen(panel) {
    if (panel === "log") return layoutState.logOpen;
    if (panel === "editor") return layoutState.editorOpen;
    if (panel === "files") return layoutState.filesOpen;
    if (panel === "sandbox") return layoutState.sandboxOpen;
    if (panel === "tools") return layoutState.toolsOpen;
    return true;
}

function syncPanelToggles() {
    if (el.btnToggleLog) {
        el.btnToggleLog.setAttribute("aria-expanded", layoutState.logOpen ? "true" : "false");
        el.btnToggleLog.setAttribute("data-panel-open", layoutState.logOpen ? "true" : "false");
        el.btnToggleLog.textContent = "Console";
    }
    if (el.btnToggleEditor) {
        el.btnToggleEditor.setAttribute("aria-expanded", layoutState.editorOpen ? "true" : "false");
        el.btnToggleEditor.setAttribute("data-panel-open", layoutState.editorOpen ? "true" : "false");
        el.btnToggleEditor.textContent = "Editor";
    }
    if (el.btnToggleFiles) {
        el.btnToggleFiles.setAttribute("aria-expanded", layoutState.filesOpen ? "true" : "false");
        el.btnToggleFiles.setAttribute("data-panel-open", layoutState.filesOpen ? "true" : "false");
        el.btnToggleFiles.textContent = "Files";
    }
    if (el.btnToggleSandbox) {
        el.btnToggleSandbox.setAttribute("aria-expanded", layoutState.sandboxOpen ? "true" : "false");
        el.btnToggleSandbox.setAttribute("data-panel-open", layoutState.sandboxOpen ? "true" : "false");
        el.btnToggleSandbox.textContent = "Sandbox";
    }
    if (el.btnToggleTools) {
        el.btnToggleTools.setAttribute("aria-expanded", layoutState.toolsOpen ? "true" : "false");
        el.btnToggleTools.setAttribute("data-panel-open", layoutState.toolsOpen ? "true" : "false");
        el.btnToggleTools.textContent = "Tools";
    }
}

function syncQuickBar() {
    if (el.btnToggleHeader) {
        el.btnToggleHeader.setAttribute("aria-expanded", layoutState.headerOpen ? "true" : "false");
        el.btnToggleHeader.setAttribute("data-panel-open", layoutState.headerOpen ? "true" : "false");
        el.btnToggleHeader.textContent = "Header";
    }
    if (el.quickHeader) {
        el.quickHeader.setAttribute("aria-expanded", layoutState.headerOpen ? "true" : "false");
        el.quickHeader.setAttribute("data-panel-open", layoutState.headerOpen ? "true" : "false");
        el.quickHeader.textContent = "Header";
    }
    if (!el.quickBar) return;
    const visible = !layoutState.headerOpen;
    el.quickBar.setAttribute("data-visible", visible ? "true" : "false");
    el.quickBar.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setHeaderOpen(open) {
    layoutState.headerOpen = open;
    applyLayout();
    persistLayout();
}

function setFooterOpen(open) {
    layoutState.footerOpen = open;
    applyLayout();
    persistLayout();
}

function setPanelOpen(panel, open) {
    if (panel === "log") layoutState.logOpen = open;
    if (panel === "editor") layoutState.editorOpen = open;
    if (panel === "files") layoutState.filesOpen = open;
    if (panel === "sandbox") {
        if (open && isSandboxWindowOpen()) {
            sandboxWindow.focus();
            layoutState.sandboxOpen = false;
            applyLayout();
            syncPanelToggles();
            persistLayout();
            syncLayoutControls();
            return;
        }
        layoutState.sandboxOpen = open;
    }
    if (panel === "tools") layoutState.toolsOpen = open;
    applyLayout();
    syncPanelToggles();
    persistLayout();
}

function togglePanel(panel) {
    if (panel === "log") return setPanelOpen("log", !layoutState.logOpen);
    if (panel === "editor") return setPanelOpen("editor", !layoutState.editorOpen);
    if (panel === "files") return setPanelOpen("files", !layoutState.filesOpen);
    if (panel === "sandbox") return setPanelOpen("sandbox", !layoutState.sandboxOpen);
    if (panel === "tools") return setPanelOpen("tools", !layoutState.toolsOpen);
}

function setPanelOrder(panel, index) {
    const row = getPanelRow(panel);
    const order = Array.isArray(layoutState.panelRows?.[row]) ? [...layoutState.panelRows[row]] : [];
    const currentIndex = order.indexOf(panel);
    if (currentIndex === -1) return;
    const target = Number(index);
    const clamped = Number.isFinite(target) ? clamp(target, 0, order.length - 1) : currentIndex;
    order.splice(currentIndex, 1);
    order.splice(clamped, 0, panel);
    layoutState.panelRows[row] = order;
    applyLayout();
    persistLayout();
    syncLayoutControls();
}

function movePanelToRow(panel, row, index = 0) {
    const targetRow = row === "bottom" ? "bottom" : "top";
    const otherRow = targetRow === "top" ? "bottom" : "top";
    const nextRows = normalizePanelRows(layoutState.panelRows);
    nextRows[otherRow] = nextRows[otherRow].filter((name) => name !== panel);
    nextRows[targetRow] = nextRows[targetRow].filter((name) => name !== panel);
    const target = nextRows[targetRow];
    const clamped = clamp(Number(index), 0, target.length);
    target.splice(clamped, 0, panel);
    layoutState.panelRows = nextRows;
    applyLayout();
    persistLayout();
    syncLayoutControls();
}

function setPanelGap(value) {
    layoutState.panelGap = Math.round(value);
    if (el.appShell) {
        el.appShell.style.setProperty("--panel-gap", `${layoutState.panelGap}px`);
    }
}

function setPanelRadius(value) {
    layoutState.panelRadius = Math.round(value);
    if (document.documentElement) {
        document.documentElement.style.setProperty("--radius", `${layoutState.panelRadius}px`);
        document.documentElement.style.setProperty("--radius-sm", `${Math.max(4, Math.round(layoutState.panelRadius * 0.8))}px`);
    }
}

function applyLayoutPreset(name) {
    const preset = LAYOUT_PRESETS[name];
    if (!preset) return;
    layoutState = sanitizeLayoutState({ ...layoutState, ...preset });
    applyLayout();
    persistLayout();
    syncLayoutControls();
    if (name === "studio") {
        requestAnimationFrame(() => syncDefaultEditorSandboxWidth({ persist: true }));
    }
}

/**
 * v0 formatter:
 * - normalize CRLF -> LF
 * - trim trailing spaces per line
 * - ensure final newline
 * 
 * Notes:
 * - This is intentionally "basic" formatting to keep behavior predictable.
 * - It avoids changing indentation or code semantics.
 * - It's safe for most snippets and keeps diffs clean.
 */

function formatBasic(code) {
  const normalized = code.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((l) => l.replace(/\s+$/g, ""));
  return lines.join("\n").trimEnd() + "\n";
}

async function formatCurrentEditor({ announce = true } = {}) {
    const source = editor.get();
    const mode = editorSettings.formatterMode || "auto";

    // Keep UX immediate: apply basic formatting synchronously before async formatter load.
    if (mode !== "prettier") {
        const basic = formatBasic(source);
        setEditorValue(basic, { silent: true });
        updateActiveFileCode(basic);
        queueEditorLint("format-basic");
        if (mode === "basic") {
            if (announce) {
                logger.append("system", ["Formatted (basic)."]);
                status.set("Formatted (basic)");
            }
            return { ok: true, method: "basic", code: basic };
        }
    }

    const result = await formatter.formatJavaScript(editor.get(), {
        mode,
        tabSize: editorSettings.tabSize,
        printWidth: editorSettings.lineWrapping ? 100 : 120,
        singleQuote: false,
        semi: true,
    });
    if (!result.ok) {
        if (announce) {
            status.set("Format failed");
            logger.append("error", [`Format failed: ${String(result.error || "unknown error")}`]);
        }
        return result;
    }
    const formatted = String(result.code ?? source);
    setEditorValue(formatted, { silent: true });
    updateActiveFileCode(formatted);
    queueEditorLint("format");
    if (announce) {
        const label = result.method || "basic";
        logger.append("system", [`Formatted (${label}).`]);
        status.set(`Formatted (${label})`);
    }
    return result;
}

function buildSavedDiffPreview(savedCode, currentCode) {
    const saved = String(savedCode ?? "").split("\n");
    const current = String(currentCode ?? "").split("\n");
    const max = Math.max(saved.length, current.length);
    const out = [];
    let changed = 0;
    for (let i = 0; i < max; i += 1) {
        const before = saved[i];
        const after = current[i];
        if (before === after) {
            out.push(`  ${before ?? ""}`);
            continue;
        }
        changed += 1;
        if (before !== undefined) out.push(`- ${before}`);
        if (after !== undefined) out.push(`+ ${after}`);
    }
    if (!changed) return "No unsaved differences.\n";
    return out.join("\n");
}

function renderEditorMirror() {
    if (!el.editorMirror) return;
    const active = getActiveFile();
    if (!editorSplitOpen) {
        el.editorMirror.setAttribute("data-open", "false");
        el.editorMirror.textContent = "";
        return;
    }
    el.editorMirror.setAttribute("data-open", "true");
    if (!active) {
        el.editorMirror.textContent = "No active file.";
        return;
    }
    el.editorMirror.textContent = buildSavedDiffPreview(active.savedCode, active.code);
}

function setEditorSplitOpen(open) {
    editorSplitOpen = Boolean(open);
    if (el.editorPanel) {
        el.editorPanel.setAttribute("data-editor-split", editorSplitOpen ? "true" : "false");
    }
    if (el.btnEditorSplit) {
        el.btnEditorSplit.setAttribute("data-active", editorSplitOpen ? "true" : "false");
    }
    renderEditorMirror();
}

function escapeHTML(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeRegExp(str) {
    return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeFileId() {
    return `file-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
}

function splitLeafExtension(leaf = "") {
    const value = String(leaf ?? "").trim();
    const dot = value.lastIndexOf(".");
    if (dot <= 0 || dot === value.length - 1) {
        return { stem: value, extension: "" };
    }
    return {
        stem: value.slice(0, dot),
        extension: value.slice(dot),
    };
}

function collapseDuplicateTerminalExtension(filePath = "") {
    const segments = splitPathSegments(filePath);
    if (!segments.length) return String(filePath || "");
    let leaf = segments.pop() || "";
    const parsed = splitLeafExtension(leaf);
    const extension = parsed.extension;
    if (!extension) {
        segments.push(leaf);
        return buildPathFromSegments(segments);
    }
    const lowerExt = extension.toLowerCase();
    const repeated = `${lowerExt}${lowerExt}`;
    let lowerLeaf = leaf.toLowerCase();
    while (lowerLeaf.endsWith(repeated)) {
        leaf = leaf.slice(0, -extension.length);
        lowerLeaf = leaf.toLowerCase();
    }
    segments.push(leaf);
    return buildPathFromSegments(segments);
}

function getFallbackFileExtension(fallback = FILE_DEFAULT_NAME) {
    const fallbackName = String(fallback ?? FILE_DEFAULT_NAME).trim() || FILE_DEFAULT_NAME;
    const fallbackLeaf = getFileBaseName(fallbackName) || FILE_DEFAULT_NAME;
    const parsed = splitLeafExtension(fallbackLeaf);
    return parsed.extension || ".js";
}

function normalizeFileName(name, fallback = FILE_DEFAULT_NAME) {
    const normalizedFallback = String(fallback ?? FILE_DEFAULT_NAME).trim() || FILE_DEFAULT_NAME;
    const fallbackExt = getFallbackFileExtension(normalizedFallback);
    const raw = String(name ?? "").trim();
    const source = raw || normalizedFallback;
    const segments = splitPathSegments(source);
    if (!segments.length) {
        const fallbackSegments = splitPathSegments(normalizedFallback);
        if (!fallbackSegments.length) {
            return `main${fallbackExt}`;
        }
        const fallbackLeaf = fallbackSegments.pop() || `main${fallbackExt}`;
        const parsedFallback = splitLeafExtension(fallbackLeaf);
        fallbackSegments.push(parsedFallback.extension ? fallbackLeaf : `${fallbackLeaf}${fallbackExt}`);
        return buildPathFromSegments(fallbackSegments);
    }
    let leaf = segments.pop() || FILE_DEFAULT_NAME;
    const parsedLeaf = splitLeafExtension(leaf);
    if (!parsedLeaf.extension) {
        leaf = `${leaf}${fallbackExt}`;
    }
    segments.push(leaf);
    return collapseDuplicateTerminalExtension(buildPathFromSegments(segments));
}

function normalizePathSlashes(value = "") {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");
}

function splitPathSegments(value = "") {
    return normalizePathSlashes(value)
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
}

function buildPathFromSegments(segments = []) {
    return (Array.isArray(segments) ? segments : [])
        .map((segment) => String(segment || "").trim())
        .filter(Boolean)
        .join("/");
}

function getFileBaseName(fileName) {
    const segments = splitPathSegments(fileName);
    return segments.length ? segments[segments.length - 1] : normalizeFileName(fileName, FILE_DEFAULT_NAME);
}

function getFileDirectory(fileName) {
    const segments = splitPathSegments(fileName);
    if (segments.length <= 1) return "";
    segments.pop();
    return buildPathFromSegments(segments);
}

function getFolderBaseName(folderPath = "") {
    const segments = splitPathSegments(folderPath);
    return segments.length ? segments[segments.length - 1] : "";
}

function getFolderParentPath(folderPath = "") {
    const segments = splitPathSegments(folderPath);
    if (segments.length <= 1) return "";
    segments.pop();
    return buildPathFromSegments(segments);
}

function normalizeFolderPath(value, { allowEmpty = false } = {}) {
    const parts = splitPathSegments(value);
    if (!parts.length) return allowEmpty ? "" : "";
    return buildPathFromSegments(parts);
}

function validatePathSegments(segments = [], label = "Name") {
    const list = Array.isArray(segments) ? segments : [];
    if (!list.length) return { valid: false, message: `${label} required.` };
    for (const segment of list) {
        if (!segment) return { valid: false, message: `${label} required.` };
        if (segment === "." || segment === "..") {
            return { valid: false, message: "Path segments cannot be . or .." };
        }
        if (/[:*?"<>|]/.test(segment)) {
            return { valid: false, message: "Invalid characters: : * ? \" < > |" };
        }
    }
    return { valid: true, message: "" };
}

function normalizeFolderList(list = []) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((entry) => {
        const normalized = normalizeFolderPath(entry, { allowEmpty: true });
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        out.push(normalized);
    });
    return out;
}

function collectFolderPaths(list = files, explicitFolders = folders) {
    const out = new Set();
    const addFolderPath = (value) => {
        const segments = splitPathSegments(value);
        if (!segments.length) return;
        let current = "";
        segments.forEach((segment) => {
            current = current ? `${current}/${segment}` : segment;
            out.add(current);
        });
    };
    (Array.isArray(list) ? list : []).forEach((file) => {
        addFolderPath(getFileDirectory(file?.name || ""));
    });
    (Array.isArray(explicitFolders) ? explicitFolders : []).forEach((folderPath) => {
        addFolderPath(folderPath);
    });
    return out;
}

function folderPathExists(targetPath, { ignoreCase = false, excludePath = "" } = {}) {
    const normalizedTarget = normalizeFolderPath(targetPath, { allowEmpty: true });
    if (!normalizedTarget) return false;
    const normalizedExclude = normalizeFolderPath(excludePath, { allowEmpty: true });
    const available = collectFolderPaths(files);
    if (!ignoreCase) {
        if (!normalizedExclude) return available.has(normalizedTarget);
        return [...available].some((path) => path === normalizedTarget && path !== normalizedExclude);
    }
    const targetLower = normalizedTarget.toLowerCase();
    const excludeLower = normalizedExclude ? normalizedExclude.toLowerCase() : "";
    return [...available].some((path) => {
        const normalizedPath = normalizeFolderPath(path, { allowEmpty: true });
        if (!normalizedPath) return false;
        const pathLower = normalizedPath.toLowerCase();
        if (excludeLower && pathLower === excludeLower) return false;
        return pathLower === targetLower;
    });
}

function ensureUniqueFolderPath(targetPath, { ignoreCase = true } = {}) {
    const normalized = normalizeFolderPath(targetPath, { allowEmpty: true }) || "game";
    if (!folderPathExists(normalized, { ignoreCase })) return normalized;
    let index = 2;
    let candidate = `${normalized}(${index})`;
    while (folderPathExists(candidate, { ignoreCase })) {
        index += 1;
        candidate = `${normalized}(${index})`;
    }
    return candidate;
}

function pruneCollapsedFolderPaths() {
    const available = collectFolderPaths(files);
    [...collapsedFolderPaths].forEach((path) => {
        if (!available.has(path)) {
            collapsedFolderPaths.delete(path);
        }
    });
}

function isFolderExpanded(folderPath) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return true;
    return !collapsedFolderPaths.has(normalized);
}

function setFolderExpanded(folderPath, expanded) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    if (expanded) collapsedFolderPaths.delete(normalized);
    else collapsedFolderPaths.add(normalized);
}

function toggleFolderExpanded(folderPath) {
    const expanded = isFolderExpanded(folderPath);
    setFolderExpanded(folderPath, !expanded);
}

function expandFolderAncestors(fileName) {
    const segments = splitPathSegments(fileName);
    if (segments.length <= 1) return;
    segments.pop();
    let current = "";
    segments.forEach((segment) => {
        current = current ? `${current}/${segment}` : segment;
        collapsedFolderPaths.delete(current);
    });
}

function expandFolderPathAncestors(folderPath) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    let current = "";
    splitPathSegments(normalized).forEach((segment) => {
        current = current ? `${current}/${segment}` : segment;
        collapsedFolderPaths.delete(current);
    });
}

function ensureUniquePathInSet(targetPath, usedNames = new Set()) {
    const normalized = normalizeFileName(targetPath);
    const segments = splitPathSegments(normalized);
    const leaf = segments.pop() || FILE_DEFAULT_NAME;
    const parsed = splitLeafExtension(leaf);
    const baseStem = parsed.stem || leaf || "file";
    const extension = parsed.extension || getFallbackFileExtension(leaf);
    const prefix = segments.length ? `${buildPathFromSegments(segments)}/` : "";
    const usedNamesLower = new Set(
        [...usedNames].map((entry) => normalizePathSlashes(String(entry ?? "")).toLowerCase())
    );
    let candidate = normalized;
    let i = 2;
    while (usedNamesLower.has(candidate.toLowerCase())) {
        candidate = `${prefix}${baseStem}(${i})${extension}`;
        i += 1;
    }
    usedNames.add(candidate);
    return candidate;
}

function renameCollapsedFolderEntries(fromPath, toPath) {
    const from = normalizeFolderPath(fromPath, { allowEmpty: true });
    const to = normalizeFolderPath(toPath, { allowEmpty: true });
    if (!from || !to || from === to) return;
    const next = new Set();
    collapsedFolderPaths.forEach((path) => {
        if (path === from || path.startsWith(`${from}/`)) {
            next.add(`${to}${path.slice(from.length)}`);
        } else {
            next.add(path);
        }
    });
    collapsedFolderPaths.clear();
    next.forEach((path) => collapsedFolderPaths.add(path));
}

function collapseAllFolders() {
    const all = collectFolderPaths(files);
    collapsedFolderPaths.clear();
    all.forEach((path) => collapsedFolderPaths.add(path));
    renderFileList();
    status.set(`Collapsed ${all.size} folder${all.size === 1 ? "" : "s"}`);
    return all.size;
}

function expandAllFolders() {
    const count = collapsedFolderPaths.size;
    collapsedFolderPaths.clear();
    renderFileList();
    status.set("Expanded all folders");
    return count;
}

function clearFileRenameState() {
    editingFileId = null;
    editingDraft = null;
    editingError = "";
    pendingNewFileRenameId = null;
}

function clearFolderRenameState() {
    editingFolderPath = null;
    editingFolderDraft = null;
    editingFolderError = "";
    editingFolderIsNew = false;
}

function clearInlineRenameState() {
    clearFileRenameState();
    clearFolderRenameState();
}

function createFileInFolder(folderPath, { rename = true } = {}) {
    const normalizedFolder = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalizedFolder) return false;
    const before = snapshotWorkspaceState();
    flushEditorAutosave();
    stashActiveFile();
    const preferredExtension = getPreferredNewFileExtension();
    const filePath = ensureUniqueName(getNextScriptFileName(normalizedFolder, preferredExtension));
    const file = makeFile(filePath, getStarterCodeForFileName(filePath));
    files.push(file);
    activeFileId = file.id;
    setSingleSelection(file.id);
    ensureTabOpen(file.id);
    expandFolderAncestors(file.name);
    setEditorValue(file.code, { silent: true });
    recordCodeSnapshot(file.id, file.code, "create-in-folder", { force: true });
    editingFileId = rename ? file.id : null;
    editingDraft = rename ? file.name : null;
    editingError = "";
    pendingNewFileRenameId = rename ? file.id : null;
    clearFolderRenameState();
    persistFiles();
    renderFileList();
    queueEditorLint("create-in-folder");
    status.set(`New file: ${file.name}`);
    logger.append("system", [`Created ${file.name}`]);
    recordFileHistory(`Create ${file.name}`, before);
    if (!rename) {
        editor.focus();
    }
    return true;
}

function renameFolderToPath(fromFolderPath, toFolderPath) {
    const fromPath = normalizeFolderPath(fromFolderPath, { allowEmpty: true });
    const toPath = normalizeFolderPath(toFolderPath, { allowEmpty: true });
    if (!fromPath || !toPath) return false;
    const available = collectFolderPaths(files);
    if (!available.has(fromPath)) return false;
    const check = validateFolderName(toPath);
    if (!check.valid) {
        status.set("Invalid folder name");
        logger.append("error", [check.message]);
        return false;
    }
    if (toPath === fromPath) return false;
    if (folderPathExists(toPath, { ignoreCase: true, excludePath: fromPath })) {
        status.set("Folder already exists");
        logger.append("error", ["Folder already exists."]);
        return false;
    }
    if (toPath.startsWith(`${fromPath}/`)) {
        status.set("Invalid target");
        logger.append("error", ["A folder cannot be moved into itself."]);
        return false;
    }

    const affected = files.filter((file) => file.name.startsWith(`${fromPath}/`));
    const before = snapshotWorkspaceState();
    const affectedIds = new Set(affected.map((file) => file.id));
    const reserved = new Set(
        files
            .filter((file) => !affectedIds.has(file.id))
            .map((file) => file.name)
    );
    const nextById = new Map();
    affected
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((file) => {
            const suffix = file.name.slice(fromPath.length).replace(/^\/+/, "");
            const desired = `${toPath}/${suffix}`;
            const next = ensureUniquePathInSet(desired, reserved);
            nextById.set(file.id, next);
        });

    let changedFiles = 0;
    files.forEach((file) => {
        const next = nextById.get(file.id);
        if (!next || next === file.name) return;
        file.name = next;
        file.touchedAt = Date.now();
        changedFiles += 1;
    });

    const nextFolders = normalizeFolderList(
        folders.map((entry) => {
            const normalized = normalizeFolderPath(entry, { allowEmpty: true });
            if (!normalized) return "";
            if (normalized === fromPath || normalized.startsWith(`${fromPath}/`)) {
                const suffix = normalized.slice(fromPath.length).replace(/^\/+/, "");
                return suffix ? `${toPath}/${suffix}` : toPath;
            }
            return normalized;
        })
    );
    const foldersChanged = nextFolders.length !== folders.length
        || nextFolders.some((path, index) => path !== folders[index]);
    if (foldersChanged) {
        folders = nextFolders;
    }

    if (!changedFiles && !foldersChanged) return false;
    renameCollapsedFolderEntries(fromPath, toPath);
    expandFolderPathAncestors(toPath);
    persistFiles();
    renderFileList();
    status.set(`Renamed folder to ${toPath}`);
    const details = [];
    if (changedFiles > 0) details.push(`${changedFiles} file${changedFiles === 1 ? "" : "s"}`);
    if (foldersChanged) details.push("empty folders");
    const detailText = details.length ? ` (${details.join(", ")}).` : ".";
    logger.append("system", [`Renamed folder ${fromPath} -> ${toPath}${detailText}`]);
    recordFileHistory(`Rename folder ${fromPath}`, before);
    return true;
}

function startFolderRename(folderPath, { isNew = false, render = true } = {}) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return false;
    if (!collectFolderPaths(files).has(normalized)) return false;
    clearFileRenameState();
    editingFolderPath = normalized;
    editingFolderDraft = normalized;
    editingFolderError = "";
    editingFolderIsNew = Boolean(isNew);
    if (render) renderFileList();
    return true;
}

function commitFolderRename(value, { cancel = false, reason = "manual" } = {}) {
    const fromPath = normalizeFolderPath(editingFolderPath, { allowEmpty: true });
    if (!fromPath) {
        clearFolderRenameState();
        renderFileList();
        return false;
    }

    if (cancel) {
        const wasNew = editingFolderIsNew;
        clearFolderRenameState();
        if (wasNew) {
            const before = snapshotWorkspaceState();
            folders = normalizeFolderList(
                folders.filter((entry) => normalizeFolderPath(entry, { allowEmpty: true }) !== fromPath)
            );
            collapsedFolderPaths.delete(fromPath);
            persistFiles();
            recordFileHistory(`Cancel folder ${fromPath}`, before);
            status.set("Folder creation canceled");
            logger.append("system", [`Canceled folder ${fromPath}.`]);
        }
        renderFileList();
        return true;
    }

    const raw = String(value ?? "");
    const normalizedDraft = normalizeFolderPath(raw, { allowEmpty: true });
    if (reason === "blur" && editingFolderIsNew && normalizedDraft === fromPath) {
        editingFolderDraft = fromPath;
        editingFolderError = "";
        renderFileList();
        return false;
    }

    const check = validateFolderName(raw);
    if (!check.valid) {
        editingFolderDraft = raw;
        editingFolderError = check.message;
        renderFileList();
        return false;
    }

    let toPath = normalizeFolderPath(raw, { allowEmpty: true });
    if (editingFolderIsNew && !String(raw).includes("/")) {
        const parentPath = getFileDirectory(fromPath);
        if (parentPath) {
            toPath = normalizeFolderPath(`${parentPath}/${toPath}`, { allowEmpty: true });
        }
    }
    if (toPath !== fromPath && folderPathExists(toPath, { ignoreCase: true, excludePath: fromPath })) {
        editingFolderDraft = raw;
        editingFolderError = "Folder already exists.";
        renderFileList();
        return false;
    }

    clearFolderRenameState();
    if (toPath === fromPath) {
        renderFileList();
        return true;
    }
    return renameFolderToPath(fromPath, toPath);
}

function renameFolder(folderPath) {
    const fromPath = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!fromPath) return false;
    return startFolderRename(fromPath, { isNew: false });
}

async function deleteFolderPath(folderPath, { confirm = true, focus = true } = {}) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return false;
    const available = collectFolderPaths(files);
    if (!available.has(normalized)) return false;

    const scopedFiles = files.filter((file) => file.name.startsWith(`${normalized}/`));
    const locked = scopedFiles.filter((file) => file.locked);
    if (locked.length) {
        status.set("Folder has locked files");
        logger.append("system", [`${locked.length} locked file${locked.length === 1 ? "" : "s"} in ${normalized}. Unlock before deleting.`]);
        return false;
    }

    const before = snapshotWorkspaceState();
    const count = scopedFiles.length;
    if (confirm) {
        const approved = await confirmWithFilePreview(
            count > 0
                ? `Delete folder "${normalized}" and move ${count} file${count === 1 ? "" : "s"} to Trash?`
                : `Delete empty folder "${normalized}"?`,
            scopedFiles.map((file) => file.name),
            {
                detail: count > 0
                    ? "Files will be moved to Trash. You can undo shortly."
                    : "Only the folder entry will be removed.",
            }
        );
        if (!approved) return false;
    }

    flushEditorAutosave();
    stashActiveFile();

    if (count > 0) {
        queueDeleteUndo(`Deleted folder ${normalized}`);
        pushFilesToTrash(scopedFiles);
        const removedIds = new Set(scopedFiles.map((file) => file.id));
        files = files.filter((file) => !removedIds.has(file.id));
        openTabIds = openTabIds.filter((tabId) => !removedIds.has(tabId));

        if (!files.length) {
            const fallback = makeFile(FILE_DEFAULT_NAME, "");
            files = [fallback];
            activeFileId = fallback.id;
            setSingleSelection(fallback.id);
            openTabIds = [fallback.id];
            setEditorValue(fallback.code, { silent: true });
        } else if (!files.some((file) => file.id === activeFileId)) {
            activeFileId = files[0].id;
            setSingleSelection(activeFileId);
            ensureTabOpen(activeFileId);
            const fallback = getActiveFile();
            setEditorValue(fallback?.code ?? "", { silent: true });
        }

        if (editingFileId && removedIds.has(editingFileId)) {
            clearFileRenameState();
        }
    }

    folders = normalizeFolderList(
        folders.filter((entry) => {
            const next = normalizeFolderPath(entry, { allowEmpty: true });
            if (!next) return false;
            return next !== normalized && !next.startsWith(`${normalized}/`);
        })
    );

    [...collapsedFolderPaths].forEach((path) => {
        if (path === normalized || path.startsWith(`${normalized}/`)) {
            collapsedFolderPaths.delete(path);
        }
    });
    selectedFolderPaths = new Set(
        [...selectedFolderPaths].filter((path) => path !== normalized && !path.startsWith(`${normalized}/`))
    );
    if (editingFolderPath && (editingFolderPath === normalized || editingFolderPath.startsWith(`${normalized}/`))) {
        clearFolderRenameState();
    }

    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: selectedFolderPaths.size === 0 });
    persistFiles();
    renderFileList();
    status.set(count > 0 ? `Deleted folder ${normalized}` : `Removed folder ${normalized}`);
    if (count > 0) {
        logger.append("system", [`Deleted folder ${normalized}. Moved ${count} file${count === 1 ? "" : "s"} to Trash.`]);
    } else {
        logger.append("system", [`Removed empty folder ${normalized}.`]);
    }
    recordFileHistory(`Delete folder ${normalized}`, before);
    if (focus) editor.focus();
    return true;
}

function moveFileToFolder(fileId, folderPath) {
    const file = getFileById(fileId);
    if (!file) return false;
    if (file.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to move."]);
        return false;
    }
    const targetFolder = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (targetFolder == null) return false;
    const currentFolder = getFileDirectory(file.name);
    if (currentFolder === targetFolder) return false;

    const before = snapshotWorkspaceState();
    const base = getFileBaseName(file.name);
    const desired = targetFolder ? `${targetFolder}/${base}` : base;
    const nextName = ensureUniqueName(desired, file.id, { ignoreCase: true });
    if (nextName === file.name) return false;
    file.name = nextName;
    file.touchedAt = Date.now();
    expandFolderAncestors(file.name);
    persistFiles();
    renderFileList();
    const targetLabel = targetFolder || "root";
    status.set(`Moved to ${targetLabel}`);
    logger.append("system", [`Moved ${base} to ${targetLabel}.`]);
    recordFileHistory(`Move ${base} to ${targetLabel}`, before);
    return true;
}

function createFileTreeNode(name = "", path = "") {
    return {
        name,
        path,
        folders: new Map(),
        files: [],
        count: 0,
    };
}

function annotateFileTreeCounts(node) {
    let count = node.files.length;
    node.folders.forEach((child) => {
        count += annotateFileTreeCounts(child);
    });
    node.count = count;
    return count;
}

function ensureFolderTreePath(root, folderPath = "") {
    const segments = splitPathSegments(folderPath);
    let cursor = root;
    let currentPath = "";
    segments.forEach((segment) => {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (!cursor.folders.has(segment)) {
            cursor.folders.set(segment, createFileTreeNode(segment, currentPath));
        }
        cursor = cursor.folders.get(segment);
    });
    return cursor;
}

function buildFileTree(list = [], { explicitFolders = folders } = {}) {
    const root = createFileTreeNode();
    normalizeFolderList(explicitFolders).forEach((folderPath) => {
        ensureFolderTreePath(root, folderPath);
    });
    (Array.isArray(list) ? list : []).forEach((file) => {
        const parts = splitPathSegments(file?.name || "");
        const folderPath = parts.length > 1 ? buildPathFromSegments(parts.slice(0, -1)) : "";
        const cursor = ensureFolderTreePath(root, folderPath);
        cursor.files.push(file);
    });
    annotateFileTreeCounts(root);
    return root;
}

function makeFile(name = FILE_DEFAULT_NAME, code = DEFAULT_CODE) {
    return {
        id: makeFileId(),
        name: normalizeFileName(name),
        code,
        savedCode: code,
        touchedAt: Date.now(),
        pinned: false,
        locked: false,
    };
}

function normalizeFile(file) {
    if (!file) return null;
    const code = typeof file.code === "string" ? file.code : DEFAULT_CODE;
    return {
        id: String(file.id ?? makeFileId()),
        name: normalizeFileName(file.name, FILE_DEFAULT_NAME),
        code,
        savedCode: typeof file.savedCode === "string" ? file.savedCode : code,
        touchedAt: Number.isFinite(file.touchedAt) ? file.touchedAt : Date.now(),
        pinned: Boolean(file.pinned),
        locked: Boolean(file.locked),
    };
}

function normalizeTrashEntry(entry) {
    const normalized = normalizeFile(entry);
    if (!normalized) return null;
    return {
        ...normalized,
        deletedAt: Number.isFinite(entry?.deletedAt) ? entry.deletedAt : Date.now(),
    };
}

function pruneTrashEntries() {
    const now = Date.now();
    trashFiles = (Array.isArray(trashFiles) ? trashFiles : [])
        .map((entry) => normalizeTrashEntry(entry))
        .filter(Boolean)
        .filter((entry) => now - entry.deletedAt <= TRASH_RETENTION_MS);
}

function readSessionState() {
    const raw = load(STORAGE.SESSION);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return {
            active: Boolean(parsed?.active),
            at: Number.isFinite(parsed?.at) ? parsed.at : 0,
        };
    } catch {
        return null;
    }
}

function setSessionState(active) {
    save(STORAGE.SESSION, JSON.stringify({ active: Boolean(active), at: Date.now() }));
}

function isFileDirty(file) {
    if (!file) return false;
    return String(file.code ?? "") !== String(file.savedCode ?? "");
}

function getDirtyFiles() {
    return files.filter((file) => isFileDirty(file));
}

function hasDirtyFiles() {
    return getDirtyFiles().length > 0;
}

function snapshotWorkspaceState() {
    return {
        files: files.map((file) => ({ ...file })),
        folders: [...folders],
        activeId: activeFileId,
        openIds: [...openTabIds],
        trash: trashFiles.map((file) => ({ ...file })),
        selectedIds: [...selectedFileIds],
        selectedFolderPaths: [...selectedFolderPaths],
        selectionAnchorFileId,
        editingFileId,
        editingDraft,
        editingError,
        pendingNewFileRenameId,
        editingFolderPath,
        editingFolderDraft,
        editingFolderError,
        editingFolderIsNew,
    };
}

function serializeWorkspaceState(snapshot) {
    if (!snapshot) return "";
    return JSON.stringify({
        files: snapshot.files,
        folders: snapshot.folders,
        activeId: snapshot.activeId,
        openIds: snapshot.openIds,
        trash: snapshot.trash,
        selectedIds: snapshot.selectedIds,
        selectedFolderPaths: snapshot.selectedFolderPaths,
        selectionAnchorFileId: snapshot.selectionAnchorFileId,
        editingFileId: snapshot.editingFileId,
        editingDraft: snapshot.editingDraft,
        editingError: snapshot.editingError,
        pendingNewFileRenameId: snapshot.pendingNewFileRenameId,
        editingFolderPath: snapshot.editingFolderPath,
        editingFolderDraft: snapshot.editingFolderDraft,
        editingFolderError: snapshot.editingFolderError,
        editingFolderIsNew: snapshot.editingFolderIsNew,
    });
}

function workspaceStatesEqual(a, b) {
    return serializeWorkspaceState(a) === serializeWorkspaceState(b);
}

function canUndoFileHistory() {
    return fileHistoryIndex >= 0;
}

function canRedoFileHistory() {
    return fileHistoryIndex < fileHistory.length - 1;
}

function clearRedoFileHistory() {
    if (fileHistoryIndex < fileHistory.length - 1) {
        fileHistory = fileHistory.slice(0, fileHistoryIndex + 1);
    }
}

function recordFileHistory(label, beforeSnapshot) {
    if (historyDepth > 0 || !beforeSnapshot) return false;
    const afterSnapshot = snapshotWorkspaceState();
    if (workspaceStatesEqual(beforeSnapshot, afterSnapshot)) return false;
    clearRedoFileHistory();
    fileHistory.push({
        label: String(label || "File action"),
        before: beforeSnapshot,
        after: afterSnapshot,
        at: Date.now(),
    });
    if (fileHistory.length > FILE_HISTORY_LIMIT) {
        const overflow = fileHistory.length - FILE_HISTORY_LIMIT;
        fileHistory.splice(0, overflow);
    }
    fileHistoryIndex = fileHistory.length - 1;
    if (openFileMenu === "header") {
        syncFilesMenuActions();
    }
    return true;
}

function applyWorkspaceSnapshot(snapshot, { persist = true, focusEditor = true } = {}) {
    if (!snapshot) return false;
    files = Array.isArray(snapshot.files)
        ? snapshot.files.map((file) => normalizeFile(file)).filter(Boolean)
        : [];
    if (!files.length) {
        files = [makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE)];
    }
    folders = normalizeFolderList(snapshot.folders);
    cleanupCodeHistoryForKnownFiles();
    trashFiles = Array.isArray(snapshot.trash)
        ? snapshot.trash.map((file) => normalizeTrashEntry(file)).filter(Boolean)
        : [];
    pruneTrashEntries();

    const hasActive = files.some((file) => file.id === snapshot.activeId);
    activeFileId = hasActive ? snapshot.activeId : files[0].id;

    selectedFileIds = new Set(Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds : []);
    selectedFolderPaths = new Set(Array.isArray(snapshot.selectedFolderPaths) ? snapshot.selectedFolderPaths : []);
    selectionAnchorFileId = snapshot.selectionAnchorFileId || null;
    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: true });

    openTabIds = normalizeOpenTabIds(Array.isArray(snapshot.openIds) ? snapshot.openIds : [activeFileId]);
    editingFileId = files.some((file) => file.id === snapshot.editingFileId) ? snapshot.editingFileId : null;
    editingDraft = editingFileId ? snapshot.editingDraft : null;
    editingError = editingFileId ? snapshot.editingError : "";
    pendingNewFileRenameId = files.some((file) => file.id === snapshot.pendingNewFileRenameId)
        ? snapshot.pendingNewFileRenameId
        : null;
    const availableFolders = collectFolderPaths(files);
    const normalizedEditingFolder = normalizeFolderPath(snapshot.editingFolderPath, { allowEmpty: true });
    editingFolderPath = normalizedEditingFolder && availableFolders.has(normalizedEditingFolder)
        ? normalizedEditingFolder
        : null;
    editingFolderDraft = editingFolderPath ? snapshot.editingFolderDraft : null;
    editingFolderError = editingFolderPath ? (snapshot.editingFolderError || "") : "";
    editingFolderIsNew = editingFolderPath ? Boolean(snapshot.editingFolderIsNew) : false;

    const active = getActiveFile();
    setEditorValue(active?.code ?? DEFAULT_CODE, { silent: true });
    if (active) {
        recordCodeSnapshot(active.id, active.code, "restore-workspace", { force: false });
    }
    if (persist) persistFiles();
    renderFileList();
    queueEditorLint("workspace-snapshot");
    if (focusEditor) editor.focus();
    return true;
}

function undoFileHistory() {
    if (!canUndoFileHistory()) return false;
    const entry = fileHistory[fileHistoryIndex];
    historyDepth += 1;
    try {
        applyWorkspaceSnapshot(entry.before, { persist: true, focusEditor: false });
    } finally {
        historyDepth = Math.max(0, historyDepth - 1);
    }
    fileHistoryIndex -= 1;
    status.set(`Undo: ${entry.label}`);
    logger.append("system", [`Undo: ${entry.label}`]);
    if (openFileMenu === "header") {
        syncFilesMenuActions();
    }
    return true;
}

function redoFileHistory() {
    if (!canRedoFileHistory()) return false;
    const nextIndex = fileHistoryIndex + 1;
    const entry = fileHistory[nextIndex];
    historyDepth += 1;
    try {
        applyWorkspaceSnapshot(entry.after, { persist: true, focusEditor: false });
    } finally {
        historyDepth = Math.max(0, historyDepth - 1);
    }
    fileHistoryIndex = nextIndex;
    status.set(`Redo: ${entry.label}`);
    logger.append("system", [`Redo: ${entry.label}`]);
    if (openFileMenu === "header") {
        syncFilesMenuActions();
    }
    return true;
}

function parseWorkspacePayload(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const parsedFiles = Array.isArray(parsed.files)
            ? parsed.files.map(normalizeFile).filter(Boolean)
            : [];
        const parsedTrash = Array.isArray(parsed.trash)
            ? parsed.trash.map(normalizeTrashEntry).filter(Boolean)
            : [];
        const parsedFolders = normalizeFolderList(parsed.folders);
        if (!parsedFiles.length && !parsedTrash.length && !parsedFolders.length) return null;
        const fallback = parsedFiles[0] || makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
        const filesValue = parsedFiles.length ? parsedFiles : [fallback];
        const activeId = filesValue.some((f) => f.id === parsed.activeId)
            ? parsed.activeId
            : filesValue[0].id;
        const openIds = Array.isArray(parsed.openIds)
            ? parsed.openIds.filter((id) => filesValue.some((f) => f.id === id))
            : [];
        const normalizedOpen = openIds.length ? openIds : [activeId];
        if (!normalizedOpen.includes(activeId)) normalizedOpen.unshift(activeId);
        return {
            files: filesValue,
            folders: parsedFolders,
            activeId,
            openIds: normalizedOpen,
            trash: parsedTrash,
            savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
        };
    } catch (err) {
        console.warn("FAZ IDE: invalid workspace payload", err);
        return null;
    }
}

function buildWorkspacePayload() {
    return {
        files,
        folders: normalizeFolderList(folders),
        activeId: activeFileId,
        openIds: normalizeOpenTabIds(openTabIds),
        trash: trashFiles,
        savedAt: Date.now(),
    };
}

function persistWorkspaceSnapshot(reason = "autosave") {
    const payload = {
        ...buildWorkspacePayload(),
        snapshotReason: reason,
    };
    save(STORAGE.WORKSPACE_SNAPSHOT, JSON.stringify(payload));
}

function clearPendingDeleteUndo() {
    if (pendingDeleteUndoTimer) {
        clearTimeout(pendingDeleteUndoTimer);
        pendingDeleteUndoTimer = null;
    }
    pendingDeleteUndo = null;
    if (openFileMenu === "header") {
        syncFilesMenuActions();
    }
}

function hasPendingDeleteUndo() {
    if (!pendingDeleteUndo) return false;
    return Date.now() - pendingDeleteUndo.createdAt <= UNDO_DELETE_WINDOW_MS;
}

function queueDeleteUndo(label = "Undo delete") {
    clearPendingDeleteUndo();
    pendingDeleteUndo = {
        files: files.map((file) => ({ ...file })),
        folders: [...folders],
        activeId: activeFileId,
        openIds: [...openTabIds],
        trash: trashFiles.map((file) => ({ ...file })),
        selectedIds: [...selectedFileIds],
        selectedFolderPaths: [...selectedFolderPaths],
        selectionAnchorFileId,
        editingFileId,
        editingDraft,
        editingError,
        pendingNewFileRenameId,
        editingFolderPath,
        editingFolderDraft,
        editingFolderError,
        editingFolderIsNew,
        createdAt: Date.now(),
        label,
    };
    pendingDeleteUndoTimer = setTimeout(() => {
        clearPendingDeleteUndo();
    }, UNDO_DELETE_WINDOW_MS);
}

function pushFilesToTrash(list = []) {
    const normalized = list
        .map((file) => normalizeFile(file))
        .filter(Boolean)
        .map((file) => ({ ...file, deletedAt: Date.now() }));
    if (!normalized.length) return;
    trashFiles = [...normalized, ...trashFiles];
    pruneTrashEntries();
}

function undoLastDelete() {
    if (!hasPendingDeleteUndo()) return false;
    const snapshot = pendingDeleteUndo;
    clearPendingDeleteUndo();
    files = Array.isArray(snapshot.files) ? snapshot.files.map((file) => normalizeFile(file)).filter(Boolean) : [];
    if (!files.length) {
        files = [makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE)];
    }
    folders = normalizeFolderList(snapshot.folders);
    trashFiles = Array.isArray(snapshot.trash) ? snapshot.trash.map((file) => normalizeTrashEntry(file)).filter(Boolean) : [];
    pruneTrashEntries();
    const hasActive = files.some((file) => file.id === snapshot.activeId);
    activeFileId = hasActive ? snapshot.activeId : files[0].id;
    selectedFileIds = new Set(Array.isArray(snapshot.selectedIds) ? snapshot.selectedIds : []);
    selectedFolderPaths = new Set(Array.isArray(snapshot.selectedFolderPaths) ? snapshot.selectedFolderPaths : []);
    selectionAnchorFileId = snapshot.selectionAnchorFileId || null;
    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: true });
    openTabIds = normalizeOpenTabIds(Array.isArray(snapshot.openIds) ? snapshot.openIds : [activeFileId]);
    editingFileId = files.some((file) => file.id === snapshot.editingFileId) ? snapshot.editingFileId : null;
    editingDraft = editingFileId ? snapshot.editingDraft : null;
    editingError = editingFileId ? snapshot.editingError : "";
    pendingNewFileRenameId = files.some((file) => file.id === snapshot.pendingNewFileRenameId)
        ? snapshot.pendingNewFileRenameId
        : null;
    const availableFolders = collectFolderPaths(files);
    const normalizedEditingFolder = normalizeFolderPath(snapshot.editingFolderPath, { allowEmpty: true });
    editingFolderPath = normalizedEditingFolder && availableFolders.has(normalizedEditingFolder)
        ? normalizedEditingFolder
        : null;
    editingFolderDraft = editingFolderPath ? snapshot.editingFolderDraft : null;
    editingFolderError = editingFolderPath ? (snapshot.editingFolderError || "") : "";
    editingFolderIsNew = editingFolderPath ? Boolean(snapshot.editingFolderIsNew) : false;
    const active = getActiveFile();
    setEditorValue(active?.code ?? DEFAULT_CODE, { silent: true });
    persistFiles();
    renderFileList();
    status.set("Delete undone");
    logger.append("system", [`${snapshot.label} undone.`]);
    editor.focus();
    return true;
}

function normalizeOpenTabIds(list = []) {
    const seen = new Set();
    const fileIds = new Set(files.map((file) => file.id));
    const normalized = [];
    list.forEach((id) => {
        if (!fileIds.has(id) || seen.has(id)) return;
        seen.add(id);
        normalized.push(id);
    });
    if (activeFileId && fileIds.has(activeFileId) && !seen.has(activeFileId)) {
        normalized.push(activeFileId);
    }
    if (!normalized.length && files.length) {
        normalized.push(files[0].id);
    }
    return normalized;
}

function ensureTabOpen(id) {
    if (!id) return;
    if (!openTabIds.includes(id)) {
        openTabIds.push(id);
    }
}

function normalizeGame(game, index = 0) {
    if (!game) return null;
    const rawId = String(game.id ?? "").trim();
    const rawName = String(game.name ?? "").trim();
    const name = rawName || rawId || `Game ${index + 1}`;
    const id = rawId || name.toLowerCase().replace(/\s+/g, "-");
    const hasExplicitFolder = Object.prototype.hasOwnProperty.call(game, "folder");
    const rawFolder = hasExplicitFolder ? game.folder : id;
    const normalizedFolder = normalizeFolderPath(rawFolder, { allowEmpty: true });
    const folder = normalizedFolder || (hasExplicitFolder ? "" : id);
    const legacySrc = String(game.src ?? "").trim();
    const legacyFileName = String(game.fileName ?? "").trim();
    const rawFiles = Array.isArray(game.files) && game.files.length
        ? game.files
        : (legacySrc ? [{ path: legacyFileName || `${id}.js`, src: legacySrc }] : []);
    const seenFilePaths = new Set();
    const files = rawFiles
        .map((file, fileIndex) => {
            const src = String(file?.src ?? "").trim();
            if (!src) return null;
            const fallbackName = String(file?.path ?? file?.name ?? `file-${fileIndex + 1}.js`).trim() || `file-${fileIndex + 1}.js`;
            const path = normalizeFileName(fallbackName, fallbackName);
            const key = path.toLowerCase();
            if (seenFilePaths.has(key)) return null;
            seenFilePaths.add(key);
            return { path, src };
        })
        .filter(Boolean);
    if (!files.length) return null;
    const preferredEntry = String(game.entryFile ?? game.entry ?? "").trim();
    const preferredKey = normalizeFileName(preferredEntry, preferredEntry || files[0].path).toLowerCase();
    const preferred = files.find((file) => file.path.toLowerCase() === preferredKey);
    const firstScript = files.find((file) => getFileBaseName(file.path).toLowerCase().endsWith(".js"));
    const entryFile = preferred?.path || firstScript?.path || files[0].path;
    return {
        id,
        name,
        folder,
        files,
        entryFile,
    };
}

function normalizeGames(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .map((game, index) => normalizeGame(game, index))
        .filter(Boolean)
        .filter((game) => {
            if (seen.has(game.id)) return false;
            seen.add(game.id);
            return true;
        });
}

function getGameById(id) {
    return games.find((game) => game.id === id);
}

function syncGamesUI({ force = false } = {}) {
    if (!el.filesGames || !el.gameSelect) return;
    if (!layoutState.filesGamesOpen || !games.length) {
        el.filesGames.setAttribute("aria-hidden", "true");
        el.gameSelect.disabled = true;
        if (el.gameLoad) el.gameLoad.disabled = true;
        return;
    }

    el.filesGames.setAttribute("aria-hidden", "false");
    el.gameSelect.disabled = false;
    if (force || !el.gameSelect.options.length) {
        el.gameSelect.innerHTML = "";
        games.forEach((game) => {
            const option = document.createElement("option");
            option.value = game.id;
            option.textContent = game.name;
            el.gameSelect.appendChild(option);
        });
    }

    if (!games.some((game) => game.id === el.gameSelect.value)) {
        el.gameSelect.value = games[0]?.id ?? "";
    }

    const hasSelection = Boolean(el.gameSelect.value);
    if (el.gameLoad) el.gameLoad.disabled = !hasSelection;
}

async function loadGameById(id, { runAfter = false } = {}) {
    const game = getGameById(id);
    if (!game) {
        status.set("Game not found");
        logger.append("error", [`Game "${id}" not found.`]);
        return false;
    }

    status.set(`Loading ${game.name}...`);
    if (el.gameLoad) el.gameLoad.disabled = true;

    try {
        const before = snapshotWorkspaceState();
        const loadedFiles = await Promise.all(
            game.files.map(async (file) => {
                const response = await fetch(file.src, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }
                return {
                    path: file.path,
                    code: await response.text(),
                };
            })
        );
        if (!loadedFiles.length) {
            throw new Error("Game template is empty.");
        }
        const normalizedFolder = normalizeFolderPath(game.folder, { allowEmpty: true });
        const folderPath = normalizedFolder ? ensureUniqueFolderPath(normalizedFolder, { ignoreCase: true }) : "";
        const entryPath = normalizeFileName(game.entryFile || loadedFiles[0].path, loadedFiles[0].path);
        const created = [];
        const reservedPaths = new Set(files.map((file) => file.name));

        stashActiveFile();
        loadedFiles.forEach((file) => {
            const desiredPath = folderPath ? `${folderPath}/${file.path}` : file.path;
            const workspacePath = ensureUniquePathInSet(desiredPath, reservedPaths);
            const target = makeFile(workspacePath, file.code);
            target.savedCode = file.code;
            files.push(target);
            created.push(target);
        });
        if (folderPath) {
            folders = normalizeFolderList([...folders, folderPath]);
            expandFolderPathAncestors(folderPath);
        }

        const preferredPath = folderPath ? `${folderPath}/${entryPath}` : entryPath;
        const activeTarget = created.find(
            (file) => file.name.toLowerCase() === normalizeFileName(preferredPath, entryPath).toLowerCase()
        ) || created.find((file) => getFileBaseName(file.name).toLowerCase().endsWith(".js")) || created[0];

        activeFileId = activeTarget.id;
        ensureTabOpen(activeTarget.id);
        clearInlineRenameState();
        setEditorValue(activeTarget.code, { silent: true });
        persistFiles();
        renderFileList();
        recordFileHistory(`Load game ${game.name}`, before);

        status.set(runAfter ? `Loaded ${game.name} (running)` : `Loaded ${game.name}`);
        logger.append("system", [`Loaded game: ${game.name} into ${folderPath || "workspace root"} (${created.length} files)`]);

        if (runAfter) {
            run();
        }
        return true;
    } catch (err) {
        status.set("Game load failed");
        logger.append("error", [`Failed to load ${game.name}: ${String(err.message || err)}`]);
        return false;
    } finally {
        syncGamesUI();
    }
}

function formatBytes(bytes = 0) {
    const safe = Math.max(0, Number(bytes) || 0);
    if (safe >= 1024 * 1024) return `${(safe / (1024 * 1024)).toFixed(1)} MB`;
    if (safe >= 1024) return `${(safe / 1024).toFixed(1)} KB`;
    return `${safe} B`;
}

function formatRelativeTime(timestamp) {
    if (!Number.isFinite(timestamp)) return "—";
    const diff = Math.max(0, Date.now() - timestamp);
    if (diff < 15000) return "Just now";
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function setPromptDialogOpen(open) {
    promptDialogOpen = Boolean(open);
    el.promptDialog.setAttribute("data-open", promptDialogOpen ? "true" : "false");
    el.promptDialog.setAttribute("aria-hidden", promptDialogOpen ? "false" : "true");
    el.promptDialogBackdrop.setAttribute("data-open", promptDialogOpen ? "true" : "false");
    el.promptDialogBackdrop.setAttribute("aria-hidden", promptDialogOpen ? "false" : "true");
}

function clearPromptDialogError() {
    if (!el.promptDialogError) return;
    el.promptDialogError.textContent = "";
    el.promptDialogError.setAttribute("data-visible", "false");
}

function setPromptDialogError(message) {
    if (!el.promptDialogError) return;
    const text = String(message || "").trim();
    el.promptDialogError.textContent = text;
    el.promptDialogError.setAttribute("data-visible", text ? "true" : "false");
}

function closePromptDialog(result) {
    if (!promptDialogState) return;
    const { resolve, restoreFocusEl } = promptDialogState;
    promptDialogState = null;
    setPromptDialogOpen(false);
    el.promptDialogList.innerHTML = "";
    el.promptDialogInput.value = "";
    clearPromptDialogError();
    if (restoreFocusEl && document.contains(restoreFocusEl) && typeof restoreFocusEl.focus === "function") {
        requestAnimationFrame(() => restoreFocusEl.focus());
    }
    resolve(result);
}

function cancelPromptDialog() {
    if (!promptDialogState) return;
    closePromptDialog(promptDialogState.cancelValue);
}

function submitPromptDialog() {
    if (!promptDialogState) return;
    if (promptDialogState.mode === "prompt") {
        const raw = String(el.promptDialogInput.value ?? "");
        const value = typeof promptDialogState.normalize === "function"
            ? promptDialogState.normalize(raw)
            : raw;
        const error = typeof promptDialogState.validate === "function"
            ? promptDialogState.validate(value, raw)
            : "";
        if (error) {
            setPromptDialogError(error);
            requestAnimationFrame(() => el.promptDialogInput.focus());
            return;
        }
        closePromptDialog(value);
        return;
    }
    closePromptDialog(true);
}

function openPromptDialog(config = {}) {
    if (promptDialogState?.resolve) {
        closePromptDialog(promptDialogState.cancelValue);
    }
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setLayoutPanelOpen(false);

    const mode = config.mode === "prompt" ? "prompt" : "confirm";
    const title = String(config.title || "Confirm");
    const message = String(config.message || "");
    const items = Array.isArray(config.items) ? config.items : [];
    const confirmText = String(config.confirmText || (mode === "prompt" ? "Save" : "Confirm"));
    const cancelText = String(config.cancelText || "Cancel");
    const cancelValue = Object.prototype.hasOwnProperty.call(config, "cancelValue")
        ? config.cancelValue
        : (mode === "prompt" ? null : false);
    const danger = Boolean(config.danger);
    const inputPlaceholder = String(config.inputPlaceholder || "");
    const inputValue = String(config.inputValue ?? "");
    const listTitle = String(config.listTitle || "");
    const restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise((resolve) => {
        promptDialogState = {
            mode,
            resolve,
            cancelValue,
            validate: config.validate,
            normalize: config.normalize,
            restoreFocusEl,
        };

        el.promptDialogTitle.textContent = title;
        el.promptDialogMessage.textContent = message;
        el.promptDialogMessage.setAttribute("data-visible", message ? "true" : "false");
        el.promptDialogInputWrap.setAttribute("data-open", mode === "prompt" ? "true" : "false");
        el.promptDialogInput.value = inputValue;
        el.promptDialogInput.placeholder = inputPlaceholder;
        clearPromptDialogError();

        const cleanedItems = [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
        if (cleanedItems.length) {
            const itemTitle = listTitle ? `<p class="prompt-dialog-list-title">${escapeHTML(listTitle)}</p>` : "";
            const rows = cleanedItems.map((item) => `<li>${escapeHTML(item)}</li>`).join("");
            el.promptDialogList.innerHTML = `${itemTitle}<ul>${rows}</ul>`;
            el.promptDialogList.setAttribute("data-open", "true");
        } else {
            el.promptDialogList.innerHTML = "";
            el.promptDialogList.setAttribute("data-open", "false");
        }

        el.promptDialogCancel.textContent = cancelText;
        el.promptDialogConfirm.textContent = confirmText;
        el.promptDialogConfirm.setAttribute("data-variant", danger ? "danger" : "primary");

        setPromptDialogOpen(true);
        requestAnimationFrame(() => {
            if (mode === "prompt") {
                el.promptDialogInput.focus();
                el.promptDialogInput.select();
            } else {
                el.promptDialogConfirm.focus();
            }
        });
    });
}

async function showConfirmDialog({
    title = "Confirm",
    message = "",
    items = [],
    listTitle = "",
    confirmText = "Confirm",
    cancelText = "Cancel",
    danger = false,
} = {}) {
    const confirmed = await openPromptDialog({
        mode: "confirm",
        title,
        message,
        items,
        listTitle,
        confirmText,
        cancelText,
        danger,
        cancelValue: false,
    });
    return Boolean(confirmed);
}

async function showTextPromptDialog({
    title = "Input",
    message = "",
    inputValue = "",
    inputPlaceholder = "",
    validate = null,
    normalize = null,
    confirmText = "Save",
    cancelText = "Cancel",
} = {}) {
    const value = await openPromptDialog({
        mode: "prompt",
        title,
        message,
        inputValue,
        inputPlaceholder,
        validate,
        normalize,
        confirmText,
        cancelText,
        cancelValue: null,
    });
    return value == null ? null : String(value);
}

async function confirmWithFilePreview(title, fileNames = [], { detail = "", limit = 8 } = {}) {
    const list = [...new Set((Array.isArray(fileNames) ? fileNames : []).map((name) => String(name || "").trim()).filter(Boolean))];
    const shown = list.slice(0, Math.max(1, limit));
    const preview = list.length > shown.length
        ? [...shown, `...and ${list.length - shown.length} more`]
        : shown;
    return showConfirmDialog({
        title: String(title || "Confirm action"),
        message: detail ? String(detail) : "",
        items: preview,
        listTitle: list.length ? `Files (${list.length})` : "",
        confirmText: "Yes",
        cancelText: "No",
        danger: true,
    });
}

function makeCopyName(name) {
    const normalized = normalizeFileName(name);
    const segments = splitPathSegments(normalized);
    const leaf = segments.pop() || FILE_DEFAULT_NAME;
    const parsed = splitLeafExtension(leaf);
    const baseStem = parsed.stem || leaf || "file";
    const extension = parsed.extension || getFallbackFileExtension(leaf);
    const prefix = segments.length ? `${buildPathFromSegments(segments)}/` : "";
    return ensureUniqueName(`${prefix}${baseStem} copy${extension}`);
}

function normalizePreferredExtension(extension = ".js") {
    const value = String(extension ?? "").trim().toLowerCase();
    if (!value) return ".js";
    if (/^\.[a-z0-9]+$/.test(value)) return value;
    if (/^[a-z0-9]+$/.test(value)) return `.${value}`;
    return ".js";
}

function normalizeNewFileTypePreference(value = "auto") {
    const normalized = String(value ?? "auto").trim().toLowerCase();
    if (normalized === "js" || normalized === "html" || normalized === "css") {
        return normalized;
    }
    return "auto";
}

function getPreferredNewFileExtension() {
    const preference = normalizeNewFileTypePreference(newFileTypePreference);
    if (preference !== "auto") {
        return normalizePreferredExtension(preference);
    }
    const activeFile = getFileById(activeFileId);
    const leaf = getFileBaseName(activeFile?.name || "");
    const extension = normalizePreferredExtension(splitLeafExtension(leaf).extension || ".js");
    if (extension === ".html" || extension === ".css" || extension === ".js") {
        return extension;
    }
    return ".js";
}

function getStarterCodeForFileName(fileName = "") {
    const leaf = getFileBaseName(fileName).toLowerCase();
    if (leaf.endsWith(".html")) {
        return "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>\n";
    }
    if (leaf.endsWith(".css")) {
        return "/* New stylesheet */\n";
    }
    return "// New JavaScript file\n";
}

function getNextScriptFileName(directory = "", preferredExtension = ".js") {
    const folder = normalizeFolderPath(directory, { allowEmpty: true });
    const extension = normalizePreferredExtension(preferredExtension);
    let index = 1;
    while (index <= files.length + 2000) {
        const leaf = `script${index}${extension}`;
        const candidate = folder ? `${folder}/${leaf}` : leaf;
        if (!files.some((file) => file.name === candidate)) {
            return candidate;
        }
        index += 1;
    }
    const fallbackLeaf = `script${files.length + 1}${extension}`;
    const fallback = folder ? `${folder}/${fallbackLeaf}` : fallbackLeaf;
    return ensureUniqueName(fallback);
}

function getNextFolderName(parentPath = "") {
    const parent = normalizeFolderPath(parentPath, { allowEmpty: true });
    const knownFolders = collectFolderPaths(files);
    let index = 1;
    while (index <= files.length + knownFolders.size + 2000) {
        const leaf = `folder${index}`;
        const candidate = parent ? `${parent}/${leaf}` : leaf;
        if (!knownFolders.has(candidate)) {
            return candidate;
        }
        index += 1;
    }
    const fallbackLeaf = `folder-${Date.now().toString(16)}`;
    return parent ? `${parent}/${fallbackLeaf}` : fallbackLeaf;
}

function validateFolderName(name) {
    const normalized = normalizeFolderPath(name, { allowEmpty: true });
    if (!normalized) return { valid: false, message: "Folder name required." };
    const segments = splitPathSegments(normalized);
    return validatePathSegments(segments, "Folder name");
}

function getFileRows({ navigableOnly = false } = {}) {
    if (!el.fileList) return [];
    const rows = Array.from(el.fileList.querySelectorAll(FILE_ROW_SELECTOR));
    if (!navigableOnly) return rows;
    return rows.filter((row) => row.dataset.editing !== "true");
}

function getFileRowById(fileId, { navigableOnly = false } = {}) {
    if (!fileId) return null;
    const rows = getFileRows({ navigableOnly });
    if (!rows.length) return null;
    const preferred = rows.find((row) => row.dataset.fileId === fileId && row.dataset.fileRowSection === "files");
    if (preferred) return preferred;
    return rows.find((row) => row.dataset.fileId === fileId) || null;
}

function focusFileRow(row) {
    if (!row || typeof row.focus !== "function") return;
    row.focus();
    if (typeof row.scrollIntoView === "function") {
        row.scrollIntoView({ block: "nearest" });
    }
}

function getFileListFocusedRowState() {
    const active = document.activeElement;
    if (!active || !el.fileList?.contains(active)) return null;
    const row = active.closest?.(FILE_ROW_SELECTOR);
    if (!row) return null;
    return {
        fileId: row.dataset.fileId || "",
        section: row.dataset.fileRowSection || "",
    };
}

function restoreFileListFocusedRow(state) {
    if (!state?.fileId) return false;
    const rows = getFileRows({ navigableOnly: true });
    if (!rows.length) return false;
    let next = rows.find(
        (row) => row.dataset.fileId === state.fileId && row.dataset.fileRowSection === state.section
    );
    if (!next) {
        next = rows.find((row) => row.dataset.fileId === state.fileId) || null;
    }
    if (!next) return false;
    focusFileRow(next);
    return true;
}

function scrollActiveFileRowIntoView() {
    if (!activeFileId) return;
    const row = getFileRowById(activeFileId);
    if (!row || typeof row.scrollIntoView !== "function") return;
    row.scrollIntoView({ block: "nearest" });
}

function getFolderRows({ navigableOnly = false } = {}) {
    if (!el.fileList) return [];
    const rows = Array.from(el.fileList.querySelectorAll(FILE_FOLDER_ROW_SELECTOR));
    if (!navigableOnly) return rows;
    return rows.filter((row) => row.dataset.editing !== "true");
}

function getFolderRowByPath(folderPath, { navigableOnly = false } = {}) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return null;
    const rows = getFolderRows({ navigableOnly });
    if (!rows.length) return null;
    return rows.find((row) => normalizeFolderPath(row.dataset.folderToggle || "", { allowEmpty: true }) === normalized) || null;
}

function pruneNestedFolderSelection(paths = []) {
    const normalized = [...new Set(
        (Array.isArray(paths) ? paths : [])
            .map((path) => normalizeFolderPath(path, { allowEmpty: true }))
            .filter(Boolean)
    )];
    normalized.sort((a, b) => a.length - b.length || a.localeCompare(b));
    const pruned = [];
    normalized.forEach((path) => {
        const nested = pruned.some((parent) => path === parent || path.startsWith(`${parent}/`));
        if (!nested) pruned.push(path);
    });
    return pruned;
}

function getSelectedFolderPaths({ pruneNested = true } = {}) {
    reconcileFolderSelection();
    const paths = [...selectedFolderPaths];
    return pruneNested ? pruneNestedFolderSelection(paths) : paths;
}

function reconcileFolderSelection() {
    const available = collectFolderPaths(files);
    selectedFolderPaths = new Set(
        [...selectedFolderPaths]
            .map((path) => normalizeFolderPath(path, { allowEmpty: true }))
            .filter((path) => path && available.has(path))
    );
}

function reconcileFileSelection({ ensureOne = true } = {}) {
    const validIds = new Set(files.map((file) => file.id));
    selectedFileIds = new Set([...selectedFileIds].filter((id) => validIds.has(id)));
    if (selectionAnchorFileId && !validIds.has(selectionAnchorFileId)) {
        selectionAnchorFileId = null;
    }
    if (ensureOne && selectedFileIds.size === 0 && selectedFolderPaths.size === 0 && activeFileId && validIds.has(activeFileId)) {
        selectedFileIds.add(activeFileId);
        selectionAnchorFileId = activeFileId;
    }
    if (!selectionAnchorFileId && selectedFileIds.size) {
        selectionAnchorFileId = [...selectedFileIds][0];
    }
}

function setSingleSelection(fileId, { clearFolders = true } = {}) {
    if (clearFolders) {
        selectedFolderPaths = new Set();
    }
    if (!fileId) {
        selectedFileIds = new Set();
        selectionAnchorFileId = null;
        return;
    }
    selectedFileIds = new Set([fileId]);
    selectionAnchorFileId = fileId;
}

function setSingleFolderSelection(folderPath) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) {
        selectedFolderPaths = new Set();
        return;
    }
    selectedFolderPaths = new Set([normalized]);
    selectedFileIds = new Set();
    selectionAnchorFileId = null;
}

function toggleFolderSelection(folderPath) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    reconcileFolderSelection();
    if (selectedFolderPaths.has(normalized)) {
        selectedFolderPaths.delete(normalized);
    } else {
        selectedFolderPaths.add(normalized);
    }
}

function clearFileSelection({ keepActive = true } = {}) {
    selectedFolderPaths = new Set();
    if (keepActive && activeFileId) {
        setSingleSelection(activeFileId);
    } else {
        setSingleSelection(null);
    }
    renderFileList();
}

function getVisibleFileIdsForSelection() {
    const ids = getFileRows({ navigableOnly: true })
        .filter((row) => row.dataset.fileRowSection === "files")
        .map((row) => row.dataset.fileId)
        .filter(Boolean);
    return [...new Set(ids)];
}

function selectAllVisibleFiles() {
    const ids = getVisibleFileIdsForSelection();
    if (!ids.length) {
        status.set("No visible files");
        return;
    }
    selectedFolderPaths = new Set();
    selectedFileIds = new Set(ids);
    selectionAnchorFileId = ids[0];
    renderFileList();
    const focusRow = getFileRowById(activeFileId, { navigableOnly: true }) || getFileRowById(ids[0], { navigableOnly: true });
    focusFileRow(focusRow);
    status.set(`${ids.length} files selected`);
}

function toggleFileSelection(fileId) {
    if (!fileId) return;
    reconcileFileSelection({ ensureOne: false });
    if (selectedFileIds.has(fileId)) {
        selectedFileIds.delete(fileId);
    } else {
        selectedFileIds.add(fileId);
    }
    if (!selectedFileIds.size && selectedFolderPaths.size === 0 && activeFileId) {
        selectedFileIds.add(activeFileId);
    }
    selectionAnchorFileId = fileId;
}

function selectFileRangeTo(fileId) {
    if (!fileId) return;
    const ordered = getVisibleFileIdsForSelection();
    if (!ordered.length || !ordered.includes(fileId)) {
        setSingleSelection(fileId);
        return;
    }
    const anchor = selectionAnchorFileId && ordered.includes(selectionAnchorFileId)
        ? selectionAnchorFileId
        : fileId;
    const anchorIndex = ordered.indexOf(anchor);
    const targetIndex = ordered.indexOf(fileId);
    const [start, end] = anchorIndex <= targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];
    selectedFileIds = new Set(ordered.slice(start, end + 1));
}

function getSelectedFiles() {
    reconcileFileSelection({ ensureOne: false });
    return files.filter((file) => selectedFileIds.has(file.id));
}

function getSelectedWorkspaceEntries() {
    reconcileFileSelection({ ensureOne: false });
    const selectedFolders = getSelectedFolderPaths({ pruneNested: true });
    const inSelectedFolder = (fileName = "") => selectedFolders.some((folderPath) => fileName.startsWith(`${folderPath}/`));
    const explicitFiles = files.filter((file) => selectedFileIds.has(file.id));
    const standaloneFiles = explicitFiles.filter((file) => !inSelectedFolder(file.name));
    const folderFiles = files.filter((file) => inSelectedFolder(file.name));
    const allFileById = new Map();
    [...standaloneFiles, ...folderFiles].forEach((file) => {
        allFileById.set(file.id, file);
    });
    return {
        selectedFolders,
        standaloneFiles,
        folderFiles,
        allFiles: [...allFileById.values()],
        selectedEntryCount: standaloneFiles.length + selectedFolders.length,
    };
}

async function bulkTrashSelectedFiles() {
    const {
        selectedFolders,
        standaloneFiles,
        selectedEntryCount,
    } = getSelectedWorkspaceEntries();

    if (selectedEntryCount === 0) {
        status.set("No files or folders selected");
        return false;
    }

    const blockedFolders = [];
    const removableFolders = [];
    selectedFolders.forEach((folderPath) => {
        const nestedFiles = files.filter((file) => file.name.startsWith(`${folderPath}/`));
        const lockedNested = nestedFiles.filter((file) => file.locked);
        if (lockedNested.length) {
            blockedFolders.push({
                path: folderPath,
                lockedCount: lockedNested.length,
            });
            return;
        }
        removableFolders.push({
            path: folderPath,
            nestedFiles,
        });
    });

    const filesFromRemovableFolders = removableFolders.flatMap((entry) => entry.nestedFiles);
    const standaloneLocked = standaloneFiles.filter((file) => file.locked);
    const standaloneUnlocked = standaloneFiles.filter((file) => !file.locked);
    const unlockedById = new Map();
    [...filesFromRemovableFolders, ...standaloneUnlocked].forEach((file) => {
        unlockedById.set(file.id, file);
    });
    const unlockedFiles = [...unlockedById.values()];
    const removableFolderPaths = removableFolders.map((entry) => entry.path);
    const totalToTrash = unlockedFiles.length + removableFolderPaths.length;
    const lockedCount = standaloneLocked.length + blockedFolders.reduce((sum, entry) => sum + entry.lockedCount, 0);

    if (totalToTrash === 0) {
        status.set("Selection is locked");
        return false;
    }

    const previewItems = [
        ...removableFolderPaths.map((path) => `${path}/`),
        ...unlockedFiles.map((file) => file.name),
    ];
    const skippedParts = [];
    if (standaloneLocked.length) {
        skippedParts.push(`${standaloneLocked.length} locked file${standaloneLocked.length === 1 ? "" : "s"}`);
    }
    if (blockedFolders.length) {
        skippedParts.push(`${blockedFolders.length} folder${blockedFolders.length === 1 ? "" : "s"} with locked files`);
    }

    const before = snapshotWorkspaceState();
    const confirmDelete = await confirmWithFilePreview(
        `Move ${totalToTrash} selected ${totalToTrash === 1 ? "item" : "items"} to Trash?`,
        previewItems,
        { detail: skippedParts.length ? `${skippedParts.join("; ")} will be skipped.` : "" }
    );

    if (!confirmDelete) return false;

    queueDeleteUndo(`Deleted ${totalToTrash} selected items`);
    flushEditorAutosave();
    stashActiveFile();

    pushFilesToTrash(unlockedFiles);
    const removedIds = new Set(unlockedFiles.map((file) => file.id));
    files = files.filter((file) => !removedIds.has(file.id));
    openTabIds = openTabIds.filter((tabId) => !removedIds.has(tabId));

    if (removableFolderPaths.length) {
        const shouldRemoveFolderPath = (path = "") => removableFolderPaths.some((folderPath) => path === folderPath || path.startsWith(`${folderPath}/`));
        folders = normalizeFolderList(
            folders.filter((entry) => {
                const normalized = normalizeFolderPath(entry, { allowEmpty: true });
                if (!normalized) return false;
                return !shouldRemoveFolderPath(normalized);
            })
        );
        [...collapsedFolderPaths].forEach((path) => {
            if (shouldRemoveFolderPath(path)) {
                collapsedFolderPaths.delete(path);
            }
        });
        if (editingFolderPath && shouldRemoveFolderPath(editingFolderPath)) {
            clearFolderRenameState();
        }
        selectedFolderPaths = new Set(
            [...selectedFolderPaths].filter((path) => !shouldRemoveFolderPath(path))
        );
    }

    if (!files.length) {
        const fallback = makeFile(FILE_DEFAULT_NAME, "");
        files = [fallback];
        activeFileId = fallback.id;
        setSingleSelection(fallback.id);
        openTabIds = [fallback.id];
        setEditorValue(fallback.code, { silent: true });
    } else if (!files.some((file) => file.id === activeFileId)) {
        activeFileId = files[0].id;
        setSingleSelection(activeFileId);
        ensureTabOpen(activeFileId);
        const fallback = getActiveFile();
        setEditorValue(fallback?.code ?? "", { silent: true });
    }

    if (editingFileId && removedIds.has(editingFileId)) {
        clearFileRenameState();
    }

    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: selectedFolderPaths.size === 0 });
    persistFiles();
    renderFileList();
    status.set(`Moved ${totalToTrash} selected ${totalToTrash === 1 ? "item" : "items"} to Trash`);
    const lockMsg = lockedCount ? ` ${lockedCount} locked skipped.` : "";
    logger.append("system", [`Moved ${totalToTrash} selected items to Trash.${lockMsg}`]);
    recordFileHistory(`Trash ${totalToTrash} selected`, before);
    editor.focus();
    return true;
}

async function promptMoveSelectedEntries() {
    const { selectedEntryCount } = getSelectedWorkspaceEntries();
    if (!selectedEntryCount) {
        status.set("No files or folders selected");
        return false;
    }
    const destination = await showTextPromptDialog({
        title: "Move Selection",
        message: `Move ${selectedEntryCount} selected ${selectedEntryCount === 1 ? "item" : "items"} to a folder path. Leave blank for root.`,
        inputValue: "",
        inputPlaceholder: "root",
        validate: (value, raw) => {
            const normalized = normalizeFolderPath(raw, { allowEmpty: true });
            if (normalized == null) return "Invalid folder path.";
            if (!normalized) return "";
            return collectFolderPaths(files).has(normalized) ? "" : "Folder path does not exist.";
        },
        normalize: (raw) => {
            const normalized = normalizeFolderPath(raw, { allowEmpty: true });
            return normalized == null ? raw : normalized;
        },
        confirmText: "Move",
    });
    if (destination == null) return false;
    return moveSelectedEntriesToFolder(destination || "");
}

function bulkSetPinned(value) {
    const selected = getSelectedFiles();
    if (!selected.length) return false;
    const before = snapshotWorkspaceState();
    selected.forEach((file) => {
        file.pinned = Boolean(value);
    });
    persistFiles();
    renderFileList();
    status.set(`${value ? "Pinned" : "Unpinned"} ${selected.length} files`);
    recordFileHistory(`${value ? "Pin" : "Unpin"} ${selected.length} selected`, before);
    return true;
}

function bulkSetLocked(value) {
    const selected = getSelectedFiles();
    if (!selected.length) return false;
    const before = snapshotWorkspaceState();
    selected.forEach((file) => {
        file.locked = Boolean(value);
    });
    if (value && editingFileId && selected.some((file) => file.id === editingFileId)) {
        commitRename(editingFileId, editingDraft ?? "", { cancel: true });
    }
    persistFiles();
    renderFileList();
    status.set(`${value ? "Locked" : "Unlocked"} ${selected.length} files`);
    recordFileHistory(`${value ? "Lock" : "Unlock"} ${selected.length} selected`, before);
    return true;
}

function duplicateSelectedFiles() {
    const selected = getSelectedFiles();
    if (!selected.length) return false;
    const before = snapshotWorkspaceState();
    const ordered = files.filter((file) => selectedFileIds.has(file.id));
    if (!ordered.length) return false;
    let lastCopy = null;
    ordered.forEach((source) => {
        const copy = makeFile(makeCopyName(source.name), source.code);
        const index = files.findIndex((item) => item.id === source.id);
        const insertAt = index >= 0 ? index + 1 : files.length;
        files.splice(insertAt, 0, copy);
        lastCopy = copy;
    });
    if (lastCopy) {
        activeFileId = lastCopy.id;
        setSingleSelection(lastCopy.id);
        ensureTabOpen(lastCopy.id);
        expandFolderAncestors(lastCopy.name);
        setEditorValue(lastCopy.code, { silent: true });
    }
    persistFiles();
    renderFileList();
    status.set(`Duplicated ${ordered.length} files`);
    logger.append("system", [`Duplicated ${ordered.length} selected files.`]);
    recordFileHistory(`Duplicate ${ordered.length} selected`, before);
    editor.focus();
    return true;
}

function scoreQuickOpenMatch(name, query) {
    const target = String(name || "").toLowerCase();
    const search = String(query || "").toLowerCase().trim();
    if (!search) return 1;
    let score = 0;
    let cursor = 0;
    let prev = -2;
    for (const ch of search) {
        const index = target.indexOf(ch, cursor);
        if (index === -1) return Number.NEGATIVE_INFINITY;
        score += 4;
        if (index === 0) score += 8;
        if (index === prev + 1) score += 6;
        if (index <= 2) score += 2;
        prev = index;
        cursor = index + 1;
    }
    if (target.startsWith(search)) score += 16;
    if (target.includes(search)) score += 8;
    score += Math.max(0, 8 - target.length * 0.04);
    return score;
}

function getQuickOpenMatches(query) {
    const ranked = files
        .map((file) => ({
            file,
            score: scoreQuickOpenMatch(file.name, query) + ((file.touchedAt || 0) / 1e13),
        }))
        .filter((entry) => Number.isFinite(entry.score) && entry.score > Number.NEGATIVE_INFINITY)
        .sort((a, b) => b.score - a.score || (b.file.touchedAt || 0) - (a.file.touchedAt || 0));
    return ranked.slice(0, 50).map((entry) => entry.file);
}

function renderQuickOpenResults() {
    if (!el.quickOpenList) return;
    if (!quickOpenResults.length) {
        el.quickOpenList.innerHTML = `<li class="quick-open-empty">No files found.</li>`;
        if (el.quickOpenHint) {
            el.quickOpenHint.textContent = "No match. Try another query.";
        }
        return;
    }
    quickOpenIndex = clamp(quickOpenIndex, 0, quickOpenResults.length - 1);
    const rows = quickOpenResults
        .map((file, index) => {
            const active = index === quickOpenIndex;
            const isCurrent = file.id === activeFileId;
            return `
                <li class="quick-open-item-wrap" role="presentation">
                    <button type="button" class="quick-open-item" role="option" data-quick-open-id="${file.id}" data-active="${active}" aria-selected="${active}">
                        <span class="quick-open-name">${escapeHTML(file.name)}</span>
                        <span class="quick-open-meta">${isCurrent ? "Active" : formatRelativeTime(file.touchedAt)}</span>
                    </button>
                </li>
            `;
        })
        .join("");
    el.quickOpenList.innerHTML = rows;
    const activeOption = el.quickOpenList.querySelector('[data-quick-open-id][data-active="true"]');
    if (activeOption && typeof activeOption.scrollIntoView === "function") {
        activeOption.scrollIntoView({ block: "nearest" });
    }
    if (el.quickOpenHint) {
        el.quickOpenHint.textContent = `${quickOpenResults.length} result${quickOpenResults.length === 1 ? "" : "s"} • Enter to open`;
    }
}

function updateQuickOpenResults(query = quickOpenQuery) {
    quickOpenQuery = String(query || "");
    quickOpenResults = getQuickOpenMatches(quickOpenQuery);
    if (quickOpenResults.length && quickOpenIndex >= quickOpenResults.length) {
        quickOpenIndex = 0;
    }
    renderQuickOpenResults();
}

function setQuickOpenOpen(open) {
    quickOpenOpen = Boolean(open);
    if (!el.quickOpenPalette || !el.quickOpenBackdrop) return;
    el.quickOpenPalette.setAttribute("data-open", quickOpenOpen ? "true" : "false");
    el.quickOpenPalette.setAttribute("aria-hidden", quickOpenOpen ? "false" : "true");
    el.quickOpenBackdrop.setAttribute("data-open", quickOpenOpen ? "true" : "false");
    el.quickOpenBackdrop.setAttribute("aria-hidden", quickOpenOpen ? "false" : "true");
    if (!quickOpenOpen) {
        quickOpenQuery = "";
        quickOpenResults = [];
        quickOpenIndex = 0;
        if (el.quickOpenInput) el.quickOpenInput.value = "";
        if (el.quickOpenList) el.quickOpenList.innerHTML = "";
        return;
    }
    updateQuickOpenResults("");
    requestAnimationFrame(() => {
        if (el.quickOpenInput) {
            el.quickOpenInput.focus();
            el.quickOpenInput.select();
        }
    });
}

function openQuickOpen() {
    if (quickOpenOpen) {
        if (el.quickOpenInput) el.quickOpenInput.focus();
        return;
    }
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    closeFileMenus();
    setQuickOpenOpen(true);
}

function closeQuickOpen({ focusEditor = true } = {}) {
    if (!quickOpenOpen) return;
    setQuickOpenOpen(false);
    if (focusEditor) {
        editor.focus();
    }
}

function activateQuickOpen(index = quickOpenIndex) {
    const target = quickOpenResults[index];
    if (!target) return false;
    setSingleSelection(target.id);
    selectFile(target.id);
    closeQuickOpen({ focusEditor: true });
    return true;
}

function onQuickOpenKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!quickOpenResults.length) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        quickOpenIndex = clamp(quickOpenIndex + step, 0, quickOpenResults.length - 1);
        renderQuickOpenResults();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        activateQuickOpen();
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeQuickOpen({ focusEditor: true });
    }
}

function wireQuickOpen() {
    if (el.quickOpenInput) {
        el.quickOpenInput.addEventListener("input", (event) => {
            quickOpenIndex = 0;
            updateQuickOpenResults(event.target.value || "");
        });
        el.quickOpenInput.addEventListener("keydown", onQuickOpenKeyDown);
    }
    if (el.quickOpenList) {
        el.quickOpenList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-quick-open-id]");
            if (!row) return;
            const index = quickOpenResults.findIndex((file) => file.id === row.dataset.quickOpenId);
            if (index === -1) return;
            quickOpenIndex = index;
            activateQuickOpen(index);
        });
    }
    if (el.quickOpenBackdrop) {
        el.quickOpenBackdrop.addEventListener("click", () => closeQuickOpen({ focusEditor: false }));
    }
}

function setShortcutHelpOpen(open) {
    shortcutHelpOpen = Boolean(open);
    if (!el.shortcutHelpPanel || !el.shortcutHelpBackdrop) return;
    el.shortcutHelpPanel.setAttribute("data-open", shortcutHelpOpen ? "true" : "false");
    el.shortcutHelpPanel.setAttribute("aria-hidden", shortcutHelpOpen ? "false" : "true");
    el.shortcutHelpBackdrop.setAttribute("data-open", shortcutHelpOpen ? "true" : "false");
    el.shortcutHelpBackdrop.setAttribute("aria-hidden", shortcutHelpOpen ? "false" : "true");
    if (shortcutHelpOpen) {
        requestAnimationFrame(() => {
            if (el.shortcutHelpClose) el.shortcutHelpClose.focus();
        });
    }
}

function openShortcutHelp() {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setShortcutHelpOpen(true);
}

function closeShortcutHelp({ focusEditor = true } = {}) {
    if (!shortcutHelpOpen) return;
    setShortcutHelpOpen(false);
    if (focusEditor) editor.focus();
}

function isCommandEnabled(entry) {
    if (!entry) return false;
    if (typeof entry.enabled === "function") {
        try {
            return Boolean(entry.enabled());
        } catch {
            return false;
        }
    }
    return Boolean(entry.enabled ?? true);
}

function getRegisteredCommandEntries() {
    return commandRegistry.list().map((entry) => ({
        id: entry.id,
        label: entry.label,
        keywords: entry.keywords || "",
        shortcut: entry.shortcut || "",
        enabled: isCommandEnabled(entry),
        run: () => {
            try {
                entry.run?.();
            } catch (err) {
                logger.append("error", [`Command "${entry.label}" failed: ${String(err?.message || err)}`]);
                status.set("Command failed");
            }
        },
    }));
}

function normalizeEditorFontFamily(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(EDITOR_FONT_FAMILY_OPTIONS, normalized)) {
        return normalized;
    }
    return "default";
}

function applyEditorFontFamily() {
    const fontFamily = normalizeEditorFontFamily(editorSettings.fontFamily);
    const fontStack = EDITOR_FONT_FAMILY_OPTIONS[fontFamily] || EDITOR_FONT_FAMILY_OPTIONS.default;
    document.documentElement.style.setProperty("--editor-font-family", fontStack);
    editor.setFontFamily?.(fontStack);
    editor.refresh?.();
}

function sanitizeEditorSettings(input = {}) {
    const rawProfile = typeof input.profile === "string" ? input.profile : "balanced";
    const profile = EDITOR_PROFILES[rawProfile] ? rawProfile : "balanced";
    const profileDefaults = EDITOR_PROFILES[profile] || EDITOR_PROFILES.balanced;
    const formatterMode = ["auto", "prettier", "basic"].includes(input.formatterMode)
        ? input.formatterMode
        : (profileDefaults.formatterMode || "auto");
    return {
        profile,
        tabSize: clamp(Number(input.tabSize ?? profileDefaults.tabSize), 2, 8),
        fontSize: clamp(Number(input.fontSize ?? profileDefaults.fontSize), 11, 22),
        fontFamily: normalizeEditorFontFamily(input.fontFamily ?? profileDefaults.fontFamily ?? "default"),
        lineWrapping: Boolean(input.lineWrapping ?? profileDefaults.lineWrapping),
        lintEnabled: Boolean(input.lintEnabled ?? profileDefaults.lintEnabled),
        errorLensEnabled: Boolean(input.errorLensEnabled ?? profileDefaults.errorLensEnabled ?? true),
        snippetEnabled: Boolean(input.snippetEnabled ?? profileDefaults.snippetEnabled),
        autosaveMs: clamp(Number(input.autosaveMs ?? profileDefaults.autosaveMs ?? EDITOR_AUTOSAVE_DEFAULT_MS), 100, 5000),
        formatterMode,
    };
}

function loadEditorSettings() {
    const raw = load(STORAGE.EDITOR_SETTINGS);
    if (!raw) {
        editorSettings = sanitizeEditorSettings({ profile: "balanced" });
        return;
    }
    try {
        editorSettings = sanitizeEditorSettings(JSON.parse(raw));
    } catch {
        editorSettings = sanitizeEditorSettings({ profile: "balanced" });
    }
}

function persistEditorSettings() {
    save(STORAGE.EDITOR_SETTINGS, JSON.stringify(editorSettings));
}

function applyEditorSettings({ persist = false, refreshUI = true } = {}) {
    editor.setOptions?.({
        tabSize: editorSettings.tabSize,
        indentUnit: editorSettings.tabSize,
        lineWrapping: editorSettings.lineWrapping,
    });
    editor.setFontSize?.(editorSettings.fontSize);
    applyEditorFontFamily();
    if (refreshUI) syncEditorSettingsPanel();
    if (persist) persistEditorSettings();
    if (editorSettings.lintEnabled) {
        queueEditorLint("settings");
    } else {
        clearInlineDiagnostics();
        fileDiagnosticsById.clear();
        queueProblemsRender();
    }
    if (!editorSettings.errorLensEnabled) {
        editor.clearMarks?.(EDITOR_MARK_KIND_ERROR_LENS);
    } else if (editorSettings.lintEnabled && activeDiagnostics.length) {
        applyErrorLens(activeDiagnostics);
    }
}

function applyEditorProfile(profileName, { persist = true } = {}) {
    const profile = EDITOR_PROFILES[profileName];
    if (!profile) return false;
    editorSettings = sanitizeEditorSettings({ ...editorSettings, ...profile, profile: profileName });
    applyEditorSettings({ persist, refreshUI: true });
    status.set(`Editor profile: ${profileName}`);
    return true;
}

function syncEditorSettingsPanel() {
    if (el.editorProfileSelect) el.editorProfileSelect.value = editorSettings.profile;
    if (el.editorFormatterSelect) el.editorFormatterSelect.value = editorSettings.formatterMode || "auto";
    if (el.editorTabSize) el.editorTabSize.value = String(editorSettings.tabSize);
    if (el.editorFontSize) el.editorFontSize.value = String(editorSettings.fontSize);
    if (el.editorFontFamilySelect) el.editorFontFamilySelect.value = normalizeEditorFontFamily(editorSettings.fontFamily);
    if (el.editorAutoSaveMs) el.editorAutoSaveMs.value = String(editorSettings.autosaveMs);
    if (el.editorWrapToggle) el.editorWrapToggle.checked = editorSettings.lineWrapping;
    if (el.editorLintToggle) el.editorLintToggle.checked = editorSettings.lintEnabled;
    if (el.editorErrorLensToggle) el.editorErrorLensToggle.checked = editorSettings.errorLensEnabled;
    if (el.editorSnippetToggle) el.editorSnippetToggle.checked = editorSettings.snippetEnabled;
    if (el.snippetScopeSelect) el.snippetScopeSelect.value = getActiveSnippetScope();
    renderSnippetList();
}

function setEditorSettingsOpen(open) {
    editorSettingsOpen = Boolean(open);
    if (!el.editorSettingsPanel || !el.editorSettingsBackdrop) return;
    el.editorSettingsPanel.setAttribute("data-open", editorSettingsOpen ? "true" : "false");
    el.editorSettingsPanel.setAttribute("aria-hidden", editorSettingsOpen ? "false" : "true");
    el.editorSettingsBackdrop.setAttribute("data-open", editorSettingsOpen ? "true" : "false");
    el.editorSettingsBackdrop.setAttribute("aria-hidden", editorSettingsOpen ? "false" : "true");
    if (editorSettingsOpen) {
        syncEditorSettingsPanel();
        requestAnimationFrame(() => el.editorProfileSelect?.focus());
    }
}

function openEditorSettings() {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    setEditorSettingsOpen(true);
}

function closeEditorSettings({ focusEditor = true } = {}) {
    if (!editorSettingsOpen) return;
    setEditorSettingsOpen(false);
    if (focusEditor) editor.focus();
}

function normalizeLoadedCodeHistory(raw) {
    if (!raw) return {};
    let parsed = {};
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== "object") return {};
    const normalized = {};
    for (const [fileId, entries] of Object.entries(parsed)) {
        const nextEntries = (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && typeof entry.code === "string")
            .map((entry) => ({
                id: String(entry.id || `snap-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`),
                at: Number.isFinite(entry.at) ? entry.at : Date.now(),
                reason: String(entry.reason || "snapshot"),
                code: String(entry.code),
            }))
            .sort((a, b) => b.at - a.at)
            .slice(0, EDITOR_HISTORY_LIMIT);
        if (nextEntries.length) {
            normalized[fileId] = nextEntries;
        }
    }
    return normalized;
}

function persistCodeHistory() {
    save(STORAGE.EDITOR_HISTORY, JSON.stringify(fileCodeHistory));
}

function loadCodeHistory() {
    const raw = load(STORAGE.EDITOR_HISTORY);
    fileCodeHistory = normalizeLoadedCodeHistory(raw);
}

function getFileHistoryEntries(fileId = activeFileId) {
    if (!fileId) return [];
    const entries = fileCodeHistory[fileId];
    return Array.isArray(entries) ? entries : [];
}

function cleanupCodeHistoryForKnownFiles() {
    const known = new Set(files.map((file) => file.id));
    for (const key of Object.keys(fileCodeHistory)) {
        if (!known.has(key)) {
            delete fileCodeHistory[key];
        }
    }
}

function recordCodeSnapshot(fileId, code, reason = "snapshot", { force = false } = {}) {
    if (!fileId) return null;
    const nextCode = String(code ?? "");
    const existing = getFileHistoryEntries(fileId);
    if (!force && existing.length && existing[0].code === nextCode) return null;
    const entry = {
        id: `snap-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`,
        at: Date.now(),
        reason: String(reason || "snapshot"),
        code: nextCode,
    };
    fileCodeHistory[fileId] = [entry, ...existing].slice(0, EDITOR_HISTORY_LIMIT);
    persistCodeHistory();
    if (editorHistoryOpen) {
        renderEditorHistoryList();
    }
    return entry;
}

function recordActiveCodeSnapshot(reason = "autosave", { force = false } = {}) {
    const active = getActiveFile();
    if (!active) return null;
    return recordCodeSnapshot(active.id, active.code, reason, { force });
}

function formatSnapshotTime(at) {
    if (!Number.isFinite(at)) return "";
    return new Date(at).toLocaleString();
}

function buildDiffSummary(beforeCode, afterCode) {
    const beforeLines = String(beforeCode ?? "").split("\n");
    const afterLines = String(afterCode ?? "").split("\n");
    const beforeCount = new Map();
    const afterCount = new Map();

    beforeLines.forEach((line) => beforeCount.set(line, (beforeCount.get(line) || 0) + 1));
    afterLines.forEach((line) => afterCount.set(line, (afterCount.get(line) || 0) + 1));

    let removed = 0;
    let added = 0;
    for (const [line, count] of beforeCount.entries()) {
        const next = afterCount.get(line) || 0;
        if (count > next) removed += count - next;
    }
    for (const [line, count] of afterCount.entries()) {
        const prev = beforeCount.get(line) || 0;
        if (count > prev) added += count - prev;
    }

    let firstChanged = -1;
    const max = Math.max(beforeLines.length, afterLines.length);
    for (let i = 0; i < max; i += 1) {
        if ((beforeLines[i] || "") !== (afterLines[i] || "")) {
            firstChanged = i;
            break;
        }
    }
    const previewFrom = Math.max(0, firstChanged - 1);
    const previewTo = Math.min(afterLines.length, previewFrom + 6);
    const preview = firstChanged >= 0
        ? afterLines.slice(previewFrom, previewTo).map((line, idx) => `${previewFrom + idx + 1}`.padStart(4, " ") + ` | ${line}`)
        : ["No line changes."];

    return {
        added,
        removed,
        preview,
    };
}

function renderEditorHistoryDiff(entry = null) {
    if (!el.editorHistoryDiff) return;
    const active = getActiveFile();
    if (!active || !entry) {
        el.editorHistoryDiff.textContent = "Select a snapshot to preview differences.";
        return;
    }
    const diff = buildDiffSummary(entry.code, active.code);
    const lines = [
        `Snapshot: ${formatSnapshotTime(entry.at)} (${entry.reason})`,
        `Compared to current file: +${diff.added} / -${diff.removed}`,
        "",
        ...diff.preview,
    ];
    el.editorHistoryDiff.textContent = lines.join("\n");
}

function renderEditorHistoryList() {
    if (!el.editorHistoryList) return;
    const active = getActiveFile();
    if (!active) {
        el.editorHistoryList.innerHTML = "";
        renderEditorHistoryDiff(null);
        return;
    }
    const entries = getFileHistoryEntries(active.id);
    if (!entries.length) {
        el.editorHistoryList.innerHTML = `<li class="quick-open-empty">No snapshots yet.</li>`;
        selectedHistoryEntryId = null;
        renderEditorHistoryDiff(null);
        return;
    }
    if (!entries.some((entry) => entry.id === selectedHistoryEntryId)) {
        selectedHistoryEntryId = entries[0].id;
    }
    el.editorHistoryList.innerHTML = entries
        .map((entry) => {
            const activeRow = entry.id === selectedHistoryEntryId;
            return `
                <li>
                    <button type="button" class="editor-history-row" data-history-id="${entry.id}" data-active="${activeRow}">
                        <span>
                            <strong>${escapeHTML(formatSnapshotTime(entry.at))}</strong>
                            <span class="editor-history-meta">${escapeHTML(entry.reason)}</span>
                        </span>
                        <span class="editor-history-meta">${escapeHTML(formatRelativeTime(entry.at))}</span>
                    </button>
                </li>
            `;
        })
        .join("");
    const selected = entries.find((entry) => entry.id === selectedHistoryEntryId) || null;
    renderEditorHistoryDiff(selected);
}

function selectHistoryEntry(id) {
    const entries = getFileHistoryEntries(activeFileId);
    if (!entries.some((entry) => entry.id === id)) return false;
    selectedHistoryEntryId = id;
    renderEditorHistoryList();
    return true;
}

function restoreSelectedHistoryEntry() {
    const active = getActiveFile();
    if (!active) return false;
    const selected = getFileHistoryEntries(active.id).find((entry) => entry.id === selectedHistoryEntryId);
    if (!selected) return false;
    const nextCode = String(selected.code || "");
    setEditorValue(nextCode, { silent: true });
    updateActiveFileCode(nextCode);
    recordCodeSnapshot(active.id, nextCode, "restore-snapshot", { force: true });
    status.set(`Restored snapshot for ${active.name}`);
    logger.append("system", [`Restored snapshot for ${active.name}`]);
    queueEditorLint("restore");
    renderFileList();
    return true;
}

function clearActiveFileHistory() {
    if (!activeFileId) return false;
    delete fileCodeHistory[activeFileId];
    persistCodeHistory();
    selectedHistoryEntryId = null;
    renderEditorHistoryList();
    status.set("Cleared file history");
    return true;
}

function setEditorHistoryOpen(open) {
    editorHistoryOpen = Boolean(open);
    if (!el.editorHistoryPanel || !el.editorHistoryBackdrop) return;
    el.editorHistoryPanel.setAttribute("data-open", editorHistoryOpen ? "true" : "false");
    el.editorHistoryPanel.setAttribute("aria-hidden", editorHistoryOpen ? "false" : "true");
    el.editorHistoryBackdrop.setAttribute("data-open", editorHistoryOpen ? "true" : "false");
    el.editorHistoryBackdrop.setAttribute("aria-hidden", editorHistoryOpen ? "false" : "true");
    if (editorHistoryOpen) {
        renderEditorHistoryList();
        requestAnimationFrame(() => el.editorHistorySnapshot?.focus());
    }
}

function openEditorHistory() {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setEditorHistoryOpen(true);
}

function closeEditorHistory({ focusEditor = true } = {}) {
    if (!editorHistoryOpen) return;
    setEditorHistoryOpen(false);
    if (focusEditor) editor.focus();
}

function scheduleEditorAutosave(reason = "autosave-edit") {
    if (editorAutosaveTimer) {
        clearTimeout(editorAutosaveTimer);
        editorAutosaveTimer = null;
    }
    const waitMs = clamp(Number(editorSettings.autosaveMs || EDITOR_AUTOSAVE_DEFAULT_MS), 100, 5000);
    editorAutosaveTimer = setTimeout(() => {
        editorAutosaveTimer = null;
        persistFiles(reason);
        recordActiveCodeSnapshot("autosave", { force: false });
    }, waitMs);
}

function flushEditorAutosave() {
    if (!editorAutosaveTimer) return;
    clearTimeout(editorAutosaveTimer);
    editorAutosaveTimer = null;
    persistFiles("autosave-flush");
    recordActiveCodeSnapshot("autosave-flush", { force: false });
}

function clearInlineDiagnostics() {
    activeDiagnostics = [];
    if (activeFileId) {
        setLintProblemsForFile(activeFileId, []);
    }
    editor.clearMarks?.(EDITOR_MARK_KIND_DIAGNOSTIC);
    editor.clearLineWidgets?.(EDITOR_MARK_KIND_ERROR_LENS);
    editor.setGutterDiagnostics?.([]);
    if (el.editorFindStatus && editorSearchOpen) {
        el.editorFindStatus.textContent = "Inline diagnostics disabled.";
    }
}

function summarizeDiagnostics(list = []) {
    let errors = 0;
    let warns = 0;
    let info = 0;
    (Array.isArray(list) ? list : []).forEach((entry) => {
        if (entry.level === "error") errors += 1;
        else if (entry.level === "warn") warns += 1;
        else info += 1;
    });
    return { errors, warns, info };
}

function mergeDiagnostics(primary = [], secondary = []) {
    const merged = [];
    const seen = new Set();
    const push = (entry) => {
        if (!entry) return;
        const key = `${entry.level || "info"}:${entry.line || 0}:${entry.ch || 0}:${entry.endCh || 0}:${entry.message || ""}`;
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(entry);
    };
    (Array.isArray(primary) ? primary : []).forEach(push);
    (Array.isArray(secondary) ? secondary : []).forEach(push);
    return merged.slice(0, 160);
}

function getDiagnosticLevelLabel(level = "info") {
    if (level === "error") return "Error";
    if (level === "warn") return "Warning";
    return "Info";
}

function applyErrorLens(list = []) {
    editor.clearLineWidgets?.(EDITOR_MARK_KIND_ERROR_LENS);
    if (!editorSettings.lintEnabled || !editorSettings.errorLensEnabled) return;
    if (editor.type !== "codemirror") return;
    const diagnosticsList = Array.isArray(list) ? list : [];
    if (!diagnosticsList.length) return;

    const grouped = new Map();
    diagnosticsList.forEach((diag) => {
        const line = clamp(Number(diag.line) || 0, 0, Math.max(0, (editor.lineCount?.() || 1) - 1));
        const bucket = grouped.get(line) || [];
        bucket.push({
            level: normalizeProblemLevel(diag.level),
            message: String(diag.message || "Diagnostic"),
        });
        grouped.set(line, bucket);
    });

    const sortedLines = [...grouped.keys()].sort((a, b) => a - b).slice(0, 80);
    sortedLines.forEach((line) => {
        const entries = grouped.get(line) || [];
        if (!entries.length) return;
        const top = entries
            .slice()
            .sort((a, b) => getProblemSeverity(b.level) - getProblemSeverity(a.level))[0];
        const details = entries
            .slice(0, 2)
            .map((entry) => `${getDiagnosticLevelLabel(entry.level)}: ${entry.message}`);
        const extra = entries.length > 2 ? ` +${entries.length - 2} more` : "";
        const node = document.createElement("div");
        node.className = "cm-error-lens";
        node.dataset.level = top?.level || "info";
        node.textContent = `${details.join(" | ")}${extra}`;
        editor.addLineWidget?.(line, node, {
            kind: EDITOR_MARK_KIND_ERROR_LENS,
            noHScroll: true,
            coverGutter: false,
            above: false,
        });
    });
}

function applyInlineDiagnostics(list = []) {
    const diagnosticsList = Array.isArray(list) ? list : [];
    activeDiagnostics = diagnosticsList;
    if (activeFileId) {
        setLintProblemsForFile(activeFileId, diagnosticsList);
    }
    editor.clearMarks?.(EDITOR_MARK_KIND_DIAGNOSTIC);
    editor.clearLineWidgets?.(EDITOR_MARK_KIND_ERROR_LENS);
    editor.setGutterDiagnostics?.([]);
    if (!editorSettings.lintEnabled) return;
    if (!diagnosticsList.length) return;

    const maxLine = Math.max(0, editor.lineCount?.() - 1);
    const gutterRows = [];
    editor.operation?.(() => {
        diagnosticsList.forEach((diag) => {
            const line = clamp(Number(diag.line) || 0, 0, maxLine);
            const start = {
                line,
                ch: Math.max(0, Number(diag.ch) || 0),
            };
            const end = {
                line,
                ch: Math.max(start.ch + 1, Number(diag.endCh) || start.ch + 1),
            };
            const className = diag.level === "error"
                ? "cm-inline-error"
                : (diag.level === "warn" ? "cm-inline-warn" : "cm-inline-info");
            editor.markRange?.(start, end, {
                className,
                title: diag.message || "Diagnostic",
                kind: EDITOR_MARK_KIND_DIAGNOSTIC,
            });
            gutterRows.push({
                line,
                level: diag.level || "info",
                message: diag.message || "Diagnostic",
            });
        });
    });
    editor.setGutterDiagnostics?.(gutterRows);
    applyErrorLens(diagnosticsList);
}

async function handleLintResponse(payload = {}) {
    if (!payload || payload.id !== lintRequestId) return;
    const diagnosticsList = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
    let merged = diagnosticsList;
    try {
        const astDiagnostics = await astClient.diagnostics(editor.get());
        if (payload.id !== lintRequestId) return;
        merged = mergeDiagnostics(astDiagnostics, diagnosticsList);
    } catch {
        merged = diagnosticsList;
    }
    applyInlineDiagnostics(merged);
    const summary = summarizeDiagnostics(merged);
    if (summary.errors + summary.warns > 0) {
        status.set(`Lint: ${summary.errors} error(s), ${summary.warns} warning(s)`);
    } else if (merged.length) {
        status.set(`Lint: ${summary.info} info hint${summary.info === 1 ? "" : "s"}`);
    }
}

function initEditorLintWorker() {
    if (typeof Worker === "undefined" || lintWorker) return;
    try {
        lintWorker = new Worker(new URL("./workers/editorLint.worker.js", import.meta.url), { type: "module" });
        lintWorker.addEventListener("message", (event) => handleLintResponse(event.data));
        lintWorker.addEventListener("error", () => {
            lintWorker = null;
            pushDiag("warn", "Lint worker unavailable. Inline diagnostics disabled.");
            clearInlineDiagnostics();
        });
    } catch {
        lintWorker = null;
        pushDiag("warn", "Lint worker unavailable. Inline diagnostics disabled.");
    }
}

function runEditorLintNow(reason = "manual") {
    if (!editorSettings.lintEnabled) {
        clearInlineDiagnostics();
        return;
    }
    if (!shouldRunLintForActiveFile()) {
        clearInlineDiagnostics();
        return;
    }
    initEditorLintWorker();
    lintRequestId += 1;
    if (!lintWorker) {
        astClient.diagnostics(editor.get())
            .then((astDiagnostics) => {
                if (!editorSettings.lintEnabled) return;
                applyInlineDiagnostics(astDiagnostics);
                const summary = summarizeDiagnostics(astDiagnostics);
                if (summary.errors + summary.warns > 0) {
                    status.set(`Lint: ${summary.errors} error(s), ${summary.warns} warning(s)`);
                } else if (astDiagnostics.length) {
                    status.set(`Lint: ${summary.info} info hint${summary.info === 1 ? "" : "s"}`);
                }
            })
            .catch(() => {});
        return;
    }
    const request = {
        id: lintRequestId,
        reason,
        code: editor.get(),
        options: {
            trimWarnings: true,
            longLineWarnings: true,
            maxLineLength: 140,
        },
    };
    lintWorker.postMessage(request);
}

function queueEditorLint(reason = "input") {
    if (!editorSettings.lintEnabled) {
        clearInlineDiagnostics();
        return;
    }
    if (!shouldRunLintForActiveFile()) {
        clearInlineDiagnostics();
        return;
    }
    if (lintTimer) clearTimeout(lintTimer);
    lintTimer = setTimeout(() => {
        lintTimer = null;
        runEditorLintNow(reason);
    }, EDITOR_LINT_DEBOUNCE_MS);
}

function getFindState() {
    return {
        query: String(el.editorFindInput?.value || ""),
        replace: String(el.editorReplaceInput?.value || ""),
        caseSensitive: el.editorFindCase?.getAttribute("aria-pressed") === "true",
        wholeWord: el.editorFindWord?.getAttribute("aria-pressed") === "true",
        regex: el.editorFindRegex?.getAttribute("aria-pressed") === "true",
        selectionOnly: el.editorFindSelection?.getAttribute("aria-pressed") === "true",
    };
}

function setFindToggleState(button, active) {
    if (!button) return;
    button.setAttribute("aria-pressed", active ? "true" : "false");
}

function buildFindRegex(findState, { global = true } = {}) {
    if (!findState?.query) return null;
    const base = findState.regex ? findState.query : escapeRegExp(findState.query);
    const pattern = findState.wholeWord ? `\\b(?:${base})\\b` : base;
    const flags = `${global ? "g" : ""}${findState.caseSensitive ? "" : "i"}m`;
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

function getEditorSelectionRanges(source = editor.get()) {
    const max = String(source || "").length;
    const list = Array.isArray(editor.getSelections?.()) ? editor.getSelections() : [];
    const ranges = list
        .map((selection) => {
            const anchor = selection?.anchor || selection?.head;
            const head = selection?.head || selection?.anchor;
            if (!anchor || !head) return null;
            const a = clamp(editor.indexFromPos(anchor), 0, max);
            const b = clamp(editor.indexFromPos(head), 0, max);
            const start = Math.min(a, b);
            const end = Math.max(a, b);
            if (end <= start) return null;
            return { start, end };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
    if (!ranges.length) return [];
    const merged = [ranges[0]];
    for (let i = 1; i < ranges.length; i += 1) {
        const prev = merged[merged.length - 1];
        const curr = ranges[i];
        if (curr.start <= prev.end) {
            prev.end = Math.max(prev.end, curr.end);
        } else {
            merged.push(curr);
        }
    }
    return merged.slice(0, 16);
}

function getFindScopes(findState, source = editor.get()) {
    const text = String(source ?? "");
    if (!findState?.selectionOnly) {
        return [{ start: 0, end: text.length }];
    }
    return getEditorSelectionRanges(text);
}

function collectFindResults(code, findState) {
    const source = String(code ?? "");
    if (!buildFindRegex(findState, { global: true })) return [];
    const scopes = getFindScopes(findState, source);
    if (!scopes.length) return [];
    const results = [];
    for (const scope of scopes) {
        const segment = source.slice(scope.start, scope.end);
        const regex = buildFindRegex(findState, { global: true });
        if (!regex) return [];
        let match;
        let guard = 0;
        while ((match = regex.exec(segment)) && guard < 5000) {
            guard += 1;
            const text = String(match[0] ?? "");
            const start = scope.start + Math.max(0, Number(match.index) || 0);
            const end = Math.min(scope.end, start + Math.max(1, text.length));
            results.push({ start, end, text });
            if (!text.length) {
                regex.lastIndex += 1;
            }
            if (results.length >= 1500) break;
        }
        if (results.length >= 1500) break;
    }
    return results.slice(0, 1500);
}

function renderFindStatus() {
    if (!el.editorFindStatus) return;
    const findState = getFindState();
    if (!findState.query) {
        el.editorFindStatus.textContent = "Type to search the active file.";
        return;
    }
    if (!buildFindRegex(findState, { global: true })) {
        el.editorFindStatus.textContent = "Invalid regular expression.";
        return;
    }
    if (findState.selectionOnly && !getFindScopes(findState, editor.get()).length) {
        el.editorFindStatus.textContent = "Selection scope is on. Select text first.";
        return;
    }
    if (!findResults.length) {
        el.editorFindStatus.textContent = findState.selectionOnly ? "No matches in selection." : "No matches.";
        return;
    }
    el.editorFindStatus.textContent =
        `${findIndex + 1}/${findResults.length} match${findResults.length === 1 ? "" : "es"}${findState.selectionOnly ? " (selection)" : ""}`;
}

function renderFindDecorations() {
    if (!editorSearchOpen) return;
    editor.clearMarks?.(EDITOR_MARK_KIND_FIND);
    if (!findResults.length) return;
    const visible = findResults.slice(0, 300);
    editor.operation?.(() => {
        visible.forEach((item, idx) => {
            const className = idx === findIndex ? "cm-inline-warn" : "cm-inline-info";
            editor.markRange?.(
                editor.posFromIndex(item.start),
                editor.posFromIndex(item.end),
                { className, kind: EDITOR_MARK_KIND_FIND, title: "Find result" }
            );
        });
    });
    findDecorationsActive = true;
}

function selectFindResult(index, { focusEditor = true } = {}) {
    if (!findResults.length) return false;
    findIndex = clamp(index, 0, findResults.length - 1);
    const target = findResults[findIndex];
    if (!target) return false;
    const from = editor.posFromIndex(target.start);
    const to = editor.posFromIndex(target.end);
    editor.setSelections?.([{ anchor: from, head: to }]);
    editor.scrollIntoView?.(from, 120);
    renderFindDecorations();
    renderFindStatus();
    if (focusEditor) editor.focus();
    return true;
}

function refreshFindResults({ preserveIndex = true, focusSelection = false } = {}) {
    const currentCode = editor.get();
    const findState = getFindState();
    const previousStart = preserveIndex && findResults[findIndex] ? findResults[findIndex].start : null;
    findResults = collectFindResults(currentCode, findState);
    if (!findResults.length) {
        findIndex = 0;
        renderFindDecorations();
        renderFindStatus();
        return;
    }
    if (previousStart != null) {
        const near = findResults.findIndex((item) => item.start >= previousStart);
        findIndex = near >= 0 ? near : 0;
    } else {
        findIndex = clamp(findIndex, 0, findResults.length - 1);
    }
    renderFindDecorations();
    renderFindStatus();
    if (focusSelection) {
        selectFindResult(findIndex, { focusEditor: false });
    }
}

function replaceCurrentFindResult() {
    if (!editorSearchOpen || !findResults.length) return false;
    const findState = getFindState();
    const target = findResults[findIndex];
    if (!target) return false;
    const singleRegex = buildFindRegex(findState, { global: false });
    if (!singleRegex) return false;
    const replacement = String(target.text).replace(singleRegex, findState.replace);
    editor.replaceRange?.(replacement, editor.posFromIndex(target.start), editor.posFromIndex(target.end));
    updateActiveFileCode(editor.get());
    refreshFindResults({ preserveIndex: false, focusSelection: true });
    queueEditorLint("replace-one");
    return true;
}

function replaceAllFindResults() {
    if (!editorSearchOpen) return false;
    const code = editor.get();
    const findState = getFindState();
    if (!findResults.length) return false;
    let replaced = code;
    if (findState.selectionOnly) {
        const scopes = getFindScopes(findState, code);
        if (!scopes.length) return false;
        const ordered = [...scopes].sort((a, b) => b.start - a.start);
        ordered.forEach((scope) => {
            const regex = buildFindRegex(findState, { global: true });
            if (!regex) return;
            const segment = replaced.slice(scope.start, scope.end);
            const nextSegment = segment.replace(regex, findState.replace);
            replaced = `${replaced.slice(0, scope.start)}${nextSegment}${replaced.slice(scope.end)}`;
        });
    } else {
        const regex = buildFindRegex(findState, { global: true });
        if (!regex) return false;
        replaced = code.replace(regex, findState.replace);
    }
    setEditorValue(replaced, { silent: true });
    updateActiveFileCode(replaced);
    refreshFindResults({ preserveIndex: false, focusSelection: false });
    renderFileList();
    queueEditorLint("replace-all");
    status.set(`Replaced ${findResults.length} matches`);
    return true;
}

function setEditorSearchOpen(open, { replaceMode = false } = {}) {
    editorSearchOpen = Boolean(open);
    if (!el.editorSearchPanel || !el.editorSearchBackdrop) return;
    el.editorSearchPanel.setAttribute("data-open", editorSearchOpen ? "true" : "false");
    el.editorSearchPanel.setAttribute("aria-hidden", editorSearchOpen ? "false" : "true");
    el.editorSearchBackdrop.setAttribute("data-open", editorSearchOpen ? "true" : "false");
    el.editorSearchBackdrop.setAttribute("aria-hidden", editorSearchOpen ? "false" : "true");
    if (editorSearchOpen) {
        if (el.editorReplaceInput) {
            el.editorReplaceInput.disabled = !replaceMode;
            el.editorReplaceInput.placeholder = replaceMode ? "Replace with..." : "Enable replace (Ctrl/Cmd+H)";
        }
        refreshFindResults({ preserveIndex: false, focusSelection: false });
        requestAnimationFrame(() => {
            if (replaceMode && el.editorReplaceInput) {
                el.editorReplaceInput.focus();
                el.editorReplaceInput.select();
            } else if (el.editorFindInput) {
                el.editorFindInput.focus();
                el.editorFindInput.select();
            }
        });
        return;
    }
    if (findDecorationsActive) {
        editor.clearMarks?.(EDITOR_MARK_KIND_FIND);
        findDecorationsActive = false;
    }
}

function openEditorSearch({ replaceMode = false } = {}) {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setEditorSearchOpen(true, { replaceMode });
}

function closeEditorSearch({ focusEditor = true } = {}) {
    if (!editorSearchOpen) return;
    setEditorSearchOpen(false);
    if (focusEditor) editor.focus();
}

function moveFindSelection(step = 1) {
    if (!findResults.length) {
        refreshFindResults({ preserveIndex: false, focusSelection: false });
        if (!findResults.length) return false;
    }
    const next = clamp(findIndex + step, 0, findResults.length - 1);
    return selectFindResult(next, { focusEditor: true });
}

function getProjectSearchState() {
    return {
        query: String(el.projectSearchInput?.value || ""),
        replace: String(el.projectReplaceInput?.value || ""),
        caseSensitive: el.projectSearchCase?.getAttribute("aria-pressed") === "true",
        wholeWord: el.projectSearchWord?.getAttribute("aria-pressed") === "true",
        regex: el.projectSearchRegex?.getAttribute("aria-pressed") === "true",
    };
}

function buildProjectSearchRegex(state, { global = true } = {}) {
    if (!state?.query) return null;
    const base = state.regex ? state.query : escapeRegExp(state.query);
    const pattern = state.wholeWord ? `\\b(?:${base})\\b` : base;
    const flags = `${global ? "g" : ""}${state.caseSensitive ? "" : "i"}m`;
    try {
        return new RegExp(pattern, flags);
    } catch {
        return null;
    }
}

function createProjectPreview(code, start, end) {
    const source = String(code || "");
    const lineStart = Math.max(0, source.lastIndexOf("\n", Math.max(0, start - 1)) + 1);
    const lineEndRaw = source.indexOf("\n", end);
    const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
    const lineText = source.slice(lineStart, lineEnd);
    return lineText.trim() || "(blank line)";
}

function indexToLineChInCode(code, index) {
    const source = String(code || "");
    const target = clamp(Number(index) || 0, 0, source.length);
    let line = 0;
    let ch = 0;
    for (let i = 0; i < target; i += 1) {
        if (source[i] === "\n") {
            line += 1;
            ch = 0;
        } else {
            ch += 1;
        }
    }
    return { line, ch };
}

function scanProjectMatches() {
    const state = getProjectSearchState();
    const regex = buildProjectSearchRegex(state, { global: true });
    if (!regex) return { state, results: [], invalidRegex: Boolean(state.query) };
    const results = [];
    files.forEach((file) => {
        const code = String(file.code || "");
        let match;
        let guard = 0;
        while ((match = regex.exec(code)) && guard < 6000) {
            guard += 1;
            const text = String(match[0] || "");
            const start = Math.max(0, Number(match.index) || 0);
            const end = start + Math.max(1, text.length);
            const from = indexToLineChInCode(code, start);
            results.push({
                id: `${file.id}:${start}:${end}`,
                fileId: file.id,
                fileName: file.name,
                start,
                end,
                text,
                line: Number(from.line) + 1,
                ch: Number(from.ch) + 1,
                preview: createProjectPreview(code, start, end),
            });
            if (!text.length) regex.lastIndex += 1;
            if (results.length >= 2000) break;
        }
    });
    return { state, results, invalidRegex: false };
}

function renderProjectSearchResults() {
    if (!el.projectSearchList) return;
    if (!projectSearchResults.length) {
        el.projectSearchList.innerHTML = `<li class="quick-open-empty">No project matches.</li>`;
        return;
    }
    el.projectSearchList.innerHTML = projectSearchResults
        .map((item) => {
            const checked = projectSearchSelectedIds.has(item.id);
            return `
                <li class="quick-open-item-wrap" role="presentation">
                    <button type="button" class="project-search-item" data-project-result-id="${item.id}" data-active="${checked}">
                        <input type="checkbox" data-project-result-toggle="${item.id}" ${checked ? "checked" : ""} />
                        <span>
                            <span class="project-search-file">${escapeHTML(item.fileName)}:${item.line}:${item.ch}</span>
                            <span class="project-search-preview">${escapeHTML(item.preview)}</span>
                        </span>
                        <span class="quick-open-meta">${escapeHTML(item.text)}</span>
                    </button>
                </li>
            `;
        })
        .join("");
}

function updateProjectSearchHint(message = "") {
    if (!el.projectSearchHint) return;
    if (message) {
        el.projectSearchHint.textContent = message;
        return;
    }
    const selected = projectSearchSelectedIds.size;
    const total = projectSearchResults.length;
    el.projectSearchHint.textContent = `${total} matches • ${selected} selected`;
}

function runProjectSearchScan() {
    const { results, invalidRegex } = scanProjectMatches();
    projectSearchResults = results;
    projectSearchSelectedIds = new Set(results.map((item) => item.id));
    renderProjectSearchResults();
    if (invalidRegex) {
        updateProjectSearchHint("Invalid regular expression.");
        return;
    }
    updateProjectSearchHint();
}

function toggleProjectResultSelection(id, forced = null) {
    if (!id) return;
    const next = forced == null ? !projectSearchSelectedIds.has(id) : Boolean(forced);
    if (next) projectSearchSelectedIds.add(id);
    else projectSearchSelectedIds.delete(id);
    renderProjectSearchResults();
    updateProjectSearchHint();
}

function selectAllProjectResults(selected) {
    if (selected) {
        projectSearchSelectedIds = new Set(projectSearchResults.map((item) => item.id));
    } else {
        projectSearchSelectedIds = new Set();
    }
    renderProjectSearchResults();
    updateProjectSearchHint();
}

function jumpToProjectResult(id) {
    const item = projectSearchResults.find((entry) => entry.id === id);
    if (!item) return false;
    const target = files.find((file) => file.id === item.fileId);
    if (!target) return false;
    setSingleSelection(target.id);
    selectFile(target.id);
    const from = editor.posFromIndex(item.start);
    const to = editor.posFromIndex(item.end);
    editor.setSelections?.([{ anchor: from, head: to }]);
    editor.scrollIntoView?.(from, 100);
    return true;
}

function replaceSelectedProjectResults() {
    if (projectSearchOpen && debouncedProjectSearchScan.pending()) {
        debouncedProjectSearchScan.flush();
    }
    const state = getProjectSearchState();
    const singleRegex = buildProjectSearchRegex(state, { global: false });
    if (!singleRegex) {
        updateProjectSearchHint("Invalid regular expression.");
        return false;
    }
    const selected = projectSearchResults.filter((item) => projectSearchSelectedIds.has(item.id));
    if (!selected.length) {
        updateProjectSearchHint("No selected matches.");
        return false;
    }
    const byFile = new Map();
    selected.forEach((item) => {
        const list = byFile.get(item.fileId) || [];
        list.push(item);
        byFile.set(item.fileId, list);
    });

    let replaceCount = 0;
    byFile.forEach((entries, fileId) => {
        const file = files.find((entry) => entry.id === fileId);
        if (!file) return;
        const ordered = [...entries].sort((a, b) => b.start - a.start);
        let nextCode = String(file.code || "");
        ordered.forEach((match) => {
            const currentText = nextCode.slice(match.start, match.end);
            const replacement = currentText.replace(singleRegex, state.replace);
            nextCode = `${nextCode.slice(0, match.start)}${replacement}${nextCode.slice(match.end)}`;
            replaceCount += 1;
        });
        file.code = nextCode;
        file.touchedAt = Date.now();
    });

    const active = getActiveFile();
    if (active) {
        setEditorValue(active.code, { silent: true });
    }
    persistFiles("project-replace");
    renderFileList();
    queueEditorLint("project-replace");
    runProjectSearchScan();
    status.set(`Project replace: ${replaceCount} match${replaceCount === 1 ? "" : "es"}`);
    return true;
}

function setProjectSearchOpen(open) {
    projectSearchOpen = Boolean(open);
    if (!el.projectSearchPanel || !el.projectSearchBackdrop) return;
    el.projectSearchPanel.setAttribute("data-open", projectSearchOpen ? "true" : "false");
    el.projectSearchPanel.setAttribute("aria-hidden", projectSearchOpen ? "false" : "true");
    el.projectSearchBackdrop.setAttribute("data-open", projectSearchOpen ? "true" : "false");
    el.projectSearchBackdrop.setAttribute("aria-hidden", projectSearchOpen ? "false" : "true");
    if (projectSearchOpen) {
        debouncedProjectSearchScan.cancel();
        runProjectSearchScan();
        requestAnimationFrame(() => {
            el.projectSearchInput?.focus();
            el.projectSearchInput?.select();
        });
        return;
    }
    debouncedProjectSearchScan.cancel();
    projectSearchResults = [];
    projectSearchSelectedIds = new Set();
    if (el.projectSearchList) el.projectSearchList.innerHTML = "";
}

function openProjectSearch() {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setProjectSearchOpen(true);
}

function closeProjectSearch({ focusEditor = true } = {}) {
    if (!projectSearchOpen) return;
    setProjectSearchOpen(false);
    if (focusEditor) editor.focus();
}

function parseSymbolsFromCodeFallback(code) {
    const lines = String(code ?? "").split("\n");
    const symbols = [];
    const pushSymbol = (line, ch, name, kind, signature = "") => {
        if (!name) return;
        symbols.push({
            id: `symbol-${line}-${ch}-${kind}-${name}`,
            line,
            ch,
            name,
            kind,
            signature: signature || name,
        });
    };

    lines.forEach((lineText, line) => {
        const fn = lineText.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/);
        if (fn) {
            pushSymbol(line, lineText.indexOf(fn[1]), fn[1], "function", `${fn[1]}(${fn[2]})`);
            return;
        }
        const cls = lineText.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/);
        if (cls) {
            pushSymbol(line, lineText.indexOf(cls[1]), cls[1], "class", cls[1]);
            return;
        }
        const varFn = lineText.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/);
        if (varFn) {
            pushSymbol(line, lineText.indexOf(varFn[1]), varFn[1], "arrow", `${varFn[1]}(${varFn[2]}) =>`);
            return;
        }
        const variable = lineText.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/);
        if (variable) {
            pushSymbol(line, lineText.indexOf(variable[1]), variable[1], "variable", variable[1]);
            return;
        }
        const method = lineText.match(/^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/);
        if (method) {
            const reserved = new Set(["if", "for", "while", "switch", "catch"]);
            if (!reserved.has(method[1])) {
                pushSymbol(line, lineText.indexOf(method[1]), method[1], "method", `${method[1]}(${method[2]})`);
            }
        }
    });

    return symbols;
}

function getSymbolMatches(query = "", symbols = null) {
    const all = Array.isArray(symbols) ? symbols : parseSymbolsFromCodeFallback(editor.get());
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return all.slice(0, 250);
    return all
        .map((entry) => {
            const hay = `${entry.name} ${entry.kind} ${entry.signature}`.toLowerCase();
            const score = scoreQuickOpenMatch(hay, normalized);
            return { entry, score };
        })
        .filter((row) => Number.isFinite(row.score) && row.score > Number.NEGATIVE_INFINITY)
        .sort((a, b) => b.score - a.score || a.entry.line - b.entry.line)
        .map((row) => row.entry)
        .slice(0, 250);
}

async function getSymbolsForCurrentCode() {
    const code = editor.get();
    try {
        const astSymbols = await astClient.symbols(code);
        if (Array.isArray(astSymbols) && astSymbols.length) {
            return astSymbols.map((entry) => ({
                id: String(entry.id || `symbol-${entry.line || 0}-${entry.ch || 0}-${entry.name || "item"}`),
                line: Math.max(0, Number(entry.line) || 0),
                ch: Math.max(0, Number(entry.ch) || 0),
                name: String(entry.name || ""),
                kind: String(entry.kind || "symbol"),
                signature: String(entry.detail || entry.signature || entry.name || ""),
                start: Number(entry.start) || 0,
                end: Number(entry.end) || 0,
            }));
        }
    } catch {
        // fallback below
    }
    return parseSymbolsFromCodeFallback(code);
}

function getSymbolReferenceName() {
    const selected = symbolResults[symbolIndex];
    if (selected?.name) return selected.name;
    const query = String(el.symbolSearchInput?.value || "").trim();
    if (/^[A-Za-z_$][\w$]*$/.test(query)) return query;
    const currentWord = editor.getWordAt?.();
    if (currentWord?.word) return currentWord.word;
    return "";
}

function renderSymbolReferenceResults() {
    if (!el.symbolRefsList) return;
    if (!symbolReferenceResults.length) {
        el.symbolRefsList.innerHTML = `<li class="quick-open-empty">No references yet.</li>`;
        return;
    }
    el.symbolRefsList.innerHTML = symbolReferenceResults
        .map((entry) => `
            <li class="quick-open-item-wrap" role="presentation">
                <button type="button" class="quick-open-item" data-symbol-ref-id="${entry.id}">
                    <span>
                        <span class="symbol-row-kind">${escapeHTML(entry.role || "reference")}</span>
                        <span class="symbol-row-name">${escapeHTML(entry.fileName)}:${entry.line}:${entry.ch}</span>
                    </span>
                    <span class="quick-open-meta">${escapeHTML(entry.preview)}</span>
                </button>
            </li>
        `)
        .join("");
}

async function findReferencesForSymbol(name = "") {
    const targetName = String(name || "").trim();
    if (!targetName) {
        status.set("Place cursor on an identifier first.");
        return false;
    }
    const requestId = ++symbolReferenceRequestId;
    if (el.symbolHint) {
        el.symbolHint.textContent = `Finding refs for "${targetName}"...`;
    }
    const snapshots = files.map((file) => ({
        fileId: file.id,
        fileName: file.name,
        code: String(file.id === activeFileId ? editor.get() : (file.code || "")),
    }));
    const fallbackRefs = (code, symbolName) => {
        const source = String(code || "");
        const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, "g");
        const refs = [];
        let match;
        let guard = 0;
        while ((match = regex.exec(source)) && guard < 4000) {
            guard += 1;
            const text = String(match[0] || "");
            const start = Math.max(0, Number(match.index) || 0);
            const end = start + Math.max(1, text.length);
            const pos = indexToLineChInCode(source, start);
            refs.push({
                role: "reference",
                start,
                end,
                line: pos.line,
                ch: pos.ch,
            });
            if (!text.length) regex.lastIndex += 1;
        }
        return refs;
    };
    const groups = await Promise.all(
        snapshots.map(async (snapshot) => {
            let refs = [];
            try {
                refs = await astClient.references(snapshot.code, targetName);
            } catch {
                refs = [];
            }
            if (!Array.isArray(refs) || !refs.length) {
                refs = fallbackRefs(snapshot.code, targetName);
            }
            return refs.map((ref) => {
                const start = Math.max(0, Number(ref.start) || 0);
                const end = Math.max(start + 1, Number(ref.end) || start + 1);
                const pos = indexToLineChInCode(snapshot.code, start);
                return {
                    id: `${snapshot.fileId}:${start}:${end}`,
                    fileId: snapshot.fileId,
                    fileName: snapshot.fileName,
                    role: String(ref.role || "reference"),
                    start,
                    end,
                    line: Number.isFinite(ref.line) ? Number(ref.line) + 1 : pos.line + 1,
                    ch: Number.isFinite(ref.ch) ? Number(ref.ch) + 1 : pos.ch + 1,
                    preview: createProjectPreview(snapshot.code, start, end),
                };
            });
        })
    );
    if (requestId !== symbolReferenceRequestId) return false;
    symbolReferenceResults = groups
        .flat()
        .sort((a, b) =>
            a.fileName.localeCompare(b.fileName) ||
            a.line - b.line ||
            a.ch - b.ch
        )
        .slice(0, 600);
    renderSymbolReferenceResults();
    if (el.symbolHint) {
        const count = symbolReferenceResults.length;
        el.symbolHint.textContent =
            `${count} reference${count === 1 ? "" : "s"} for "${targetName}" • click to jump`;
    }
    return true;
}

async function findReferencesAtCursor() {
    const name = getSymbolReferenceName();
    if (!name) {
        status.set("Place cursor on an identifier first.");
        return false;
    }
    if (!symbolPaletteOpen) {
        openSymbolPalette();
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return findReferencesForSymbol(name);
}

function jumpToSymbolReference(refId) {
    const target = symbolReferenceResults.find((entry) => entry.id === refId);
    if (!target) return false;
    const file = getFileById(target.fileId);
    if (!file) return false;
    setSingleSelection(file.id);
    selectFile(file.id);
    const from = editor.posFromIndex(target.start);
    const to = editor.posFromIndex(target.end);
    editor.setSelections?.([{ anchor: from, head: to }]);
    editor.scrollIntoView?.(from, 120);
    highlightSymbolAt({
        line: from.line,
        ch: from.ch,
        name: editor.getRange?.(from, to) || getSymbolReferenceName() || "symbol",
    });
    return true;
}

function renderSymbolResults() {
    if (!el.symbolList) return;
    if (!symbolResults.length) {
        el.symbolList.innerHTML = `<li class="quick-open-empty">No symbols found.</li>`;
        if (el.symbolHint) el.symbolHint.textContent = "No symbols for current filter.";
        return;
    }
    symbolIndex = clamp(symbolIndex, 0, symbolResults.length - 1);
    el.symbolList.innerHTML = symbolResults
        .map((symbol, index) => {
            const active = index === symbolIndex;
            return `
                <li class="quick-open-item-wrap" role="presentation">
                    <button type="button" class="quick-open-item" role="option" data-symbol-id="${symbol.id}" data-active="${active}" aria-selected="${active}">
                        <span>
                            <span class="symbol-row-kind">${escapeHTML(symbol.kind)}</span>
                            <span class="symbol-row-name">${escapeHTML(symbol.signature || symbol.name)}</span>
                        </span>
                        <span class="quick-open-meta">L${symbol.line + 1}</span>
                    </button>
                </li>
            `;
        })
        .join("");
    if (el.symbolHint) {
        el.symbolHint.textContent = `${symbolResults.length} symbol${symbolResults.length === 1 ? "" : "s"} • Enter to jump • Ctrl/Cmd+Enter refs`;
    }
    const activeEl = el.symbolList.querySelector('[data-symbol-id][data-active="true"]');
    activeEl?.scrollIntoView?.({ block: "nearest" });
}

async function refreshSymbolResults(query = el.symbolSearchInput?.value || "") {
    const requestId = ++symbolRequestId;
    const sourceSymbols = await getSymbolsForCurrentCode();
    if (requestId !== symbolRequestId) return;
    symbolResults = getSymbolMatches(query, sourceSymbols);
    if (symbolResults.length && symbolIndex >= symbolResults.length) {
        symbolIndex = 0;
    }
    renderSymbolResults();
}

function highlightSymbolAt(symbol) {
    if (!symbol) return;
    editor.clearMarks?.(EDITOR_MARK_KIND_SYMBOL);
    const from = { line: symbol.line, ch: symbol.ch };
    const to = { line: symbol.line, ch: symbol.ch + symbol.name.length };
    editor.markRange?.(from, to, {
        className: "cm-inline-info",
        title: "Symbol",
        kind: EDITOR_MARK_KIND_SYMBOL,
    });
    setTimeout(() => editor.clearMarks?.(EDITOR_MARK_KIND_SYMBOL), 900);
}

function activateSymbol(index = symbolIndex) {
    const symbol = symbolResults[index];
    if (!symbol) return false;
    symbolIndex = index;
    const from = { line: symbol.line, ch: symbol.ch };
    const to = { line: symbol.line, ch: symbol.ch + symbol.name.length };
    editor.setSelections?.([{ anchor: from, head: to }]);
    editor.scrollIntoView?.(from, 120);
    highlightSymbolAt(symbol);
    closeSymbolPalette({ focusEditor: true });
    return true;
}

async function promptGoToLine() {
    const lineCount = editor.lineCount?.() || 1;
    const raw = await showTextPromptDialog({
        title: "Go To Line",
        message: `Enter a line number between 1 and ${lineCount}.`,
        inputValue: "1",
        inputPlaceholder: "Line number",
        validate(value) {
            const trimmed = String(value || "").trim();
            if (!trimmed) return "Line number is required.";
            const numeric = Number(trimmed);
            if (!Number.isFinite(numeric)) return "Enter a valid number.";
            return "";
        },
        normalize(value) {
            return String(value || "").trim();
        },
        confirmText: "Go",
        cancelText: "Cancel",
    });
    if (raw == null) return false;
    const next = clamp(Number(raw) || 1, 1, lineCount);
    const target = { line: next - 1, ch: 0 };
    editor.setCursor?.(target);
    editor.scrollIntoView?.(target, 120);
    closeSymbolPalette({ focusEditor: true });
    status.set(`Moved to line ${next}`);
    return true;
}

async function renameSymbolAtCursor() {
    const symbol = editor.getWordAt?.();
    const currentName = symbol?.word || "";
    if (!currentName || !/^[A-Za-z_$][\w$]*$/.test(currentName)) {
        status.set("Place cursor on an identifier first.");
        return false;
    }
    const nextName = await showTextPromptDialog({
        title: "Rename Symbol",
        message: `Rename "${currentName}" to:`,
        inputValue: currentName,
        inputPlaceholder: "New symbol name",
        normalize(value) {
            return String(value || "").trim();
        },
        validate(value) {
            if (!value) return "Name is required.";
            if (!/^[A-Za-z_$][\w$]*$/.test(value)) return "Use a valid JavaScript identifier.";
            return "";
        },
        confirmText: "Rename",
        cancelText: "Cancel",
    });
    if (nextName == null) return false;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === currentName) return false;
    if (!/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
        status.set("Invalid identifier name.");
        return false;
    }
    const code = editor.get();
    let updated = code;
    let renameCount = 0;
    try {
        const astRename = await astClient.rename(code, currentName, trimmed);
        if (astRename.ok && astRename.edits.length > 0) {
            updated = astRename.nextCode;
            renameCount = astRename.edits.length;
        }
    } catch {
        // fallback below
    }
    if (renameCount === 0) {
        const regex = new RegExp(`\\b${escapeRegExp(currentName)}\\b`, "g");
        const matches = code.match(regex) || [];
        if (!matches.length) return false;
        renameCount = matches.length;
        updated = code.replace(regex, trimmed);
    }
    const proceed = await showConfirmDialog({
        title: "Confirm Symbol Rename",
        message: `Rename ${renameCount} occurrence${renameCount === 1 ? "" : "s"} of "${currentName}" to "${trimmed}"?`,
        confirmText: "Rename",
        cancelText: "Cancel",
        danger: false,
    });
    if (!proceed) return false;
    setEditorValue(updated, { silent: true });
    updateActiveFileCode(updated);
    recordActiveCodeSnapshot("rename-symbol", { force: true });
    renderFileList();
    queueEditorLint("rename-symbol");
    refreshSymbolResults(el.symbolSearchInput?.value || "");
    status.set(`Renamed ${renameCount} occurrence${renameCount === 1 ? "" : "s"}`);
    return true;
}

function setSymbolPaletteOpen(open) {
    symbolPaletteOpen = Boolean(open);
    if (!el.symbolPalette || !el.symbolPaletteBackdrop) return;
    el.symbolPalette.setAttribute("data-open", symbolPaletteOpen ? "true" : "false");
    el.symbolPalette.setAttribute("aria-hidden", symbolPaletteOpen ? "false" : "true");
    el.symbolPaletteBackdrop.setAttribute("data-open", symbolPaletteOpen ? "true" : "false");
    el.symbolPaletteBackdrop.setAttribute("aria-hidden", symbolPaletteOpen ? "false" : "true");
    if (symbolPaletteOpen) {
        refreshSymbolResults("");
        symbolReferenceResults = [];
        renderSymbolReferenceResults();
        requestAnimationFrame(() => {
            el.symbolSearchInput?.focus();
            el.symbolSearchInput?.select();
        });
    } else {
        symbolResults = [];
        symbolIndex = 0;
        symbolReferenceResults = [];
        symbolReferenceRequestId += 1;
        if (el.symbolSearchInput) el.symbolSearchInput.value = "";
        if (el.symbolList) el.symbolList.innerHTML = "";
        if (el.symbolRefsList) el.symbolRefsList.innerHTML = "";
    }
}

function openSymbolPalette() {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setSymbolPaletteOpen(true);
}

function closeSymbolPalette({ focusEditor = true } = {}) {
    if (!symbolPaletteOpen) return;
    setSymbolPaletteOpen(false);
    if (focusEditor) editor.focus();
}

function getUniqueSelections(list = []) {
    const seen = new Set();
    const unique = [];
    (Array.isArray(list) ? list : []).forEach((sel) => {
        const anchor = sel?.anchor || sel?.head;
        const head = sel?.head || sel?.anchor;
        if (!anchor || !head) return;
        const key = `${anchor.line}:${anchor.ch}:${head.line}:${head.ch}`;
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({ anchor, head });
    });
    return unique;
}

function addCursorVertical(direction = 1) {
    if (!editor.supportsMultiCursor) return false;
    const selections = editor.getSelections?.() || [];
    if (!selections.length) return false;
    const next = [...selections];
    selections.forEach((sel) => {
        const head = sel?.head || sel?.anchor;
        if (!head) return;
        const targetLine = clamp(head.line + direction, 0, Math.max(0, (editor.lineCount?.() || 1) - 1));
        const lineText = editor.getLine?.(targetLine) || "";
        const targetCh = clamp(head.ch, 0, lineText.length);
        next.push({
            anchor: { line: targetLine, ch: targetCh },
            head: { line: targetLine, ch: targetCh },
        });
    });
    const unique = getUniqueSelections(next);
    if (!unique.length) return false;
    editor.setSelections?.(unique);
    status.set(`Cursors: ${unique.length}`);
    return true;
}

function normalizeSnippetScope(scope) {
    const value = String(scope || "*").trim().toLowerCase();
    if (!value || value === "all" || value === "any") return "*";
    return SNIPPET_SCOPE_VALUES.has(value) ? value : "*";
}

function detectLanguageFromFileName(fileName = "") {
    const lower = String(fileName || "").toLowerCase();
    if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".jsx")) return "javascript";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
    return "text";
}

function getEditorModeForLanguage(language = "text") {
    if (language === "javascript") return "javascript";
    if (language === "typescript") return "javascript";
    if (language === "json") return { name: "javascript", json: true };
    if (language === "html") return "text/html";
    if (language === "css") return "css";
    if (language === "markdown") return "markdown";
    return "text/plain";
}

function applyEditorLanguageForActiveFile() {
    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    editor.setOptions?.({ mode: getEditorModeForLanguage(language) });
}

function shouldRunLintForLanguage(language = "text") {
    return language === "javascript" || language === "typescript" || language === "json";
}

function shouldRunLintForActiveFile() {
    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    return shouldRunLintForLanguage(language);
}

function getActiveSnippetScope() {
    const active = getActiveFile();
    if (!active?.name) return "javascript";
    return detectLanguageFromFileName(active.name);
}

function normalizeSnippet(snippet) {
    if (!snippet || typeof snippet !== "object") return null;
    const trigger = String(snippet.trigger || "").trim();
    const template = String(snippet.template || "");
    const scope = normalizeSnippetScope(snippet.scope);
    if (!trigger || !template) return null;
    return { trigger, template, scope };
}

function persistSnippetRegistry() {
    save(STORAGE.SNIPPETS, JSON.stringify(snippetRegistry));
}

function loadSnippetRegistry() {
    const raw = load(STORAGE.SNIPPETS);
    if (!raw) {
        snippetRegistry = DEFAULT_SNIPPETS.map((entry) => ({ ...entry }));
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            snippetRegistry = DEFAULT_SNIPPETS.map((entry) => ({ ...entry }));
            return;
        }
        if (!parsed.length) {
            snippetRegistry = [];
            return;
        }
        const normalized = parsed
            .map((entry) => normalizeSnippet(entry))
            .filter(Boolean);
        snippetRegistry = normalized.length ? normalized : DEFAULT_SNIPPETS.map((entry) => ({ ...entry }));
    } catch {
        snippetRegistry = DEFAULT_SNIPPETS.map((entry) => ({ ...entry }));
    }
}

function registerSnippet(snippet, { replace = true } = {}) {
    const normalized = normalizeSnippet(snippet);
    if (!normalized) return false;
    const index = snippetRegistry.findIndex(
        (entry) => entry.trigger === normalized.trigger && normalizeSnippetScope(entry.scope) === normalized.scope
    );
    if (index >= 0) {
        if (!replace) return false;
        snippetRegistry[index] = normalized;
        persistSnippetRegistry();
        return true;
    }
    snippetRegistry.push(normalized);
    snippetRegistry.sort((a, b) =>
        a.trigger.localeCompare(b.trigger) ||
        normalizeSnippetScope(a.scope).localeCompare(normalizeSnippetScope(b.scope))
    );
    persistSnippetRegistry();
    return true;
}

function unregisterSnippet(trigger, scope = null) {
    const key = String(trigger || "").trim();
    if (!key) return false;
    const scopeKey = scope == null ? null : normalizeSnippetScope(scope);
    const before = snippetRegistry.length;
    snippetRegistry = snippetRegistry.filter((entry) => {
        if (entry.trigger !== key) return true;
        if (scopeKey == null) return false;
        return normalizeSnippetScope(entry.scope) !== scopeKey;
    });
    const changed = snippetRegistry.length !== before;
    if (changed) persistSnippetRegistry();
    return changed;
}

function renderSnippetList() {
    if (!el.snippetList) return;
    if (!snippetRegistry.length) {
        el.snippetList.innerHTML = `<li class="quick-open-empty">No snippets registered.</li>`;
        return;
    }
    const activeScope = getActiveSnippetScope();
    el.snippetList.innerHTML = snippetRegistry
        .map((entry) => {
            const scope = normalizeSnippetScope(entry.scope);
            const inScope = scope === "*" || scope === activeScope;
            return `
                <li class="snippet-item">
                    <div>
                        <div class="snippet-item-meta">
                            <span class="snippet-item-trigger">${escapeHTML(entry.trigger)}</span>
                            <span class="snippet-item-scope">${escapeHTML(scope === "*" ? "all" : scope)}</span>
                            ${inScope ? `<span class="file-meta">active</span>` : ""}
                        </div>
                        <div class="snippet-item-template">${escapeHTML(entry.template)}</div>
                    </div>
                    <div class="snippet-item-actions">
                        <button type="button" data-snippet-edit="${escapeHTML(entry.trigger)}" data-snippet-edit-scope="${escapeHTML(scope)}">Use</button>
                        <button type="button" data-snippet-remove="${escapeHTML(entry.trigger)}" data-snippet-scope="${escapeHTML(scope)}">Remove</button>
                    </div>
                </li>
            `;
        })
        .join("");
}

function loadSnippetIntoInputs(trigger, scope = "*") {
    const key = String(trigger || "").trim();
    const scopeKey = normalizeSnippetScope(scope);
    if (!key) return false;
    const entry = snippetRegistry.find((item) =>
        item.trigger === key && normalizeSnippetScope(item.scope) === scopeKey
    );
    if (!entry) return false;
    if (el.snippetTriggerInput) el.snippetTriggerInput.value = entry.trigger;
    if (el.snippetScopeSelect) el.snippetScopeSelect.value = normalizeSnippetScope(entry.scope);
    if (el.snippetTemplateInput) {
        el.snippetTemplateInput.value = entry.template;
        el.snippetTemplateInput.focus();
    }
    status.set(`Loaded snippet: ${entry.trigger}`);
    return true;
}

function parseSnippetTemplate(template) {
    const text = String(template || "");
    const pattern = /\$\{(\d+)(?::([^}]*))?\}|\$(\d+)/g;
    let cursor = 0;
    let output = "";
    const stops = [];
    let finalStop = null;
    let match;
    while ((match = pattern.exec(text))) {
        output += text.slice(cursor, match.index);
        const index = Number(match[1] || match[3] || 0);
        const placeholder = match[2] ?? "";
        const start = output.length;
        output += placeholder;
        const end = output.length;
        if (index === 0) {
            finalStop = { order: 0, start, end };
        } else {
            stops.push({ order: index, start, end });
        }
        cursor = match.index + match[0].length;
    }
    output += text.slice(cursor);
    stops.sort((a, b) => a.order - b.order || a.start - b.start);
    if (finalStop) {
        stops.push(finalStop);
    }
    return { text: output, stops };
}

function clearSnippetSession() {
    snippetSession = null;
}

function jumpSnippetStop(step = 1) {
    if (!snippetSession || !snippetSession.stops?.length) return false;
    const next = snippetSession.index + step;
    if (next >= snippetSession.stops.length || next < 0) {
        clearSnippetSession();
        return false;
    }
    snippetSession.index = next;
    const stop = snippetSession.stops[snippetSession.index];
    const anchor = editor.posFromIndex(stop.start);
    const head = editor.posFromIndex(stop.end);
    editor.setSelections?.([{ anchor, head }]);
    editor.scrollIntoView?.(anchor, 80);
    return true;
}

function expandSnippetAtCursor() {
    if (!editorSettings.snippetEnabled) return false;
    const currentWord = editor.getWordAt?.();
    if (!currentWord || !currentWord.word) return false;
    const selection = editor.getSelections?.()[0];
    if (selection && (selection.anchor.line !== selection.head.line || selection.anchor.ch !== selection.head.ch)) {
        return false;
    }
    const activeScope = getActiveSnippetScope();
    const snippet = snippetRegistry
        .filter((entry) =>
            entry.trigger === currentWord.word &&
            (normalizeSnippetScope(entry.scope) === activeScope || normalizeSnippetScope(entry.scope) === "*")
        )
        .sort((a, b) => {
            const aScope = normalizeSnippetScope(a.scope);
            const bScope = normalizeSnippetScope(b.scope);
            const aRank = aScope === activeScope ? 0 : 1;
            const bRank = bScope === activeScope ? 0 : 1;
            return aRank - bRank;
        })[0];
    if (!snippet) return false;
    const parsed = parseSnippetTemplate(snippet.template);
    const baseIndex = editor.indexFromPos(currentWord.from);
    editor.replaceRange?.(parsed.text, currentWord.from, currentWord.to);
    if (parsed.stops.length) {
        snippetSession = {
            stops: parsed.stops.map((stop) => ({
                start: baseIndex + stop.start,
                end: baseIndex + stop.end,
            })),
            index: 0,
        };
        jumpSnippetStop(0);
    } else {
        clearSnippetSession();
    }
    updateActiveFileCode(editor.get());
    queueEditorLint("snippet");
    return true;
}

function wireEditorSearch() {
    if (el.editorFindInput) {
        el.editorFindInput.addEventListener("input", () => {
            findIndex = 0;
            refreshFindResults({ preserveIndex: false, focusSelection: false });
        });
        el.editorFindInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                moveFindSelection(event.shiftKey ? -1 : 1);
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeEditorSearch({ focusEditor: true });
            }
        });
    }
    if (el.editorReplaceInput) {
        el.editorReplaceInput.addEventListener("input", () => renderFindStatus());
        el.editorReplaceInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                replaceCurrentFindResult();
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeEditorSearch({ focusEditor: true });
            }
        });
    }
    if (el.editorFindCase) {
        el.editorFindCase.addEventListener("click", () => {
            const active = el.editorFindCase.getAttribute("aria-pressed") !== "true";
            setFindToggleState(el.editorFindCase, active);
            refreshFindResults({ preserveIndex: false, focusSelection: false });
        });
    }
    if (el.editorFindWord) {
        el.editorFindWord.addEventListener("click", () => {
            const active = el.editorFindWord.getAttribute("aria-pressed") !== "true";
            setFindToggleState(el.editorFindWord, active);
            refreshFindResults({ preserveIndex: false, focusSelection: false });
        });
    }
    if (el.editorFindRegex) {
        el.editorFindRegex.addEventListener("click", () => {
            const active = el.editorFindRegex.getAttribute("aria-pressed") !== "true";
            setFindToggleState(el.editorFindRegex, active);
            refreshFindResults({ preserveIndex: false, focusSelection: false });
        });
    }
    if (el.editorFindSelection) {
        el.editorFindSelection.addEventListener("click", () => {
            const active = el.editorFindSelection.getAttribute("aria-pressed") !== "true";
            setFindToggleState(el.editorFindSelection, active);
            refreshFindResults({ preserveIndex: false, focusSelection: false });
        });
    }
    el.editorFindPrev?.addEventListener("click", () => moveFindSelection(-1));
    el.editorFindNext?.addEventListener("click", () => moveFindSelection(1));
    el.editorReplaceOne?.addEventListener("click", () => replaceCurrentFindResult());
    el.editorReplaceAll?.addEventListener("click", () => replaceAllFindResults());
    el.editorSearchBackdrop?.addEventListener("click", () => closeEditorSearch({ focusEditor: false }));
}

function wireSymbolPalette() {
    if (el.symbolSearchInput) {
        el.symbolSearchInput.addEventListener("input", (event) => {
            symbolIndex = 0;
            refreshSymbolResults(event.target.value || "");
            symbolReferenceResults = [];
            renderSymbolReferenceResults();
        });
        el.symbolSearchInput.addEventListener("keydown", async (event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (!symbolResults.length) return;
                const step = event.key === "ArrowDown" ? 1 : -1;
                symbolIndex = clamp(symbolIndex + step, 0, symbolResults.length - 1);
                renderSymbolResults();
                return;
            }
            if (event.key === "Enter") {
                event.preventDefault();
                if (event.metaKey || event.ctrlKey) {
                    findReferencesForSymbol(getSymbolReferenceName());
                    return;
                }
                if (!symbolResults.length) {
                    await refreshSymbolResults(el.symbolSearchInput?.value || "");
                }
                activateSymbol(symbolIndex);
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                closeSymbolPalette({ focusEditor: true });
            }
        });
    }
    if (el.symbolList) {
        el.symbolList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-symbol-id]");
            if (!row) return;
            const index = symbolResults.findIndex((symbol) => symbol.id === row.dataset.symbolId);
            if (index === -1) return;
            symbolIndex = index;
            activateSymbol(index);
        });
    }
    if (el.symbolRefsList) {
        el.symbolRefsList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-symbol-ref-id]");
            if (!row) return;
            const refId = row.dataset.symbolRefId;
            if (!refId) return;
            jumpToSymbolReference(refId);
            closeSymbolPalette({ focusEditor: true });
        });
    }
    el.symbolGoLine?.addEventListener("click", () => promptGoToLine());
    el.symbolRename?.addEventListener("click", () => renameSymbolAtCursor());
    el.symbolFindRefs?.addEventListener("click", async () => findReferencesAtCursor());
    el.symbolPaletteBackdrop?.addEventListener("click", () => closeSymbolPalette({ focusEditor: false }));
}

function wireProjectSearch() {
    const scheduleRerun = () => {
        if (!projectSearchOpen) return;
        debouncedProjectSearchScan.schedule();
    };
    const runNow = () => {
        debouncedProjectSearchScan.cancel();
        runProjectSearchScan();
    };
    el.projectReplaceInput?.addEventListener("input", () => updateProjectSearchHint());
    el.projectSearchInput?.addEventListener("input", scheduleRerun);
    el.projectSearchRun?.addEventListener("click", () => runNow());
    el.projectSearchSelectAll?.addEventListener("click", () => selectAllProjectResults(true));
    el.projectSearchClearSel?.addEventListener("click", () => selectAllProjectResults(false));
    el.projectReplaceSelected?.addEventListener("click", () => replaceSelectedProjectResults());
    el.projectSearchCase?.addEventListener("click", () => {
        setFindToggleState(el.projectSearchCase, el.projectSearchCase.getAttribute("aria-pressed") !== "true");
        runNow();
    });
    el.projectSearchWord?.addEventListener("click", () => {
        setFindToggleState(el.projectSearchWord, el.projectSearchWord.getAttribute("aria-pressed") !== "true");
        runNow();
    });
    el.projectSearchRegex?.addEventListener("click", () => {
        setFindToggleState(el.projectSearchRegex, el.projectSearchRegex.getAttribute("aria-pressed") !== "true");
        runNow();
    });
    el.projectSearchBackdrop?.addEventListener("click", () => closeProjectSearch({ focusEditor: false }));
    el.projectSearchList?.addEventListener("click", (event) => {
        const toggle = event.target.closest("[data-project-result-toggle]");
        if (toggle) {
            toggleProjectResultSelection(toggle.dataset.projectResultToggle, toggle.checked);
            return;
        }
        const row = event.target.closest("[data-project-result-id]");
        if (!row) return;
        const id = row.dataset.projectResultId;
        if (!id) return;
        if (event.detail >= 2) {
            jumpToProjectResult(id);
            return;
        }
        toggleProjectResultSelection(id);
    });
    el.projectSearchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            runNow();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeProjectSearch({ focusEditor: true });
        }
    });
    el.projectReplaceInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            replaceSelectedProjectResults();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeProjectSearch({ focusEditor: true });
        }
    });
}

function wireEditorHistory() {
    el.editorHistoryClose?.addEventListener("click", () => closeEditorHistory({ focusEditor: true }));
    el.editorHistoryBackdrop?.addEventListener("click", () => closeEditorHistory({ focusEditor: false }));
    el.editorHistorySnapshot?.addEventListener("click", () => {
        const active = getActiveFile();
        if (!active) return;
        recordCodeSnapshot(active.id, active.code, "manual", { force: true });
        status.set("Snapshot saved");
        renderEditorHistoryList();
    });
    el.editorHistoryRestore?.addEventListener("click", () => restoreSelectedHistoryEntry());
    el.editorHistoryClear?.addEventListener("click", async () => {
        const confirmed = await showConfirmDialog({
            title: "Clear File History",
            message: "Clear snapshots for the active file?",
            confirmText: "Clear",
            cancelText: "Cancel",
            danger: true,
        });
        if (!confirmed) return;
        clearActiveFileHistory();
    });
    el.editorHistoryList?.addEventListener("click", (event) => {
        const row = event.target.closest("[data-history-id]");
        if (!row) return;
        selectHistoryEntry(row.dataset.historyId);
    });
}

function wireEditorSettings() {
    el.editorSettingsClose?.addEventListener("click", () => closeEditorSettings({ focusEditor: true }));
    el.editorSettingsBackdrop?.addEventListener("click", () => closeEditorSettings({ focusEditor: false }));
    el.editorProfileSelect?.addEventListener("change", (event) => {
        if (!event.target.value) return;
        applyEditorProfile(event.target.value, { persist: true });
    });
    el.editorFormatterSelect?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, formatterMode: event.target.value });
        persistEditorSettings();
        syncEditorSettingsPanel();
    });
    el.editorTabSize?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, tabSize: Number(event.target.value) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorFontSize?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, fontSize: Number(event.target.value) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorFontFamilySelect?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, fontFamily: event.target.value });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorAutoSaveMs?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, autosaveMs: Number(event.target.value) });
        persistEditorSettings();
        syncEditorSettingsPanel();
    });
    el.editorWrapToggle?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, lineWrapping: Boolean(event.target.checked) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorLintToggle?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, lintEnabled: Boolean(event.target.checked) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorErrorLensToggle?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, errorLensEnabled: Boolean(event.target.checked) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorSnippetToggle?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, snippetEnabled: Boolean(event.target.checked) });
        persistEditorSettings();
        syncEditorSettingsPanel();
    });
    const upsertFromInputs = () => {
        const trigger = String(el.snippetTriggerInput?.value || "").trim();
        const template = String(el.snippetTemplateInput?.value || "");
        const scope = normalizeSnippetScope(el.snippetScopeSelect?.value || "*");
        if (!trigger || !template.trim()) {
            status.set("Snippet needs trigger and template.");
            return false;
        }
        const applied = registerSnippet({ trigger, template, scope }, { replace: true });
        if (!applied) {
            status.set("Snippet update skipped.");
            return false;
        }
        renderSnippetList();
        status.set(`Snippet saved: ${trigger} (${scope === "*" ? "all" : scope})`);
        return true;
    };
    el.snippetAdd?.addEventListener("click", () => {
        upsertFromInputs();
    });
    el.snippetTemplateInput?.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            upsertFromInputs();
        }
    });
    el.snippetList?.addEventListener("click", (event) => {
        const editBtn = event.target.closest("[data-snippet-edit]");
        if (editBtn) {
            const trigger = editBtn.dataset.snippetEdit;
            const scope = editBtn.dataset.snippetEditScope || "*";
            if (!trigger) return;
            loadSnippetIntoInputs(trigger, scope);
            return;
        }
        const removeBtn = event.target.closest("[data-snippet-remove]");
        if (!removeBtn) return;
        const trigger = removeBtn.dataset.snippetRemove;
        const scope = removeBtn.dataset.snippetScope || "*";
        if (!trigger) return;
        const removed = unregisterSnippet(trigger, scope);
        if (!removed) return;
        renderSnippetList();
        status.set(`Snippet removed: ${trigger}`);
    });
}

function wireDebugger() {
    setDebugMode(false);
    refreshEditorBreakpointMarkers();
    renderDebugBreakpointList();
    renderDebugWatchList();

    el.debugModeToggle?.addEventListener("click", () => {
        setDebugMode(!debugMode);
        if (debugMode) {
            status.set("Debug mode enabled");
            requestDebugWatchValues();
        } else {
            status.set("Debug mode disabled");
        }
    });
    el.debugRun?.addEventListener("click", () => run());
    el.debugClearBreakpoints?.addEventListener("click", () => clearDebugBreakpoints());
    el.debugClearWatches?.addEventListener("click", () => {
        const removed = clearDebugWatches();
        status.set(removed ? `Cleared ${removed} watch expression(s)` : "No watches to clear");
    });
    el.debugWatchAdd?.addEventListener("click", () => {
        const value = el.debugWatchInput?.value || "";
        if (!addDebugWatch(value)) return;
        if (el.debugWatchInput) {
            el.debugWatchInput.value = "";
            el.debugWatchInput.focus();
        }
    });
    el.debugWatchInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const value = el.debugWatchInput?.value || "";
            if (!addDebugWatch(value)) return;
            if (el.debugWatchInput) {
                el.debugWatchInput.value = "";
            }
        }
    });
    el.debugWatchList?.addEventListener("click", (event) => {
        const removeBtn = event.target.closest("[data-debug-watch-remove]");
        if (!removeBtn) return;
        const expression = String(removeBtn.dataset.debugWatchRemove || "").trim();
        if (!expression) return;
        if (removeDebugWatch(expression)) {
            status.set(`Removed watch: ${expression}`);
        }
    });
    el.debugWatchList?.addEventListener("dblclick", (event) => {
        const item = event.target.closest(".diagnostics-item");
        if (!item) return;
        const text = item.textContent || "";
        const expression = text.split("=")[0]?.trim();
        if (expression) {
            removeDebugWatch(expression);
            status.set(`Removed watch: ${expression}`);
        }
    });
    editor.onGutterClick?.(({ line, gutter }) => {
        if (!debugMode) return;
        if (gutter !== "CodeMirror-linenumbers" && gutter !== "cm-breakpoint-gutter") return;
        toggleDebugBreakpoint(line);
    });
}

function getCommandPaletteEntries() {
    const active = getActiveFile();
    const selectedCount = getSelectedWorkspaceEntries().selectedEntryCount;
    const dirtyCount = getDirtyFiles().length;
    const coreEntries = [
        {
            id: "cmd-new-file",
            label: "File: New",
            keywords: "create file new",
            shortcut: "Ctrl/Cmd+N",
            enabled: true,
            run: () => createFile(),
        },
        {
            id: "cmd-new-folder",
            label: "File: New Folder",
            keywords: "create folder path",
            shortcut: "",
            enabled: true,
            run: () => createFolder(),
        },
        {
            id: "cmd-collapse-folders",
            label: "Folders: Collapse All",
            keywords: "folders tree collapse all",
            shortcut: "",
            enabled: collectFolderPaths(files).size > 0,
            run: () => collapseAllFolders(),
        },
        {
            id: "cmd-expand-folders",
            label: "Folders: Expand All",
            keywords: "folders tree expand all",
            shortcut: "",
            enabled: collapsedFolderPaths.size > 0,
            run: () => expandAllFolders(),
        },
        {
            id: "cmd-duplicate",
            label: "File: Duplicate Active",
            keywords: "duplicate copy",
            shortcut: "Ctrl/Cmd+D",
            enabled: Boolean(active),
            run: () => activeFileId && duplicateFile(activeFileId),
        },
        {
            id: "cmd-save-file",
            label: "File: Save",
            keywords: "save file write",
            shortcut: "Ctrl/Cmd+S",
            enabled: Boolean(active) && isFileDirty(active),
            run: () => saveActiveFile({ announce: true }),
        },
        {
            id: "cmd-save-all",
            label: "File: Save All",
            keywords: "save all write",
            shortcut: "Ctrl/Cmd+Shift+S",
            enabled: dirtyCount > 0,
            run: () => saveAllFiles({ announce: true }),
        },
        {
            id: "cmd-format",
            label: "Editor: Format Code",
            keywords: "format prettier",
            shortcut: "",
            enabled: true,
            run: async () => formatCurrentEditor({ announce: true }),
        },
        {
            id: "cmd-task-run-all",
            label: "Task: Run All",
            keywords: "task runner run all save format lint run",
            shortcut: "",
            enabled: !taskRunnerBusy,
            run: () => runTaskRunnerTask("run-all"),
        },
        {
            id: "cmd-task-run-app",
            label: "Task: Run App",
            keywords: "task runner execute sandbox",
            shortcut: "",
            enabled: !taskRunnerBusy,
            run: () => runTaskRunnerTask("run-app"),
        },
        {
            id: "cmd-task-lint",
            label: "Task: Lint Workspace",
            keywords: "task runner lint diagnostics",
            shortcut: "",
            enabled: !taskRunnerBusy,
            run: () => runTaskRunnerTask("lint-workspace"),
        },
        {
            id: "cmd-task-format-active",
            label: "Task: Format Active",
            keywords: "task runner format file",
            shortcut: "",
            enabled: !taskRunnerBusy,
            run: () => runTaskRunnerTask("format-active"),
        },
        {
            id: "cmd-task-save-all",
            label: "Task: Save All",
            keywords: "task runner save all files",
            shortcut: "",
            enabled: !taskRunnerBusy,
            run: () => runTaskRunnerTask("save-all"),
        },
        {
            id: "cmd-find",
            label: "Editor: Find",
            keywords: "find search replace",
            shortcut: "Ctrl/Cmd+F",
            enabled: true,
            run: () => openEditorSearch({ replaceMode: false }),
        },
        {
            id: "cmd-replace",
            label: "Editor: Replace",
            keywords: "replace search",
            shortcut: "Ctrl/Cmd+H",
            enabled: true,
            run: () => openEditorSearch({ replaceMode: true }),
        },
        {
            id: "cmd-symbols",
            label: "Editor: Symbols",
            keywords: "outline symbol goto",
            shortcut: "Ctrl/Cmd+Shift+O",
            enabled: true,
            run: () => openSymbolPalette(),
        },
        {
            id: "cmd-project-search",
            label: "Project: Search in Files",
            keywords: "project global search replace files",
            shortcut: "Ctrl/Cmd+Shift+F",
            enabled: true,
            run: () => openProjectSearch(),
        },
        {
            id: "cmd-editor-split",
            label: "Editor: Toggle Split View",
            keywords: "split compare saved diff",
            shortcut: "",
            enabled: true,
            run: () => setEditorSplitOpen(!editorSplitOpen),
        },
        {
            id: "cmd-debug-toggle",
            label: "Debug: Toggle Mode",
            keywords: "debug breakpoints watch",
            shortcut: "",
            enabled: true,
            run: () => setDebugMode(!debugMode),
        },
        {
            id: "cmd-debug-clear-breakpoints",
            label: "Debug: Clear Breakpoints",
            keywords: "debug clear breakpoints",
            shortcut: "",
            enabled: debugBreakpoints.size > 0,
            run: () => clearDebugBreakpoints(),
        },
        {
            id: "cmd-debug-clear-watches",
            label: "Debug: Clear Watches",
            keywords: "debug clear watch expressions",
            shortcut: "",
            enabled: debugWatches.length > 0,
            run: () => clearDebugWatches(),
        },
        {
            id: "cmd-goto-line",
            label: "Editor: Go To Line",
            keywords: "line jump",
            shortcut: "Ctrl/Cmd+G",
            enabled: true,
            run: () => promptGoToLine(),
        },
        {
            id: "cmd-rename-symbol",
            label: "Editor: Rename Symbol",
            keywords: "rename identifier",
            shortcut: "",
            enabled: true,
            run: () => renameSymbolAtCursor(),
        },
        {
            id: "cmd-find-references",
            label: "Editor: Find References",
            keywords: "references usages symbol",
            shortcut: "",
            enabled: true,
            run: () => findReferencesAtCursor(),
        },
        {
            id: "cmd-history",
            label: "Editor: Local History",
            keywords: "history snapshot restore",
            shortcut: "",
            enabled: true,
            run: () => openEditorHistory(),
        },
        {
            id: "cmd-snapshot",
            label: "Editor: Snapshot Now",
            keywords: "snapshot checkpoint",
            shortcut: "",
            enabled: Boolean(active),
            run: () => {
                const file = getActiveFile();
                if (!file) return;
                recordCodeSnapshot(file.id, file.code, "manual", { force: true });
                status.set("Snapshot saved");
            },
        },
        {
            id: "cmd-settings",
            label: "Editor: Settings",
            keywords: "editor settings profile",
            shortcut: "",
            enabled: true,
            run: () => openEditorSettings(),
        },
        {
            id: "cmd-trash-selected",
            label: "Selection: Trash Selected",
            keywords: "delete trash selected",
            shortcut: "Delete",
            enabled: selectedCount > 0,
            run: () => bulkTrashSelectedFiles(),
        },
        {
            id: "cmd-move-selected",
            label: "Selection: Move Selected",
            keywords: "move selected files folders",
            shortcut: "",
            enabled: selectedCount > 0,
            run: () => promptMoveSelectedEntries(),
        },
        {
            id: "cmd-select-all",
            label: "Selection: Select All Visible",
            keywords: "select all files",
            shortcut: "Ctrl/Cmd+A",
            enabled: true,
            run: () => selectAllVisibleFiles(),
        },
        {
            id: "cmd-undo-action",
            label: "History: Undo File Action",
            keywords: "undo history",
            shortcut: "Ctrl/Cmd+Z",
            enabled: canUndoFileHistory(),
            run: () => undoFileHistory(),
        },
        {
            id: "cmd-redo-action",
            label: "History: Redo File Action",
            keywords: "redo history",
            shortcut: "Ctrl/Cmd+Shift+Z",
            enabled: canRedoFileHistory(),
            run: () => redoFileHistory(),
        },
        {
            id: "cmd-undo-delete",
            label: "History: Undo Delete (Legacy)",
            keywords: "undo delete trash",
            shortcut: "",
            enabled: hasPendingDeleteUndo(),
            run: () => undoLastDelete(),
        },
        {
            id: "cmd-export-workspace",
            label: "Workspace: Export",
            keywords: "export backup download",
            shortcut: "",
            enabled: true,
            run: () => exportWorkspace(),
        },
        {
            id: "cmd-import-workspace",
            label: "Workspace: Import",
            keywords: "import restore upload",
            shortcut: "",
            enabled: true,
            run: () => triggerWorkspaceImportPicker(),
        },
        {
            id: "cmd-open-folder",
            label: "Workspace: Open Local Folder",
            keywords: "folder filesystem open",
            shortcut: "",
            enabled: true,
            run: () => openLocalProjectFolder(),
        },
        {
            id: "cmd-save-folder",
            label: "Workspace: Save All To Folder",
            keywords: "folder filesystem save write",
            shortcut: "",
            enabled: true,
            run: () => saveWorkspaceToLocalFolder(),
        },
        {
            id: "cmd-open-quick-open",
            label: "Search: Quick Open Files",
            keywords: "quick open files search",
            shortcut: "Ctrl/Cmd+P",
            enabled: true,
            run: () => openQuickOpen(),
        },
        {
            id: "cmd-show-shortcuts",
            label: "Help: Keyboard Shortcuts",
            keywords: "shortcuts help keyboard",
            shortcut: "F1",
            enabled: true,
            run: () => openShortcutHelp(),
        },
        {
            id: "cmd-toggle-filters",
            label: "View: Toggle Filters",
            keywords: "view filters",
            shortcut: "",
            enabled: true,
            run: () => setFilesFiltersOpen(!layoutState.filesFiltersOpen),
        },
        {
            id: "cmd-toggle-trash",
            label: "View: Toggle Trash",
            keywords: "view trash",
            shortcut: "",
            enabled: true,
            run: () => setFilesSectionOpen("trash", !layoutState.filesTrashOpen),
        },
    ];
    return [...coreEntries, ...getRegisteredCommandEntries()];
}

function getCommandPaletteMatches(query) {
    const normalized = String(query || "").trim().toLowerCase();
    const entries = getCommandPaletteEntries();
    const scored = entries
        .map((entry) => {
            const target = `${entry.label} ${entry.keywords || ""}`.trim();
            const score = normalized ? scoreQuickOpenMatch(target, normalized) : 1;
            return { entry, score };
        })
        .filter((row) => Number.isFinite(row.score) && row.score > Number.NEGATIVE_INFINITY)
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label))
        .map((row) => row.entry);
    return scored.slice(0, 80);
}

function renderCommandPaletteResults() {
    if (!el.commandPaletteList) return;
    if (!commandPaletteResults.length) {
        el.commandPaletteList.innerHTML = `<li class="quick-open-empty">No commands found.</li>`;
        if (el.commandPaletteHint) {
            el.commandPaletteHint.textContent = "No match. Try another query.";
        }
        return;
    }
    commandPaletteIndex = clamp(commandPaletteIndex, 0, commandPaletteResults.length - 1);
    const rows = commandPaletteResults
        .map((entry, index) => {
            const active = index === commandPaletteIndex;
            const disabled = !entry.enabled;
            const shortcut = entry.shortcut ? escapeHTML(entry.shortcut) : "Action";
            return `
                <li class="quick-open-item-wrap" role="presentation">
                    <button type="button" class="quick-open-item command-palette-item" role="option" data-command-id="${entry.id}" data-active="${active}" data-disabled="${disabled}" aria-selected="${active}" ${disabled ? "disabled" : ""}>
                        <span class="quick-open-name">${escapeHTML(entry.label)}</span>
                        <span class="quick-open-meta">${shortcut}</span>
                    </button>
                </li>
            `;
        })
        .join("");
    el.commandPaletteList.innerHTML = rows;
    const activeOption = el.commandPaletteList.querySelector('[data-command-id][data-active="true"]');
    if (activeOption && typeof activeOption.scrollIntoView === "function") {
        activeOption.scrollIntoView({ block: "nearest" });
    }
    if (el.commandPaletteHint) {
        el.commandPaletteHint.textContent = `${commandPaletteResults.length} command${commandPaletteResults.length === 1 ? "" : "s"} • Enter to run`;
    }
}

function updateCommandPaletteResults(query = commandPaletteQuery) {
    commandPaletteQuery = String(query || "");
    commandPaletteResults = getCommandPaletteMatches(commandPaletteQuery);
    if (commandPaletteResults.length && commandPaletteIndex >= commandPaletteResults.length) {
        commandPaletteIndex = 0;
    }
    renderCommandPaletteResults();
}

function setCommandPaletteOpen(open) {
    commandPaletteOpen = Boolean(open);
    if (!el.commandPalette || !el.commandPaletteBackdrop) return;
    el.commandPalette.setAttribute("data-open", commandPaletteOpen ? "true" : "false");
    el.commandPalette.setAttribute("aria-hidden", commandPaletteOpen ? "false" : "true");
    el.commandPaletteBackdrop.setAttribute("data-open", commandPaletteOpen ? "true" : "false");
    el.commandPaletteBackdrop.setAttribute("aria-hidden", commandPaletteOpen ? "false" : "true");
    if (!commandPaletteOpen) {
        commandPaletteQuery = "";
        commandPaletteResults = [];
        commandPaletteIndex = 0;
        if (el.commandPaletteInput) el.commandPaletteInput.value = "";
        if (el.commandPaletteList) el.commandPaletteList.innerHTML = "";
        return;
    }
    updateCommandPaletteResults("");
    requestAnimationFrame(() => {
        if (el.commandPaletteInput) {
            el.commandPaletteInput.focus();
            el.commandPaletteInput.select();
        }
    });
}

function openCommandPalette() {
    if (commandPaletteOpen) {
        if (el.commandPaletteInput) el.commandPaletteInput.focus();
        return;
    }
    closeQuickOpen({ focusEditor: false });
    closeFileMenus();
    closeShortcutHelp({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setCommandPaletteOpen(true);
}

function closeCommandPalette({ focusEditor = true } = {}) {
    if (!commandPaletteOpen) return;
    setCommandPaletteOpen(false);
    if (focusEditor) editor.focus();
}

function activateCommandPalette(index = commandPaletteIndex) {
    const target = commandPaletteResults[index];
    if (!target || !target.enabled) return false;
    closeCommandPalette({ focusEditor: false });
    target.run();
    return true;
}

function onCommandPaletteKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (!commandPaletteResults.length) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        commandPaletteIndex = clamp(commandPaletteIndex + step, 0, commandPaletteResults.length - 1);
        renderCommandPaletteResults();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        activateCommandPalette();
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        closeCommandPalette({ focusEditor: true });
    }
}

function wireCommandPalette() {
    if (el.commandPaletteInput) {
        el.commandPaletteInput.addEventListener("input", (event) => {
            commandPaletteIndex = 0;
            updateCommandPaletteResults(event.target.value || "");
        });
        el.commandPaletteInput.addEventListener("keydown", onCommandPaletteKeyDown);
    }
    if (el.commandPaletteList) {
        el.commandPaletteList.addEventListener("click", (event) => {
            const row = event.target.closest("[data-command-id]");
            if (!row) return;
            const index = commandPaletteResults.findIndex((entry) => entry.id === row.dataset.commandId);
            if (index === -1) return;
            commandPaletteIndex = index;
            activateCommandPalette(index);
        });
    }
    if (el.commandPaletteBackdrop) {
        el.commandPaletteBackdrop.addEventListener("click", () => closeCommandPalette({ focusEditor: false }));
    }
}

function wireShortcutHelp() {
    if (el.btnEditorShortcutHelp) {
        el.btnEditorShortcutHelp.addEventListener("click", () => openShortcutHelp());
    }
    if (el.shortcutHelpClose) {
        el.shortcutHelpClose.addEventListener("click", () => closeShortcutHelp({ focusEditor: true }));
    }
    if (el.shortcutHelpBackdrop) {
        el.shortcutHelpBackdrop.addEventListener("click", () => closeShortcutHelp({ focusEditor: false }));
    }
}

function wirePromptDialog() {
    setPromptDialogOpen(false);
    clearPromptDialogError();
    el.promptDialogBackdrop?.addEventListener("click", () => cancelPromptDialog());
    el.promptDialogCancel?.addEventListener("click", () => cancelPromptDialog());
    el.promptDialogConfirm?.addEventListener("click", () => submitPromptDialog());
    el.promptDialogInput?.addEventListener("input", () => clearPromptDialogError());
    el.promptDialogInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitPromptDialog();
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            cancelPromptDialog();
        }
    });
    el.promptDialog?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            cancelPromptDialog();
            return;
        }
        if (event.key === "Enter" && promptDialogState?.mode === "confirm") {
            event.preventDefault();
            submitPromptDialog();
        }
    });
}

async function hydrateFileState() {
    const primary = parseWorkspacePayload(load(STORAGE.FILES));
    const snapshot = parseWorkspacePayload(load(STORAGE.WORKSPACE_SNAPSHOT));
    const session = readSessionState();
    const shouldOfferRecovery = Boolean(
        session?.active &&
        snapshot &&
        (!primary || snapshot.savedAt > (primary.savedAt + SNAPSHOT_RECOVERY_GRACE_MS))
    );
    if (shouldOfferRecovery) {
        const snapshotAgeMs = Math.max(0, Date.now() - (snapshot.savedAt || Date.now()));
        const snapshotAgeMin = Math.max(1, Math.round(snapshotAgeMs / 60000));
        const shouldRecover = await showConfirmDialog({
            title: "Recover Workspace Snapshot",
            message:
                `Recover unsaved workspace snapshot from about ${snapshotAgeMin} minute(s) ago?\n` +
                "This appears to be from an interrupted session.",
            confirmText: "Recover",
            cancelText: "Skip",
        });
        if (shouldRecover) {
            return { ...snapshot, source: "snapshot-recovery" };
        }
    }
    if (primary) return { ...primary, source: "primary" };
    if (snapshot) return { ...snapshot, source: "snapshot-fallback" };
    const legacy = load(STORAGE.CODE);
    const defaultFile = makeFile(FILE_DEFAULT_NAME, legacy ?? DEFAULT_CODE);
    return {
        files: [defaultFile],
        folders: [],
        activeId: defaultFile.id,
        openIds: [defaultFile.id],
        trash: [],
        source: "legacy",
    };
}

function persistFiles(reason = "autosave") {
    if (!files.length || !activeFileId) return;
    openTabIds = normalizeOpenTabIds(openTabIds);
    pruneTrashEntries();
    pruneProblemDiagnostics();
    const payload = buildWorkspacePayload();
    save(STORAGE.FILES, JSON.stringify(payload));
    const active = getActiveFile();
    if (active) save(STORAGE.CODE, active.code);
    persistWorkspaceSnapshot(reason);
    queueProblemsRender();
}

function exportWorkspaceData() {
    return buildExportWorkspaceData({
        appVersion: APP.VERSION,
        workspacePayload: buildWorkspacePayload(),
        layoutState,
        theme: currentTheme,
    });
}

function exportWorkspace() {
    const payload = exportWorkspaceData();
    const fileName = triggerWorkspaceExportDownload({
        payload,
        fileName: buildWorkspaceExportFilename(),
    });
    status.set("Workspace exported");
    logger.append("system", [`Workspace exported (${fileName}).`]);
}

function normalizeImportedWorkspace(input) {
    return normalizeImportedWorkspacePayload(input, {
        normalizeFile,
        normalizeTrashEntry,
        normalizeFolderList,
        makeFile,
        defaultFileName: FILE_DEFAULT_NAME,
        defaultCode: DEFAULT_CODE,
        normalizeTheme,
        sanitizeLayoutState,
        currentLayoutState: layoutState,
    });
}

function applyImportedWorkspace(normalized, { label = "Import workspace", focusEditor = true } = {}) {
    if (!normalized) return false;
    const before = snapshotWorkspaceState();
    files = normalized.files.map((file) => normalizeFile(file)).filter(Boolean);
    if (!files.length) {
        files = [makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE)];
    }
    folders = normalizeFolderList(normalized.folders);
    cleanupCodeHistoryForKnownFiles();
    trashFiles = normalized.trash.map((file) => normalizeTrashEntry(file)).filter(Boolean);
    pruneTrashEntries();
    activeFileId = files.some((file) => file.id === normalized.activeId)
        ? normalized.activeId
        : files[0].id;
    openTabIds = normalizeOpenTabIds(normalized.openIds);
    selectedFileIds = new Set([activeFileId]);
    selectedFolderPaths = new Set();
    selectionAnchorFileId = activeFileId;
    clearInlineRenameState();
    setEditorValue(getActiveFile()?.code ?? DEFAULT_CODE, { silent: true });
    const active = getActiveFile();
    if (active) {
        recordCodeSnapshot(active.id, active.code, "workspace-import", { force: false });
    }
    if (normalized.layout) {
        layoutState = normalized.layout;
        applyLayout();
        syncLayoutControls();
        persistLayout();
    }
    if (normalized.theme) {
        applyTheme(normalized.theme);
    }
    persistFiles("workspace-import");
    renderFileList();
    queueEditorLint("workspace-import");
    recordFileHistory(label, before);
    status.set("Workspace imported");
    logger.append("system", ["Workspace imported."]);
    if (focusEditor) editor.focus();
    return true;
}

function triggerWorkspaceImportPicker() {
    if (!el.workspaceImportInput) return;
    el.workspaceImportInput.value = "";
    el.workspaceImportInput.click();
}

async function importWorkspaceFromFile(file) {
    if (!file) return false;
    const text = await file.text();
    const parsed = parseWorkspaceImportText(text, { normalizeImportedWorkspace });
    if (!parsed.ok && parsed.error === "invalid-json") {
        status.set("Import failed");
        logger.append("error", [`Import failed: invalid JSON (${String(parsed.message || "unknown error")}).`]);
        return false;
    }
    const normalized = parsed.ok ? parsed.normalized : null;
    if (!normalized) {
        status.set("Import failed");
        logger.append("error", ["Import failed: unsupported workspace payload."]);
        return false;
    }
    const confirmImport = await showConfirmDialog({
        title: "Import Workspace",
        message: buildImportWorkspaceConfirmMessage({
            fileCount: normalized.files.length,
            trashCount: normalized.trash.length,
        }),
        confirmText: "Import",
        cancelText: "Cancel",
        danger: true,
    });
    if (!confirmImport) return false;
    return applyImportedWorkspace(normalized, { label: "Import workspace", focusEditor: true });
}

async function canUseFileSystemAccess() {
    return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function isSupportedLocalFolderFileName(name = "") {
    const leaf = getFileBaseName(name).toLowerCase();
    const dot = leaf.lastIndexOf(".");
    if (dot <= 0 || dot >= leaf.length - 1) return false;
    const extension = leaf.slice(dot + 1);
    return LOCAL_FOLDER_IMPORT_EXTENSIONS.has(extension);
}

async function readDirectoryWorkspaceEntries(handle, prefix = "") {
    const out = { files: [], folders: [] };
    if (!handle || typeof handle.entries !== "function") return out;
    for await (const [name, entry] of handle.entries()) {
        const nextPath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === "directory") {
            const folderPath = normalizeFolderPath(nextPath, { allowEmpty: true });
            if (folderPath) out.folders.push(folderPath);
            const nested = await readDirectoryWorkspaceEntries(entry, nextPath);
            out.files.push(...nested.files);
            out.folders.push(...nested.folders);
            continue;
        }
        if (entry.kind !== "file" || !isSupportedLocalFolderFileName(name)) continue;
        const file = await entry.getFile();
        const code = await file.text();
        out.files.push({
            path: normalizePathSlashes(nextPath),
            code: String(code ?? ""),
        });
    }
    out.folders = normalizeFolderList(out.folders);
    return out;
}

async function openLocalProjectFolder() {
    if (!await canUseFileSystemAccess()) {
        status.set("File access unsupported");
        logger.append("warn", ["File System Access API is not supported in this browser."]);
        return false;
    }
    try {
        const handle = await window.showDirectoryPicker();
        const { files: entries, folders: discoveredFolders } = await readDirectoryWorkspaceEntries(handle);
        if (!entries.length) {
            status.set("No supported files found");
            logger.append("system", ["No supported text files found in selected folder."]);
            projectDirectoryHandle = handle;
            return false;
        }
        const before = snapshotWorkspaceState();
        stashActiveFile();
        const sortedEntries = [...entries].sort((left, right) =>
            String(left?.path || "").localeCompare(String(right?.path || ""), undefined, {
                numeric: true,
                sensitivity: "base",
            })
        );
        const usedPaths = new Set();
        const remappedPaths = [];
        files = sortedEntries.map((entry) => {
            const originalPath = normalizePathSlashes(String(entry?.path || ""));
            const normalizedPath = ensureUniquePathInSet(originalPath, usedPaths);
            if (normalizedPath !== originalPath) {
                remappedPaths.push([originalPath, normalizedPath]);
            }
            const file = makeFile(normalizedPath, entry.code);
            file.savedCode = entry.code;
            return file;
        });
        folders = normalizeFolderList([
            ...discoveredFolders,
            ...collectFolderPaths(files, []),
        ]);
        activeFileId = files[0].id;
        openTabIds = [activeFileId];
        selectedFileIds = new Set([activeFileId]);
        selectedFolderPaths = new Set();
        selectionAnchorFileId = activeFileId;
        clearInlineRenameState();
        setEditorValue(files[0].code, { silent: true });
        cleanupCodeHistoryForKnownFiles();
        files.forEach((file) => recordCodeSnapshot(file.id, file.code, "folder-open", { force: true }));
        projectDirectoryHandle = handle;
        persistFiles("open-folder");
        renderFileList();
        queueEditorLint("open-folder");
        recordFileHistory("Open local folder", before);
        status.set(`Loaded ${entries.length} file${entries.length === 1 ? "" : "s"} from folder`);
        logger.append("system", [`Loaded ${entries.length} workspace file${entries.length === 1 ? "" : "s"} from local folder.`]);
        if (folders.length) {
            logger.append("system", [`Detected ${folders.length} folder path${folders.length === 1 ? "" : "s"} from local folder.`]);
        }
        if (remappedPaths.length) {
            const sample = remappedPaths
                .slice(0, 3)
                .map(([fromPath, toPath]) => `${fromPath} -> ${toPath}`)
                .join(", ");
            const suffix = remappedPaths.length > 3 ? "..." : "";
            logger.append("warn", [`Resolved ${remappedPaths.length} file path collision${remappedPaths.length === 1 ? "" : "s"} (${sample}${suffix}).`]);
        }
        return true;
    } catch (err) {
        if (String(err?.name || "") === "AbortError") return false;
        logger.append("error", [`Failed to open folder: ${String(err?.message || err)}`]);
        status.set("Open folder failed");
        return false;
    }
}

async function ensureProjectDirectoryHandle() {
    if (projectDirectoryHandle) return projectDirectoryHandle;
    if (!await canUseFileSystemAccess()) return null;
    try {
        projectDirectoryHandle = await window.showDirectoryPicker();
    } catch (err) {
        if (String(err?.name || "") === "AbortError") return null;
        throw err;
    }
    return projectDirectoryHandle;
}

async function ensureDirectoryPath(rootHandle, folderPath = "") {
    const parts = splitPathSegments(folderPath);
    let current = rootHandle;
    for (const dir of parts) {
        current = await current.getDirectoryHandle(dir, { create: true });
    }
    return current;
}

async function writeFileToDirectory(rootHandle, filePath, code) {
    const parts = String(filePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
    if (!parts.length) return;
    const fileName = parts.pop();
    const current = await ensureDirectoryPath(rootHandle, buildPathFromSegments(parts));
    const targetFile = await current.getFileHandle(fileName, { create: true });
    const writer = await targetFile.createWritable();
    await writer.write(String(code ?? ""));
    await writer.close();
}

function detectCaseInsensitiveWorkspacePathCollisions(list = []) {
    const byKey = new Map();
    const collisions = [];
    (Array.isArray(list) ? list : []).forEach((file) => {
        const normalizedPath = normalizePathSlashes(String(file?.name || "").trim());
        if (!normalizedPath) return;
        const key = normalizedPath.toLowerCase();
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, normalizedPath);
            return;
        }
        if (existing !== normalizedPath) {
            collisions.push([existing, normalizedPath]);
        }
    });
    return collisions;
}

async function saveWorkspaceToLocalFolder() {
    const handle = await ensureProjectDirectoryHandle();
    if (!handle) {
        status.set("Save canceled");
        return false;
    }
    try {
        const collisions = detectCaseInsensitiveWorkspacePathCollisions(files);
        if (collisions.length) {
            status.set("Save blocked: file name conflict");
            const sample = collisions
                .slice(0, 3)
                .map(([left, right]) => `${left} <-> ${right}`)
                .join(", ");
            const suffix = collisions.length > 3 ? "..." : "";
            logger.append("error", [`Save blocked: case-insensitive file path conflicts detected (${sample}${suffix}).`]);
            return false;
        }
        stashActiveFile();
        const allFolderPaths = [...collectFolderPaths(files, folders)].sort((left, right) => {
            const depthDiff = splitPathSegments(left).length - splitPathSegments(right).length;
            if (depthDiff !== 0) return depthDiff;
            return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
        });
        for (const folderPath of allFolderPaths) {
            await ensureDirectoryPath(handle, folderPath);
        }
        let written = 0;
        for (const file of files) {
            await writeFileToDirectory(handle, file.name, file.code);
            file.savedCode = file.code;
            file.touchedAt = Date.now();
            written += 1;
        }
        persistFiles("save-folder");
        renderFileList();
        status.set(`Saved ${written} file${written === 1 ? "" : "s"} to folder`);
        logger.append("system", [`Saved ${written} workspace file${written === 1 ? "" : "s"} to local folder.`]);
        return true;
    } catch (err) {
        logger.append("error", [`Save folder failed: ${String(err?.message || err)}`]);
        status.set("Save folder failed");
        return false;
    }
}

function getActiveFile() {
    return files.find((f) => f.id === activeFileId);
}

function getFileById(id) {
    return files.find((f) => f.id === id);
}

function toggleFilePin(fileId) {
    const file = getFileById(fileId);
    if (!file) return;
    const before = snapshotWorkspaceState();
    file.pinned = !file.pinned;
    persistFiles();
    renderFileList();
    recordFileHistory(file.pinned ? `Pin ${file.name}` : `Unpin ${file.name}`, before);
}

function toggleFileLock(fileId) {
    const file = getFileById(fileId);
    if (!file) return;
    const before = snapshotWorkspaceState();
    file.locked = !file.locked;
    if (file.locked && editingFileId === file.id) {
        commitRename(file.id, file.name, { cancel: true });
    }
    persistFiles();
    renderFileList();
    recordFileHistory(file.locked ? `Lock ${file.name}` : `Unlock ${file.name}`, before);
}

function duplicateFile(fileId) {
    const source = getFileById(fileId);
    if (!source) return;
    const before = snapshotWorkspaceState();
    const copyName = makeCopyName(source.name);
    const copy = makeFile(copyName, source.code);
    const index = files.findIndex((f) => f.id === source.id);
    const insertAt = index >= 0 ? index + 1 : files.length;
    files.splice(insertAt, 0, copy);
    activeFileId = copy.id;
    setSingleSelection(copy.id);
    ensureTabOpen(copy.id);
    expandFolderAncestors(copy.name);
    setEditorValue(copy.code, { silent: true });
    persistFiles();
    renderFileList();
    status.set(`Duplicated to ${copy.name}`);
    logger.append("system", [`Duplicated ${source.name}`]);
    recordFileHistory(`Duplicate ${source.name}`, before);
}

function renameFile(fileId) {
    const file = getFileById(fileId);
    if (!file) return;
    if (file.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to rename."]);
        return;
    }
    startRename(file.id);
}

function closeFileMenus() {
    if (el.filesMenu) {
        el.filesMenu.setAttribute("data-open", "false");
        el.filesMenu.setAttribute("aria-hidden", "true");
        el.filesMenu.style.visibility = "";
    }
    if (el.fileRowMenu) {
        el.fileRowMenu.setAttribute("data-open", "false");
        el.fileRowMenu.setAttribute("aria-hidden", "true");
        el.fileRowMenu.style.visibility = "";
    }
    if (el.fileFolderMenu) {
        el.fileFolderMenu.setAttribute("data-open", "false");
        el.fileFolderMenu.setAttribute("aria-hidden", "true");
        el.fileFolderMenu.style.visibility = "";
    }
    if (el.filesMenuButton) {
        el.filesMenuButton.setAttribute("aria-expanded", "false");
    }
    openFileMenu = null;
    fileMenuTargetId = null;
    folderMenuTargetPath = null;
}

function positionMenu(menuEl, anchorEl) {
    if (!menuEl || !anchorEl) return;
    const anchorRect = anchorEl.getBoundingClientRect();
    const gutter = 8;
    const gap = 6;
    menuEl.style.visibility = "hidden";
    menuEl.style.left = "0px";
    menuEl.style.top = "0px";
    requestAnimationFrame(() => {
        const menuRect = menuEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        let left = anchorRect.left;
        let top = anchorRect.bottom + gap;
        const maxLeft = Math.max(gutter, viewportWidth - menuRect.width - gutter);
        left = clamp(left, gutter, maxLeft);
        if (top + menuRect.height > viewportHeight - gutter) {
            top = anchorRect.top - menuRect.height - gap;
        }
        const maxTop = Math.max(gutter, viewportHeight - menuRect.height - gutter);
        top = clamp(top, gutter, maxTop);
        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;
        menuEl.style.visibility = "visible";
    });
}

function positionMenuAt(menuEl, clientX, clientY) {
    if (!menuEl) return;
    const gutter = 8;
    menuEl.style.visibility = "hidden";
    menuEl.style.left = "0px";
    menuEl.style.top = "0px";
    requestAnimationFrame(() => {
        const menuRect = menuEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        let left = Number.isFinite(clientX) ? clientX : 0;
        let top = Number.isFinite(clientY) ? clientY : 0;
        const maxLeft = Math.max(gutter, viewportWidth - menuRect.width - gutter);
        const maxTop = Math.max(gutter, viewportHeight - menuRect.height - gutter);
        left = clamp(left, gutter, maxLeft);
        top = clamp(top, gutter, maxTop);
        menuEl.style.left = `${left}px`;
        menuEl.style.top = `${top}px`;
        menuEl.style.visibility = "visible";
    });
}

function syncFilesMenuActions() {
    if (!el.filesMenu) return;
    pruneTrashEntries();
    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: false });
    const active = getActiveFile();
    const selection = getSelectedWorkspaceEntries();
    const selectedFiles = getSelectedFiles();
    const selectedFileCount = selectedFiles.length;
    const selectedCount = selection.selectedEntryCount;
    const visibleCount = getVisibleFileIdsForSelection().length;
    const anyLocked = files.some((file) => file.locked);
    const dirtyCount = getDirtyFiles().length;
    const duplicateBtn = el.filesMenu.querySelector('[data-files-menu="duplicate"]');
    const renameBtn = el.filesMenu.querySelector('[data-files-menu="rename"]');
    const saveFileBtn = el.filesMenu.querySelector('[data-files-menu="save-file"]');
    const saveAllBtn = el.filesMenu.querySelector('[data-files-menu="save-all"]');
    const exportWorkspaceBtn = el.filesMenu.querySelector('[data-files-menu="export-workspace"]');
    const importWorkspaceBtn = el.filesMenu.querySelector('[data-files-menu="import-workspace"]');
    const undoActionBtn = el.filesMenu.querySelector('[data-files-menu="undo-action"]');
    const redoActionBtn = el.filesMenu.querySelector('[data-files-menu="redo-action"]');
    const selectAllBtn = el.filesMenu.querySelector('[data-files-menu="select-all"]');
    const clearSelectionBtn = el.filesMenu.querySelector('[data-files-menu="clear-selection"]');
    const trashSelectedBtn = el.filesMenu.querySelector('[data-files-menu="trash-selected"]');
    const moveSelectedBtn = el.filesMenu.querySelector('[data-files-menu="move-selected"]');
    const pinSelectedBtn = el.filesMenu.querySelector('[data-files-menu="pin-selected"]');
    const unpinSelectedBtn = el.filesMenu.querySelector('[data-files-menu="unpin-selected"]');
    const lockSelectedBtn = el.filesMenu.querySelector('[data-files-menu="lock-selected"]');
    const unlockSelectedBtn = el.filesMenu.querySelector('[data-files-menu="unlock-selected"]');
    const deleteAllBtn = el.filesMenu.querySelector('[data-files-menu="delete-all"]');
    const undoBtn = el.filesMenu.querySelector('[data-files-menu="undo-delete"]');
    const restoreBtn = el.filesMenu.querySelector('[data-files-menu="restore-last"]');
    const restoreAllBtn = el.filesMenu.querySelector('[data-files-menu="restore-all"]');
    const emptyTrashBtn = el.filesMenu.querySelector('[data-files-menu="empty-trash"]');
    if (duplicateBtn) duplicateBtn.disabled = !active;
    if (renameBtn) renameBtn.disabled = !active || active.locked;
    if (saveFileBtn) saveFileBtn.disabled = !active || !isFileDirty(active);
    if (saveAllBtn) {
        saveAllBtn.disabled = dirtyCount === 0;
        saveAllBtn.textContent = dirtyCount > 0 ? `Save All (${dirtyCount})` : "Save All";
    }
    if (exportWorkspaceBtn) exportWorkspaceBtn.disabled = files.length === 0;
    if (importWorkspaceBtn) importWorkspaceBtn.disabled = false;
    if (undoActionBtn) undoActionBtn.disabled = !canUndoFileHistory();
    if (redoActionBtn) redoActionBtn.disabled = !canRedoFileHistory();
    if (selectAllBtn) {
        selectAllBtn.disabled = visibleCount === 0;
        selectAllBtn.textContent = visibleCount ? `Select All (${visibleCount})` : "Select All";
    }
    if (clearSelectionBtn) clearSelectionBtn.disabled = selectedCount === 0;
    if (trashSelectedBtn) {
        trashSelectedBtn.disabled = selectedCount === 0;
        trashSelectedBtn.textContent = selectedCount ? `Trash (${selectedCount})` : "Trash";
    }
    if (moveSelectedBtn) {
        moveSelectedBtn.disabled = selectedCount === 0;
        moveSelectedBtn.textContent = selectedCount ? `Move (${selectedCount})` : "Move";
    }
    if (pinSelectedBtn) pinSelectedBtn.disabled = selectedFileCount === 0;
    if (unpinSelectedBtn) unpinSelectedBtn.disabled = selectedFileCount === 0;
    if (lockSelectedBtn) lockSelectedBtn.disabled = selectedFileCount === 0;
    if (unlockSelectedBtn) unlockSelectedBtn.disabled = selectedFileCount === 0;
    if (deleteAllBtn) deleteAllBtn.disabled = anyLocked;
    if (undoBtn) undoBtn.disabled = !hasPendingDeleteUndo();
    if (restoreBtn) restoreBtn.disabled = trashFiles.length === 0;
    if (restoreAllBtn) {
        restoreAllBtn.disabled = trashFiles.length === 0;
        restoreAllBtn.textContent = trashFiles.length ? `Restore (${trashFiles.length})` : "Restore All";
    }
    if (emptyTrashBtn) {
        emptyTrashBtn.disabled = trashFiles.length === 0;
        emptyTrashBtn.textContent = trashFiles.length ? `Empty (${trashFiles.length})` : "Empty";
    }
}

function shouldDeleteSelectionFromFileMenu(fileId) {
    if (!fileId) return false;
    const selection = getSelectedWorkspaceEntries();
    return selection.selectedEntryCount > 1 && selectedFileIds.has(fileId);
}

function shouldDeleteSelectionFromFolderMenu(folderPath) {
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return false;
    const selection = getSelectedWorkspaceEntries();
    return selection.selectedEntryCount > 1 && selectedFolderPaths.has(normalized);
}

function openFilesMenu(anchorEl) {
    if (!el.filesMenu) return;
    closeFileMenus();
    openFileMenu = "header";
    syncFilesMenuActions();
    el.filesMenu.setAttribute("data-open", "true");
    el.filesMenu.setAttribute("aria-hidden", "false");
    if (el.filesMenuButton) {
        el.filesMenuButton.setAttribute("aria-expanded", "true");
    }
    syncFilesMenuToggles();
    positionMenu(el.filesMenu, anchorEl);
}

function openFilesMenuAt(clientX, clientY) {
    if (!el.filesMenu) return;
    closeFileMenus();
    openFileMenu = "header";
    syncFilesMenuActions();
    el.filesMenu.setAttribute("data-open", "true");
    el.filesMenu.setAttribute("aria-hidden", "false");
    if (el.filesMenuButton) {
        el.filesMenuButton.setAttribute("aria-expanded", "true");
    }
    syncFilesMenuToggles();
    positionMenuAt(el.filesMenu, clientX, clientY);
}

function openFileRowMenu(fileId, anchorEl) {
    if (!el.fileRowMenu) return;
    const file = getFileById(fileId);
    if (!file) return;
    closeFileMenus();
    openFileMenu = "row";
    fileMenuTargetId = fileId;
    const pinBtn = el.fileRowMenu.querySelector('[data-file-menu-action="pin"]');
    const lockBtn = el.fileRowMenu.querySelector('[data-file-menu-action="lock"]');
    const renameBtn = el.fileRowMenu.querySelector('[data-file-menu-action="rename"]');
    const duplicateBtn = el.fileRowMenu.querySelector('[data-file-menu-action="duplicate"]');
    const deleteBtn = el.fileRowMenu.querySelector('[data-file-menu-action="delete"]');
    const deleteSelection = shouldDeleteSelectionFromFileMenu(file.id);
    if (pinBtn) pinBtn.textContent = file.pinned ? "Unpin" : "Pin";
    if (lockBtn) lockBtn.textContent = file.locked ? "Unlock" : "Lock";
    if (renameBtn) renameBtn.disabled = file.locked;
    if (duplicateBtn) duplicateBtn.disabled = false;
    if (deleteBtn) {
        deleteBtn.textContent = deleteSelection ? "Delete Selected Items" : "Delete";
        deleteBtn.disabled = deleteSelection ? false : file.locked || files.length === 1;
    }
    el.fileRowMenu.setAttribute("data-open", "true");
    el.fileRowMenu.setAttribute("aria-hidden", "false");
    positionMenu(el.fileRowMenu, anchorEl);
}

function openFileRowMenuAt(fileId, clientX, clientY) {
    if (!el.fileRowMenu) return;
    const file = getFileById(fileId);
    if (!file) return;
    closeFileMenus();
    openFileMenu = "row";
    fileMenuTargetId = fileId;
    const pinBtn = el.fileRowMenu.querySelector('[data-file-menu-action="pin"]');
    const lockBtn = el.fileRowMenu.querySelector('[data-file-menu-action="lock"]');
    const renameBtn = el.fileRowMenu.querySelector('[data-file-menu-action="rename"]');
    const duplicateBtn = el.fileRowMenu.querySelector('[data-file-menu-action="duplicate"]');
    const deleteBtn = el.fileRowMenu.querySelector('[data-file-menu-action="delete"]');
    const deleteSelection = shouldDeleteSelectionFromFileMenu(file.id);
    if (pinBtn) pinBtn.textContent = file.pinned ? "Unpin" : "Pin";
    if (lockBtn) lockBtn.textContent = file.locked ? "Unlock" : "Lock";
    if (renameBtn) renameBtn.disabled = file.locked;
    if (duplicateBtn) duplicateBtn.disabled = false;
    if (deleteBtn) {
        deleteBtn.textContent = deleteSelection ? "Delete Selected Items" : "Delete";
        deleteBtn.disabled = deleteSelection ? false : file.locked || files.length === 1;
    }
    el.fileRowMenu.setAttribute("data-open", "true");
    el.fileRowMenu.setAttribute("aria-hidden", "false");
    positionMenuAt(el.fileRowMenu, clientX, clientY);
}

function openFolderMenu(folderPath, anchorEl) {
    if (!el.fileFolderMenu) return;
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    const knownFolders = collectFolderPaths(files);
    const folderFiles = files.filter((file) => file.name.startsWith(`${normalized}/`));
    const hasLockedFiles = folderFiles.some((file) => file.locked);
    closeFileMenus();
    openFileMenu = "folder";
    folderMenuTargetPath = normalized;
    const renameBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="rename"]');
    const newFileBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-file"]');
    const newFolderBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-folder"]');
    const deleteBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="delete"]');
    const collapseBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="collapse-all"]');
    const expandBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="expand-all"]');
    const deleteSelection = shouldDeleteSelectionFromFolderMenu(normalized);
    if (renameBtn) renameBtn.disabled = !knownFolders.has(normalized);
    if (newFileBtn) newFileBtn.disabled = false;
    if (newFolderBtn) newFolderBtn.disabled = false;
    if (deleteBtn) {
        deleteBtn.textContent = deleteSelection ? "Delete Selected Items" : "Delete Folder";
        deleteBtn.disabled = deleteSelection ? false : !knownFolders.has(normalized) || hasLockedFiles;
    }
    if (collapseBtn) collapseBtn.disabled = knownFolders.size === 0;
    if (expandBtn) expandBtn.disabled = collapsedFolderPaths.size === 0;
    el.fileFolderMenu.setAttribute("data-open", "true");
    el.fileFolderMenu.setAttribute("aria-hidden", "false");
    positionMenu(el.fileFolderMenu, anchorEl);
}

function openFolderMenuAt(folderPath, clientX, clientY) {
    if (!el.fileFolderMenu) return;
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    const knownFolders = collectFolderPaths(files);
    const folderFiles = files.filter((file) => file.name.startsWith(`${normalized}/`));
    const hasLockedFiles = folderFiles.some((file) => file.locked);
    closeFileMenus();
    openFileMenu = "folder";
    folderMenuTargetPath = normalized;
    const renameBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="rename"]');
    const newFileBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-file"]');
    const newFolderBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-folder"]');
    const deleteBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="delete"]');
    const collapseBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="collapse-all"]');
    const expandBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="expand-all"]');
    const deleteSelection = shouldDeleteSelectionFromFolderMenu(normalized);
    if (renameBtn) renameBtn.disabled = !knownFolders.has(normalized);
    if (newFileBtn) newFileBtn.disabled = false;
    if (newFolderBtn) newFolderBtn.disabled = false;
    if (deleteBtn) {
        deleteBtn.textContent = deleteSelection ? "Delete Selected Items" : "Delete Folder";
        deleteBtn.disabled = deleteSelection ? false : !knownFolders.has(normalized) || hasLockedFiles;
    }
    if (collapseBtn) collapseBtn.disabled = knownFolders.size === 0;
    if (expandBtn) expandBtn.disabled = collapsedFolderPaths.size === 0;
    el.fileFolderMenu.setAttribute("data-open", "true");
    el.fileFolderMenu.setAttribute("aria-hidden", "false");
    positionMenuAt(el.fileFolderMenu, clientX, clientY);
}

function syncFilesMenuToggles() {
    if (!el.filesMenu) return;
    const filtersBtn = el.filesMenu.querySelector('[data-files-toggle="filters"]');
    const gamesBtn = el.filesMenu.querySelector('[data-files-toggle="games"]');
    const openEditorsBtn = el.filesMenu.querySelector('[data-files-toggle="open-editors"]');
    const filesBtn = el.filesMenu.querySelector('[data-files-toggle="files"]');
    const trashBtn = el.filesMenu.querySelector('[data-files-toggle="trash"]');
    if (filtersBtn) {
        const open = layoutState.filesFiltersOpen;
        filtersBtn.setAttribute("aria-pressed", open ? "true" : "false");
        filtersBtn.textContent = "Filters";
    }
    if (gamesBtn) {
        const open = layoutState.filesGamesOpen;
        gamesBtn.setAttribute("aria-pressed", open ? "true" : "false");
        gamesBtn.textContent = "Games";
        gamesBtn.disabled = games.length === 0;
    }
    if (openEditorsBtn) {
        const open = layoutState.filesOpenEditorsOpen;
        openEditorsBtn.setAttribute("aria-pressed", open ? "true" : "false");
        openEditorsBtn.textContent = "Editors";
    }
    if (filesBtn) {
        const open = layoutState.filesListOpen;
        filesBtn.setAttribute("aria-pressed", open ? "true" : "false");
        filesBtn.textContent = "Files";
    }
    if (trashBtn) {
        const open = layoutState.filesTrashOpen;
        trashBtn.setAttribute("aria-pressed", open ? "true" : "false");
        trashBtn.textContent = "Trash";
    }
}

function renderEditorTabs() {
    if (!el.editorTabs) return;
    openTabIds = normalizeOpenTabIds(openTabIds);
    if (!openTabIds.length) {
        el.editorTabs.innerHTML = "";
        el.editorTabs.removeAttribute("aria-activedescendant");
        return;
    }

    const disableClose = openTabIds.length <= 1;
    const tabs = openTabIds
        .map((id) => {
            const file = getFileById(id);
            if (!file) return "";
            const active = id === activeFileId;
            const dirty = isFileDirty(file);
            const safeName = escapeHTML(file.name);
            const dirtyBadge = dirty ? `<span class="editor-tab-dirty" aria-label="Unsaved">*</span>` : "";
            return `
                <div class="editor-tab" role="tab" tabindex="0" id="tab-${id}" data-tab-id="${id}" data-active="${active}" data-dirty="${dirty}" aria-selected="${active}">
                    <span class="editor-tab-label">${safeName}</span>
                    ${dirtyBadge}
                    <button type="button" class="editor-tab-close" data-tab-close="${id}" aria-label="Close ${safeName}" ${disableClose ? "disabled" : ""}>×</button>
                </div>
            `;
        })
        .join("");

    el.editorTabs.innerHTML = tabs;
    if (activeFileId) {
        el.editorTabs.setAttribute("aria-activedescendant", `tab-${activeFileId}`);
    } else {
        el.editorTabs.removeAttribute("aria-activedescendant");
    }
}

function closeTab(id) {
    if (!id) return;
    const index = openTabIds.indexOf(id);
    if (index === -1) return;
    if (openTabIds.length <= 1) return;
    openTabIds.splice(index, 1);

    if (id === activeFileId) {
        const nextId = openTabIds[index] || openTabIds[index - 1] || openTabIds[0];
        if (nextId) {
            selectFile(nextId);
            return;
        }
    }

    persistFiles();
    renderEditorTabs();
    renderFileList();
}

function onEditorTabsClick(event) {
    const closeBtn = event.target.closest("[data-tab-close]");
    if (closeBtn) {
        event.stopPropagation();
        closeTab(closeBtn.dataset.tabClose);
        return;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
        selectFile(tab.dataset.tabId);
    }
}

function onEditorTabsKey(event) {
    const tab = event.target.closest("[data-tab-id]");
    if (!tab) return;
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectFile(tab.dataset.tabId);
        return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        closeTab(tab.dataset.tabId);
    }
}

function buildFileProblemCounts() {
    const map = new Map();
    collectProblemEntries().forEach((entry) => {
        if (!entry?.fileId) return;
        const prev = map.get(entry.fileId) || { errors: 0, warns: 0, info: 0, total: 0 };
        if (entry.level === "error") prev.errors += 1;
        else if (entry.level === "warn") prev.warns += 1;
        else prev.info += 1;
        prev.total += 1;
        map.set(entry.fileId, prev);
    });
    return map;
}

function renderFileList() {
    if (!el.fileList) return;
    const focusedRowState = getFileListFocusedRowState();
    debouncedFileFilterRender.cancel();
    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: true });
    pruneTrashEntries();
    pruneCollapsedFolderPaths();
    if (fileMenuTargetId && !files.some((file) => file.id === fileMenuTargetId)) {
        closeFileMenus();
    }
    if (folderMenuTargetPath && !collectFolderPaths(files).has(folderMenuTargetPath)) {
        closeFileMenus();
    }
    openTabIds = normalizeOpenTabIds(openTabIds);
    const query = fileFilter.trim().toLowerCase();
    const matchedFiles = query
        ? files.filter((file) => file.name.toLowerCase().includes(query))
        : [...files];
    let visibleFiles = [...matchedFiles];

    if (query) {
        if (editingFileId && !visibleFiles.some((file) => file.id === editingFileId)) {
            const editingFile = files.find((file) => file.id === editingFileId);
            if (editingFile) visibleFiles.push(editingFile);
        }
        if (activeFileId && !visibleFiles.some((file) => file.id === activeFileId)) {
            const activeFile = files.find((file) => file.id === activeFileId);
            if (activeFile) visibleFiles.push(activeFile);
        }
    }

    const sortList = (list) => {
        if (fileSort === "name") {
            return [...list].sort((a, b) => a.name.localeCompare(b.name));
        }
        if (fileSort === "recent") {
            return [...list].sort((a, b) => (b.touchedAt || 0) - (a.touchedAt || 0));
        }
        return list;
    };

    const pinned = sortList(visibleFiles.filter((file) => file.pinned));
    const unpinned = sortList(visibleFiles.filter((file) => !file.pinned));
    const orderedFiles = [...pinned, ...unpinned];
    const visibleIds = new Set(visibleFiles.map((file) => file.id));
    const openEditors = openTabIds
        .map((id) => getFileById(id))
        .filter((file) => file && (!query || visibleIds.has(file.id)));
    const visibleTrash = query
        ? trashFiles.filter((file) => file.name.toLowerCase().includes(query))
        : [...trashFiles];
    const problemCountsByFile = buildFileProblemCounts();

    if (el.fileSearch) el.fileSearch.value = fileFilter;
    if (el.fileSort) el.fileSort.value = fileSort;
    if (el.fileSearchClear) {
        el.fileSearchClear.setAttribute("data-active", query ? "true" : "false");
    }

    const shouldRenderTrash = layoutState.filesTrashOpen && visibleTrash.length > 0;
    const hasVisibleFileRows = orderedFiles.length > 0 || openEditors.length > 0;
    if (!hasVisibleFileRows && !shouldRenderTrash) {
        const emptyCopy = query ? "No matches" : "No files";
        el.fileList.innerHTML = `<li class="file-item"><span class="files-sub">${emptyCopy}</span></li>`;
        el.fileList.removeAttribute("aria-activedescendant");
        renderEditorTabs();
        return;
    }

    const renderFileRow = (file, sectionId, allowEditing, { depth = 0, displayName = null, showDirectory = false, guideLevels = null } = {}) => {
        const active = file.id === activeFileId;
        const selected = selectedFileIds.has(file.id);
        const dirty = isFileDirty(file);
        const editing = allowEditing && file.id === editingFileId;
        const isLocked = Boolean(file.locked);
        const errorBlock = editing && editingError
            ? `<span class="file-error">${escapeHTML(editingError)}</span>`
            : "";
        const draftValue = editing ? (editingDraft ?? file.name) : file.name;
        const invalid = editing && Boolean(editingError);
        const label = displayName || file.name;
        const activeTag = !editing && active
            ? `<span class="file-active-tag" aria-label="Active file">ACTIVE</span>`
            : "";
        const nameBlock = editing
            ? `<input class="file-rename" data-file-rename="${file.id}" value="${escapeHTML(draftValue)}" aria-label="Rename file" aria-invalid="${invalid ? "true" : "false"}" />`
            : `<span class="file-name">${escapeHTML(label)}</span>`;
        const rowTag = editing ? "div" : "button";
        const rowId = `file-option-${sectionId}-${file.id}`;
        const depthValue = Math.max(0, Number(depth) || 0);
        const depthStyle = `style="--file-depth:${depthValue}"`;
        const titleAttr = editing ? "" : `title="${escapeHTML(file.name)}"`;
        const draggableAttr = !editing && allowEditing && sectionId === "files"
            ? `draggable="true" data-draggable-file="true"`
            : "";
        const rowAttrs = editing
            ? `class="file-row" role="option" aria-selected="${selected}" aria-current="${active ? "true" : "false"}" id="${rowId}" data-file-id="${file.id}" data-active="${active}" data-selected="${selected}" data-dirty="${dirty}" data-editing="true" data-pinned="${file.pinned}" data-locked="${isLocked}" data-file-row-section="${sectionId}" data-file-depth="${depthValue}" ${depthStyle} ${titleAttr}`
            : `type="button" class="file-row" role="option" aria-selected="${selected}" aria-current="${active ? "true" : "false"}" id="${rowId}" data-file-id="${file.id}" data-active="${active}" data-selected="${selected}" data-dirty="${dirty}" data-pinned="${file.pinned}" data-locked="${isLocked}" data-file-row-section="${sectionId}" data-file-depth="${depthValue}" ${depthStyle} ${titleAttr} ${draggableAttr}`;
        const guides = Array.isArray(guideLevels) && guideLevels.length
            ? `<span class="file-tree-guides" aria-hidden="true">${guideLevels.map((level) => `<span class="file-tree-guide" style="left:${8 + (level * 12)}px"></span>`).join("")}</span>`
            : "";
        return `
            <li class="file-item" data-file-row-section="${sectionId}">
                <${rowTag} ${rowAttrs}>
                    ${guides}
                    <span class="file-name-wrap">
                        ${nameBlock}
                        ${errorBlock}
                    </span>
                    ${activeTag}
                </${rowTag}>
            </li>`;
    };

    const renderRows = (list, sectionId, allowEditing, options = {}) => list
        .map((file) => renderFileRow(file, sectionId, allowEditing, {
            ...options,
            displayName: typeof options.displayName === "function"
                ? options.displayName(file)
                : options.displayName,
        }))
        .join("");

    const renderFileTreeRows = (list, sectionId, allowEditing, { includeExplicitFolders = false } = {}) => {
        const explicitFolders = includeExplicitFolders
            ? normalizeFolderList(editingFolderPath ? [...folders, editingFolderPath] : [...folders])
            : [];
        const tree = buildFileTree(list, {
            explicitFolders,
        });
        const out = [];
        const walk = (node, depth = 0, ancestorContinuations = []) => {
            const totalChildren = node.folders.length + node.files.length;
            const folderCount = node.folders.length;
            node.folders.forEach((folderNode, folderIndex) => {
                const siblingIndex = folderIndex;
                const hasNextSibling = siblingIndex < totalChildren - 1;
                const expanded = isFolderExpanded(folderNode.path);
                const editingFolder = allowEditing && editingFolderPath === folderNode.path;
                const folderDraftValue = editingFolder ? (editingFolderDraft ?? folderNode.path) : folderNode.path;
                const folderInvalid = editingFolder && Boolean(editingFolderError);
                const guideLevels = [];
                ancestorContinuations.forEach((carry, level) => {
                    if (carry) guideLevels.push(level);
                });
                if (depth > 0) {
                    const parentLevel = depth - 1;
                    if (!guideLevels.includes(parentLevel)) guideLevels.push(parentLevel);
                }
                const guides = guideLevels.length
                    ? `<span class="file-tree-guides" aria-hidden="true">${guideLevels.map((level) => `<span class="file-tree-guide" style="left:${8 + (level * 12)}px"></span>`).join("")}</span>`
                    : "";
                const folderNameBlock = editingFolder
                    ? `
                        <span class="file-folder-name-wrap file-folder-name-wrap-editing">
                            <input
                                class="file-rename file-folder-rename"
                                data-folder-rename="${escapeHTML(folderNode.path)}"
                                value="${escapeHTML(folderDraftValue)}"
                                aria-label="Rename folder"
                                aria-invalid="${folderInvalid ? "true" : "false"}"
                            />
                            ${folderInvalid ? `<span class="file-error">${escapeHTML(editingFolderError)}</span>` : ""}
                        </span>
                    `
                    : `
                        <span class="file-folder-name-wrap">
                            <span class="file-folder-caret" aria-hidden="true"></span>
                            <span class="file-folder-name">${escapeHTML(folderNode.name)}</span>
                        </span>
                    `;
                const rowTag = editingFolder ? "div" : "button";
                const depthValue = Math.max(0, Number(depth) || 0);
                const folderSelected = selectedFolderPaths.has(folderNode.path);
                const rowAttrs = editingFolder
                    ? `class="file-folder-row" data-folder-toggle="${escapeHTML(folderNode.path)}" data-file-depth="${depthValue}" data-selected="${folderSelected}" aria-selected="${folderSelected}" data-editing="true" style="--file-depth:${depthValue}" title="${escapeHTML(folderNode.path)}"`
                    : `type="button" class="file-folder-row" data-folder-toggle="${escapeHTML(folderNode.path)}" data-file-depth="${depthValue}" data-selected="${folderSelected}" aria-selected="${folderSelected}" aria-expanded="${expanded}" draggable="true" data-draggable-folder="true" style="--file-depth:${depthValue}" title="${escapeHTML(folderNode.path)}"`;
                out.push(`
                    <li class="file-item file-item-folder" data-file-row-section="${sectionId}">
                        <${rowTag} ${rowAttrs}>
                            ${guides}
                            ${folderNameBlock}
                            ${editingFolder ? "" : `<span class="file-folder-count">${folderNode.count}</span>`}
                        </${rowTag}>
                    </li>
                `);
                if (expanded) {
                    walk(folderNode, depth + 1, [...ancestorContinuations, hasNextSibling]);
                }
            });
            node.files.forEach((file, fileIndex) => {
                const siblingIndex = folderCount + fileIndex;
                const hasNextSibling = siblingIndex < totalChildren - 1;
                const guideLevels = [];
                ancestorContinuations.forEach((carry, level) => {
                    if (carry) guideLevels.push(level);
                });
                if (depth > 0) {
                    const parentLevel = depth - 1;
                    if (!guideLevels.includes(parentLevel)) guideLevels.push(parentLevel);
                }
                if (depth > 0 && hasNextSibling) {
                    const parentLevel = depth - 1;
                    if (!guideLevels.includes(parentLevel)) guideLevels.push(parentLevel);
                }
                out.push(renderFileRow(file, sectionId, allowEditing, {
                    depth,
                    displayName: getFileBaseName(file.name),
                    showDirectory: false,
                    guideLevels,
                }));
            });
        };
        walk(tree, 0, []);
        return out.join("");
    };

    const renderTrashRows = (list, sectionId) => list
        .map((file) => `
            <li class="file-item file-item-trash" data-file-row-section="${sectionId}">
                <div class="file-row file-row-trash" role="note" data-trash-id="${file.id}" data-file-row-section="${sectionId}">
                    <span class="file-name-wrap">
                        <span class="file-name">${escapeHTML(file.name)}</span>
                        <span class="file-info">Deleted ${formatRelativeTime(file.deletedAt)}</span>
                    </span>
                </div>
            </li>
        `)
        .join("");

    const renderSectionHeader = (label, id, open) => {
        const caretOnLeft = id === "open-editors" || id === "files";
        const caretSide = caretOnLeft ? "left" : "right";
        const content = caretOnLeft
            ? `
                <span class="file-section-caret" aria-hidden="true"></span>
                <span class="file-section-label">${label}</span>
            `
            : `
                <span class="file-section-label">${label}</span>
                <span class="file-section-caret" aria-hidden="true"></span>
            `;
        return `
        <li class="file-section-header">
            <button type="button" class="file-section-toggle" data-file-section="${id}" data-caret-side="${caretSide}" aria-expanded="${open}">
                ${content}
            </button>
        </li>
    `;
    };

    const openEditorsOpen = layoutState.filesOpenEditorsOpen;
    const filesListOpen = layoutState.filesListOpen;
    const trashOpen = layoutState.filesTrashOpen;
    const openEditorsSection = openEditors.length
        ? renderSectionHeader("Open Editors", "open-editors", openEditorsOpen) +
            (openEditorsOpen ? renderRows(openEditors, "open-editors", false, {
                depth: 0,
                displayName: (file) => getFileBaseName(file.name),
                showDirectory: true,
            }) : "")
        : "";

    let filesSection = "";
    if (pinned.length || unpinned.length) {
        let rows = "";
        const includeExplicitFolders = !query || Boolean(editingFolderPath);
        if (filesListOpen) {
            if (pinned.length) {
                rows += `<li class="file-section">Pinned</li>`;
                rows += renderFileTreeRows(pinned, "files", true, { includeExplicitFolders: false });
            }
            const hasFilesSectionRows = unpinned.length > 0 || (includeExplicitFolders && folders.length > 0);
            if (hasFilesSectionRows && pinned.length) {
                rows += `<li class="file-section">Files</li>`;
            }
            rows += renderFileTreeRows(unpinned, "files", true, { includeExplicitFolders });
        }
        filesSection = renderSectionHeader("Files", "files", filesListOpen) + rows;
    }

    let trashSection = "";
    if (visibleTrash.length) {
        const label = visibleTrash.length === 1 ? "Trash (1)" : `Trash (${visibleTrash.length})`;
        trashSection = renderSectionHeader(label, "trash", trashOpen);
        if (trashOpen) {
            trashSection += renderTrashRows(visibleTrash, "trash");
        }
    }

    el.fileList.innerHTML = `${openEditorsSection}${filesSection}${trashSection}`;

    const activeInFiles = activeFileId ? document.getElementById(`file-option-files-${activeFileId}`) : null;
    const activeInOpenEditors = activeFileId ? document.getElementById(`file-option-open-editors-${activeFileId}`) : null;
    if (activeInFiles) {
        el.fileList.setAttribute("aria-activedescendant", activeInFiles.id);
    } else if (activeInOpenEditors) {
        el.fileList.setAttribute("aria-activedescendant", activeInOpenEditors.id);
    } else {
        el.fileList.removeAttribute("aria-activedescendant");
    }
    scrollActiveFileRowIntoView();
    if (quickOpenOpen) {
        updateQuickOpenResults(quickOpenQuery);
    }
    if (commandPaletteOpen) {
        updateCommandPaletteResults(commandPaletteQuery);
    }

    renderEditorTabs();

    if (editingFileId) {
        requestAnimationFrame(() => {
            const input = el.fileList.querySelector(`[data-file-rename="${editingFileId}"]`);
            if (input) {
                input.focus();
                const file = files.find((item) => item.id === editingFileId);
                if (file && editingDraft === file.name) {
                    selectBaseName(input);
                }
            }
        });
        return;
    }
    if (editingFolderPath) {
        requestAnimationFrame(() => {
            const input = el.fileList.querySelector(`[data-folder-rename="${editingFolderPath}"]`);
            if (input) {
                input.focus();
                if (editingFolderDraft === editingFolderPath) {
                    input.select();
                }
            }
        });
        return;
    }
    restoreFileListFocusedRow(focusedRowState);
}

function stashActiveFile() {
    const current = getActiveFile();
    if (!current) return;
    current.code = editor.get();
}

function selectFile(id) {
    if (id === activeFileId) {
        const needsSelectionReset = selectedFileIds.size !== 1 || !selectedFileIds.has(id);
        if (needsSelectionReset) {
            setSingleSelection(id);
            renderFileList();
        }
        return;
    }
    const nextFile = files.find((f) => f.id === id);
    if (!nextFile) return;

    stashActiveFile();
    activeFileId = nextFile.id;
    setSingleSelection(nextFile.id);
    ensureTabOpen(nextFile.id);
    expandFolderAncestors(nextFile.name);
    nextFile.touchedAt = Date.now();
    setEditorValue(nextFile.code, { silent: true });
    recordCodeSnapshot(nextFile.id, nextFile.code, "open", { force: false });
    persistFiles();
    renderFileList();
    renderEditorMirror();
    if (editorHistoryOpen) {
        selectedHistoryEntryId = null;
        renderEditorHistoryList();
    }
    if (editorSearchOpen) {
        refreshFindResults({ preserveIndex: false, focusSelection: false });
    }
    if (symbolPaletteOpen) {
        refreshSymbolResults(el.symbolSearchInput?.value || "");
    }
    queueEditorLint("switch-file");
    status.set(`Editing ${nextFile.name}`);
    logger.append("system", [`Switched to ${nextFile.name}`]);
    editor.focus();
}

function updateActiveFileCode(newCode, { scheduleAutosaveNow = true } = {}) {
    const file = getActiveFile();
    if (!file) return;
    file.code = String(newCode ?? "");
    file.touchedAt = Date.now();
    if (scheduleAutosaveNow) {
        scheduleEditorAutosave("autosave-edit");
    }
}

function saveActiveFile({ announce = true } = {}) {
    const file = getActiveFile();
    if (!file) return false;
    flushEditorAutosave();
    stashActiveFile();
    const wasDirty = isFileDirty(file);
    file.savedCode = file.code;
    file.touchedAt = Date.now();
    persistFiles("manual-save");
    recordCodeSnapshot(file.id, file.code, "save", { force: wasDirty });
    renderFileList();
    renderEditorMirror();
    if (announce) {
        status.set(wasDirty ? "Saved" : "Already saved");
        logger.append("system", [wasDirty ? `Saved ${file.name}` : `${file.name} already saved.`]);
    }
    return true;
}

function saveAllFiles({ announce = true } = {}) {
    flushEditorAutosave();
    stashActiveFile();
    let savedCount = 0;
    files.forEach((file) => {
        if (!isFileDirty(file)) return;
        file.savedCode = file.code;
        file.touchedAt = Date.now();
        recordCodeSnapshot(file.id, file.code, "save-all", { force: true });
        savedCount += 1;
    });
    if (!savedCount) {
        if (announce) status.set("No unsaved files");
        return false;
    }
    persistFiles("manual-save-all");
    renderFileList();
    renderEditorMirror();
    if (announce) {
        status.set(`Saved ${savedCount} ${savedCount === 1 ? "file" : "files"}`);
        logger.append("system", [`Saved ${savedCount} ${savedCount === 1 ? "file" : "files"}.`]);
    }
    return true;
}

function createFile() {
    const before = snapshotWorkspaceState();
    flushEditorAutosave();
    const preferredExtension = getPreferredNewFileExtension();
    const defaultName = getNextScriptFileName("", preferredExtension);
    stashActiveFile();
    const file = makeFile(defaultName, getStarterCodeForFileName(defaultName));
    files.push(file);
    expandFolderAncestors(file.name);
    activeFileId = file.id;
    setSingleSelection(file.id);
    ensureTabOpen(file.id);
    setEditorValue(file.code, { silent: true });
    recordCodeSnapshot(file.id, file.code, "create", { force: true });
    persistFiles();
    editingFileId = file.id;
    editingDraft = file.name;
    editingError = "";
    pendingNewFileRenameId = file.id;
    clearFolderRenameState();
    renderFileList();
    queueEditorLint("create-file");
    status.set(`New file: ${file.name}`);
    logger.append("system", [`Created ${file.name}`]);
    recordFileHistory(`Create ${file.name}`, before);
}

function createFolder(parentPath = "") {
    const parent = normalizeFolderPath(parentPath, { allowEmpty: true });
    if (parent && !collectFolderPaths(files).has(parent)) {
        status.set("Folder path does not exist");
        logger.append("error", ["Folder path does not exist."]);
        return false;
    }
    const suggested = getNextFolderName(parent);
    const folderPath = normalizeFolderPath(suggested, { allowEmpty: true });
    const check = validateFolderName(folderPath);
    if (!check.valid) {
        status.set("Invalid folder name");
        logger.append("error", [check.message]);
        return false;
    }
    if (folderPathExists(folderPath, { ignoreCase: true })) {
        status.set("Folder already exists");
        return false;
    }
    const before = snapshotWorkspaceState();
    flushEditorAutosave();
    stashActiveFile();
    folders = normalizeFolderList([...folders, folderPath]);
    expandFolderPathAncestors(folderPath);
    clearFileRenameState();
    editingFolderPath = folderPath;
    editingFolderDraft = folderPath;
    editingFolderError = "";
    editingFolderIsNew = true;
    persistFiles();
    renderFileList();
    status.set(`Folder created: ${folderPath}`);
    logger.append("system", [`Created folder ${folderPath}.`]);
    recordFileHistory(`Create folder ${folderPath}`, before);
    return true;
}

async function deleteFile(id) {
    if (files.length === 1) {
        logger.append("system", ["Keep at least one file."]); 
        return;
    }

    const index = files.findIndex((f) => f.id === id);
    if (index === -1) return;
    const file = files[index];
    if (file.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to delete."]);
        return;
    }
    const before = snapshotWorkspaceState();
    const confirmDelete = await confirmWithFilePreview(
        `Move ${file.name} to Trash?`,
        [file.name],
        { detail: "You can undo this action for a short time." }
    );
    if (!confirmDelete) return;
    queueDeleteUndo(`Deleted ${file.name}`);
    pushFilesToTrash([file]);

    files.splice(index, 1);
    openTabIds = openTabIds.filter((tabId) => tabId !== id);
    const removedActive = id === activeFileId;
    if (removedActive) {
        const fallback = files[0];
        activeFileId = fallback.id;
        ensureTabOpen(activeFileId);
        setEditorValue(fallback.code, { silent: true });
    }
    persistFiles();
    renderFileList();
    status.set(`Moved ${file.name} to Trash`);
    logger.append("system", [`Moved ${file.name} to Trash. Undo available for 15s.`]);
    recordFileHistory(`Trash ${file.name}`, before);
}

function restoreTrashEntry(entry, { activate = true } = {}) {
    const restored = normalizeFile(entry);
    if (!restored) return null;
    if (files.some((file) => file.id === restored.id)) {
        restored.id = makeFileId();
    }
    restored.name = ensureUniqueName(restored.name);
    restored.touchedAt = Date.now();
    files.push(restored);
    if (activate) {
        activeFileId = restored.id;
        setSingleSelection(restored.id);
        ensureTabOpen(restored.id);
        expandFolderAncestors(restored.name);
        setEditorValue(restored.code, { silent: true });
    }
    return restored;
}

function restoreTrashById(trashId, { activate = true, focus = true } = {}) {
    pruneTrashEntries();
    const index = trashFiles.findIndex((entry) => entry.id === trashId);
    if (index === -1) return false;
    const before = snapshotWorkspaceState();
    stashActiveFile();
    const [entry] = trashFiles.splice(index, 1);
    const restored = restoreTrashEntry(entry, { activate });
    if (!restored) {
        persistFiles();
        return false;
    }
    persistFiles();
    renderFileList();
    status.set(`Restored ${restored.name}`);
    logger.append("system", [`Restored ${restored.name} from Trash.`]);
    recordFileHistory(`Restore ${restored.name}`, before);
    if (focus) editor.focus();
    return true;
}

function restoreLastDeletedFile() {
    pruneTrashEntries();
    if (!trashFiles.length) {
        status.set("Trash is empty");
        return false;
    }
    const targetId = trashFiles[0].id;
    return restoreTrashById(targetId, { activate: true, focus: true });
}

function restoreAllDeletedFiles() {
    pruneTrashEntries();
    if (!trashFiles.length) {
        status.set("Trash is empty");
        return false;
    }
    const before = snapshotWorkspaceState();
    stashActiveFile();
    const total = trashFiles.length;
    const entries = [...trashFiles].reverse();
    trashFiles = [];
    let restoredCount = 0;
    entries.forEach((entry) => {
        const restored = restoreTrashEntry(entry, { activate: false });
        if (restored) restoredCount += 1;
    });
    if (restoredCount === 0) {
        persistFiles();
        renderFileList();
        return false;
    }
    openTabIds = normalizeOpenTabIds(openTabIds);
    const active = getActiveFile();
    if (active) {
        setEditorValue(active.code, { silent: true });
    }
    persistFiles();
    renderFileList();
    status.set(`Restored ${restoredCount} ${restoredCount === 1 ? "file" : "files"}`);
    logger.append("system", [`Restored ${restoredCount} of ${total} files from Trash.`]);
    recordFileHistory(`Restore ${restoredCount} from trash`, before);
    editor.focus();
    return true;
}

async function emptyTrash() {
    pruneTrashEntries();
    if (!trashFiles.length) {
        status.set("Trash is empty");
        renderFileList();
        return false;
    }
    const before = snapshotWorkspaceState();
    const count = trashFiles.length;
    const confirmClear = await confirmWithFilePreview(
        `Empty Trash (${count} files)?`,
        trashFiles.map((file) => file.name),
        { detail: "This cannot be undone." }
    );
    if (!confirmClear) return false;
    trashFiles = [];
    persistFiles();
    renderFileList();
    status.set("Trash emptied");
    logger.append("system", [`Trash cleared (${count} files).`]);
    recordFileHistory(`Empty trash (${count})`, before);
    return true;
}

async function deleteAllFiles() {
    if (!files.length) return;
    const lockedCount = files.filter((file) => file.locked).length;
    if (lockedCount > 0) {
        const noun = lockedCount === 1 ? "file is" : "files are";
        status.set("Locked files");
        logger.append("system", [`${lockedCount} locked ${noun} blocking Delete all. Unlock first.`]);
        return;
    }

    const total = files.length;
    const before = snapshotWorkspaceState();
    const confirmDelete = await confirmWithFilePreview(
        `Move all ${total} files to Trash?`,
        files.map((file) => file.name),
        { detail: "This keeps one fresh file open." }
    );
    if (!confirmDelete) return;
    queueDeleteUndo("Deleted all files");
    pushFilesToTrash(files);

    const fallback = makeFile(FILE_DEFAULT_NAME, "");
    files = [fallback];
    activeFileId = fallback.id;
    setSingleSelection(fallback.id);
    openTabIds = [fallback.id];
    clearInlineRenameState();
    fileMenuTargetId = null;
    setEditorValue(fallback.code, { silent: true });
    persistFiles();
    renderFileList();
    status.set(`Moved ${total} files to Trash`);
    logger.append("system", [`Moved ${total} files to Trash. Reset to ${fallback.name}. Undo available for 15s.`]);
    recordFileHistory(`Delete all files (${total})`, before);
    editor.focus();
}

function buildSelectedMovePayload() {
    const {
        selectedFolders,
        standaloneFiles,
    } = getSelectedWorkspaceEntries();
    return {
        folderPaths: selectedFolders,
        fileIds: standaloneFiles
            .filter((file) => !file.locked)
            .map((file) => file.id),
    };
}

function getDragMovePayload() {
    const folderPaths = [...new Set(
        (Array.isArray(dragFolderPaths) ? dragFolderPaths : [])
            .map((path) => normalizeFolderPath(path, { allowEmpty: true }))
            .filter(Boolean)
    )];
    const fileIds = [...new Set((Array.isArray(dragFileIds) ? dragFileIds : []).filter(Boolean))];
    return {
        folderPaths,
        fileIds,
    };
}

function canMoveFolderToTarget(folderPath, targetFolderPath = "") {
    const source = normalizeFolderPath(folderPath, { allowEmpty: true });
    const target = normalizeFolderPath(targetFolderPath, { allowEmpty: true });
    if (!source) return false;
    const currentParent = getFolderParentPath(source);
    if (target === source) return false;
    if (target && target.startsWith(`${source}/`)) return false;
    if (target === currentParent) return false;
    return true;
}

function canMoveFileToTarget(fileId, targetFolderPath = "") {
    const file = getFileById(fileId);
    if (!file || file.locked) return false;
    const target = normalizeFolderPath(targetFolderPath, { allowEmpty: true });
    const current = getFileDirectory(file.name);
    return current !== target;
}

function moveSelectedEntriesToFolder(targetFolderPath = "", { payload = null, focus = true } = {}) {
    const targetFolder = normalizeFolderPath(targetFolderPath, { allowEmpty: true });
    if (targetFolder == null) return false;

    const source = payload || buildSelectedMovePayload();
    const folderPaths = pruneNestedFolderSelection(source.folderPaths || []);
    const fileIds = [...new Set((source.fileIds || []).filter(Boolean))];
    const fileIdsInsideSelectedFolders = new Set(
        fileIds.filter((fileId) => {
            const file = getFileById(fileId);
            if (!file) return false;
            return folderPaths.some((folderPath) => file.name.startsWith(`${folderPath}/`));
        })
    );

    if (!folderPaths.length && !fileIds.length) {
        status.set("No files or folders selected");
        return false;
    }

    let movedFolders = 0;
    let movedFiles = 0;
    let skippedFolders = 0;
    let skippedFiles = 0;
    const movedFolderPaths = [];

    folderPaths.forEach((folderPath) => {
        if (!canMoveFolderToTarget(folderPath, targetFolder)) {
            skippedFolders += 1;
            return;
        }
        const base = getFolderBaseName(folderPath);
        const desired = targetFolder ? `${targetFolder}/${base}` : base;
        const uniqueTarget = ensureUniqueFolderPath(desired, { ignoreCase: true });
        if (!uniqueTarget || uniqueTarget === folderPath) {
            skippedFolders += 1;
            return;
        }
        if (renameFolderToPath(folderPath, uniqueTarget)) {
            movedFolders += 1;
            movedFolderPaths.push(uniqueTarget);
        } else {
            skippedFolders += 1;
        }
    });

    const movedFolderSourcePaths = new Set(folderPaths);
    const standaloneFileIds = fileIds.filter((fileId) => !fileIdsInsideSelectedFolders.has(fileId));

    standaloneFileIds.forEach((fileId) => {
        if (!canMoveFileToTarget(fileId, targetFolder)) {
            skippedFiles += 1;
            return;
        }
        if (moveFileToFolder(fileId, targetFolder || "")) {
            movedFiles += 1;
        } else {
            skippedFiles += 1;
        }
    });

    if (movedFolderSourcePaths.size) {
        selectedFolderPaths = new Set(
            [...selectedFolderPaths].filter(
                (path) => ![...movedFolderSourcePaths].some((sourcePath) => path === sourcePath || path.startsWith(`${sourcePath}/`))
            )
        );
        movedFolderPaths.forEach((path) => selectedFolderPaths.add(path));
    }

    reconcileFolderSelection();
    reconcileFileSelection({ ensureOne: selectedFolderPaths.size === 0 });
    renderFileList();

    const totalMoved = movedFolders + movedFiles;
    const totalSkipped = skippedFolders + skippedFiles;
    if (totalMoved === 0) {
        status.set("Nothing moved");
        return false;
    }
    const parts = [];
    if (movedFolders) parts.push(`${movedFolders} folder${movedFolders === 1 ? "" : "s"}`);
    if (movedFiles) parts.push(`${movedFiles} file${movedFiles === 1 ? "" : "s"}`);
    const destination = targetFolder || "root";
    const skipText = totalSkipped ? ` ${totalSkipped} skipped.` : "";
    status.set(`Moved ${parts.join(" + ")} to ${destination}.${skipText}`);
    if (focus) editor.focus();
    return true;
}

function clearFileDragState() {
    dragFileId = null;
    dragFolderPath = null;
    dragFolderHoverPath = null;
    dragFileIds = [];
    dragFolderPaths = [];
    setRootDropHover(false);
    if (el.fileList) {
        el.fileList.querySelectorAll(`${FILE_ROW_SELECTOR}[data-dragging="true"]`).forEach((row) => {
            row.removeAttribute("data-dragging");
        });
        el.fileList.querySelectorAll(`${FILE_FOLDER_ROW_SELECTOR}[data-dragging="true"]`).forEach((row) => {
            row.removeAttribute("data-dragging");
        });
        el.fileList.querySelectorAll(`${FILE_FOLDER_ROW_SELECTOR}[data-drop-target="true"]`).forEach((row) => {
            row.removeAttribute("data-drop-target");
        });
    }
}

function setFolderDropHover(path = null) {
    const normalized = normalizeFolderPath(path, { allowEmpty: true });
    dragFolderHoverPath = normalized || null;
    if (!el.fileList) return;
    el.fileList.querySelectorAll(`${FILE_FOLDER_ROW_SELECTOR}[data-drop-target="true"]`).forEach((row) => {
        row.removeAttribute("data-drop-target");
    });
    if (!dragFolderHoverPath) return;
    const target = [...el.fileList.querySelectorAll(FILE_FOLDER_ROW_SELECTOR)]
        .find((row) => row.dataset.folderToggle === dragFolderHoverPath);
    if (target) {
        target.setAttribute("data-drop-target", "true");
    }
}

function setRootDropHover(active = false) {
    if (!el.fileList) return;
    if (active) {
        el.fileList.setAttribute("data-root-drop-target", "true");
    } else {
        el.fileList.removeAttribute("data-root-drop-target");
    }
}

function onFileListDragStart(event) {
    const folderRow = event.target?.closest?.(FILE_FOLDER_ROW_SELECTOR);
    if (folderRow && folderRow.dataset.editing !== "true") {
        const folderPath = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) {
            event.preventDefault();
            return;
        }
        closeFileMenus();
        const selectedPayload = buildSelectedMovePayload();
        const selectedCount = selectedPayload.folderPaths.length + selectedPayload.fileIds.length;
        const shouldDragSelection = selectedFolderPaths.has(folderPath) && selectedCount > 1;
        const payload = shouldDragSelection
            ? selectedPayload
            : { folderPaths: [folderPath], fileIds: [] };
        dragFolderPaths = payload.folderPaths;
        dragFileIds = payload.fileIds;
        dragFolderPath = dragFolderPaths[0] || null;
        dragFileId = dragFileIds[0] || null;
        dragFolderPaths.forEach((path) => {
            const row = getFolderRowByPath(path);
            if (row) row.setAttribute("data-dragging", "true");
        });
        dragFileIds.forEach((id) => {
            const row = getFileRowById(id);
            if (row) row.setAttribute("data-dragging", "true");
        });
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", `folder:${folderPath}`);
        }
        return;
    }

    const row = event.target?.closest?.(FILE_ROW_SELECTOR);
    if (!row) return;
    if (row.dataset.fileRowSection !== "files" || row.dataset.editing === "true") {
        event.preventDefault();
        return;
    }
    const fileId = row.dataset.fileId;
    const file = getFileById(fileId);
    if (!file || file.locked) {
        event.preventDefault();
        status.set("File locked");
        return;
    }
    closeFileMenus();
    const selectedPayload = buildSelectedMovePayload();
    const selectedCount = selectedPayload.folderPaths.length + selectedPayload.fileIds.length;
    const shouldDragSelection = selectedFileIds.has(fileId) && selectedCount > 1;
    const payload = shouldDragSelection
        ? selectedPayload
        : { folderPaths: [], fileIds: [fileId] };
    dragFolderPaths = payload.folderPaths;
    dragFileIds = payload.fileIds;
    dragFolderPath = dragFolderPaths[0] || null;
    dragFileId = dragFileIds[0] || null;
    dragFolderPaths.forEach((path) => {
        const folder = getFolderRowByPath(path);
        if (folder) folder.setAttribute("data-dragging", "true");
    });
    dragFileIds.forEach((id) => {
        const fileRow = getFileRowById(id);
        if (fileRow) fileRow.setAttribute("data-dragging", "true");
    });
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", fileId);
    }
}

function onFileListDragOver(event) {
    const payload = getDragMovePayload();
    if (!payload.folderPaths.length && !payload.fileIds.length) return;

    const folderRow = event.target?.closest?.(FILE_FOLDER_ROW_SELECTOR);
    if (folderRow) {
        const folderPath = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) {
            setFolderDropHover(null);
            setRootDropHover(false);
            return;
        }
        const canMoveFolder = payload.folderPaths.some((path) => canMoveFolderToTarget(path, folderPath));
        const canMoveFile = payload.fileIds.some((id) => canMoveFileToTarget(id, folderPath));
        if (!canMoveFolder && !canMoveFile) {
            setFolderDropHover(null);
            setRootDropHover(false);
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        setRootDropHover(false);
        setFolderDropHover(folderPath);
        return;
    }

    const insideFileList = Boolean(event.target?.closest?.("#fileList"));
    if (insideFileList) {
        const canMoveFolder = payload.folderPaths.some((path) => canMoveFolderToTarget(path, ""));
        const canMoveFile = payload.fileIds.some((id) => canMoveFileToTarget(id, ""));
        if (!canMoveFolder && !canMoveFile) {
            setFolderDropHover(null);
            setRootDropHover(false);
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        setFolderDropHover(null);
        setRootDropHover(true);
        return;
    }

    setFolderDropHover(null);
    setRootDropHover(false);
}

function onFileListDragLeave(event) {
    const payload = getDragMovePayload();
    if (!payload.fileIds.length && !payload.folderPaths.length) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && el.fileList?.contains(nextTarget)) return;
    setFolderDropHover(null);
    setRootDropHover(false);
}

function onFileListDrop(event) {
    const payload = getDragMovePayload();
    if (!payload.fileIds.length && !payload.folderPaths.length) return;

    const folderRow = event.target?.closest?.(FILE_FOLDER_ROW_SELECTOR);
    let targetFolder = null;
    if (folderRow) {
        targetFolder = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
    } else {
        const insideFileList = Boolean(event.target?.closest?.("#fileList"));
        if (insideFileList) {
            targetFolder = "";
        }
    }
    if (targetFolder == null) {
        clearFileDragState();
        return;
    }

    event.preventDefault();
    const moved = moveSelectedEntriesToFolder(targetFolder, { payload, focus: false });
    clearFileDragState();
    setRootDropHover(false);
    if (moved) {
        const file = getFileById(activeFileId);
        if (file) {
            focusFileRow(getFileRowById(file.id, { navigableOnly: true }));
        } else if (selectedFolderPaths.size) {
            const [firstFolder] = getSelectedFolderPaths({ pruneNested: false });
            focusFileRow(getFolderRowByPath(firstFolder, { navigableOnly: true }));
        }
    }
}

function onFileListDragEnd() {
    clearFileDragState();
}

function onGlobalDragCleanup(event) {
    const target = event?.target;
    if (target instanceof Node && el.fileList?.contains(target)) return;
    if (!dragFileId && !dragFolderPath && !dragFolderHoverPath && !dragFileIds.length && !dragFolderPaths.length) return;
    clearFileDragState();
}

function onFileListClick(event) {
    if (event.target.closest("[data-file-rename]") || event.target.closest("[data-folder-rename]")) return;
    if (editingFileId || editingFolderPath) return;
    const sectionToggle = event.target.closest("[data-file-section]");
    if (sectionToggle) {
        const section = sectionToggle.dataset.fileSection;
        const expanded = sectionToggle.getAttribute("aria-expanded") === "true";
        setFilesSectionOpen(section, !expanded);
        return;
    }
    const folderToggle = event.target.closest("[data-folder-toggle]");
    if (folderToggle) {
        const folderPath = normalizeFolderPath(folderToggle.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) return;
        const isFilesSection = folderToggle.closest(".file-item")?.dataset.fileRowSection === "files";
        if (isFilesSection && (event.ctrlKey || event.metaKey)) {
            toggleFolderSelection(folderPath);
            renderFileList();
            focusFileRow(getFolderRowByPath(folderPath, { navigableOnly: true }));
            return;
        }
        if (isFilesSection) {
            setSingleFolderSelection(folderPath);
        }
        toggleFolderExpanded(folderPath);
        renderFileList();
        focusFileRow(getFolderRowByPath(folderPath, { navigableOnly: true }));
        return;
    }
    const row = event.target.closest("[data-file-id]");
    if (!row) return;
    const fileId = row.dataset.fileId;
    const isFilesSection = row.dataset.fileRowSection === "files";
    if (isFilesSection && event.shiftKey) {
        selectFileRangeTo(fileId);
        renderFileList();
        focusFileRow(getFileRowById(fileId, { navigableOnly: true }));
        return;
    }
    if (isFilesSection && (event.ctrlKey || event.metaKey)) {
        toggleFileSelection(fileId);
        renderFileList();
        focusFileRow(getFileRowById(fileId, { navigableOnly: true }));
        return;
    }
    selectFile(fileId);
}

function onFileListDblClick(event) {
    if (editingFileId || editingFolderPath) return;
    const row = event.target.closest("[data-file-id]");
    if (!row) return;
    const file = getFileById(row.dataset.fileId);
    if (file?.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to rename."]);
        return;
    }
    startRename(row.dataset.fileId);
}

function onFileListContextMenu(event) {
    const folderRow = event.target.closest(FILE_FOLDER_ROW_SELECTOR);
    const row = event.target.closest("[data-file-id]");
    if (editingFileId || editingFolderPath) return;
    event.preventDefault();
    if (folderRow) {
        const folderPath = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) return;
        if (!selectedFolderPaths.has(folderPath)) {
            setSingleFolderSelection(folderPath);
            renderFileList();
        }
        openFolderMenuAt(folderPath, event.clientX, event.clientY);
        return;
    }
    if (!row) {
        openFilesMenuAt(event.clientX, event.clientY);
        return;
    }
    if (row.dataset.fileRowSection === "files" && !selectedFileIds.has(row.dataset.fileId)) {
        setSingleSelection(row.dataset.fileId);
        renderFileList();
    }
    openFileRowMenuAt(row.dataset.fileId, event.clientX, event.clientY);
}

function ensureUniqueName(name, excludeId, { ignoreCase = false } = {}) {
    const normalized = collapseDuplicateTerminalExtension(normalizeFileName(name));
    const segments = splitPathSegments(normalized);
    const leaf = segments.pop() || FILE_DEFAULT_NAME;
    const parsed = splitLeafExtension(leaf);
    const baseStem = parsed.stem || leaf || "file";
    const extension = parsed.extension || getFallbackFileExtension(leaf);
    const prefix = segments.length ? `${buildPathFromSegments(segments)}/` : "";
    let candidate = normalized;
    let i = 2;
    while (files.some((f) => {
        if (f.id === excludeId) return false;
        if (!ignoreCase) return f.name === candidate;
        const fileName = normalizePathSlashes(String(f.name ?? "")).toLowerCase();
        return fileName === candidate.toLowerCase();
    })) {
        candidate = collapseDuplicateTerminalExtension(`${prefix}${baseStem}(${i})${extension}`);
        i += 1;
    }
    return collapseDuplicateTerminalExtension(candidate);
}

function validateFileName(name, { currentFile = null } = {}) {
    const normalized = normalizePathSlashes(String(name ?? "").trim());
    if (!normalized) return { valid: false, message: "Name required." };
    if (normalized.endsWith("/")) {
        return { valid: false, message: "File name required after folder path." };
    }
    const segments = splitPathSegments(normalized);
    const check = validatePathSegments(segments, "Name");
    if (!check.valid) return check;
    if (segments.length > 1) {
        const targetFolder = buildPathFromSegments(segments.slice(0, -1));
        const currentFolder = getFileDirectory(currentFile?.name || "");
        const knownFolders = collectFolderPaths(files);
        if (targetFolder && targetFolder !== currentFolder && !knownFolders.has(targetFolder)) {
            return { valid: false, message: "Folder path does not exist." };
        }
    }
    return { valid: true, message: "" };
}

function selectBaseName(input) {
    const value = input.value || "";
    const dot = value.lastIndexOf(".");
    if (dot > 0) {
        input.setSelectionRange(0, dot);
    } else {
        input.select();
    }
}

function startRename(fileId) {
    const file = files.find((item) => item.id === fileId);
    if (file?.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to rename."]);
        return;
    }
    pendingNewFileRenameId = null;
    clearFolderRenameState();
    editingFileId = fileId;
    editingDraft = file ? file.name : "";
    editingError = "";
    renderFileList();
}

function commitRename(fileId, value, { cancel = false, reason = "manual" } = {}) {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    const before = snapshotWorkspaceState();
    if (cancel) {
        if (pendingNewFileRenameId === fileId) {
            pendingNewFileRenameId = null;
        }
        clearFileRenameState();
        renderFileList();
        return;
    }
    if (file.locked) {
        status.set("File locked");
        logger.append("system", ["File is locked. Unlock to rename."]);
        return;
    }
    const normalizedValue = normalizePathSlashes(String(value ?? "").trim());
    if (reason === "blur" && pendingNewFileRenameId === fileId && normalizedValue === file.name) {
        editingFileId = fileId;
        editingDraft = file.name;
        editingError = "";
        renderFileList();
        return;
    }
    const check = validateFileName(value, { currentFile: file });
    if (!check.valid) {
        editingFileId = fileId;
        editingDraft = value;
        editingError = check.message;
        renderFileList();
        return;
    }
    const next = collapseDuplicateTerminalExtension(ensureUniqueName(value, fileId));
    const changed = next !== file.name;
    file.name = next;
    if (changed) {
        expandFolderAncestors(file.name);
    }
    clearFileRenameState();
    persistFiles();
    renderFileList();
    if (changed) {
        status.set(`Renamed to ${file.name}`);
        logger.append("system", [`Renamed to ${file.name}`]);
        recordFileHistory(`Rename to ${file.name}`, before);
    }
}

function onFileListInput(event) {
    const fileInput = event.target?.closest?.("[data-file-rename]");
    if (fileInput) {
        if (fileInput.dataset.fileRename === editingFileId) {
            editingDraft = fileInput.value;
            if (editingError) editingError = "";
        }
        return;
    }
    const folderInput = event.target?.closest?.("[data-folder-rename]");
    if (!folderInput) return;
    if (folderInput.dataset.folderRename === editingFolderPath) {
        editingFolderDraft = folderInput.value;
        if (editingFolderError) editingFolderError = "";
    }
}

function onFileListKey(event) {
    const folderInput = event.target?.closest?.("[data-folder-rename]");
    if (folderInput) {
        if (event.key === "Enter") {
            event.preventDefault();
            commitFolderRename(folderInput.value, { reason: "enter" });
        }
        if (event.key === "Escape") {
            event.preventDefault();
            commitFolderRename(folderInput.value, { cancel: true, reason: "escape" });
        }
        return;
    }
    const input = event.target?.closest?.("[data-file-rename]");
    if (input) {
        const fileId = input.dataset.fileRename;
        if (event.key === "Enter") {
            event.preventDefault();
            commitRename(fileId, input.value, { reason: "enter" });
        }
        if (event.key === "Escape") {
            event.preventDefault();
            commitRename(fileId, input.value, { cancel: true, reason: "escape" });
        }
        return;
    }

    const folderRow = event.target?.closest?.(FILE_FOLDER_ROW_SELECTOR);
    if (folderRow && folderRow.dataset.editing !== "true") {
        const folderPath = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (event.ctrlKey || event.metaKey) {
                toggleFolderSelection(folderPath);
            } else {
                setSingleFolderSelection(folderPath);
            }
            toggleFolderExpanded(folderPath);
            renderFileList();
            focusFileRow(getFolderRowByPath(folderPath, { navigableOnly: true }));
            return;
        }
        if (event.key === "Delete" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
            event.preventDefault();
            const shouldDeleteSelection = selectedFolderPaths.has(folderPath) && getSelectedWorkspaceEntries().selectedEntryCount > 1;
            if (shouldDeleteSelection) {
                bulkTrashSelectedFiles();
            } else {
                deleteFolderPath(folderPath, { confirm: true, focus: true });
            }
            return;
        }
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            openFolderMenu(folderPath, folderRow);
            const firstItem = el.fileFolderMenu?.querySelector(".files-menu-item:not(:disabled)");
            if (firstItem && typeof firstItem.focus === "function") {
                firstItem.focus();
            }
        }
        return;
    }

    if (event.altKey) return;
    const row = event.target?.closest?.(FILE_ROW_SELECTOR);
    if (!row || row.dataset.editing === "true") return;
    const fileId = row.dataset.fileId;
    if (!fileId) return;
    const isFilesSection = row.dataset.fileRowSection === "files";

    const rows = getFileRows({ navigableOnly: true });
    if (!rows.length) return;
    const index = rows.indexOf(row);
    const currentIndex = index >= 0 ? index : 0;

    if (isFilesSection && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllVisibleFiles();
        return;
    }

    if (isFilesSection && event.key === "Escape") {
        event.preventDefault();
        clearFileSelection({ keepActive: true });
        const focusRow = getFileRowById(activeFileId, { navigableOnly: true }) || row;
        focusFileRow(focusRow);
        return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = clamp(currentIndex + step, 0, rows.length - 1);
        const nextRow = rows[nextIndex];
        if (isFilesSection && event.shiftKey && nextRow?.dataset.fileRowSection === "files") {
            selectFileRangeTo(nextRow.dataset.fileId);
            renderFileList();
            focusFileRow(getFileRowById(nextRow.dataset.fileId, { navigableOnly: true }));
            return;
        }
        focusFileRow(nextRow);
        return;
    }

    if (event.key === "Home") {
        event.preventDefault();
        focusFileRow(rows[0]);
        return;
    }

    if (event.key === "End") {
        event.preventDefault();
        focusFileRow(rows[rows.length - 1]);
        return;
    }

    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectFile(fileId);
        return;
    }

    if (event.key === "F2") {
        event.preventDefault();
        renameFile(fileId);
        return;
    }

    if (event.key === "Delete" && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        const selectedCount = getSelectedWorkspaceEntries().selectedEntryCount;
        if (isFilesSection && selectedCount > 1 && selectedFileIds.has(fileId)) {
            bulkTrashSelectedFiles();
            return;
        }
        deleteFile(fileId);
        return;
    }

    if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        const selectedCount = getSelectedFiles().length;
        if (isFilesSection && selectedCount > 1 && selectedFileIds.has(fileId)) {
            duplicateSelectedFiles();
            return;
        }
        duplicateFile(fileId);
        return;
    }

    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openFileRowMenu(fileId, row);
        const firstItem = el.fileRowMenu?.querySelector(".files-menu-item:not(:disabled)");
        if (firstItem && typeof firstItem.focus === "function") {
            firstItem.focus();
        }
    }
}

function onFileListBlur(event) {
    const folderInput = event.target.closest("[data-folder-rename]");
    if (folderInput) {
        commitFolderRename(folderInput.value, { reason: "blur" });
        return;
    }
    const input = event.target.closest("[data-file-rename]");
    if (!input) return;
    const fileId = input.dataset.fileRename;
    commitRename(fileId, input.value, { reason: "blur" });
}

function renderInspectDetails(info) {
    if (!el.inspectDetails) return;

    if (!info) {
        lastInspectInfo = null;
        el.inspectDetails.innerHTML = "<p>Run code, then toggle Inspect to explore the sandbox DOM.</p>";
        return;
    }
    lastInspectInfo = info;

    const tag = (info.tagName ?? "").toLowerCase();
    const idPart = info.id ? `#${escapeHTML(info.id)}` : "";
    const classPart = info.classes?.length ? "." + info.classes.map(escapeHTML).join(".") : "";
    const dims = info.rect
        ? `${Math.round(info.rect.width)}x${Math.round(info.rect.height)} @ ${Math.round(info.rect.x)},${Math.round(info.rect.y)}`
        : "size unknown";
    const styles = info.styles ?? {};
    const text = info.text?.trim() ? escapeHTML(info.text.trim()) : "&lt;no text&gt;";
    const selector = getInspectSelectorText(info);

    el.inspectDetails.innerHTML = `
        <div class="inspect-target">&lt;${tag}${idPart}${classPart}&gt;</div>
        <div class="inspect-meta">${dims}</div>
        <div class="inspect-meta">selector: ${escapeHTML(selector || "unknown")}</div>
        <div class="inspect-styles">
            <span>color: ${escapeHTML(styles.color ?? "auto")}</span>
            <span>bg: ${escapeHTML(styles.backgroundColor ?? "transparent")}</span>
            <span>font: ${escapeHTML(styles.fontSize ?? "inherit")}</span>
        </div>
        <p class="inspect-text">${text}</p>
    `;
}

function getInspectSelectorText(info) {
    if (!info || typeof info !== "object") return "";
    const raw = String(info.selector || "").trim();
    if (raw) return raw;
    const tag = String(info.tagName || "").trim().toLowerCase();
    if (!tag) return "";
    const id = String(info.id || "").trim();
    if (id) return `${tag}#${id}`;
    const classes = Array.isArray(info.classes)
        ? info.classes.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];
    if (!classes.length) return tag;
    return `${tag}.${classes.slice(0, 3).join(".")}`;
}

async function copyInspectSelectorToClipboard() {
    const selector = getInspectSelectorText(lastInspectInfo);
    if (!selector) {
        status.set("No inspected element to copy.");
        return false;
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:clipboard-error", { detail: { reason: "Clipboard API unavailable" } }));
        }
        status.set("Clipboard unavailable.");
        return false;
    }
    try {
        await navigator.clipboard.writeText(selector);
        status.set(`Copied selector: ${selector}`);
        return true;
    } catch {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:clipboard-error", { detail: { reason: "Clipboard blocked" } }));
        }
        status.set("Clipboard blocked.");
        return false;
    }
}

function setInspectUI(active) {
    inspectEnabled = active;
    if (el.btnInspect) el.btnInspect.setAttribute("data-active", active ? "true" : "false");
    if (el.inspectPanel) el.inspectPanel.setAttribute("data-inspecting", active ? "true" : "false");
    if (el.inspectStatus) el.inspectStatus.textContent = active ? "Inspecting" : "Off";
    if (active) {
        lastInspectInfo = null;
        el.inspectDetails.innerHTML = "<p>Hover elements inside the sandbox.</p>";
    } else {
        renderInspectDetails(null);
    }
}

function sendSandboxCommand(type, payload = undefined) {
    const win = getRunnerWindow();
    if (!win || !currentToken) return;
    win.postMessage({ source: "fazide-parent", token: currentToken, type, payload }, "*");
}

function syncSandboxTheme() {
    sendSandboxCommand("theme_update", { theme: currentTheme });
}

function sendInspectCommand(type) {
    sendSandboxCommand(type);
}

function toggleInspect() {
    const next = !inspectEnabled;
    if (next && !currentToken) {
        logger.append("system", ["Run code before using Inspect."]);
        return;
    }

    setInspectUI(next);
    sendInspectCommand(next ? "inspect_enable" : "inspect_disable");
    logger.append("system", [next ? "Inspect mode enabled." : "Inspect mode disabled."]);
}

function syncInspectAfterLoad() {
    if (inspectEnabled && currentToken) {
        sendInspectCommand("inspect_enable");
    }
}

function setDebugMode(next) {
    debugMode = Boolean(next);
    if (el.debugModeToggle) {
        el.debugModeToggle.setAttribute("aria-pressed", debugMode ? "true" : "false");
        el.debugModeToggle.textContent = debugMode ? "Debug: On" : "Debug: Off";
    }
}

function normalizeDebugBreakpointLine(line) {
    const max = Math.max(0, (editor.lineCount?.() || 1) - 1);
    return clamp(Number(line) || 0, 0, max);
}

function refreshEditorBreakpointMarkers() {
    const lines = [...debugBreakpoints.values()].sort((a, b) => a - b);
    editor.setBreakpoints?.(lines);
}

function renderDebugBreakpointList() {
    if (!el.debugBreakpointList) return;
    const rows = [...debugBreakpoints.values()].sort((a, b) => a - b);
    if (!rows.length) {
        el.debugBreakpointList.innerHTML = `<li class="debug-breakpoint-empty">No breakpoints. Click gutter line numbers to add.</li>`;
        return;
    }
    el.debugBreakpointList.innerHTML = rows
        .map((line) => `<li class="diagnostics-item">Line ${line + 1}</li>`)
        .join("");
}

function renderDebugWatchList() {
    if (!el.debugWatchList) return;
    if (!debugWatches.length) {
        el.debugWatchList.innerHTML = `<li class="debug-watch-empty">No watch expressions.</li>`;
        return;
    }
    el.debugWatchList.innerHTML = debugWatches
        .map((expr) => {
            const value = debugWatchValues.has(expr)
                ? debugWatchValues.get(expr)
                : "(not evaluated)";
            return `
                <li class="debug-watch-item diagnostics-item">
                    <span class="debug-watch-entry">${escapeHTML(expr)} = ${escapeHTML(String(value))}</span>
                    <button type="button" class="debug-watch-remove" data-debug-watch-remove="${escapeHTML(expr)}">Remove</button>
                </li>
            `;
        })
        .join("");
}

function toggleDebugBreakpoint(line) {
    const target = normalizeDebugBreakpointLine(line);
    if (debugBreakpoints.has(target)) debugBreakpoints.delete(target);
    else debugBreakpoints.add(target);
    refreshEditorBreakpointMarkers();
    renderDebugBreakpointList();
    status.set(`Breakpoints: ${debugBreakpoints.size}`);
}

function clearDebugBreakpoints() {
    debugBreakpoints.clear();
    refreshEditorBreakpointMarkers();
    renderDebugBreakpointList();
    status.set("Breakpoints cleared");
}

function addDebugWatch(expression) {
    const normalized = String(expression || "").trim();
    if (!normalized) return false;
    if (debugWatches.includes(normalized)) return false;
    debugWatches.push(normalized);
    renderDebugWatchList();
    requestDebugWatchValues();
    return true;
}

function removeDebugWatch(expression) {
    const normalized = String(expression || "").trim();
    const before = debugWatches.length;
    debugWatches = debugWatches.filter((entry) => entry !== normalized);
    if (debugWatches.length === before) return false;
    debugWatchValues.delete(normalized);
    renderDebugWatchList();
    return true;
}

function clearDebugWatches() {
    const count = debugWatches.length;
    if (!count) return 0;
    debugWatches = [];
    debugWatchValues.clear();
    renderDebugWatchList();
    return count;
}

function applyBreakpointsToCode(code) {
    if (!debugMode || !debugBreakpoints.size) return String(code ?? "");
    const lines = String(code ?? "").split("\n");
    const ordered = [...debugBreakpoints.values()].sort((a, b) => b - a);
    ordered.forEach((line) => {
        const idx = clamp(line, 0, lines.length);
        lines.splice(idx, 0, "debugger; // FAZ IDE breakpoint");
    });
    return lines.join("\n");
}

function requestDebugWatchValues() {
    if (!debugMode || !currentToken || !debugWatches.length) return;
    const win = getRunnerWindow();
    if (!win) return;
    win.postMessage({
        source: "fazide-parent",
        token: currentToken,
        type: "debug_eval",
        payload: {
            expressions: [...debugWatches],
        },
    }, "*");
}

function setRunnerFullscreen(active) {
    runnerFullscreen = active;
    if (el.runnerShell) el.runnerShell.setAttribute("data-fullscreen", active ? "true" : "false");
    if (el.btnRunnerFull) {
        el.btnRunnerFull.textContent = active ? "Collapse" : "Expand";
        el.btnRunnerFull.setAttribute("data-active", active ? "true" : "false");
    }
    if (document.body) {
        document.body.classList.toggle("runner-fullscreen", active);
    }
}

function exposeDebug() {
    if (typeof window === "undefined") return;

    const samples = {
        basic: `console.log("FAZ IDE: basic sample running");\n`,
        error: `console.log("About to throw...");\nthrow new Error("FAZ IDE sample error");\n`,
        async: `console.log("Async sample");\nsetTimeout(() => console.log("Async OK"), 300);\n`,
        inspect: `const box = document.createElement("div");\nbox.textContent = "Hover me";\nbox.style.cssText = "padding:16px;margin:20px;border:1px solid #22d3ee;background:#0f172a;color:#e2e8f0;border-radius:8px";\ndocument.body.appendChild(box);\nconsole.log("Inspect sample ready");\n`,
    };

    window.fazide = {
        version: APP.VERSION,
        samples,
        listGames() {
            return games.map((game) => ({
                id: game.id,
                name: game.name,
                folder: game.folder,
                entryFile: game.entryFile,
                files: game.files.map((file) => ({ path: file.path, src: file.src })),
            }));
        },
        loadGame(id, { run = false } = {}) {
            return loadGameById(id, { runAfter: run });
        },
        setCode(code) {
            setEditorValue(String(code ?? ""), { silent: true });
            updateActiveFileCode(editor.get());
        },
        setTheme(theme) {
            applyTheme(theme);
            return currentTheme;
        },
        getTheme() {
            return currentTheme;
        },
        getCode() {
            return editor.get();
        },
        listFiles() {
            return files.map((f) => ({
                id: f.id,
                name: f.name,
                active: f.id === activeFileId,
                dirty: isFileDirty(f),
            }));
        },
        listDirtyFiles() {
            return getDirtyFiles().map((file) => ({ id: file.id, name: file.name }));
        },
        listTrash() {
            pruneTrashEntries();
            return trashFiles.map((file) => ({
                id: file.id,
                name: file.name,
                deletedAt: file.deletedAt,
            }));
        },
        saveFile() {
            return saveActiveFile({ announce: false });
        },
        saveAllFiles() {
            return saveAllFiles({ announce: false });
        },
        createFile(name = getNextScriptFileName(), code = "") {
            const check = validateFileName(name);
            if (!check.valid) {
                status.set("Invalid file name");
                logger.append("error", [check.message]);
                return null;
            }
            const before = snapshotWorkspaceState();
            stashActiveFile();
            const file = makeFile(ensureUniqueName(name), String(code ?? ""));
            files.push(file);
            activeFileId = file.id;
            ensureTabOpen(file.id);
            expandFolderAncestors(file.name);
            setEditorValue(file.code, { silent: true });
            persistFiles();
            renderFileList();
            status.set(`New file: ${file.name}`);
            recordFileHistory(`Create ${file.name}`, before);
            return file;
        },
        createFolder(path = getNextFolderName()) {
            const folderPath = normalizeFolderPath(path, { allowEmpty: true });
            const check = validateFolderName(folderPath);
            if (!check.valid) return null;
            if (folderPathExists(folderPath, { ignoreCase: true })) return null;
            const before = snapshotWorkspaceState();
            stashActiveFile();
            folders = normalizeFolderList([...folders, folderPath]);
            expandFolderPathAncestors(folderPath);
            persistFiles();
            renderFileList();
            recordFileHistory(`Create folder ${folderPath}`, before);
            return { path: folderPath };
        },
        listFolders() {
            return [...collectFolderPaths()].sort((a, b) => a.localeCompare(b));
        },
        renameFolder(fromPath, toPath) {
            return renameFolderToPath(fromPath, toPath);
        },
        deleteFolder(path, options = {}) {
            const confirmDelete = options?.confirm !== false;
            return deleteFolderPath(path, { confirm: confirmDelete, focus: false });
        },
        collapseAllFolders() {
            return collapseAllFolders();
        },
        expandAllFolders() {
            return expandAllFolders();
        },
        createFileInFolder(path, options = {}) {
            return createFileInFolder(path, options);
        },
        moveFileToFolder(name, folderPath) {
            const file = files.find((entry) => entry.name === name);
            if (!file) return false;
            return moveFileToFolder(file.id, folderPath);
        },
        deleteFile(name) {
            const target = files.find((f) => f.name === name);
            if (!target) return false;
            if (files.length === 1) return false;
            if (target.locked) return false;
            const before = snapshotWorkspaceState();
            queueDeleteUndo(`Deleted ${target.name}`);
            pushFilesToTrash([target]);
            const idx = files.findIndex((f) => f.id === target.id);
            if (idx === -1) return false;
            files.splice(idx, 1);
            openTabIds = openTabIds.filter((tabId) => tabId !== target.id);
            if (activeFileId === target.id) {
                const fallback = files[0];
                activeFileId = fallback.id;
                ensureTabOpen(activeFileId);
                setEditorValue(fallback.code, { silent: true });
            }
            persistFiles();
            renderFileList();
            recordFileHistory(`Trash ${target.name}`, before);
            return true;
        },
        deleteAllFiles() {
            const lockedCount = files.filter((file) => file.locked).length;
            if (lockedCount > 0) return false;
            const before = snapshotWorkspaceState();
            queueDeleteUndo("Deleted all files");
            pushFilesToTrash(files);
            const fallback = makeFile(FILE_DEFAULT_NAME, "");
            files = [fallback];
            activeFileId = fallback.id;
            openTabIds = [fallback.id];
            clearInlineRenameState();
            fileMenuTargetId = null;
            setEditorValue(fallback.code, { silent: true });
            persistFiles();
            renderFileList();
            recordFileHistory("Delete all files", before);
            return true;
        },
        undoDelete() {
            return undoLastDelete();
        },
        undoAction() {
            return undoFileHistory();
        },
        redoAction() {
            return redoFileHistory();
        },
        restoreFromTrash() {
            return restoreLastDeletedFile();
        },
        restoreAllFromTrash() {
            return restoreAllDeletedFiles();
        },
        clearTrash() {
            pruneTrashEntries();
            const count = trashFiles.length;
            const before = snapshotWorkspaceState();
            trashFiles = [];
            persistFiles();
            renderFileList();
            if (count > 0) recordFileHistory(`Empty trash (${count})`, before);
            return count;
        },
        renameFile(oldName, newName) {
            const file = files.find((f) => f.name === oldName);
            if (!file) return false;
            const check = validateFileName(newName || file.name, { currentFile: file });
            if (!check.valid) {
                status.set("Invalid file name");
                logger.append("error", [check.message]);
                return false;
            }
            const before = snapshotWorkspaceState();
            const next = ensureUniqueName(newName || file.name, file.id);
            file.name = next;
            persistFiles();
            renderFileList();
            recordFileHistory(`Rename to ${file.name}`, before);
            return true;
        },
        exportWorkspaceData() {
            return exportWorkspaceData();
        },
        importWorkspaceData(payload) {
            const normalized = normalizeImportedWorkspace(payload);
            if (!normalized) return false;
            return applyImportedWorkspace(normalized, { label: "Import workspace (debug)" });
        },
        openLocalFolder() {
            return openLocalProjectFolder();
        },
        saveToLocalFolder() {
            return saveWorkspaceToLocalFolder();
        },
        setDebugMode(active) {
            setDebugMode(Boolean(active));
            return debugMode;
        },
        addBreakpoint(line) {
            toggleDebugBreakpoint(Math.max(0, Number(line) - 1));
            return [...debugBreakpoints.values()].sort((a, b) => a - b);
        },
        clearBreakpoints() {
            clearDebugBreakpoints();
            return [];
        },
        addWatch(expression) {
            return addDebugWatch(expression);
        },
        removeWatch(expression) {
            return removeDebugWatch(expression);
        },
        clearWatches() {
            return clearDebugWatches();
        },
        getInspectSelector() {
            return getInspectSelectorText(lastInspectInfo);
        },
        copyInspectSelector() {
            return copyInspectSelectorToClipboard();
        },
        openCommandPalette() {
            openCommandPalette();
        },
        openShortcutHelp() {
            openShortcutHelp();
        },
        registerCommand(command, options = {}) {
            return commandRegistry.register(command, options);
        },
        unregisterCommand(id) {
            return commandRegistry.unregister(id);
        },
        listCommands() {
            return commandRegistry.list().map((entry) => ({
                id: entry.id,
                label: entry.label,
                shortcut: entry.shortcut,
                source: entry.source,
            }));
        },
        registerSnippet(snippet, options = {}) {
            return registerSnippet(snippet, options);
        },
        unregisterSnippet(trigger, scope = null) {
            return unregisterSnippet(trigger, scope);
        },
        listSnippets() {
            return snippetRegistry.map((entry) => ({ ...entry }));
        },
        openEditorSearch(replaceMode = false) {
            openEditorSearch({ replaceMode: Boolean(replaceMode) });
        },
        openProjectSearch() {
            openProjectSearch();
        },
        openSymbolPalette() {
            openSymbolPalette();
        },
        openEditorHistory() {
            openEditorHistory();
        },
        openEditorSettings() {
            openEditorSettings();
        },
        listSymbols(query = "") {
            return getSymbolMatches(String(query || ""));
        },
        async listSymbolsAst() {
            return getSymbolsForCurrentCode();
        },
        async listReferences(name) {
            return astClient.references(editor.get(), String(name || ""));
        },
        async findReferences(name = "") {
            const targetName = String(name || getSymbolReferenceName() || "");
            return findReferencesForSymbol(targetName);
        },
        renameSymbol() {
            return renameSymbolAtCursor();
        },
        snapshotCode(reason = "manual") {
            const active = getActiveFile();
            if (!active) return null;
            return recordCodeSnapshot(active.id, active.code, reason, { force: true });
        },
        listCodeSnapshots(fileId = activeFileId) {
            return getFileHistoryEntries(fileId).map((entry) => ({
                id: entry.id,
                at: entry.at,
                reason: entry.reason,
                codeLength: entry.code.length,
            }));
        },
        setEditorProfile(profile) {
            return applyEditorProfile(profile, { persist: true });
        },
        setEditorOption(key, value) {
            if (!["tabSize", "fontSize", "fontFamily", "lineWrapping", "lintEnabled", "errorLensEnabled", "snippetEnabled", "autosaveMs", "formatterMode"].includes(key)) {
                return false;
            }
            editorSettings = sanitizeEditorSettings({ ...editorSettings, [key]: value });
            applyEditorSettings({ persist: true, refreshUI: true });
            return true;
        },
        runTask(taskId) {
            return runTaskRunnerTask(taskId);
        },
        clearTaskOutput() {
            clearTaskRunnerOutput();
            return true;
        },
        listTaskOutput() {
            return taskRunnerEntries.map((entry) => ({
                id: entry.id,
                at: entry.at,
                level: entry.level,
                task: entry.task,
                message: entry.message,
                location: entry.location ? { ...entry.location } : null,
            }));
        },
        getState() {
            return {
                layout: { ...layoutState },
                inspectEnabled,
                runCount,
                editorType: editor.type,
                editorSettings: { ...editorSettings },
                astAvailable: astClient.available(),
                debugMode,
                breakpoints: [...debugBreakpoints.values()].sort((a, b) => a - b),
                watches: [...debugWatches],
                projectSearchOpen,
                editorSplitOpen,
                dirtyFiles: getDirtyFiles().length,
                historyDepth: fileHistory.length,
                codeHistoryDepth: Object.keys(fileCodeHistory).length,
                lintDiagnostics: activeDiagnostics.length,
                taskRunnerBusy,
                taskRunnerEntries: taskRunnerEntries.length,
                canUndoFileHistory: canUndoFileHistory(),
                canRedoFileHistory: canRedoFileHistory(),
            };
        },
        help() {
            const lines = [
                "FAZ IDE console helpers:",
                "fazide.selfTest()",
                "fazide.setPanelOpen('log'|'editor'|'files'|'sandbox'|'tools', true|false)",
                "fazide.togglePanel('log'|'editor'|'files'|'sandbox'|'tools')",
                "fazide.setPanelOrder('log'|'editor'|'files'|'sandbox'|'tools', 0..3)",
                "fazide.dockPanel('log'|'editor'|'files'|'sandbox'|'tools', 'top'|'bottom')",
                "fazide.setCode('...') / fazide.getCode()",
                "fazide.setTheme('dark'|'light'|'purple') / fazide.getTheme()",
                "fazide.listFiles() / fazide.listTrash() / fazide.createFile('name.js', 'code') / fazide.createFolder('src')",
                "fazide.listFolders() / fazide.renameFolder('src','core') / fazide.deleteFolder('src') / fazide.moveFileToFolder('main.js','core')",
                "fazide.deleteFile('name.js') / fazide.deleteAllFiles() / fazide.undoDelete()",
                "fazide.undoAction() / fazide.redoAction()",
                "fazide.saveFile() / fazide.saveAllFiles() / fazide.listDirtyFiles()",
                "fazide.exportWorkspaceData() / fazide.importWorkspaceData(payload)",
                "fazide.openLocalFolder() / fazide.saveToLocalFolder()",
                "fazide.restoreFromTrash() / fazide.restoreAllFromTrash() / fazide.clearTrash()",
                "fazide.renameFile('old.js','new.js')",
                "fazide.openEditorSearch() / fazide.openSymbolPalette() / fazide.renameSymbol() / fazide.findReferences('name?')",
                "fazide.openProjectSearch()",
                "fazide.listSymbolsAst() / fazide.listReferences('name')",
                "fazide.snapshotCode() / fazide.listCodeSnapshots()",
                "fazide.setEditorProfile('balanced'|'focus'|'presentation')",
                "fazide.runTask('run-all'|'run-app'|'lint-workspace'|'format-active'|'save-all') / fazide.listTaskOutput()",
                "fazide.registerCommand({ id, label, run, keywords, shortcut }) / fazide.unregisterCommand(id)",
                "fazide.registerSnippet({ trigger, template, scope }) / fazide.unregisterSnippet(trigger, scope?)",
                "fazide.setDebugMode(true) / fazide.addBreakpoint(12) / fazide.addWatch('someVar')",
                "fazide.listGames() / fazide.loadGame('click-counter', { run: true })",
                "fazide.setLogWidth(px) / fazide.setSidebarWidth(px) / fazide.setSandboxWidth(px) / fazide.setToolsWidth(px)",
                "fazide.setSizes({ logWidth, sidebarWidth, sandboxWidth, toolsWidth })",
                "fazide.setPanelGap(px) / fazide.setCornerRadius(px) / fazide.setBottomHeight(px)",
                "fazide.applyPreset('studio'|'focus'|'review'|'wide')",
                "fazide.resetLayout()",
                "fazide.runSample('basic'|'error'|'async'|'inspect')",
            ];
            console.log(lines.join("\n"));
            return lines;
        },
        selfTest() {
            const results = [];
            const push = (name, ok, info = "") => results.push({ name, ok, info });
            push("App shell present", Boolean(el.appShell));
            push("Editor present", Boolean(el.editor));
            push("Runner present", Boolean(el.runner));
            push("Command palette present", Boolean(el.commandPalette));
            push("Shortcut help present", Boolean(el.shortcutHelpPanel));
            push("Find panel present", Boolean(el.editorSearchPanel));
            push("Symbol panel present", Boolean(el.symbolPalette));
            push("Project search panel present", Boolean(el.projectSearchPanel));
            push("History panel present", Boolean(el.editorHistoryPanel));
            push("Settings panel present", Boolean(el.editorSettingsPanel));
            push("Task runner panel present", Boolean(el.taskRunnerPanel));
            push("Debug panel present", Boolean(el.debugPanel));
            push("Split mirror present", Boolean(el.editorMirror));
            push("Layout attrs", Boolean(el.appShell?.dataset.log) && Boolean(el.appShell?.dataset.sandbox));
            push(
                "Panel order",
                Array.isArray(layoutState.panelRows?.top) &&
                    layoutState.panelRows.top.length + (layoutState.panelRows.bottom?.length || 0) >= 4
            );

            const allPass = results.every((r) => r.ok);
            console.table(results);
            console.log(allPass ? "FAZ IDE selfTest: PASS" : "FAZ IDE selfTest: CHECK FAILURES");
            return results;
        },
        setSidebarWidth(px) {
            const bounds = getLayoutBounds().sidebar;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setSidebarWidth(next);
            persistLayout();
            return next;
        },
        setLogWidth(px) {
            const bounds = getLayoutBounds().logWidth;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setLogWidth(next);
            persistLayout();
            return next;
        },
        setSandboxWidth(px) {
            const bounds = getLayoutBounds().sandboxWidth;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setSandboxWidth(next);
            persistLayout();
            return next;
        },
        setToolsWidth(px) {
            const bounds = getLayoutBounds().toolsWidth;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setToolsWidth(next);
            persistLayout();
            return next;
        },
        setSizes({ logWidth, sidebarWidth, sandboxWidth, toolsWidth } = {}) {
            let applied = {};
            if (Number.isFinite(logWidth)) {
                applied.logWidth = this.setLogWidth(logWidth);
            }
            if (Number.isFinite(sidebarWidth)) {
                applied.sidebarWidth = this.setSidebarWidth(sidebarWidth);
            }
            if (Number.isFinite(sandboxWidth)) {
                applied.sandboxWidth = this.setSandboxWidth(sandboxWidth);
            }
            if (Number.isFinite(toolsWidth)) {
                applied.toolsWidth = this.setToolsWidth(toolsWidth);
            }
            return applied;
        },
        setPanelOrder(panel, index) {
            setPanelOrder(panel, index);
            return { ...layoutState.panelRows };
        },
        dockPanel(panel, row = "top") {
            movePanelToRow(panel, row, 0);
            return { ...layoutState.panelRows };
        },
        setPanelOpen(panel, open) {
            setPanelOpen(panel, Boolean(open));
            return isPanelOpen(panel);
        },
        togglePanel(panel) {
            togglePanel(panel);
            return isPanelOpen(panel);
        },
        setPanelGap(px) {
            const bounds = getLayoutBounds().panelGap;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setPanelGap(next);
            persistLayout();
            return next;
        },
        setBottomHeight(px) {
            const bounds = getLayoutBounds().bottomHeight;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setBottomHeight(next);
            persistLayout();
            return next;
        },
        setCornerRadius(px) {
            const bounds = getLayoutBounds().cornerRadius;
            const next = clamp(Number(px), bounds.min, bounds.max);
            setPanelRadius(next);
            persistLayout();
            return next;
        },
        applyPreset(name) {
            applyLayoutPreset(name);
            return { ...layoutState };
        },
        resetLayout() {
            applyLayoutPreset("studio");
        },
        runSample(name = "basic") {
            const code = samples[name] || samples.basic;
            setEditorValue(code, { silent: true });
            updateActiveFileCode(code);
            run();
        },
    };
}

function toggleRunnerFullscreen() {
    if (isSandboxWindowOpen()) {
        logger.append("system", ["Sandbox is popped out. Close it to use fullscreen."]);
        return;
    }
    const next = !runnerFullscreen;
    setRunnerFullscreen(next);
    logger.append("system", [next ? "Sandbox expanded." : "Sandbox restored."]);
}

function exitRunnerFullscreen() {
    if (!runnerFullscreen) return;
    setRunnerFullscreen(false);
    logger.append("system", ["Sandbox restored."]);
}

async function boot() {
    loadEditorSettings();
    loadSnippetRegistry();
    loadCodeHistory();
    wireDiagnostics();
    wireProblemsPanel();
    wireTaskRunner();
    registerServiceWorker();
    checkStorageHealth();
    setDiagnosticsVerbose(false);
    const storedTheme = load(STORAGE.THEME);
    applyTheme(storedTheme || "dark", { persist: false });
    initDocking();
    initSplitters();
    exposeDebug();
    wireQuickOpen();
    wireCommandPalette();
    wireShortcutHelp();
    wirePromptDialog();
    wireEditorSearch();
    wireSymbolPalette();
    wireProjectSearch();
    wireEditorHistory();
    wireEditorSettings();
    wireDebugger();
    setLayoutPanelOpen(false);
    setShortcutHelpOpen(false);
    setEditorSearchOpen(false);
    setSymbolPaletteOpen(false);
    setProjectSearchOpen(false);
    setEditorHistoryOpen(false);
    setEditorSettingsOpen(false);
    setEditorSplitOpen(false);
    setFindToggleState(el.editorFindCase, false);
    setFindToggleState(el.editorFindWord, false);
    setFindToggleState(el.editorFindRegex, false);
    setFindToggleState(el.editorFindSelection, false);
    setFindToggleState(el.projectSearchCase, false);
    setFindToggleState(el.projectSearchWord, false);
    setFindToggleState(el.projectSearchRegex, false);
    applyEditorSettings({ persist: false, refreshUI: true });

    const editorLabel = editor.type === "codemirror" ? "CodeMirror" : "Textarea";
    const editorState = editor.type === "codemirror" ? "ok" : "warn";
    setHealth(health.editor, editorState, `Editor: ${editorLabel}`);
    setHealth(health.sandbox, "idle", "Sandbox: Idle");
    if (editor.type !== "codemirror") {
        pushDiag("warn", "CodeMirror not detected. Falling back to textarea.");
    }
    formatter.isPrettierReady().then((ready) => {
        if (!ready) {
            pushDiag("warn", "Prettier modules unavailable. Using basic formatter.");
        } else {
            pushDiag("info", "Prettier formatter ready.");
        }
    }).catch(() => {
        pushDiag("warn", "Prettier modules unavailable. Using basic formatter.");
    });

    const rawLayout = load(STORAGE.LAYOUT);
    layoutState = loadLayout(rawLayout);
    applyLayout();
    if (!rawLayout) {
        requestAnimationFrame(() => syncDefaultEditorSandboxWidth({ persist: true }));
    }
    setSandboxPopoutUI();

    // Initial content
    // Notes:
    // - load() returns a string or null; null means first run or storage cleared.
    // - DEFAULT_CODE is the fallback.
    const initial = await hydrateFileState();
    files = initial.files;
    folders = normalizeFolderList(initial.folders);
    activeFileId = initial.activeId;
    openTabIds = normalizeOpenTabIds(initial.openIds);
    trashFiles = Array.isArray(initial.trash) ? initial.trash : [];
    cleanupCodeHistoryForKnownFiles();
    pruneTrashEntries();
    setSingleSelection(activeFileId);
    const activeFile = getActiveFile();
    setEditorValue(activeFile?.code ?? DEFAULT_CODE, { silent: true });
    if (activeFile) {
        recordCodeSnapshot(activeFile.id, activeFile.code, "boot", { force: false });
    }
    renderFileList();
    renderEditorMirror();
    syncGamesUI({ force: true });
    persistFiles("boot");
    setSessionState(true);

    // Header line
    // Notes:
    // - Status chip communicates states at a glance.
    // - Log prints a one-time boot banner for context.
    status.set("Ready");
    logger.append("system", [`${APP.NAME} ${APP.VERSION} loaded - built by ${APP.AUTHOR}`]);
    if (initial.source === "snapshot-recovery" || initial.source === "snapshot-fallback") {
        logger.append("system", ["Recovered workspace from snapshot backup."]);
        status.set("Recovered snapshot");
    }

    // Autosave on edit
    // Notes:
    // - Saves on every input event (typing/paste).
    // - Keeps "lossless" workflow: refresh shouldn't lost code.
    // - Status becomes "Editing" to show unspecific activity.
    editor.onChange(() => {
        if (suppressChange) return;
        updateActiveFileCode(editor.get());
        queueEditorLint("input");
        if (editorSearchOpen) {
            refreshFindResults({ preserveIndex: true, focusSelection: false });
        }
        if (symbolPaletteOpen) {
            refreshSymbolResults(el.symbolSearchInput?.value || "");
        }
        clearSnippetSession();
        status.set("Unsaved");
        renderFileList();
        renderEditorMirror();
    });

    editor.onCursorActivity?.(() => {
        if (!snippetSession) return;
        const current = editor.getSelections?.()[0];
        if (!current) return;
        const stop = snippetSession.stops?.[snippetSession.index];
        if (!stop) return;
        const anchor = editor.indexFromPos(current.anchor);
        const head = editor.indexFromPos(current.head);
        const min = Math.min(anchor, head);
        const max = Math.max(anchor, head);
        if (min === stop.start && max === stop.end) return;
        clearSnippetSession();
    });

    editor.onMouseDown?.((event) => {
        if (!event?.altKey || !editor.supportsMultiCursor) return;
        event.preventDefault();
        const pos = editor.coordsChar?.({ left: event.clientX, top: event.clientY });
        if (!pos) return;
        const selections = editor.getSelections?.() || [];
        selections.push({ anchor: pos, head: pos });
        editor.setSelections?.(getUniqueSelections(selections));
    });

    // Keyboard shortcuts (editor-focused)
    // Notes:
    // - We handle shortcuts only while the editor has focus.
    // - We prevent default browser behavior (Save page / focus address bar).
    editor.onKeyDown((e) => {
        if (isRunShortcut(e)) {
            e.preventDefault();
            run();
            return;
        }

        if (isSaveShortcut(e)) {
            e.preventDefault();
            saveActiveFile({ announce: true });
            return;
        }

        if (isSaveAllShortcut(e)) {
            e.preventDefault();
            saveAllFiles({ announce: true });
            return;
        }

        if (isNewFileShortcut(e)) {
            e.preventDefault();
            createFile();
            return;
        }

        if (isClearLogShortcut(e)) {
            e.preventDefault();
            ensureLogOpen("Console opened.");
            logger.clear();
            logger.append("system", ["Log cleared."]);
            status.set("Ready");
            return;
        }

        if (isFindShortcut(e)) {
            e.preventDefault();
            openEditorSearch({ replaceMode: false });
            return;
        }

        if (isReplaceShortcut(e)) {
            e.preventDefault();
            openEditorSearch({ replaceMode: true });
            return;
        }

        if (isSymbolShortcut(e)) {
            e.preventDefault();
            openSymbolPalette();
            return;
        }

        if (isProjectSearchShortcut(e)) {
            e.preventDefault();
            openProjectSearch();
            return;
        }

        if (isGoToLineShortcut(e)) {
            e.preventDefault();
            promptGoToLine();
            return;
        }

        if (isAddCursorDownShortcut(e)) {
            e.preventDefault();
            addCursorVertical(1);
            return;
        }

        if (isAddCursorUpShortcut(e)) {
            e.preventDefault();
            addCursorVertical(-1);
            return;
        }

        if (e.key === "Tab" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (snippetSession) {
                e.preventDefault();
                if (!jumpSnippetStop(1)) {
                    clearSnippetSession();
                }
                return;
            }
            if (expandSnippetAtCursor()) {
                e.preventDefault();
                return;
            }
        }

        if (e.key === "Escape" && snippetSession) {
            clearSnippetSession();
        }
    });

    // Buttons
    // Notes:
    // - Buttons call the same underlying actions as shortcuts where possible.
    el.btnRun.addEventListener("click", run);

    el.btnFormat.addEventListener("click", async () => {
        await formatCurrentEditor({ announce: true });
        editor.focus();
    });

    el.btnClear.addEventListener("click", () => {
        clearEditor({ silent: true });
        updateActiveFileCode("");
        logger.append("system", ["Editor cleared."]);
        status.set("Cleared");
        editor.focus();
    });

    el.btnEditorFind?.addEventListener("click", () => openEditorSearch({ replaceMode: false }));
    el.btnEditorSymbols?.addEventListener("click", () => openSymbolPalette());
    el.btnProjectSearch?.addEventListener("click", () => openProjectSearch());
    el.btnEditorSplit?.addEventListener("click", () => setEditorSplitOpen(!editorSplitOpen));
    el.btnEditorHistory?.addEventListener("click", () => openEditorHistory());
    el.btnEditorSettings?.addEventListener("click", () => openEditorSettings());

    el.btnClearLog.addEventListener("click", () => {
        ensureLogOpen("Console opened.");
        logger.clear();
        logger.append("system", ["Log cleared."]);
        status.set("Ready");
    });

    el.btnCopyLog.addEventListener("click", () => {
        ensureLogOpen("Console opened.");
        logger.copy();
    });
    el.btnInspect.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for inspect.");
        ensureSandboxOpen("Sandbox opened for inspect.");
        toggleInspect();
    });
    el.btnInspectCopy?.addEventListener("click", async () => {
        ensureToolsOpen("Tools opened for inspect.");
        await copyInspectSelectorToClipboard();
    });
    if (el.filesMenuButton) {
        el.filesMenuButton.addEventListener("click", (event) => {
            event.stopPropagation();
            if (openFileMenu === "header") {
                closeFileMenus();
                return;
            }
            openFilesMenu(el.filesMenuButton);
        });
    }
    if (el.filesMenu) {
        if (el.newFileTypeSelect) {
            newFileTypePreference = normalizeNewFileTypePreference(el.newFileTypeSelect.value);
            el.newFileTypeSelect.value = newFileTypePreference;
            el.newFileTypeSelect.addEventListener("change", (event) => {
                const next = normalizeNewFileTypePreference(event.target.value);
                newFileTypePreference = next;
                event.target.value = next;
            });
        }
        el.filesMenu.addEventListener("click", (event) => {
            const toggleBtn = event.target.closest("[data-files-toggle]");
            if (toggleBtn) {
                const target = toggleBtn.dataset.filesToggle;
                if (target === "filters") {
                    setFilesFiltersOpen(!layoutState.filesFiltersOpen);
                }
                if (target === "games") {
                    setFilesGamesOpen(!layoutState.filesGamesOpen);
                }
                if (target === "open-editors") {
                    setFilesSectionOpen("open-editors", !layoutState.filesOpenEditorsOpen);
                }
                if (target === "files") {
                    setFilesSectionOpen("files", !layoutState.filesListOpen);
                }
                if (target === "trash") {
                    setFilesSectionOpen("trash", !layoutState.filesTrashOpen);
                }
                syncFilesMenuToggles();
                closeFileMenus();
                return;
            }

            const btn = event.target.closest("[data-files-menu]");
            if (!btn) return;
            const action = btn.dataset.filesMenu;
            closeFileMenus();
            if (action === "save-file") saveActiveFile({ announce: true });
            if (action === "save-all") saveAllFiles({ announce: true });
            if (action === "export-workspace") exportWorkspace();
            if (action === "import-workspace") triggerWorkspaceImportPicker();
            if (action === "undo-action") undoFileHistory();
            if (action === "redo-action") redoFileHistory();
            if (action === "select-all") selectAllVisibleFiles();
            if (action === "clear-selection") clearFileSelection({ keepActive: true });
            if (action === "trash-selected") bulkTrashSelectedFiles();
            if (action === "move-selected") promptMoveSelectedEntries();
            if (action === "pin-selected") bulkSetPinned(true);
            if (action === "unpin-selected") bulkSetPinned(false);
            if (action === "lock-selected") bulkSetLocked(true);
            if (action === "unlock-selected") bulkSetLocked(false);
            if (action === "new") createFile();
            if (action === "new-folder") createFolder();
            if (action === "duplicate" && activeFileId) {
                if (getSelectedFiles().length > 1) {
                    duplicateSelectedFiles();
                } else {
                    duplicateFile(activeFileId);
                }
            }
            if (action === "rename" && activeFileId) renameFile(activeFileId);
            if (action === "undo-delete") undoLastDelete();
            if (action === "restore-last") restoreLastDeletedFile();
            if (action === "restore-all") restoreAllDeletedFiles();
            if (action === "empty-trash") emptyTrash();
            if (action === "delete-all") deleteAllFiles();
        });
    }
    if (el.fileRowMenu) {
        el.fileRowMenu.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-file-menu-action]");
            if (!btn || !fileMenuTargetId) return;
            const action = btn.dataset.fileMenuAction;
            const fileId = fileMenuTargetId;
            closeFileMenus();
            if (action === "pin") toggleFilePin(fileId);
            if (action === "lock") toggleFileLock(fileId);
            if (action === "rename") renameFile(fileId);
            if (action === "duplicate") duplicateFile(fileId);
            if (action === "delete") {
                const shouldDeleteSelection = selectedFileIds.has(fileId) && getSelectedWorkspaceEntries().selectedEntryCount > 1;
                if (shouldDeleteSelection) {
                    bulkTrashSelectedFiles();
                } else {
                    deleteFile(fileId);
                }
            }
        });
    }
    if (el.fileFolderMenu) {
        el.fileFolderMenu.addEventListener("click", (event) => {
            const btn = event.target.closest("[data-folder-menu-action]");
            if (!btn) return;
            const action = btn.dataset.folderMenuAction;
            const folderPath = folderMenuTargetPath;
            closeFileMenus();
            if (action === "rename" && folderPath) renameFolder(folderPath);
            if (action === "new-file" && folderPath) createFileInFolder(folderPath, { rename: true });
            if (action === "new-folder" && folderPath) createFolder(folderPath);
            if (action === "delete" && folderPath) {
                const shouldDeleteSelection = selectedFolderPaths.has(folderPath) && getSelectedWorkspaceEntries().selectedEntryCount > 1;
                if (shouldDeleteSelection) {
                    bulkTrashSelectedFiles();
                } else {
                    deleteFolderPath(folderPath, { confirm: true, focus: true });
                }
            }
            if (action === "collapse-all") collapseAllFolders();
            if (action === "expand-all") expandAllFolders();
        });
    }
    if (el.editorTabs) {
        el.editorTabs.addEventListener("click", onEditorTabsClick);
        el.editorTabs.addEventListener("keydown", onEditorTabsKey);
    }
    el.fileList.addEventListener("click", onFileListClick);
    el.fileList.addEventListener("dblclick", onFileListDblClick);
    el.fileList.addEventListener("input", onFileListInput);
    el.fileList.addEventListener("keydown", onFileListKey);
    el.fileList.addEventListener("blur", onFileListBlur, true);
    el.fileList.addEventListener("contextmenu", onFileListContextMenu);
    el.fileList.addEventListener("dragstart", onFileListDragStart);
    el.fileList.addEventListener("dragover", onFileListDragOver);
    el.fileList.addEventListener("dragleave", onFileListDragLeave);
    el.fileList.addEventListener("drop", onFileListDrop);
    el.fileList.addEventListener("dragend", onFileListDragEnd);
    document.addEventListener("drop", onGlobalDragCleanup);
    document.addEventListener("dragend", onGlobalDragCleanup);
    window.addEventListener("blur", onGlobalDragCleanup);
    if (el.fileSearch) {
        el.fileSearch.addEventListener("input", (event) => {
            const nextFilter = String(event.target.value || "");
            if (nextFilter === fileFilter) return;
            fileFilter = nextFilter;
            if (!fileFilter.trim()) {
                debouncedFileFilterRender.cancel();
                renderFileList();
                return;
            }
            debouncedFileFilterRender.schedule();
        });
    }
    if (el.fileSearchClear) {
        el.fileSearchClear.addEventListener("click", () => {
            fileFilter = "";
            debouncedFileFilterRender.cancel();
            if (el.fileSearch) {
                el.fileSearch.value = "";
                el.fileSearch.focus();
            }
            renderFileList();
        });
    }
    if (el.fileSort) {
        el.fileSort.addEventListener("change", (event) => {
            fileSort = event.target.value || "manual";
            debouncedFileFilterRender.cancel();
            renderFileList();
        });
    }
    if (el.workspaceImportInput) {
        el.workspaceImportInput.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            await importWorkspaceFromFile(file);
            event.target.value = "";
        });
    }
    if (el.gameSelect) {
        el.gameSelect.addEventListener("change", () => {
            syncGamesUI();
        });
    }
    if (el.gameLoad) {
        el.gameLoad.addEventListener("click", async () => {
            const id = el.gameSelect?.value;
            if (!id) return;
            await loadGameById(id, { runAfter: false });
        });
    }
    el.btnRunnerFull.addEventListener("click", toggleRunnerFullscreen);
    el.btnRunnerExit.addEventListener("click", exitRunnerFullscreen);
    if (el.btnPopoutSandbox) {
        el.btnPopoutSandbox.addEventListener("click", toggleSandboxPopout);
    }
    el.btnToggleFiles.addEventListener("click", () => togglePanel("files"));
    el.btnToggleLog.addEventListener("click", () => togglePanel("log"));
    if (el.btnToggleEditor) {
        el.btnToggleEditor.addEventListener("click", () => togglePanel("editor"));
    }
    el.btnToggleSandbox.addEventListener("click", () => togglePanel("sandbox"));
    if (el.btnToggleTools) {
        el.btnToggleTools.addEventListener("click", () => togglePanel("tools"));
    }
    el.btnCloseLog.addEventListener("click", () => setPanelOpen("log", false));
    el.btnCloseSandbox.addEventListener("click", () => setPanelOpen("sandbox", false));
    if (el.btnCloseTools) {
        el.btnCloseTools.addEventListener("click", () => setPanelOpen("tools", false));
    }
    if (el.btnToggleHeader) {
        el.btnToggleHeader.addEventListener("click", () => {
            setHeaderOpen(!layoutState.headerOpen);
        });
    }
    if (el.themeSelect) {
        el.themeSelect.addEventListener("change", (event) => {
            applyTheme(event.target.value);
        });
    }
    el.btnClearDiagnostics.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for diagnostics.");
        diagnostics.clear();
    });
    el.btnToggleDiagnostics.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for diagnostics.");
        setDiagnosticsVerbose(!diagnosticsVerbose);
    });

    if (el.layoutToggle) {
        el.layoutToggle.addEventListener("click", () => {
            syncLayoutControls();
            setLayoutPanelOpen(true);
        });
    }
    if (el.quickLayout) {
        el.quickLayout.addEventListener("click", () => {
            syncLayoutControls();
            setLayoutPanelOpen(true);
        });
    }
    if (el.quickHeader) {
        el.quickHeader.addEventListener("click", () => setHeaderOpen(true));
    }
    if (el.layoutClose) {
        el.layoutClose.addEventListener("click", () => setLayoutPanelOpen(false));
    }
    if (el.layoutBackdrop) {
        el.layoutBackdrop.addEventListener("click", () => setLayoutPanelOpen(false));
    }
    if (el.layoutReset) {
        el.layoutReset.addEventListener("click", () => {
            window.fazide.resetLayout();
            syncLayoutControls();
        });
    }
    if (el.layoutPreset) {
        el.layoutPreset.addEventListener("change", (event) => {
            const value = event.target.value;
            if (!value) return;
            applyLayoutPreset(value);
            event.target.value = "";
        });
    }
    if (el.layoutOrderLog) {
        el.layoutOrderLog.addEventListener("change", (event) => {
            setPanelOrder("log", Number(event.target.value));
        });
    }
    if (el.layoutOrderEditor) {
        el.layoutOrderEditor.addEventListener("change", (event) => {
            setPanelOrder("editor", Number(event.target.value));
        });
    }
    if (el.layoutOrderFiles) {
        el.layoutOrderFiles.addEventListener("change", (event) => {
            setPanelOrder("files", Number(event.target.value));
        });
    }
    if (el.layoutOrderSandbox) {
        el.layoutOrderSandbox.addEventListener("change", (event) => {
            setPanelOrder("sandbox", Number(event.target.value));
        });
    }
    if (el.layoutLogOpen) {
        el.layoutLogOpen.addEventListener("change", (event) => {
            setPanelOpen("log", event.target.checked);
        });
    }
    if (el.layoutEditorOpen) {
        el.layoutEditorOpen.addEventListener("change", (event) => {
            setPanelOpen("editor", event.target.checked);
        });
    }
    if (el.layoutFilesOpen) {
        el.layoutFilesOpen.addEventListener("change", (event) => {
            setPanelOpen("files", event.target.checked);
        });
    }
    if (el.layoutSandboxOpen) {
        el.layoutSandboxOpen.addEventListener("change", (event) => {
            setPanelOpen("sandbox", event.target.checked);
        });
    }
    if (el.layoutToolsOpen) {
        el.layoutToolsOpen.addEventListener("change", (event) => {
            setPanelOpen("tools", event.target.checked);
        });
    }
    if (el.layoutHeaderOpen) {
        el.layoutHeaderOpen.addEventListener("change", (event) => {
            setHeaderOpen(event.target.checked);
        });
    }
    if (el.layoutFooterOpen) {
        el.layoutFooterOpen.addEventListener("change", (event) => {
            setFooterOpen(event.target.checked);
        });
    }
    if (el.layoutLogWidth && el.layoutLogWidthInput) {
        const apply = (value) => {
            const row = getPanelRow("log");
            const bounds = getEffectiveBounds("log", row, getLayoutBounds().logWidth);
            const next = clamp(Number(value), bounds.min, bounds.max);
            setLogWidth(next);
            normalizeLayoutWidths();
            el.layoutLogWidth.value = layoutState.logWidth;
            el.layoutLogWidthInput.value = layoutState.logWidth;
            persistLayout();
        };
        el.layoutLogWidth.addEventListener("input", (event) => apply(event.target.value));
        el.layoutLogWidthInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutSidebarWidth && el.layoutSidebarWidthInput) {
        const apply = (value) => {
            const row = getPanelRow("files");
            const bounds = getEffectiveBounds("files", row, getLayoutBounds().sidebar);
            const next = clamp(Number(value), bounds.min, bounds.max);
            setSidebarWidth(next);
            normalizeLayoutWidths();
            el.layoutSidebarWidth.value = layoutState.sidebarWidth;
            el.layoutSidebarWidthInput.value = layoutState.sidebarWidth;
            persistLayout();
        };
        el.layoutSidebarWidth.addEventListener("input", (event) => apply(event.target.value));
        el.layoutSidebarWidthInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutSandboxWidth && el.layoutSandboxWidthInput) {
        const apply = (value) => {
            const row = getPanelRow("sandbox");
            const bounds = getEffectiveBounds("sandbox", row, getLayoutBounds().sandboxWidth);
            const next = clamp(Number(value), bounds.min, bounds.max);
            setSandboxWidth(next);
            normalizeLayoutWidths();
            el.layoutSandboxWidth.value = layoutState.sandboxWidth;
            el.layoutSandboxWidthInput.value = layoutState.sandboxWidth;
            persistLayout();
        };
        el.layoutSandboxWidth.addEventListener("input", (event) => apply(event.target.value));
        el.layoutSandboxWidthInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutToolsWidth && el.layoutToolsWidthInput) {
        const apply = (value) => {
            const row = getPanelRow("tools");
            const bounds = getEffectiveBounds("tools", row, getLayoutBounds().toolsWidth);
            const next = clamp(Number(value), bounds.min, bounds.max);
            setToolsWidth(next);
            normalizeLayoutWidths();
            el.layoutToolsWidth.value = layoutState.toolsWidth;
            el.layoutToolsWidthInput.value = layoutState.toolsWidth;
            persistLayout();
        };
        el.layoutToolsWidth.addEventListener("input", (event) => apply(event.target.value));
        el.layoutToolsWidthInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutPanelGap && el.layoutPanelGapInput) {
        const apply = (value) => {
            const bounds = getLayoutBounds().panelGap;
            const next = clamp(Number(value), bounds.min, bounds.max);
            setPanelGap(next);
            normalizeLayoutWidths();
            el.layoutPanelGap.value = layoutState.panelGap;
            el.layoutPanelGapInput.value = layoutState.panelGap;
            persistLayout();
        };
        el.layoutPanelGap.addEventListener("input", (event) => apply(event.target.value));
        el.layoutPanelGapInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutCornerRadius && el.layoutCornerRadiusInput) {
        const apply = (value) => {
            const bounds = getLayoutBounds().cornerRadius;
            const next = clamp(Number(value), bounds.min, bounds.max);
            setPanelRadius(next);
            el.layoutCornerRadius.value = layoutState.panelRadius;
            el.layoutCornerRadiusInput.value = layoutState.panelRadius;
            persistLayout();
        };
        el.layoutCornerRadius.addEventListener("input", (event) => apply(event.target.value));
        el.layoutCornerRadiusInput.addEventListener("change", (event) => apply(event.target.value));
    }

    // Sandbox output listener
    // Notes:
    // - The iframe bridge uses postMessage(). This is where we receive it.
    window.addEventListener("message", onSandboxMessage);
    window.addEventListener("message", onPopoutMessage);
    el.runner.addEventListener("load", syncInspectAfterLoad);
    window.addEventListener("keydown", (e) => {
        const target = e.target;
        const editorFocused = Boolean(
            target?.closest?.(".CodeMirror") ||
            target?.id === "editor" ||
            document.activeElement?.id === "editor" ||
            document.activeElement?.closest?.(".CodeMirror")
        );
        if (e.defaultPrevented) return;
        if (promptDialogOpen) {
            if (e.key === "Escape") {
                e.preventDefault();
                cancelPromptDialog();
            }
            return;
        }
        if (e.key === "F1") {
            e.preventDefault();
            openShortcutHelp();
            return;
        }
        if (isCommandPaletteShortcut(e)) {
            e.preventDefault();
            openCommandPalette();
            return;
        }
        if (isQuickOpenShortcut(e)) {
            e.preventDefault();
            openQuickOpen();
            return;
        }
        if (isFindShortcut(e) && !editorFocused) {
            e.preventDefault();
            openEditorSearch({ replaceMode: false });
            return;
        }
        if (isReplaceShortcut(e) && !editorFocused) {
            e.preventDefault();
            openEditorSearch({ replaceMode: true });
            return;
        }
        if (isSymbolShortcut(e) && !editorFocused) {
            e.preventDefault();
            openSymbolPalette();
            return;
        }
        if (isProjectSearchShortcut(e) && !editorFocused) {
            e.preventDefault();
            openProjectSearch();
            return;
        }
        if (isGoToLineShortcut(e) && !editorFocused) {
            e.preventDefault();
            promptGoToLine();
            return;
        }
        if (isSaveAllShortcut(e) && !editorFocused) {
            e.preventDefault();
            saveAllFiles({ announce: true });
            return;
        }
        if (isSaveShortcut(e) && !editorFocused) {
            e.preventDefault();
            saveActiveFile({ announce: true });
            return;
        }
        if (isNewFileShortcut(e) && !editorFocused) {
            e.preventDefault();
            createFile();
            return;
        }
        if (isUndoShortcut(e) && !editorFocused) {
            e.preventDefault();
            if (!undoFileHistory()) {
                undoLastDelete();
            }
            return;
        }
        if (isRedoShortcut(e) && !editorFocused) {
            e.preventDefault();
            redoFileHistory();
            return;
        }
        if (e.key === "Escape" && commandPaletteOpen) {
            e.preventDefault();
            closeCommandPalette({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && quickOpenOpen) {
            e.preventDefault();
            closeQuickOpen({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && shortcutHelpOpen) {
            e.preventDefault();
            closeShortcutHelp({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && editorSearchOpen) {
            e.preventDefault();
            closeEditorSearch({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && symbolPaletteOpen) {
            e.preventDefault();
            closeSymbolPalette({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && projectSearchOpen) {
            e.preventDefault();
            closeProjectSearch({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && editorHistoryOpen) {
            e.preventDefault();
            closeEditorHistory({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && editorSettingsOpen) {
            e.preventDefault();
            closeEditorSettings({ focusEditor: true });
            return;
        }
        if (e.key === "Escape" && openFileMenu) {
            closeFileMenus();
            return;
        }
        if (e.key === "Escape" && el.layoutPanel?.getAttribute("data-open") === "true") {
            setLayoutPanelOpen(false);
            return;
        }
        if (e.key === "Escape" && runnerFullscreen) {
            e.preventDefault();
            exitRunnerFullscreen();
        }
    });

    document.addEventListener("click", (event) => {
        if (!openFileMenu) return;
        const target = event.target;
        if (target.closest("#filesMenu") || target.closest("#fileRowMenu") || target.closest("#fileFolderMenu")) return;
        if (target.closest("[data-file-menu]") || target.closest("[data-folder-menu]")) return;
        if (target.closest("#filesMenuButton")) return;
        closeFileMenus();
    });

    window.addEventListener("resize", () => {
        normalizeLayoutWidths();
        syncLayoutControls();
    });
    window.addEventListener("beforeunload", (event) => {
        flushEditorAutosave();
        if (hasDirtyFiles()) {
            event.preventDefault();
            event.returnValue = "";
        }
    });
    window.addEventListener("pagehide", () => {
        flushEditorAutosave();
        setSessionState(false);
    });

    renderInspectDetails(null);
    queueEditorLint("boot");
    // UX: start with cursor ready
    editor.focus();
}

function run() {
    // Pull current editor contents and execute inside sandbox iframe.
    const code = editor.get();
    updateActiveFileCode(code);
    const activeFile = getActiveFile();
    const activeLanguage = detectLanguageFromFileName(activeFile?.name || "");
    const entryName = activeFile?.name || FILE_DEFAULT_NAME;
    const resolveWorkspaceFile = (filePath = "") => {
        const normalized = normalizePathSlashes(String(filePath || "")).toLowerCase();
        if (!normalized) return null;
        return files.find((file) => normalizePathSlashes(String(file.name || "")).toLowerCase() === normalized) || null;
    };
    const isExternalAssetRef = (value = "") => {
        const normalized = String(value || "").trim().toLowerCase();
        if (!normalized || normalized.startsWith("#") || normalized.startsWith("//")) return true;
        return /^[a-z][a-z0-9+.-]*:/.test(normalized);
    };
    const stripAssetDecorators = (value = "") => String(value || "").split("#")[0].split("?")[0];
    const resolveWorkspaceAssetPath = (fromFileName, assetRef) => {
        if (isExternalAssetRef(assetRef)) return "";
        const clean = normalizePathSlashes(stripAssetDecorators(assetRef));
        if (!clean) return "";
        const rootRelative = clean.startsWith("/");
        const baseSegments = rootRelative ? [] : splitPathSegments(getFileDirectory(fromFileName));
        const refSegments = splitPathSegments(rootRelative ? clean.slice(1) : clean);
        if (!refSegments.length) return "";
        refSegments.forEach((segment) => {
            if (segment === ".") return;
            if (segment === "..") {
                if (baseSegments.length) baseSegments.pop();
                return;
            }
            baseSegments.push(segment);
        });
        return buildPathFromSegments(baseSegments);
    };
    const sanitizeStyleForHtml = (value = "") => String(value ?? "").replace(/<\/style>/gi, "<\\/style>");
    const buildHtmlFromWorkspace = (htmlSource, fromFileName) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(htmlSource ?? ""), "text/html");

        Array.from(doc.querySelectorAll("link[href]")).forEach((link) => {
            const rel = String(link.getAttribute("rel") || "").toLowerCase();
            if (rel && !rel.split(/\s+/).includes("stylesheet")) return;
            const href = link.getAttribute("href") || "";
            const resolvedPath = resolveWorkspaceAssetPath(fromFileName, href);
            if (!resolvedPath) return;
            const sourceFile = resolveWorkspaceFile(resolvedPath);
            if (!sourceFile || detectLanguageFromFileName(sourceFile.name) !== "css") return;
            const style = doc.createElement("style");
            style.setAttribute("data-fazide-source", sourceFile.name);
            style.textContent = sanitizeStyleForHtml(sourceFile.code);
            link.replaceWith(style);
        });

        Array.from(doc.querySelectorAll("script[src]")).forEach((script) => {
            const src = script.getAttribute("src") || "";
            const resolvedPath = resolveWorkspaceAssetPath(fromFileName, src);
            if (!resolvedPath) return;
            const sourceFile = resolveWorkspaceFile(resolvedPath);
            if (!sourceFile || detectLanguageFromFileName(sourceFile.name) !== "javascript") return;
            const inline = doc.createElement("script");
            Array.from(script.attributes).forEach((attr) => {
                if (String(attr.name || "").toLowerCase() === "src") return;
                inline.setAttribute(attr.name, attr.value);
            });
            inline.setAttribute("data-fazide-source", sourceFile.name);
            inline.textContent = String(sourceFile.code ?? "");
            script.replaceWith(inline);
        });

        const root = doc.documentElement;
        return `<!doctype html>\n${root ? root.outerHTML : String(htmlSource ?? "")}`;
    };
    const buildCssPreviewHtml = (cssCode) => {
        const safeCss = sanitizeStyleForHtml(cssCode);
        return (
            `<!doctype html><html><head><meta charset="utf-8" />` +
            `<style>${safeCss}</style>` +
            `</head><body>` +
            `<main class="fazide-css-preview">` +
            `<h1>CSS Preview</h1>` +
            `<p>Edit your stylesheet and click Run to refresh this preview.</p>` +
            `<button type="button">Preview Button</button>` +
            `</main></body></html>`
        );
    };

    let runnableSource = applyBreakpointsToCode(code);
    let sandboxMode = "javascript";
    if (activeLanguage === "html") {
        runnableSource = buildHtmlFromWorkspace(code, entryName);
        sandboxMode = "html";
    } else if (activeLanguage === "css") {
        runnableSource = buildCssPreviewHtml(code);
        sandboxMode = "html";
    }
    currentRunFileId = activeFileId;

    runCount += 1;
    currentToken = makeToken();

    ensureLogOpen("Console opened for new run.");

    // UI feedback first (feels responsive even if execution errors immediately).
    status.set("Running...");
    setHealth(health.sandbox, "warn", "Sandbox: Running");
    logger.append("system", [`-- Run #${runCount} --`]);
    if (debugMode) {
        logger.append("system", [`Debug mode on • ${debugBreakpoints.size} breakpoint(s)`]);
    }

    try {
        // This resets iframe document + runs bridge + user code.
        runInSandbox(getRunnerFrame(), runnableSource, currentToken, { mode: sandboxMode });
        const tokenAtRun = currentToken;
        setTimeout(() => {
            if (currentToken !== tokenAtRun) return;
            if (health.sandbox && health.sandbox.dataset.state === "warn") {
                setHealth(health.sandbox, "ok", "Sandbox: Ready");
            }
        }, 300);
        ensureSandboxOpen("Sandbox opened for run.");

        if (inspectEnabled) {
            // Re-arm the sandbox inspector after every fresh document write.
            setTimeout(() => sendInspectCommand("inspect_enable"), 0);
        }
        if (debugMode && debugWatches.length) {
            setTimeout(() => requestDebugWatchValues(), 80);
        }

        // We do NOT force "Ready" instantly; we confirm completion visually via the
        // "Ran" indicates the run was launched successfully (not necessarily error-free).
        status.set("Ran");
    } catch (err) {
        // If writing the iframe fails (rare), surface it in the log.
        setHealth(health.sandbox, "error", "Sandbox: Failed");
        pushDiag("error", "Sandbox failed to load.");
        logger.append("error", [String(err)]);
        status.set("Error");
    }
};

function onSandboxMessage(event) {
    // event.data is expected to be a small JSON-like object from the iframe.
    const data = event.data;

    // Only accept FAZ IDE sandbox message
    // Notes:
    // - Source tag prevents other postMessage traffic from being handled.
    if (!data || data.source !== "fazide") return;

    // Token gate: ignore older runs/noise
    // Notes:
    // - If user runs again quickly, old iframe messages can still arrive.
    // - Token gating keeps the console panel "current run only".
    if (!data.token || data.token !== currentToken) return;

    // Console forwarding
    if (data.type === "console") {
        // payload: { level, args }
        setHealth(health.sandbox, "ok", "Sandbox: Ready");
        ensureLogOpen("Console opened for new logs.");
        logger.append(data.payload.level, data.payload.args);
        return;
    }

    if (data.type === "inspect_update") {
        ensureToolsOpen("Tools opened for inspect.");
        ensureSandboxOpen("Sandbox opened for inspect.");
        renderInspectDetails(data.payload);
        return;
    }

    if (data.type === "inspect_status") {
        if (!data.payload?.active) {
            setInspectUI(false);
        } else if (inspectEnabled && el.inspectStatus) {
            el.inspectStatus.textContent = "Inspecting";
        }
        return;
    }

    if (data.type === "debug_watch") {
        const values = data.payload?.values;
        if (values && typeof values === "object") {
            Object.entries(values).forEach(([expr, value]) => {
                debugWatchValues.set(expr, String(value));
            });
            renderDebugWatchList();
        }
        return;
    }

    // Synchronous/runtime errors
    if (data.type === "runtime_error") {
        // payload: { message , filename, lineno, colno }
        const e = data.payload;
        ensureLogOpen("Console opened for runtime error.");
        logger.append("error", [`${e.message} (${e.filename}:${e.lineno}:${e.colno})`]);
        const fileName = getFileById(currentRunFileId)?.name || getActiveFile()?.name || "";
        pushRuntimeProblem({
            message: `${e.message} (${e.filename}:${e.lineno}:${e.colno})`,
            fileId: currentRunFileId,
            fileName,
            line: Number.isFinite(Number(e?.lineno)) ? Number(e.lineno) - 1 : null,
            ch: Number.isFinite(Number(e?.colno)) ? Number(e.colno) - 1 : null,
            endCh: Number.isFinite(Number(e?.colno)) ? Number(e.colno) : null,
            level: "error",
            kind: "runtime",
        });
        status.set("Error");
        return;
    }

    // Async errors (unhandled promise rejection)
    if (data.type === "promise_rejection") {
        ensureLogOpen("Console opened for promise rejection.");
        logger.append("error", [`Unhandled promise rejection: ${data.payload.reason}`]);
        const fileName = getFileById(currentRunFileId)?.name || getActiveFile()?.name || "";
        pushRuntimeProblem({
            message: `Unhandled promise rejection: ${data.payload.reason}`,
            fileId: currentRunFileId,
            fileName,
            level: "error",
            kind: "promise",
        });
        status.set("Error");
        return;
    }
}

// Start FAZ IDE
// Notes:
// - boot() wires everything once (no framework needed).
// - keeping a single entry point helps later when adding init steps (themes, tabs, etc.)

boot().catch((err) => {
    console.error("FAZ IDE boot failed:", err);
    status.set("Boot failed");
    logger.append("error", [`Boot failed: ${String(err?.message || err)}`]);
});
