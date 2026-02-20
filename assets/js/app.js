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

import { APP, STORAGE, DEFAULT_CODE, DEFAULT_WELCOME_FILES, GAMES, APPLICATIONS, LESSONS } from "./config.js";
import { getRequiredElements } from "./ui/elements.js";
import { load, save, saveBatchAtomic, recoverStorageJournal, getStorageJournalState, getStorageBackendInfo, STORAGE_JOURNAL_KEY } from "./ui/store.js";
import { makeLogger } from "./ui/logger.js";
import { makeStatus } from "./ui/status.js";
import { makeDiagnostics } from "./ui/diagnostics.js";
import { syncTemplateSelectorShell, renderTemplateSelectorOptions } from "./ui/templateSelectors.js";
import { THEMES, normalizeTheme, applyThemeState, DEFAULT_THEME } from "./ui/theme.js";
import { buildExportWorkspaceData, buildWorkspaceExportFilename, triggerWorkspaceExportDownload, normalizeImportedWorkspacePayload, parseWorkspaceImportText, buildImportWorkspaceConfirmMessage } from "./ui/workspaceTransfer.js";
import { DEFAULT_LAYOUT_STATE, LAYOUT_PRESETS, normalizePanelRows, normalizeFilesSectionOrder, cloneLayoutState } from "./ui/layoutState.js";
import { getFileIconPath, getFolderIconPath, bindFileListIconFallbacks } from "./ui/fileIcons.js";
import {
    toBooleanAttribute,
    setBooleanAttribute,
    setDataOpen,
    setAriaHidden,
    setAriaSelected,
    setAriaExpanded,
    setAriaPressed,
    setDataActive,
    setDataPanelOpen,
    setVisibilityState,
    setTabActiveState,
    setOpenStateAttributes,
} from "./ui/domBooleanState.js";
import { runInSandbox } from "./sandbox/runner.js";
import { normalizeProblemLevel, normalizeSandboxConsolePayload } from "./sandbox/consolePayload.js";
import { isTrustedSandboxMessageEvent, isSandboxMessageForCurrentRun } from "./sandbox/messageTrust.js";
import { normalizeRuntimeErrorPayload, normalizePromiseRejectionPayload } from "./sandbox/runtimeDiagnostics.js";
import { createRunContext, normalizeRunContext, buildRunContextLabel } from "./sandbox/runContext.js";
import { buildCssPreviewHtml, createWorkspaceAssetResolver } from "./sandbox/workspacePreview.js";
import { makeTextareaEditor } from "./editors/textarea.js";
import { makeCodeMirrorEditor } from "./editors/codemirror5.js";
import { createCommandRegistry } from "./core/commandRegistry.js";
import { createStateBoundaries } from "./core/stateBoundaries.js";
import { solvePanelRows } from "./core/layoutEngine.js";
import { rowsToPanelLayout, panelLayoutToRows, normalizePanelLayout } from "./core/panelLayoutModel.js";
import { parseLessonSteps, normalizeLessonInputChar } from "./core/lessonEngine.js";
import {
    splitLeafExtension,
    collapseDuplicateTerminalExtension,
    getFallbackFileExtension,
    normalizeFileName,
    normalizeLooseFileName,
    normalizePathSlashes,
    splitPathSegments,
    buildPathFromSegments,
    getFileBaseName,
    getFileDirectory,
    getFolderBaseName,
    getFolderParentPath,
    normalizeFolderPath,
} from "./core/pathing.js";

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
    isToggleCommentShortcut,
    isMoveLineDownShortcut,
    isMoveLineUpShortcut,
    isDuplicateLineDownShortcut,
    isDuplicateLineUpShortcut,
    isDeleteLineShortcut,
    isSelectNextOccurrenceShortcut,
    isSelectAllOccurrencesShortcut,
    isZoomInShortcut,
    isZoomOutShortcut,
    isZoomResetShortcut,
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
        if (commandPaletteOpen || topCommandPaletteOpen) {
            updateCommandPaletteResults(commandPaletteQuery);
        }
    },
});
const formatter = createFormatter({ fallbackFormat: formatBasic });
const astClient = createAstClient();

const DEFAULT_TUTORIAL_ID = "beginner";
const TUTORIAL_FORCE_START_STORAGE_KEY = "fazide.tutorial.force-start-once.v1";
const TUTORIAL_DEFINITIONS = Object.freeze({
    beginner: Object.freeze({
        id: "beginner",
        label: "Beginner Tutorial",
        seenKey: "fazide.tutorial.beginner.seen.v1",
        completeMessage: "Beginner tutorial complete. Use 'tutorial start beginner' in Dev Terminal to view it again.",
        steps: Object.freeze([
            {
                id: "welcome",
                title: "Welcome to FAZ IDE",
                body: "Welcome! If you're not used to an IDE, it's highly recommended to go through this tutorial first so you can learn the layout and workflow quickly.",
                target: "#appShell",
            },
            {
                id: "files",
                title: "Files Panel",
                body: "This is your project tree. Your Welcome folder is preloaded here so you can learn the IDE on a real starter project.",
                target: "#filesPanel",
                onEnter: () => {
                    setPanelOpen("files", true);
                    setFilesSectionOpen("files", true);
                    focusWelcomeProjectInEditor();
                },
            },
            {
                id: "file-actions-menu",
                title: "Files Actions",
                body: "This opens the View section where you can enable or disable file-system tabs and tools you need (or hide what you do not).",
                target: "#filesMenu [aria-label=\"View actions\"] .files-menu-grid",
                reveal: { filesMenuView: true },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "files-tab-open-editors",
                title: "Files Tab: Open Editors",
                body: "Open Editors lists files currently open in the editor for quick switching.",
                target: "#fileList [data-file-section=\"open-editors\"]",
                reveal: { filesTabFocus: "open-editors" },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "files-tab-files",
                title: "Files Tab: Files",
                body: "Files is your main workspace tree. Next, we continue to the Editor where you'll write and run code.",
                target: "#fileList [data-file-section=\"files\"]",
                reveal: { filesTabFocus: "files" },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "files-tab-games",
                title: "Files Tab: Games",
                body: "This Games tab in the file system opens the game library section.",
                target: "#filesGames",
                reveal: { filesTabFocus: "games" },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "files-tab-apps",
                title: "Files Tab: Applications",
                body: "This Applications tab opens built-in app templates and runtime examples.",
                target: "#filesApps",
                reveal: { filesTabFocus: "applications" },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "files-tab-lessons",
                title: "Files Tab: Lessons",
                body: "This Lessons tab opens guided coding lessons with progress tracking.",
                target: "#filesLessons",
                reveal: { filesTabFocus: "lessons" },
                onEnter: () => setPanelOpen("files", true),
            },
            {
                id: "editor",
                title: "Editor",
                body: "Write and edit code here. Use shortcuts like Ctrl/Cmd+S to save and Ctrl/Cmd+Enter to run.",
                target: "#editorPanel",
                onEnter: () => {
                    setPanelOpen("editor", true);
                    focusWelcomeProjectInEditor();
                },
            },
            {
                id: "editor-tabs",
                title: "Open File Tabs",
                body: "Tabs show your currently open files, so you can move between files quickly.",
                target: "#editorTabs",
                onEnter: () => setPanelOpen("editor", true),
            },
            {
                id: "run",
                title: "Run",
                body: "Press Run to execute your active file in the sandbox safely.",
                target: "#run",
                onEnter: () => setPanelOpen("sandbox", true),
            },
            {
                id: "format",
                title: "Format",
                body: "Format keeps your active file clean and consistent before running or saving.",
                target: "#format",
                onEnter: () => setPanelOpen("editor", true),
            },
            {
                id: "editor-tools",
                title: "Editor Tools",
                body: "These buttons open Find, Symbols, Project Search, Split view, History, and Settings workflows.",
                target: ".editor-pro-buttons",
                onEnter: () => setPanelOpen("editor", true),
            },
            {
                id: "sandbox",
                title: "Sandbox Preview",
                body: "Now the Welcome project runs in the sandbox so you can see your first live output in FAZ IDE.",
                target: "#runnerShell",
                onEnter: () => {
                    setPanelOpen("sandbox", true);
                    runWelcomeProjectForTutorial();
                },
            },
            {
                id: "sandbox-actions",
                title: "Sandbox Actions",
                body: "Pop out for a separate window or expand for a larger local preview.",
                target: "#popoutSandbox",
                reveal: { sandboxActions: true },
                onEnter: () => setPanelOpen("sandbox", true),
            },
            {
                id: "console",
                title: "Console",
                body: "Console shows logs, warnings, and errors from your runs.",
                target: "#logPanel",
                onEnter: () => setPanelOpen("log", true),
            },
            {
                id: "console-actions",
                title: "Console Actions",
                body: "Use Copy and Clear to manage output while debugging run-by-run.",
                target: "#copyLog",
                onEnter: () => setPanelOpen("log", true),
            },
            {
                id: "search",
                title: "Command Search",
                body: "Search commands quickly here (or press Ctrl/Cmd+Shift+P).",
                target: "#topCommandPaletteInput",
            },
            {
                id: "search-results",
                title: "Command Results",
                body: "As you type, matching commands appear in this dropdown so you can run actions quickly.",
                target: "#topCommandPaletteMenu",
                reveal: { topCommandMenu: true },
                onEnter: () => startTutorialCommandSearchDemo(),
            },
            {
                id: "theme",
                title: "Theme Selector",
                body: "Change visual theme instantly to match your workflow and readability preference.",
                target: "#themeSelect",
            },
            {
                id: "layout",
                title: "Layout Controls",
                body: "Open Layout to tune panel sizes, docking behavior, and workspace shape.",
                target: "#layoutToggle",
            },
            {
                id: "status",
                title: "Status",
                body: "Status shows what the IDE is doing. Use it as a quick health signal while working.",
                target: "#statusText",
            },
            {
                id: "footer-runtime",
                title: "Footer Runtime Signals",
                body: "Footer runtime indicators summarize editor, sandbox, problems, storage, and zoom at a glance.",
                target: "#footerRuntimeStatus",
            },
            {
                id: "footer-editor",
                title: "Footer Editor Signals",
                body: "Editor footer stats track file name, cursor position, selection, and save state while coding.",
                target: "#footerEditorStatus",
            },
        ]),
    }),
});

const tutorialState = {
    tutorialId: DEFAULT_TUTORIAL_ID,
    active: false,
    index: 0,
    stepId: "",
    keepFilesMenuOpen: false,
    activeFilesTabFocus: "",
    commandDemoTimer: null,
    commandDemoToken: 0,
    sandboxDemoRan: false,
    highlightNode: null,
    wired: false,
    listenersWired: false,
    typewriterTimer: null,
    typewriterToken: 0,
};

function getTutorialIds() {
    return Object.keys(TUTORIAL_DEFINITIONS);
}

function normalizeTutorialId(value = "", fallback = DEFAULT_TUTORIAL_ID) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw && TUTORIAL_DEFINITIONS[raw]) return raw;
    return fallback;
}

function getTutorialDefinition(tutorialId = DEFAULT_TUTORIAL_ID) {
    const resolvedId = normalizeTutorialId(tutorialId, DEFAULT_TUTORIAL_ID);
    return TUTORIAL_DEFINITIONS[resolvedId] || TUTORIAL_DEFINITIONS[DEFAULT_TUTORIAL_ID];
}

function getWelcomeProjectHtmlFile() {
    const preferred = ["welcome/index.html", "welcome\\index.html", "index.html"];
    const lowerSet = new Set(preferred.map((entry) => entry.toLowerCase()));
    return files.find((file) => {
        const name = String(file?.name || "").trim().toLowerCase();
        if (!name) return false;
        if (lowerSet.has(name)) return true;
        return name.endsWith("/index.html") && name.includes("welcome");
    }) || null;
}

function focusWelcomeProjectInEditor() {
    const file = getWelcomeProjectHtmlFile();
    if (!file?.id) return false;
    selectFile(file.id);
    return true;
}

function runWelcomeProjectForTutorial() {
    if (!focusWelcomeProjectInEditor()) return false;
    if (tutorialState.sandboxDemoRan) return true;
    run();
    tutorialState.sandboxDemoRan = true;
    return true;
}

function clearTutorialCommandSearchDemo({ resetInput = true } = {}) {
    tutorialState.commandDemoToken += 1;
    if (tutorialState.commandDemoTimer) {
        clearTimeout(tutorialState.commandDemoTimer);
        tutorialState.commandDemoTimer = null;
    }
    if (resetInput) {
        commandPaletteIndex = 0;
        updateCommandPaletteResults("");
    }
}

function startTutorialCommandSearchDemo() {
    if (!tutorialState.active) return;
    clearTutorialCommandSearchDemo({ resetInput: true });
    setTopCommandPaletteOpen(true);
    const token = tutorialState.commandDemoToken;
    const demoTerms = ["layout", "theme", "run"];
    let termIndex = 0;
    let charIndex = 0;

    const scheduleNext = (delay, fn) => {
        tutorialState.commandDemoTimer = setTimeout(() => {
            tutorialState.commandDemoTimer = null;
            if (!tutorialState.active || tutorialState.commandDemoToken !== token) return;
            fn();
        }, Math.max(0, Number(delay) || 0));
    };

    const typeCurrentTerm = () => {
        if (termIndex >= demoTerms.length) {
            scheduleNext(450, () => {
                commandPaletteIndex = 0;
                updateCommandPaletteResults("");
            });
            return;
        }

        const term = demoTerms[termIndex];
        if (charIndex < term.length) {
            charIndex += 1;
            commandPaletteIndex = 0;
            updateCommandPaletteResults(term.slice(0, charIndex));
            scheduleNext(85, typeCurrentTerm);
            return;
        }

        scheduleNext(420, () => {
            termIndex += 1;
            charIndex = 0;
            commandPaletteIndex = 0;
            updateCommandPaletteResults("");
            scheduleNext(180, typeCurrentTerm);
        });
    };

    scheduleNext(120, typeCurrentTerm);
}

function stopSandboxRun() {
    clearSandboxReadyTimer();
    currentToken = null;
    currentRunContext = null;
    currentRunFileId = null;
    const frame = getRunnerFrame();
    if (frame instanceof HTMLIFrameElement) {
        frame.srcdoc = "<!doctype html><html><head><meta charset=\"utf-8\" /><style>html,body{height:100%;margin:0;background:#0b0f14;color:#94a3b8;font:600 14px/1.4 system-ui,sans-serif;display:grid;place-items:center}</style></head><body>Sandbox stopped</body></html>";
    }
    setHealth(health.sandbox, "idle", "Sandbox: Idle");
}

function finalizeBeginnerTutorialCompletion() {
    stopSandboxRun();
    applyLayoutPreset("studio", { animatePanels: false });
    setPanelOpen("tools", false);
    setPanelOpen("files", true);
    layoutState.filesOpenEditorsOpen = true;
    layoutState.filesListOpen = true;
    layoutState.filesGamesOpen = true;
    layoutState.filesAppsOpen = true;
    layoutState.filesLessonsOpen = true;
    gamesSelectorOpen = true;
    applicationsSelectorOpen = true;
    lessonsSelectorOpen = true;
    applyFilesLayout();
    renderFileList();
    syncFilesMenuToggles();
}

function safeLocalStorageGet(key) {
    try {
        if (typeof localStorage === "undefined") return "";
        return String(localStorage.getItem(String(key || "")) || "");
    } catch {
        return "";
    }
}

function safeLocalStorageSet(key, value) {
    try {
        if (typeof localStorage === "undefined") return false;
        localStorage.setItem(String(key || ""), String(value || ""));
        return true;
    } catch {
        return false;
    }
}

function safeLocalStorageRemove(key) {
    try {
        if (typeof localStorage === "undefined") return false;
        localStorage.removeItem(String(key || ""));
        return true;
    } catch {
        return false;
    }
}

function isAutomationEnvironment() {
    return typeof navigator !== "undefined" && Boolean(navigator.webdriver);
}

function getTutorialElements() {
    if (typeof document === "undefined") return null;
    const root = document.getElementById("tutorialIntro");
    if (!root) return null;
    return {
        root,
        highlight: document.getElementById("tutorialIntroHighlight"),
        panel: root.querySelector(".tutorial-intro-panel"),
        title: document.getElementById("tutorialIntroTitle"),
        body: document.getElementById("tutorialIntroBody"),
        progress: document.getElementById("tutorialIntroProgress"),
        progressFill: document.getElementById("tutorialIntroProgressFill"),
        back: document.getElementById("tutorialIntroBack"),
        next: document.getElementById("tutorialIntroNext"),
        skip: document.getElementById("tutorialIntroSkip"),
    };
}

function clearTutorialTypewriter() {
    tutorialState.typewriterToken += 1;
    if (tutorialState.typewriterTimer != null) {
        clearInterval(tutorialState.typewriterTimer);
        tutorialState.typewriterTimer = null;
    }
}

function setTutorialBodyTypewriter(text = "") {
    const ui = getTutorialElements();
    if (!ui?.body) return;
    const content = String(text || "");
    clearTutorialTypewriter();
    if (!content) {
        ui.body.textContent = "";
        ui.body.removeAttribute("data-typing");
        return;
    }
    const localToken = tutorialState.typewriterToken;
    ui.body.textContent = "";
    ui.body.setAttribute("data-typing", "true");
    let index = 0;
    tutorialState.typewriterTimer = setInterval(() => {
        if (localToken !== tutorialState.typewriterToken) {
            clearInterval(tutorialState.typewriterTimer);
            tutorialState.typewriterTimer = null;
            return;
        }
        index += 1;
        ui.body.textContent = content.slice(0, index);
        if (index >= content.length) {
            clearInterval(tutorialState.typewriterTimer);
            tutorialState.typewriterTimer = null;
            ui.body.removeAttribute("data-typing");
        }
    }, 14);
}

function rectsOverlap(a, b, gap = 0) {
    if (!a || !b) return false;
    return !(
        a.right + gap <= b.left
        || a.left >= b.right + gap
        || a.bottom + gap <= b.top
        || a.top >= b.bottom + gap
    );
}

function updateTutorialPanelPosition() {
    const ui = getTutorialElements();
    const panel = ui?.panel;
    if (!panel) return false;

    const viewportWidth = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
    const viewportHeight = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
    const margin = 12;
    const gap = 12;

    panel.style.left = `${Math.round(viewportWidth / 2)}px`;
    panel.style.top = `${Math.round(viewportHeight / 2)}px`;
    panel.setAttribute("data-placement", "center");

    const panelRect = panel.getBoundingClientRect();
    const panelWidth = Math.max(0, Math.round(panelRect.width));
    const panelHeight = Math.max(0, Math.round(panelRect.height));
    if (panelWidth <= 0 || panelHeight <= 0) return false;

    const clampLeft = (value) => clamp(value, margin + (panelWidth / 2), viewportWidth - margin - (panelWidth / 2));
    const clampTop = (value) => clamp(value, margin + (panelHeight / 2), viewportHeight - margin - (panelHeight / 2));

    if (!(tutorialState.highlightNode instanceof HTMLElement)) {
        panel.style.left = `${Math.round(clampLeft(viewportWidth / 2))}px`;
        panel.style.top = `${Math.round(clampTop(viewportHeight / 2))}px`;
        panel.setAttribute("data-placement", "center");
        return true;
    }

    const targetRect = tutorialState.highlightNode.getBoundingClientRect();
    const candidates = [
        {
            placement: "right",
            left: clampLeft(targetRect.right + gap + (panelWidth / 2)),
            top: clampTop(targetRect.top + (panelHeight / 2)),
        },
        {
            placement: "left",
            left: clampLeft(targetRect.left - gap - (panelWidth / 2)),
            top: clampTop(targetRect.top + (panelHeight / 2)),
        },
        {
            placement: "bottom",
            left: clampLeft(targetRect.left + (panelWidth / 2)),
            top: clampTop(targetRect.bottom + gap + (panelHeight / 2)),
        },
        {
            placement: "top",
            left: clampLeft(targetRect.left + (panelWidth / 2)),
            top: clampTop(targetRect.top - gap - (panelHeight / 2)),
        },
        {
            placement: "center",
            left: clampLeft(viewportWidth / 2),
            top: clampTop(viewportHeight / 2),
        },
    ];

    const highlightedRect = {
        left: targetRect.left,
        top: targetRect.top,
        right: targetRect.right,
        bottom: targetRect.bottom,
    };

    const chosen = candidates.find((candidate) => {
        const rect = {
            left: candidate.left - (panelWidth / 2),
            right: candidate.left + (panelWidth / 2),
            top: candidate.top - (panelHeight / 2),
            bottom: candidate.top + (panelHeight / 2),
        };
        return !rectsOverlap(rect, highlightedRect, 10);
    }) || candidates[candidates.length - 1];

    panel.style.left = `${Math.round(chosen.left)}px`;
    panel.style.top = `${Math.round(chosen.top)}px`;
    panel.setAttribute("data-placement", chosen.placement);
    return true;
}

function resetTutorialStepReveals() {
    clearTutorialCommandSearchDemo({ resetInput: true });
    tutorialState.activeFilesTabFocus = "";
    tutorialState.keepFilesMenuOpen = false;
    closeFileMenus();
    setTopCommandPaletteOpen(false);
    setCommandPaletteOpen(false, { focusInput: false });
    setQuickOpenOpen(false);
    setLayoutPanelOpen(false);
    setEditorSettingsOpen(false);
    setShortcutHelpOpen(false);
    setLessonStatsOpen(false);
    if (el.runnerShell instanceof HTMLElement) {
        delete el.runnerShell.dataset.tutorialActions;
    }
}

function applyTutorialStepReveal(step) {
    const reveal = step?.reveal;
    if (!reveal || typeof reveal !== "object") return;

    const syncTutorialMotionFrames = (frameCount = 8) => {
        let remaining = Math.max(1, Number(frameCount) || 0);
        const tick = () => {
            if (!tutorialState.active) return;
            refreshTutorialHighlightPosition();
            updateTutorialPanelPosition();
            remaining -= 1;
            if (remaining > 0) scheduleFrame(tick);
        };
        tick();
    };

    const prefersReducedMotion = typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const setTutorialFilesTabFocus = (section, targetSelector = "") => {
        const normalized = String(section || "").toLowerCase();
        if (!normalized) return;

        if (normalized === "open-editors") {
            const fallbackFileId = activeFileId || files[0]?.id;
            if (fallbackFileId) {
                ensureTabOpen(fallbackFileId);
            }
        }

        tutorialState.activeFilesTabFocus = normalized;
        const highlightSelector = targetSelector || ({
            "open-editors": "#fileList [data-file-section=\"open-editors\"]",
            files: "#fileList [data-file-section=\"files\"]",
            games: "#filesGames",
            applications: "#filesApps",
            lessons: "#filesLessons",
        }[normalized] || "");

        const openFocusedTab = () => {
            if (!tutorialState.active || tutorialState.activeFilesTabFocus !== normalized) return;
            if (normalized === "open-editors") layoutState.filesOpenEditorsOpen = true;
            if (normalized === "files") layoutState.filesListOpen = true;
            if (normalized === "games") {
                layoutState.filesGamesOpen = true;
                gamesSelectorOpen = true;
            }
            if (normalized === "applications") {
                layoutState.filesAppsOpen = true;
                applicationsSelectorOpen = true;
            }
            if (normalized === "lessons") {
                layoutState.filesLessonsOpen = true;
                lessonsSelectorOpen = true;
            }
            applyFilesLayout();
            renderFileList();
            syncFilesMenuToggles();
            if (highlightSelector) {
                const targetNode = typeof document !== "undefined" ? document.querySelector(highlightSelector) : null;
                if (targetNode instanceof HTMLElement) {
                    tutorialState.highlightNode = targetNode;
                    try {
                        targetNode.scrollIntoView({
                            block: "nearest",
                            inline: "nearest",
                            behavior: prefersReducedMotion ? "auto" : "smooth",
                        });
                    } catch {
                        // no-op
                    }
                }
            }
            syncTutorialMotionFrames(prefersReducedMotion ? 8 : 18);
        };

        openFocusedTab();
        scheduleFrame(() => {
            openFocusedTab();
            scheduleFrame(openFocusedTab);
        });
    };

    const revealFilesMenuViewSection = () => {
        if (!(el.filesMenuButton instanceof HTMLElement) || !(el.filesMenu instanceof HTMLElement)) return;
        openFilesMenu(el.filesMenuButton);
        el.filesMenu.scrollTop = 0;
        syncTutorialMotionFrames(3);
        const syncViewSection = ({ smooth = false } = {}) => {
            if (!(el.filesMenu instanceof HTMLElement)) return;
            const viewSection = el.filesMenu.querySelector('[aria-label="View actions"]');
            const viewAnchor = (viewSection instanceof HTMLElement)
                ? viewSection
                : el.filesMenu.querySelector('[data-files-toggle="filters"]');
            const viewHighlight = (viewSection instanceof HTMLElement)
                ? (viewSection.querySelector('.files-menu-grid') || viewSection)
                : viewAnchor;

            if (viewAnchor instanceof HTMLElement) {
                try {
                    viewAnchor.scrollIntoView({
                        block: "start",
                        inline: "nearest",
                        behavior: smooth && !prefersReducedMotion ? "smooth" : "auto",
                    });
                } catch {
                    // no-op
                }
            } else if (!smooth) {
                el.filesMenu.scrollTop = el.filesMenu.scrollHeight;
            }

            if (viewHighlight instanceof HTMLElement) {
                tutorialState.highlightNode = viewHighlight;
            }

            syncTutorialMotionFrames(smooth ? 14 : 4);
        };

        scheduleFrame(() => {
            syncViewSection({ smooth: true });
            scheduleFrame(() => {
                syncViewSection();
                scheduleFrame(() => syncViewSection());
            });
        });
    };

    if (reveal.filesFilters === true) setFilesFiltersOpen(true);
    if (reveal.filesMenu === true && el.filesMenuButton) {
        tutorialState.keepFilesMenuOpen = true;
        scheduleFrame(() => {
            openFilesMenu(el.filesMenuButton);
            if (el.filesMenu instanceof HTMLElement) el.filesMenu.scrollTop = 0;
            scheduleFrame(() => {
                syncTutorialMotionFrames(5);
            });
        });
    }
    if (reveal.filesMenuView === true && el.filesMenuButton) {
        tutorialState.keepFilesMenuOpen = true;
        revealFilesMenuViewSection();
    }
    if (typeof reveal.filesTabFocus === "string") {
        setTutorialFilesTabFocus(reveal.filesTabFocus, step?.target || "");
    }
    if (reveal.sandboxActions === true && el.runnerShell instanceof HTMLElement) {
        el.runnerShell.dataset.tutorialActions = "true";
        syncTutorialMotionFrames(prefersReducedMotion ? 6 : 12);
    }
    if (reveal.topCommandMenu === true) setTopCommandPaletteOpen(true);
    if (reveal.layoutPanel === true) setLayoutPanelOpen(true);
    if (reveal.editorSettings === true) setEditorSettingsOpen(true);
    if (reveal.shortcutHelp === true) setShortcutHelpOpen(true);
    if (reveal.lessonStats === true) setLessonStatsOpen(true);
    if (reveal.quickOpen === true) setQuickOpenOpen(true);
    if (reveal.commandPalette === true) setCommandPaletteOpen(true, { focusInput: false });
    if (typeof reveal.toolsTab === "string") setToolsTab(reveal.toolsTab);
    if (typeof reveal.consoleView === "string") setConsoleView(reveal.consoleView);
}

function refreshTutorialHighlightPosition() {
    const ui = getTutorialElements();
    if (!ui?.highlight || !tutorialState.active || !(tutorialState.highlightNode instanceof HTMLElement)) {
        if (ui?.highlight) {
            ui.highlight.hidden = true;
            ui.highlight.style.opacity = "0";
        }
        return false;
    }

    const intersectRect = (a, b) => {
        if (!a || !b) return null;
        const left = Math.max(Number(a.left) || 0, Number(b.left) || 0);
        const top = Math.max(Number(a.top) || 0, Number(b.top) || 0);
        const right = Math.min(Number(a.right) || 0, Number(b.right) || 0);
        const bottom = Math.min(Number(a.bottom) || 0, Number(b.bottom) || 0);
        if (right <= left || bottom <= top) return null;
        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
        };
    };

    const unionRect = (a, b) => {
        if (!a && !b) return null;
        if (!a) return b;
        if (!b) return a;
        const left = Math.min(Number(a.left) || 0, Number(b.left) || 0);
        const top = Math.min(Number(a.top) || 0, Number(b.top) || 0);
        const right = Math.max(Number(a.right) || 0, Number(b.right) || 0);
        const bottom = Math.max(Number(a.bottom) || 0, Number(b.bottom) || 0);
        if (right <= left || bottom <= top) return null;
        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
        };
    };

    const getFilesSectionRect = (node) => {
        if (!(node instanceof HTMLElement) || !(el.fileList instanceof HTMLElement)) return null;
        const sectionId = String(node.dataset.fileSection || "").trim();
        if (!sectionId) return null;
        const header = node.closest(".file-section-header");
        if (!(header instanceof HTMLElement)) return null;

        let sectionRect = header.getBoundingClientRect();
        let cursor = header.nextElementSibling;
        while (cursor instanceof HTMLElement) {
            if (cursor.classList.contains("file-section-header") || cursor.hasAttribute("data-files-static-slot")) {
                break;
            }
            if (String(cursor.dataset.fileRowSection || "") === sectionId) {
                sectionRect = unionRect(sectionRect, cursor.getBoundingClientRect()) || sectionRect;
            }
            cursor = cursor.nextElementSibling;
        }
        return sectionRect;
    };

    const viewportRect = {
        left: 0,
        top: 0,
        right: Math.max(0, Number(window.innerWidth) || 0),
        bottom: Math.max(0, Number(window.innerHeight) || 0),
    };

    const sectionRect = getFilesSectionRect(tutorialState.highlightNode);
    const rawRect = sectionRect || tutorialState.highlightNode.getBoundingClientRect();
    let clippedRect = {
        left: rawRect.left,
        top: rawRect.top,
        right: rawRect.right,
        bottom: rawRect.bottom,
        width: rawRect.width,
        height: rawRect.height,
    };

    let clampBounds = viewportRect;
    const nodeInFileList = el.fileList instanceof HTMLElement && el.fileList.contains(tutorialState.highlightNode);
    if (nodeInFileList && el.filesPanel instanceof HTMLElement) {
        const panelRect = el.filesPanel.getBoundingClientRect();
        const panelBounds = {
            left: panelRect.left,
            top: panelRect.top,
            right: panelRect.right,
            bottom: panelRect.bottom,
        };
        const boundedPanel = intersectRect(panelBounds, viewportRect);
        if (boundedPanel) {
            clampBounds = boundedPanel;
            const clippedToPanel = intersectRect(clippedRect, boundedPanel);
            if (clippedToPanel) {
                clippedRect = clippedToPanel;
            }
        }
    }

    const clippedToViewport = intersectRect(clippedRect, viewportRect);
    if (clippedToViewport) {
        clippedRect = clippedToViewport;
    }

    const width = Math.max(0, Math.round(clippedRect.width));
    const height = Math.max(0, Math.round(clippedRect.height));
    if (width <= 0 || height <= 0) {
        ui.highlight.hidden = true;
        ui.highlight.style.opacity = "0";
        return false;
    }

    const padding = 4;
    const paddedLeft = clippedRect.left - padding;
    const paddedTop = clippedRect.top - padding;
    const paddedRight = clippedRect.right + padding;
    const paddedBottom = clippedRect.bottom + padding;

    const left = Math.round(clamp(paddedLeft, clampBounds.left, Math.max(clampBounds.left, clampBounds.right - 1)));
    const top = Math.round(clamp(paddedTop, clampBounds.top, Math.max(clampBounds.top, clampBounds.bottom - 1)));
    const right = Math.round(clamp(paddedRight, left + 1, Math.max(left + 1, clampBounds.right)));
    const bottom = Math.round(clamp(paddedBottom, top + 1, Math.max(top + 1, clampBounds.bottom)));
    const ringWidth = Math.max(1, right - left);
    const ringHeight = Math.max(1, bottom - top);
    ui.highlight.hidden = false;
    ui.highlight.style.left = `${left}px`;
    ui.highlight.style.top = `${top}px`;
    ui.highlight.style.width = `${ringWidth}px`;
    ui.highlight.style.height = `${ringHeight}px`;
    ui.highlight.style.opacity = "1";
    updateTutorialPanelPosition();
    return true;
}

function clearTutorialHighlight() {
    const ui = getTutorialElements();
    if (ui?.highlight) {
        ui.highlight.hidden = true;
        ui.highlight.style.opacity = "0";
    }
    tutorialState.highlightNode = null;
    updateTutorialPanelPosition();
}

function getTutorialSeen(tutorialId = tutorialState.tutorialId) {
    const definition = getTutorialDefinition(tutorialId);
    return safeLocalStorageGet(definition.seenKey) === "1";
}

function setTutorialSeen(value, tutorialId = tutorialState.tutorialId) {
    const definition = getTutorialDefinition(tutorialId);
    if (value) {
        safeLocalStorageSet(definition.seenKey, "1");
    } else {
        safeLocalStorageRemove(definition.seenKey);
    }
}

function resetAllTutorialSeenState() {
    getTutorialIds().forEach((tutorialId) => {
        setTutorialSeen(false, tutorialId);
    });
}

function renderTutorialStep() {
    const ui = getTutorialElements();
    if (!ui || !tutorialState.active) return false;
    const definition = getTutorialDefinition(tutorialState.tutorialId);
    const steps = Array.isArray(definition.steps) ? definition.steps : [];
    const maxIndex = Math.max(0, steps.length - 1);
    tutorialState.index = clamp(tutorialState.index, 0, maxIndex);
    const step = steps[tutorialState.index];
    if (!step) return false;

    tutorialState.stepId = String(step.id || "");
    if (tutorialState.tutorialId === "beginner") {
        setPanelOpen("tools", false);
    }
    resetTutorialStepReveals();
    applyTutorialStepReveal(step);

    if (typeof step.onEnter === "function") {
        try {
            step.onEnter();
        } catch {
            // no-op
        }
    }

    clearTutorialHighlight();
    const target = typeof document !== "undefined" ? document.querySelector(step.target) : null;
    if (target instanceof HTMLElement) {
        tutorialState.highlightNode = target;
        refreshTutorialHighlightPosition();
        const prefersReducedMotion = typeof window !== "undefined"
            && typeof window.matchMedia === "function"
            && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const syncTransition = (frameCount = 10) => {
            let remaining = Math.max(1, Number(frameCount) || 0);
            const tick = () => {
                if (!tutorialState.active) return;
                refreshTutorialHighlightPosition();
                updateTutorialPanelPosition();
                remaining -= 1;
                if (remaining > 0) scheduleFrame(tick);
            };
            tick();
        };
        scheduleFrame(() => {
            try {
                target.scrollIntoView({
                    block: "nearest",
                    inline: "nearest",
                    behavior: prefersReducedMotion ? "auto" : "smooth",
                });
            } catch {
                // no-op
            }
            syncTransition(prefersReducedMotion ? 4 : 12);
        });
    } else {
        refreshTutorialHighlightPosition();
    }

    if (ui.title) ui.title.textContent = step.title;
    setTutorialBodyTypewriter(step.body);
    if (ui.progress) ui.progress.textContent = `Step ${tutorialState.index + 1} of ${steps.length}`;
    if (ui.progressFill) {
        const total = Math.max(1, steps.length);
        const ratio = clamp((tutorialState.index + 1) / total, 0, 1);
        ui.progressFill.style.width = `${Math.round(ratio * 100)}%`;
    }
    if (ui.back) ui.back.disabled = tutorialState.index <= 0;
    if (ui.next) ui.next.textContent = tutorialState.index >= steps.length - 1 ? "Finish" : "Next";
    updateTutorialPanelPosition();
    return true;
}

function closeBeginnerTutorial({ markSeen = true, tutorialId = tutorialState.tutorialId } = {}) {
    const ui = getTutorialElements();
    tutorialState.active = false;
    tutorialState.stepId = "";
    tutorialState.sandboxDemoRan = false;
    tutorialState.keepFilesMenuOpen = false;
    clearTutorialCommandSearchDemo({ resetInput: true });
    clearTutorialTypewriter();
    clearTutorialHighlight();
    resetTutorialStepReveals();
    if (ui?.root) {
        ui.root.hidden = true;
        ui.root.setAttribute("aria-hidden", "true");
    }
    if (ui?.panel) {
        ui.panel.style.left = "";
        ui.panel.style.top = "";
        ui.panel.setAttribute("data-placement", "center");
    }
    if (ui?.body) {
        ui.body.removeAttribute("data-typing");
    }
    if (typeof document !== "undefined" && document.body) {
        document.body.removeAttribute("data-tutorial-active");
    }
    if (markSeen) setTutorialSeen(true, tutorialId);
}

function moveBeginnerTutorial(delta = 1) {
    if (!tutorialState.active) return false;
    const definition = getTutorialDefinition(tutorialState.tutorialId);
    const steps = Array.isArray(definition.steps) ? definition.steps : [];
    const next = tutorialState.index + Number(delta || 0);
    if (next < 0) return false;
    if (next >= steps.length) {
        closeBeginnerTutorial({ markSeen: true, tutorialId: tutorialState.tutorialId });
        if (tutorialState.tutorialId === "beginner") {
            finalizeBeginnerTutorialCompletion();
        }
        status.set("Tutorial complete");
        logger.append("system", [String(definition.completeMessage || "Tutorial complete")]);
        return true;
    }
    tutorialState.index = next;
    return renderTutorialStep();
}

function openBeginnerTutorial({ force = false, tutorialId = DEFAULT_TUTORIAL_ID } = {}) {
    const ui = getTutorialElements();
    const resolvedId = normalizeTutorialId(tutorialId, DEFAULT_TUTORIAL_ID);
    if (!ui) return false;
    if (!force && isAutomationEnvironment()) return false;
    if (!force && getTutorialSeen(resolvedId)) return false;
    tutorialState.tutorialId = resolvedId;
    tutorialState.active = true;
    tutorialState.index = 0;
    tutorialState.stepId = "";
    tutorialState.sandboxDemoRan = false;
    if (resolvedId === "beginner") {
        setPanelOpen("tools", false);
        focusWelcomeProjectInEditor();
    }
    ui.root.hidden = false;
    ui.root.setAttribute("aria-hidden", "false");
    if (typeof document !== "undefined" && document.body) {
        document.body.setAttribute("data-tutorial-active", "true");
    }
    renderTutorialStep();
    status.set("Tutorial started");
    return true;
}

function wireTutorialIntro() {
    const ui = getTutorialElements();
    if (!ui || tutorialState.wired) return;
    ui.back?.addEventListener("click", () => {
        moveBeginnerTutorial(-1);
    });
    ui.next?.addEventListener("click", () => {
        moveBeginnerTutorial(1);
    });
    ui.skip?.addEventListener("click", () => {
        closeBeginnerTutorial({ markSeen: true });
        status.set("Tutorial skipped");
    });

    if (!tutorialState.listenersWired) {
        window.addEventListener("resize", () => {
            if (!tutorialState.active) return;
            refreshTutorialHighlightPosition();
            updateTutorialPanelPosition();
        });
        document.addEventListener("scroll", () => {
            if (!tutorialState.active) return;
            refreshTutorialHighlightPosition();
            updateTutorialPanelPosition();
        }, true);
        tutorialState.listenersWired = true;
    }

    tutorialState.wired = true;
}

const health = {
    editor: el.healthEditor,
    sandbox: el.healthSandbox,
    storage: el.healthStorage,
};

function setHealth(node, state, text) {
    if (node) {
        node.dataset.state = state;
        node.textContent = text;
    }
    syncFooterRuntimeStatus();
}

function getHealthLabelSuffix(value = "", fallback = "") {
    const text = String(value || "").trim();
    if (!text) return String(fallback || "").trim();
    const idx = text.indexOf(":");
    if (idx === -1) return text;
    const suffix = text.slice(idx + 1).trim();
    return suffix || String(fallback || "").trim();
}

function syncFooterRuntimeStatus() {
    if (el.footerEditorRuntime) {
        const editorState = el.healthEditor?.dataset?.state || el.footerEditorRuntime.dataset?.state || "ok";
        const editorSource = el.healthEditor?.textContent || el.footerEditorRuntime.textContent || "Editor: Ready";
        const editorLabel = getHealthLabelSuffix(editorSource, "Ready");
        el.footerEditorRuntime.dataset.state = editorState;
        el.footerEditorRuntime.textContent = `Editor: ${editorLabel}`;
        el.footerEditorRuntime.title = `Editor status: ${editorLabel}`;
    }

    if (el.footerSandbox) {
        const sandboxState = el.healthSandbox?.dataset?.state || el.footerSandbox.dataset?.state || "idle";
        const sandboxSource = el.healthSandbox?.textContent || el.footerSandbox.textContent || "Sandbox: Idle";
        const sandboxLabel = getHealthLabelSuffix(sandboxSource, "Idle");
        el.footerSandbox.dataset.state = sandboxState;
        el.footerSandbox.textContent = `Sandbox: ${sandboxLabel}`;
        el.footerSandbox.title = `Sandbox status: ${sandboxLabel}`;
    }

    if (el.footerStorage) {
        const storageState = el.healthStorage?.dataset?.state || el.footerStorage.dataset?.state || "ok";
        const fallback = storageState === "error" ? "Blocked" : "OK";
        const storageSource = el.healthStorage?.textContent || el.footerStorage.textContent || `Storage: ${fallback}`;
        const storageLabel = getHealthLabelSuffix(storageSource, fallback);
        el.footerStorage.dataset.state = storageState;
        el.footerStorage.textContent = `Storage: ${storageLabel}`;
        el.footerStorage.title = `Storage status: ${storageLabel}`;
    }

    if (el.footerZoom) {
        const zoom = normalizeUiZoom(uiZoomPercent);
        const zoomState = zoom >= 140 || zoom <= 80 ? "warn" : "ok";
        el.footerZoom.dataset.state = zoomState;
        el.footerZoom.textContent = `Zoom: ${zoom}%`;
        el.footerZoom.title = `UI zoom: ${zoom}%`;
    }

    if (el.footerProblems) {
        const list = el.problemsList;
        const total = list ? list.querySelectorAll("[data-problem-id]").length : 0;
        const hasError = Boolean(list?.querySelector('[data-problem-id][data-level="error"]'));
        const hasWarn = Boolean(list?.querySelector('[data-problem-id][data-level="warn"]'));
        const state = hasError ? "error" : (hasWarn || total > 0 ? "warn" : "ok");
        el.footerProblems.dataset.state = state;
        el.footerProblems.textContent = `Problems: ${total}`;
        el.footerProblems.title = total > 0 ? `${total} active problem${total === 1 ? "" : "s"}` : "No active problems";
    }
}

let diagnosticsVerbose = false;

function setDiagnosticsVerbose(next) {
    diagnosticsVerbose = next;
    if (el.btnToggleDiagnostics) {
        setAriaPressed(el.btnToggleDiagnostics, diagnosticsVerbose);
        el.btnToggleDiagnostics.textContent = diagnosticsVerbose ? "Verbose: On" : "Verbose: Off";
    }
}

function pushDiag(level, message) {
    if (level === "info" && !diagnosticsVerbose) return;
    diagnostics.push(level, message);
}

function truncateText(value = "", maxChars = 0, { suffix = " ... [truncated]" } = {}) {
    const source = String(value ?? "");
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || source.length <= limit) return source;
    const ending = String(suffix || "");
    const bodyLimit = Math.max(0, limit - ending.length);
    if (bodyLimit <= 0) return source.slice(0, limit);
    return `${source.slice(0, bodyLimit)}${ending}`;
}

function scheduleFrame(task) {
    const run = typeof task === "function" ? task : () => {};
    if (typeof requestAnimationFrame === "function") {
        return requestAnimationFrame(run);
    }
    return setTimeout(run, 16);
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
let currentRunContext = null;

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
let activeLayoutPresetName = "studio";
let fileFilter = "";
let fileSort = "manual";
const FILE_ROW_SELECTOR = ".file-row[data-file-id]";
const FILE_FOLDER_ROW_SELECTOR = ".file-folder-row[data-folder-toggle]";
const FILES_REORDERABLE_SECTIONS = new Set(["games", "applications", "lessons", "open-editors", "files"]);
const HORIZONTAL_HEADER_SCROLL_SELECTOR = ".top, .card-hd, .files-header, .layout-header, .editor-header";
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
const RUNTIME_PROBLEM_LIMIT = 120;
const PROBLEM_ENTRY_LIMIT = 200;
const DEFAULT_DOCK_ZONE_MAGNET_DISTANCE = 96;
const EDITOR_MARK_KIND_DIAGNOSTIC = "diagnostic";
const EDITOR_MARK_KIND_ERROR_LENS = "error-lens";
const EDITOR_MARK_KIND_FIND = "find";
const EDITOR_MARK_KIND_SYMBOL = "symbol";
const EDITOR_LINT_DEBOUNCE_MS = 220;
const DEV_TERMINAL_MESSAGE_MAX_CHARS = 1400;
const DEV_TERMINAL_OUTPUT_LIMIT = 240;
const DEV_TERMINAL_HISTORY_LIMIT = 80;
const CONSOLE_INPUT_MAX_CHARS = 200;
const CONSOLE_INPUT_HISTORY_LIMIT = 80;
const CONSOLE_INPUT_HISTORY_STORAGE_KEY = "fazide.console-input-history.v1";
const SANDBOX_CONSOLE_MAX_ARGS = 24;
const SANDBOX_CONSOLE_ARG_MAX_CHARS = 1000;
const SANDBOX_RUNTIME_MESSAGE_MAX_CHARS = 1400;
const SANDBOX_PROMISE_REASON_MAX_CHARS = 1400;
const SANDBOX_CONSOLE_QUEUE_LIMIT = 180;
const SANDBOX_CONSOLE_FLUSH_TIMEOUT_MS = 80;
const SANDBOX_READY_FALLBACK_MS = 1200;
const FILE_FILTER_RENDER_DEBOUNCE_MS = 90;
const PROJECT_SEARCH_SCAN_DEBOUNCE_MS = 140;
const WORKSPACE_IMPORT_MAX_INPUT_CHARS = 2_000_000;
const WORKSPACE_MAX_FILES = 320;
const WORKSPACE_MAX_TRASH = 320;
const WORKSPACE_MAX_FOLDERS = 800;
const WORKSPACE_MAX_OPEN_TABS = 120;
const WORKSPACE_MAX_PATH_CHARS = 260;
const WORKSPACE_MAX_FILE_CODE_CHARS = 160_000;
const WORKSPACE_MAX_TOTAL_CODE_CHARS = 2_000_000;
const WORKSPACE_MAX_TRASH_CODE_CHARS = 900_000;
const LOCAL_FOLDER_MAX_FILE_BYTES = 700_000;
const LOCAL_FOLDER_MAX_TOTAL_BYTES = 10_000_000;
const TEMPLATE_ICON_SOURCE_LIMIT = 6;
const EDITOR_HISTORY_REASON_MAX_CHARS = 72;
const LOCAL_FOLDER_IMPORT_EXTENSIONS = new Set([
    "js",
    "mjs",
    "cjs",
    "jsx",
    "ts",
    "tsx",
    "json",
    "html",
    "css",
    "scss",
    "sass",
    "less",
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
const EDITOR_COMPLETION_KEYWORDS = Object.freeze({
    javascript: Object.freeze([
        "const", "let", "var", "function", "return", "if", "else", "for", "while", "switch", "case", "default",
        "break", "continue", "try", "catch", "finally", "throw", "class", "extends", "new", "import", "export",
        "from", "async", "await", "typeof", "instanceof", "void", "this", "super", "true", "false", "null",
        "undefined", "console", "document", "window", "setTimeout", "setInterval", "Promise", "Map", "Set", "Array", "Object",
    ]),
    typescript: Object.freeze([
        "interface", "type", "enum", "implements", "public", "private", "protected", "readonly", "declare", "namespace", "module",
        "keyof", "infer", "never", "unknown", "any", "as", "satisfies",
    ]),
    json: Object.freeze(["true", "false", "null"]),
    html: Object.freeze(["div", "span", "section", "header", "footer", "main", "article", "nav", "button", "input", "form", "label"]),
    css: Object.freeze([
        "display", "position", "margin", "padding", "width", "height", "color", "background", "border", "font-size", "line-height",
        "grid", "flex", "align-items", "justify-content", "gap", "z-index", "overflow", "opacity", "transform",
    ]),
    markdown: Object.freeze(["#", "##", "###", "-", "*", "```", "[", "]", "(", ")"]),
});
const EDITOR_COMPLETION_MIN_PREFIX = 2;
const EDITOR_COMPLETION_MAX_ITEMS = 8;
const EDITOR_COMPLETION_MAX_ITEMS_MIN = 4;
const EDITOR_COMPLETION_MAX_ITEMS_MAX = 16;
const EDITOR_COMPLETION_OPACITY_MIN = 20;
const EDITOR_COMPLETION_OPACITY_MAX = 100;
const EDITOR_COMPLETION_OPACITY_DEFAULT = 60;
const EDITOR_COMPLETION_PANEL_MIN_WIDTH_PX = 220;
const EDITOR_COMPLETION_PANEL_MAX_WIDTH_PX = 380;
const EDITOR_COMPLETION_PANEL_MIN_HEIGHT_PX = 96;
const EDITOR_COMPLETION_PANEL_MAX_HEIGHT_PX = 220;
const EDITOR_COMPLETION_PANEL_EDGE_GAP_PX = 8;
const EDITOR_COMPLETION_PANEL_CURSOR_GAP_PX = 6;
const EDITOR_SIGNATURE_HINT_EDGE_GAP_PX = 8;
const EDITOR_SIGNATURE_HINT_CURSOR_GAP_PX = 8;
const EDITOR_SIGNATURE_HINT_MIN_HEIGHT_PX = 22;
const EDITOR_SCOPE_KIND_SET = new Set(["class", "function", "method", "arrow"]);
const EDITOR_BOTTOM_COMFORT_RATIO = 0.5;
const EDITOR_BOTTOM_COMFORT_MIN_PX = 96;
const EDITOR_BOTTOM_COMFORT_MAX_PX = 620;
const EDITOR_CURSOR_COMFORT_TARGET_RATIO = 0.5;
const EDITOR_CURSOR_COMFORT_TOLERANCE_RATIO = 0.06;

const EDITOR_PROFILES = {
    balanced: {
        tabSize: 2,
        fontSize: 16,
        fontFamily: "default",
        syntaxTheme: "default",
        lineWrapping: true,
        lintEnabled: true,
        errorLensEnabled: true,
        snippetEnabled: true,
        signatureHintEnabled: true,
        completionMaxItems: 8,
        completionOpacity: 60,
        autosaveMs: 650,
        formatterMode: "auto",
    },
    focus: {
        tabSize: 2,
        fontSize: 14,
        fontFamily: "default",
        syntaxTheme: "default",
        lineWrapping: false,
        lintEnabled: true,
        errorLensEnabled: true,
        snippetEnabled: true,
        signatureHintEnabled: true,
        completionMaxItems: 8,
        completionOpacity: 55,
        autosaveMs: 420,
        formatterMode: "prettier",
    },
    presentation: {
        tabSize: 2,
        fontSize: 16,
        fontFamily: "default",
        syntaxTheme: "default",
        lineWrapping: true,
        lintEnabled: false,
        errorLensEnabled: false,
        snippetEnabled: false,
        signatureHintEnabled: false,
        completionMaxItems: 6,
        completionOpacity: 50,
        autosaveMs: 900,
        formatterMode: "basic",
    },
};

const EDITOR_FONT_FAMILY_OPTIONS = {
    default: 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    "jetbrains-mono": '"JetBrains Mono", "Cascadia Mono", "Consolas", monospace',
    "fira-code": '"Fira Code", "Cascadia Mono", "Consolas", monospace',
    "source-code-pro": '"Source Code Pro", "Cascadia Mono", "Consolas", monospace',
    "ibm-plex-mono": '"IBM Plex Mono", "Cascadia Mono", "Consolas", monospace',
    "roboto-mono": '"Roboto Mono", "Cascadia Mono", "Consolas", monospace',
    inconsolata: '"Inconsolata", "Cascadia Mono", "Consolas", monospace',
    "ubuntu-mono": '"Ubuntu Mono", "Cascadia Mono", "Consolas", monospace',
    "cascadia-mono": '"Cascadia Mono", "Consolas", monospace',
    "space-mono": '"Space Mono", "Cascadia Mono", "Consolas", monospace',
};

const DEFAULT_EDITOR_SYNTAX_THEME = "default";
const EDITOR_AUTO_PAIR_OPEN_TO_CLOSE = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["\"", "\""],
    ["'", "'"],
    ["`", "`"],
]);
const EDITOR_AUTO_PAIR_CLOSE_TO_OPEN = new Map(
    [...EDITOR_AUTO_PAIR_OPEN_TO_CLOSE.entries()].map(([open, close]) => [close, open])
);
const EDITOR_AUTO_PAIR_QUOTES = new Set(["\"", "'", "`"]);
const EDITOR_AUTO_PAIR_SAFE_NEXT = new Set([")", "]", "}", ">", ",", ";", ":"]);
const EDITOR_LINE_COMMENT_PREFIX_LANGS = new Set(["javascript", "typescript", "json", "css"]);
const EDITOR_HTML_VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);
const EDITOR_SYNTAX_THEME_NAMES = Object.freeze([
    "default",
    "dark",
    "light",
    "purple",
    "retro",
    "temple",
    "midnight",
    "ocean",
    "forest",
    "graphite",
    "sunset",
]);
const EDITOR_SYNTAX_THEME_NAME_SET = new Set(EDITOR_SYNTAX_THEME_NAMES);
const EDITOR_SYNTAX_THEME_METADATA = Object.freeze({
    default: Object.freeze({
        label: "Syntax Default",
        colors: Object.freeze(["Classic defaults", "Balanced contrast", "Safe baseline"]),
    }),
    dark: Object.freeze({
        label: "Dark",
        colors: Object.freeze(["Silver White", "Amethyst Purple", "Amber Gold", "Electric Cyan", "Graphite Gray"]),
    }),
    light: Object.freeze({
        label: "Light",
        colors: Object.freeze(["Glacier Blue", "Ice Indigo", "Mint Green", "Amber Glow", "Cloud Gray"]),
    }),
    purple: Object.freeze({
        label: "Purple",
        colors: Object.freeze(["Royal Purple", "Sapphire Blue", "Crown Gold", "Emerald Green", "Velvet Gray"]),
    }),
    retro: Object.freeze({
        label: "Retro",
        colors: Object.freeze(["Arcade Red", "Arcade Blue", "Arcade Yellow", "Arcade Green", "Tube White"]),
    }),
    temple: Object.freeze({
        label: "Temple",
        colors: Object.freeze(["Cobalt Blue", "Temple Gold", "Ivory White", "Signal Red", "Sky Cyan"]),
    }),
    midnight: Object.freeze({
        label: "Midnight",
        colors: Object.freeze(["Indigo Blue", "Laser Cyan", "Rose Red", "Lime Green", "Steel Gray"]),
    }),
    ocean: Object.freeze({
        label: "Ocean",
        colors: Object.freeze(["Ocean Blue", "Reef Teal", "Voltage Purple", "Beacon Amber", "Harbor Gray"]),
    }),
    forest: Object.freeze({
        label: "Forest",
        colors: Object.freeze(["Emerald Green", "Sky Blue", "Amber Gold", "Orchid Magenta", "Moon Gray"]),
    }),
    graphite: Object.freeze({
        label: "Graphite",
        colors: Object.freeze(["Silver White", "Amethyst Purple", "Amber Gold", "Electric Cyan", "Graphite Gray"]),
    }),
    sunset: Object.freeze({
        label: "Sunset",
        colors: Object.freeze(["Solar Orange", "Reactor Red", "Core Gold", "Teal Green", "Ash Gray"]),
    }),
});
const EDITOR_SYNTAX_THEME_ROLE_COLORS = Object.freeze({
    default: Object.freeze({ primary: "#e5e7eb", secondary: "#8b5cf6", accent: "#f59e0b", support: "#22d3ee", neutral: "#71717a" }),
    dark: Object.freeze({ primary: "#e5e7eb", secondary: "#8b5cf6", accent: "#f59e0b", support: "#22d3ee", neutral: "#71717a" }),
    light: Object.freeze({ primary: "#38bdf8", secondary: "#60a5fa", accent: "#34d399", support: "#f59e0b", neutral: "#94a3b8" }),
    purple: Object.freeze({ primary: "#7c3aed", secondary: "#3b82f6", accent: "#f59e0b", support: "#10b981", neutral: "#a1a1aa" }),
    retro: Object.freeze({ primary: "#d90429", secondary: "#0051ba", accent: "#ffd500", support: "#009b48", neutral: "#d8dee4" }),
    temple: Object.freeze({ primary: "#1f4fff", secondary: "#00a9ff", accent: "#d9a100", support: "#fff6db", neutral: "#7d8eb2" }),
    midnight: Object.freeze({ primary: "#6366f1", secondary: "#06b6d4", accent: "#f43f5e", support: "#84cc16", neutral: "#a3a3a3" }),
    ocean: Object.freeze({ primary: "#3b82f6", secondary: "#14b8a6", accent: "#a855f7", support: "#f59e0b", neutral: "#94a3b8" }),
    forest: Object.freeze({ primary: "#10b981", secondary: "#0ea5e9", accent: "#f59e0b", support: "#d946ef", neutral: "#9ca3af" }),
    graphite: Object.freeze({ primary: "#e5e7eb", secondary: "#8b5cf6", accent: "#f59e0b", support: "#22d3ee", neutral: "#71717a" }),
    sunset: Object.freeze({ primary: "#f97316", secondary: "#ef4444", accent: "#eab308", support: "#14b8a6", neutral: "#94a3b8" }),
});
const SYNTAX_ROLE_KEYS = Object.freeze(["primary", "secondary", "accent", "support", "neutral"]);
const SYNTAX_SURFACE_MIX_RULES = Object.freeze({
    dark: Object.freeze({ mix: "#000000", chroma: 0, neutral: 0 }),
    light: Object.freeze({ mix: "#0f172a", chroma: 0.42, neutral: 0.52 }),
    purple: Object.freeze({ mix: "#f8f1ff", chroma: 0.16, neutral: 0.28 }),
});
const SYNTAX_THEME_MIX_OVERRIDES = Object.freeze({
    retro: Object.freeze({
        dark: Object.freeze({ mix: "#000000", chroma: 0, neutral: 0 }),
        light: Object.freeze({ mix: "#0f172a", chroma: 0.38, neutral: 0.48 }),
        purple: Object.freeze({ mix: "#ffffff", chroma: 0.03, neutral: 0.1 }),
    }),
    temple: Object.freeze({
        dark: Object.freeze({ mix: "#000000", chroma: 0.02, neutral: 0.08 }),
        light: Object.freeze({ mix: "#0b1b52", chroma: 0.5, neutral: 0.6 }),
        purple: Object.freeze({ mix: "#ffffff", chroma: 0.1, neutral: 0.18 }),
    }),
});
const EDITOR_SYNTAX_THEME_ALIASES = Object.freeze({
    default: "default",
    "syntax-default": "default",
    dark: "dark",
    light: "light",
    purple: "purple",
    ember: "sunset",
    volcanic: "sunset",
    midnight: "midnight",
    citrus: "sunset",
    ocean: "ocean",
    graphite: "graphite",
    forge: "sunset",
    lotus: "purple",
    embermint: "forest",
    arctic: "light",
    sunset: "sunset",
    verdant: "forest",
    candy: "purple",
    magma: "sunset",
    storm: "ocean",
    orchid: "purple",
    graphene: "graphite",
    twilight: "midnight",
    aurora: "forest",
    solarflare: "sunset",
    deepsea: "ocean",
    nebula: "purple",
    obsidian: "dark",
    royal: "purple",
    glacier: "light",
    rubik: "retro",
    rubiks: "retro",
    cube: "retro",
    templeos: "temple",
    holy: "temple",
});
const EDITOR_SYNTAX_THEME_BY_UI_THEME = Object.freeze({
    dark: "dark",
    light: "light",
    purple: "purple",
    retro: "retro",
    temple: "temple",
    midnight: "midnight",
    ocean: "ocean",
    forest: "forest",
    graphite: "graphite",
    sunset: "sunset",
});
const EDITOR_SYNTAX_VAR_KEYS = Object.freeze([
    "plain",
    "keyword",
    "atom",
    "number",
    "def",
    "variable",
    "variable-2",
    "variable-3",
    "property",
    "operator",
    "comment",
    "string",
    "string-2",
    "meta",
    "tag",
    "attribute",
    "qualifier",
    "builtin",
    "bracket",
]);

const EDITOR_SYNTAX_THEME_PALETTES = Object.freeze({
    volcanic: Object.freeze({
        dark: Object.freeze({
            plain: "#f8f4ff",
            keyword: "#ff9f43",
            atom: "#9b5de5",
            number: "#ff7a00",
            def: "#c77dff",
            variable: "#f8f4ff",
            "variable-2": "#b388ff",
            "variable-3": "#ffd166",
            property: "#d0a2ff",
            operator: "#ff9f43",
            comment: "#b3a0c8",
            string: "#ffb86b",
            "string-2": "#ff9f43",
            meta: "#c77dff",
            tag: "#9b5de5",
            attribute: "#d0a2ff",
            qualifier: "#ffd166",
            builtin: "#ff7a00",
            bracket: "#efe7ff",
        }),
        light: Object.freeze({
            plain: "#2b1a38",
            keyword: "#c2410c",
            atom: "#6d28d9",
            number: "#ea580c",
            def: "#7c3aed",
            variable: "#2b1a38",
            "variable-2": "#8b5cf6",
            "variable-3": "#a16207",
            property: "#7c3aed",
            operator: "#c2410c",
            comment: "#7f6b93",
            string: "#b45309",
            "string-2": "#9a3412",
            meta: "#8b5cf6",
            tag: "#6d28d9",
            attribute: "#7c3aed",
            qualifier: "#a16207",
            builtin: "#ea580c",
            bracket: "#3a2b4a",
        }),
        purple: Object.freeze({
            plain: "#fbf4ff",
            keyword: "#fb923c",
            atom: "#c084fc",
            number: "#f97316",
            def: "#e9d5ff",
            variable: "#fbf4ff",
            "variable-2": "#d8b4fe",
            "variable-3": "#fbbf24",
            property: "#e2c8ff",
            operator: "#fb923c",
            comment: "#bea6d5",
            string: "#fdba74",
            "string-2": "#fb923c",
            meta: "#d8b4fe",
            tag: "#c084fc",
            attribute: "#e9d5ff",
            qualifier: "#fbbf24",
            builtin: "#f97316",
            bracket: "#f3e8ff",
        }),
    }),
    twilight: Object.freeze({
        dark: Object.freeze({
            plain: "#f3ecff",
            keyword: "#c084fc",
            atom: "#a855f7",
            number: "#fdba74",
            def: "#e9d5ff",
            variable: "#f3ecff",
            "variable-2": "#c4b5fd",
            "variable-3": "#fde047",
            property: "#d8b4fe",
            operator: "#e9d5ff",
            comment: "#9f92bf",
            string: "#fcd34d",
            "string-2": "#f59e0b",
            meta: "#c084fc",
            tag: "#a78bfa",
            attribute: "#e9d5ff",
            qualifier: "#fde047",
            builtin: "#f97316",
            bracket: "#efe2ff",
        }),
        light: Object.freeze({
            plain: "#2a1f3d",
            keyword: "#7e22ce",
            atom: "#6d28d9",
            number: "#c2410c",
            def: "#5b21b6",
            variable: "#2a1f3d",
            "variable-2": "#7c3aed",
            "variable-3": "#a16207",
            property: "#6d28d9",
            operator: "#9333ea",
            comment: "#7f6fa0",
            string: "#b45309",
            "string-2": "#92400e",
            meta: "#7c3aed",
            tag: "#6d28d9",
            attribute: "#5b21b6",
            qualifier: "#a16207",
            builtin: "#c2410c",
            bracket: "#3e3154",
        }),
        purple: Object.freeze({
            plain: "#f7efff",
            keyword: "#d8b4fe",
            atom: "#c4b5fd",
            number: "#fda65a",
            def: "#f0abfc",
            variable: "#f7efff",
            "variable-2": "#e9d5ff",
            "variable-3": "#fbbf24",
            property: "#ddd6fe",
            operator: "#f0ddff",
            comment: "#bba7d7",
            string: "#fde68a",
            "string-2": "#f59e0b",
            meta: "#d8b4fe",
            tag: "#c4b5fd",
            attribute: "#f1e7ff",
            qualifier: "#fbbf24",
            builtin: "#fb923c",
            bracket: "#f5edff",
        }),
    }),
    aurora: Object.freeze({
        dark: Object.freeze({
            plain: "#ecfff7",
            keyword: "#34d399",
            atom: "#22d3ee",
            number: "#f59e0b",
            def: "#5eead4",
            variable: "#ecfff7",
            "variable-2": "#2dd4bf",
            "variable-3": "#facc15",
            property: "#67e8f9",
            operator: "#10b981",
            comment: "#8db9b0",
            string: "#86efac",
            "string-2": "#34d399",
            meta: "#22d3ee",
            tag: "#2dd4bf",
            attribute: "#67e8f9",
            qualifier: "#86efac",
            builtin: "#f59e0b",
            bracket: "#dcfce7",
        }),
        light: Object.freeze({
            plain: "#13292a",
            keyword: "#047857",
            atom: "#0e7490",
            number: "#b45309",
            def: "#0f766e",
            variable: "#13292a",
            "variable-2": "#0f766e",
            "variable-3": "#a16207",
            property: "#0891b2",
            operator: "#059669",
            comment: "#5f8781",
            string: "#15803d",
            "string-2": "#166534",
            meta: "#0e7490",
            tag: "#0f766e",
            attribute: "#0891b2",
            qualifier: "#15803d",
            builtin: "#b45309",
            bracket: "#1f3c3d",
        }),
        purple: Object.freeze({
            plain: "#eefff8",
            keyword: "#5eead4",
            atom: "#67e8f9",
            number: "#fbbf24",
            def: "#99f6e4",
            variable: "#eefff8",
            "variable-2": "#6ee7b7",
            "variable-3": "#fde047",
            property: "#a5f3fc",
            operator: "#34d399",
            comment: "#a3c1b8",
            string: "#86efac",
            "string-2": "#4ade80",
            meta: "#67e8f9",
            tag: "#5eead4",
            attribute: "#a5f3fc",
            qualifier: "#86efac",
            builtin: "#f59e0b",
            bracket: "#d9fbea",
        }),
    }),
    solarflare: Object.freeze({
        dark: Object.freeze({
            plain: "#fff4ea",
            keyword: "#f97316",
            atom: "#ef4444",
            number: "#f59e0b",
            def: "#fb7185",
            variable: "#fff4ea",
            "variable-2": "#fb923c",
            "variable-3": "#fde047",
            property: "#fda4af",
            operator: "#f97316",
            comment: "#c3a490",
            string: "#fdba74",
            "string-2": "#fb923c",
            meta: "#ef4444",
            tag: "#f97316",
            attribute: "#fda4af",
            qualifier: "#fde047",
            builtin: "#dc2626",
            bracket: "#ffe8d4",
        }),
        light: Object.freeze({
            plain: "#3a2416",
            keyword: "#c2410c",
            atom: "#b91c1c",
            number: "#b45309",
            def: "#be123c",
            variable: "#3a2416",
            "variable-2": "#ea580c",
            "variable-3": "#a16207",
            property: "#be123c",
            operator: "#c2410c",
            comment: "#9a7b66",
            string: "#b45309",
            "string-2": "#9a3412",
            meta: "#b91c1c",
            tag: "#c2410c",
            attribute: "#be123c",
            qualifier: "#a16207",
            builtin: "#991b1b",
            bracket: "#4a2d1c",
        }),
        purple: Object.freeze({
            plain: "#fff1ea",
            keyword: "#fb923c",
            atom: "#fb7185",
            number: "#f59e0b",
            def: "#fda4af",
            variable: "#fff1ea",
            "variable-2": "#fdba74",
            "variable-3": "#fde047",
            property: "#fbcfe8",
            operator: "#fb923c",
            comment: "#c7a394",
            string: "#fdba74",
            "string-2": "#fb923c",
            meta: "#fb7185",
            tag: "#fb923c",
            attribute: "#fda4af",
            qualifier: "#fde047",
            builtin: "#ef4444",
            bracket: "#ffe4d6",
        }),
    }),
    deepsea: Object.freeze({
        dark: Object.freeze({
            plain: "#e8f8ff",
            keyword: "#38bdf8",
            atom: "#60a5fa",
            number: "#22d3ee",
            def: "#93c5fd",
            variable: "#e8f8ff",
            "variable-2": "#2dd4bf",
            "variable-3": "#7dd3fc",
            property: "#7dd3fc",
            operator: "#0ea5e9",
            comment: "#88a8b7",
            string: "#67e8f9",
            "string-2": "#22d3ee",
            meta: "#60a5fa",
            tag: "#38bdf8",
            attribute: "#7dd3fc",
            qualifier: "#2dd4bf",
            builtin: "#0284c7",
            bracket: "#d6ecff",
        }),
        light: Object.freeze({
            plain: "#132a3b",
            keyword: "#0369a1",
            atom: "#1d4ed8",
            number: "#0e7490",
            def: "#2563eb",
            variable: "#132a3b",
            "variable-2": "#0f766e",
            "variable-3": "#155e75",
            property: "#0ea5e9",
            operator: "#0284c7",
            comment: "#607e8e",
            string: "#0f766e",
            "string-2": "#0e7490",
            meta: "#2563eb",
            tag: "#0369a1",
            attribute: "#0ea5e9",
            qualifier: "#0f766e",
            builtin: "#1d4ed8",
            bracket: "#224458",
        }),
        purple: Object.freeze({
            plain: "#eaf7ff",
            keyword: "#67e8f9",
            atom: "#93c5fd",
            number: "#22d3ee",
            def: "#bfdbfe",
            variable: "#eaf7ff",
            "variable-2": "#5eead4",
            "variable-3": "#a5f3fc",
            property: "#bae6fd",
            operator: "#38bdf8",
            comment: "#9bb7c6",
            string: "#a5f3fc",
            "string-2": "#67e8f9",
            meta: "#93c5fd",
            tag: "#7dd3fc",
            attribute: "#bae6fd",
            qualifier: "#5eead4",
            builtin: "#38bdf8",
            bracket: "#d8ecff",
        }),
    }),
    nebula: Object.freeze({
        dark: Object.freeze({
            plain: "#f2ecff",
            keyword: "#c084fc",
            atom: "#60a5fa",
            number: "#fda4af",
            def: "#a78bfa",
            variable: "#f2ecff",
            "variable-2": "#818cf8",
            "variable-3": "#fbbf24",
            property: "#c4b5fd",
            operator: "#d8b4fe",
            comment: "#a798c2",
            string: "#93c5fd",
            "string-2": "#60a5fa",
            meta: "#c084fc",
            tag: "#a78bfa",
            attribute: "#93c5fd",
            qualifier: "#fbbf24",
            builtin: "#fb923c",
            bracket: "#efe5ff",
        }),
        light: Object.freeze({
            plain: "#2b2140",
            keyword: "#7e22ce",
            atom: "#2563eb",
            number: "#dc2626",
            def: "#6d28d9",
            variable: "#2b2140",
            "variable-2": "#4f46e5",
            "variable-3": "#a16207",
            property: "#5b21b6",
            operator: "#8b5cf6",
            comment: "#7e6f9d",
            string: "#1d4ed8",
            "string-2": "#2563eb",
            meta: "#7c3aed",
            tag: "#6d28d9",
            attribute: "#1d4ed8",
            qualifier: "#a16207",
            builtin: "#c2410c",
            bracket: "#3b2f52",
        }),
        purple: Object.freeze({
            plain: "#f6efff",
            keyword: "#d8b4fe",
            atom: "#93c5fd",
            number: "#fda4af",
            def: "#c4b5fd",
            variable: "#f6efff",
            "variable-2": "#a5b4fc",
            "variable-3": "#fbbf24",
            property: "#ddd6fe",
            operator: "#e9d5ff",
            comment: "#b6a4d3",
            string: "#bfdbfe",
            "string-2": "#93c5fd",
            meta: "#d8b4fe",
            tag: "#c4b5fd",
            attribute: "#bfdbfe",
            qualifier: "#fbbf24",
            builtin: "#fb923c",
            bracket: "#f2e8ff",
        }),
    }),
    forge: Object.freeze({
        dark: Object.freeze({
            plain: "#fff5eb",
            keyword: "#fb923c",
            atom: "#f59e0b",
            number: "#ef4444",
            def: "#fdba74",
            variable: "#fff5eb",
            "variable-2": "#f97316",
            "variable-3": "#fde047",
            property: "#fdba74",
            operator: "#fb923c",
            comment: "#c0a792",
            string: "#fbbf24",
            "string-2": "#f59e0b",
            meta: "#ef4444",
            tag: "#fb923c",
            attribute: "#fdba74",
            qualifier: "#fde047",
            builtin: "#dc2626",
            bracket: "#ffe7d1",
        }),
        light: Object.freeze({
            plain: "#3d2618",
            keyword: "#c2410c",
            atom: "#b45309",
            number: "#b91c1c",
            def: "#d97706",
            variable: "#3d2618",
            "variable-2": "#ea580c",
            "variable-3": "#a16207",
            property: "#d97706",
            operator: "#c2410c",
            comment: "#9a7b66",
            string: "#b45309",
            "string-2": "#92400e",
            meta: "#b91c1c",
            tag: "#c2410c",
            attribute: "#d97706",
            qualifier: "#a16207",
            builtin: "#991b1b",
            bracket: "#4c3020",
        }),
        purple: Object.freeze({
            plain: "#fff2e9",
            keyword: "#fb923c",
            atom: "#f59e0b",
            number: "#fb7185",
            def: "#fdba74",
            variable: "#fff2e9",
            "variable-2": "#fb923c",
            "variable-3": "#fde047",
            property: "#fdba74",
            operator: "#fb923c",
            comment: "#c4a08f",
            string: "#fbbf24",
            "string-2": "#f59e0b",
            meta: "#fb7185",
            tag: "#fb923c",
            attribute: "#fdba74",
            qualifier: "#fde047",
            builtin: "#ef4444",
            bracket: "#ffe2d0",
        }),
    }),
    lotus: Object.freeze({
        dark: Object.freeze({
            plain: "#f6ecff",
            keyword: "#e879f9",
            atom: "#22d3ee",
            number: "#fb7185",
            def: "#c084fc",
            variable: "#f6ecff",
            "variable-2": "#a78bfa",
            "variable-3": "#fde047",
            property: "#d8b4fe",
            operator: "#f0abfc",
            comment: "#ae97c7",
            string: "#67e8f9",
            "string-2": "#22d3ee",
            meta: "#c084fc",
            tag: "#a78bfa",
            attribute: "#67e8f9",
            qualifier: "#fde047",
            builtin: "#fb923c",
            bracket: "#efe0ff",
        }),
        light: Object.freeze({
            plain: "#311f3b",
            keyword: "#a21caf",
            atom: "#0e7490",
            number: "#be123c",
            def: "#7e22ce",
            variable: "#311f3b",
            "variable-2": "#6d28d9",
            "variable-3": "#a16207",
            property: "#9333ea",
            operator: "#a855f7",
            comment: "#8a7399",
            string: "#0f766e",
            "string-2": "#0e7490",
            meta: "#7e22ce",
            tag: "#6d28d9",
            attribute: "#0f766e",
            qualifier: "#a16207",
            builtin: "#c2410c",
            bracket: "#43314e",
        }),
        purple: Object.freeze({
            plain: "#f8edff",
            keyword: "#f0abfc",
            atom: "#67e8f9",
            number: "#fb7185",
            def: "#d8b4fe",
            variable: "#f8edff",
            "variable-2": "#c4b5fd",
            "variable-3": "#fde047",
            property: "#e9d5ff",
            operator: "#f0abfc",
            comment: "#bda5d1",
            string: "#a5f3fc",
            "string-2": "#67e8f9",
            meta: "#d8b4fe",
            tag: "#c4b5fd",
            attribute: "#a5f3fc",
            qualifier: "#fde047",
            builtin: "#fb923c",
            bracket: "#f3e6ff",
        }),
    }),
    embermint: Object.freeze({
        dark: Object.freeze({
            plain: "#f0fff7",
            keyword: "#fb923c",
            atom: "#34d399",
            number: "#f59e0b",
            def: "#6ee7b7",
            variable: "#f0fff7",
            "variable-2": "#2dd4bf",
            "variable-3": "#fde047",
            property: "#99f6e4",
            operator: "#f97316",
            comment: "#9cb9ad",
            string: "#86efac",
            "string-2": "#4ade80",
            meta: "#2dd4bf",
            tag: "#34d399",
            attribute: "#99f6e4",
            qualifier: "#fde047",
            builtin: "#fb923c",
            bracket: "#dcfcef",
        }),
        light: Object.freeze({
            plain: "#1f3329",
            keyword: "#c2410c",
            atom: "#047857",
            number: "#b45309",
            def: "#059669",
            variable: "#1f3329",
            "variable-2": "#0f766e",
            "variable-3": "#a16207",
            property: "#10b981",
            operator: "#ea580c",
            comment: "#6f8b7d",
            string: "#15803d",
            "string-2": "#166534",
            meta: "#0f766e",
            tag: "#047857",
            attribute: "#10b981",
            qualifier: "#a16207",
            builtin: "#c2410c",
            bracket: "#2c463a",
        }),
        purple: Object.freeze({
            plain: "#f2fff7",
            keyword: "#fdba74",
            atom: "#5eead4",
            number: "#f59e0b",
            def: "#99f6e4",
            variable: "#f2fff7",
            "variable-2": "#6ee7b7",
            "variable-3": "#fde047",
            property: "#a7f3d0",
            operator: "#fb923c",
            comment: "#a5c0b2",
            string: "#bbf7d0",
            "string-2": "#86efac",
            meta: "#5eead4",
            tag: "#6ee7b7",
            attribute: "#a7f3d0",
            qualifier: "#fde047",
            builtin: "#fb923c",
            bracket: "#d9fbe8",
        }),
    }),
    arctic: Object.freeze({
        dark: Object.freeze({
            plain: "#eaf6ff",
            keyword: "#7dd3fc",
            atom: "#93c5fd",
            number: "#67e8f9",
            def: "#bfdbfe",
            variable: "#eaf6ff",
            "variable-2": "#5eead4",
            "variable-3": "#a5f3fc",
            property: "#bae6fd",
            operator: "#38bdf8",
            comment: "#95acbc",
            string: "#a5f3fc",
            "string-2": "#67e8f9",
            meta: "#93c5fd",
            tag: "#7dd3fc",
            attribute: "#bae6fd",
            qualifier: "#5eead4",
            builtin: "#60a5fa",
            bracket: "#dceeff",
        }),
        light: Object.freeze({
            plain: "#1a2f40",
            keyword: "#0369a1",
            atom: "#2563eb",
            number: "#0e7490",
            def: "#1d4ed8",
            variable: "#1a2f40",
            "variable-2": "#0f766e",
            "variable-3": "#155e75",
            property: "#0284c7",
            operator: "#0891b2",
            comment: "#6a8292",
            string: "#0f766e",
            "string-2": "#0e7490",
            meta: "#2563eb",
            tag: "#0369a1",
            attribute: "#0284c7",
            qualifier: "#0f766e",
            builtin: "#1d4ed8",
            bracket: "#26495e",
        }),
        purple: Object.freeze({
            plain: "#edf7ff",
            keyword: "#a5f3fc",
            atom: "#bfdbfe",
            number: "#67e8f9",
            def: "#dbeafe",
            variable: "#edf7ff",
            "variable-2": "#99f6e4",
            "variable-3": "#bae6fd",
            property: "#dbeafe",
            operator: "#7dd3fc",
            comment: "#a6bccb",
            string: "#cffafe",
            "string-2": "#a5f3fc",
            meta: "#bfdbfe",
            tag: "#bae6fd",
            attribute: "#dbeafe",
            qualifier: "#99f6e4",
            builtin: "#93c5fd",
            bracket: "#e0eeff",
        }),
    }),
});

function buildSyntaxPaletteVariant(basePalette, overrides = {}) {
    const buildSurface = (surface) => Object.freeze({
        ...(basePalette?.[surface] || {}),
        ...(overrides?.[surface] || {}),
    });
    return Object.freeze({
        dark: buildSurface("dark"),
        light: buildSurface("light"),
        purple: buildSurface("purple"),
    });
}

const SYNTAX_THEME_SURFACES = Object.freeze(["dark", "light", "purple"]);

function clampUnit(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
}

function parseHexColor(value = "") {
    const raw = String(value || "").trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
    return {
        r: Number.parseInt(raw.slice(0, 2), 16),
        g: Number.parseInt(raw.slice(2, 4), 16),
        b: Number.parseInt(raw.slice(4, 6), 16),
    };
}

function rgbToHex(color = {}) {
    const toHex = (channel) => Math.round(clampUnit(channel, 0, 255)).toString(16).padStart(2, "0");
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function mixHexColors(baseHex = "#000000", mixHex = "#000000", amount = 0) {
    const base = parseHexColor(baseHex);
    const mix = parseHexColor(mixHex);
    if (!base || !mix) return baseHex;
    const weight = clampUnit(amount, 0, 1);
    return rgbToHex({
        r: base.r + (mix.r - base.r) * weight,
        g: base.g + (mix.g - base.g) * weight,
        b: base.b + (mix.b - base.b) * weight,
    });
}

function rgbToHsl(color = {}) {
    const r = clampUnit(color.r, 0, 255) / 255;
    const g = clampUnit(color.g, 0, 255) / 255;
    const b = clampUnit(color.b, 0, 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (delta > 0) {
        s = delta / (1 - Math.abs(2 * l - 1));
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: s * 100, l: l * 100 };
}

function hslToRgb(color = {}) {
    const h = ((Number(color.h) % 360) + 360) % 360;
    const s = clampUnit(color.s, 0, 100) / 100;
    const l = clampUnit(color.l, 0, 100) / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - chroma / 2;
    let rPrime = 0;
    let gPrime = 0;
    let bPrime = 0;
    if (h < 60) {
        rPrime = chroma;
        gPrime = x;
    } else if (h < 120) {
        rPrime = x;
        gPrime = chroma;
    } else if (h < 180) {
        gPrime = chroma;
        bPrime = x;
    } else if (h < 240) {
        gPrime = x;
        bPrime = chroma;
    } else if (h < 300) {
        rPrime = x;
        bPrime = chroma;
    } else {
        rPrime = chroma;
        bPrime = x;
    }
    return {
        r: (rPrime + m) * 255,
        g: (gPrime + m) * 255,
        b: (bPrime + m) * 255,
    };
}

function nudgeHexColor(hex = "#ffffff", attempt = 0) {
    const rgb = parseHexColor(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb);
    const shift = 26 + attempt * 14;
    const next = {
        h: hsl.h + shift,
        s: hsl.s + (attempt % 2 === 0 ? 7 : -5),
        l: hsl.l + (attempt % 2 === 0 ? 8 : -8),
    };
    return rgbToHex(hslToRgb(next));
}

function colorDistance(hexA = "", hexB = "") {
    const a = parseHexColor(hexA);
    const b = parseHexColor(hexB);
    if (!a || !b) return 0;
    const dr = a.r - b.r;
    const dg = a.g - b.g;
    const db = a.b - b.b;
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function ensureDistinctRoleColors(input = {}) {
    const next = { ...input };
    const threshold = 72;
    SYNTAX_ROLE_KEYS.forEach((role, index) => {
        let color = next[role];
        if (!parseHexColor(color)) return;
        for (let attempt = 0; attempt < 8; attempt += 1) {
            let minDistance = Number.POSITIVE_INFINITY;
            for (let i = 0; i < index; i += 1) {
                const previous = next[SYNTAX_ROLE_KEYS[i]];
                if (!parseHexColor(previous)) continue;
                minDistance = Math.min(minDistance, colorDistance(color, previous));
            }
            if (minDistance >= threshold) break;
            color = nudgeHexColor(color, attempt);
        }
        next[role] = color;
    });
    return next;
}

function buildConfiguredSyntaxThemeIdentity(themeName = "", palette = {}) {
    const normalizedTheme = String(themeName || "").trim().toLowerCase();
    const baseRoles = EDITOR_SYNTAX_THEME_ROLE_COLORS[normalizedTheme];
    if (!baseRoles) return deriveSyntaxThemeIdentity(palette);
    const identity = {};
    const mixRules = SYNTAX_THEME_MIX_OVERRIDES[normalizedTheme] || SYNTAX_SURFACE_MIX_RULES;
    SYNTAX_THEME_SURFACES.forEach((surface) => {
        const mixRule = mixRules[surface] || mixRules.dark || SYNTAX_SURFACE_MIX_RULES.dark;
        const surfaceRoles = {
            primary: mixHexColors(baseRoles.primary, mixRule.mix, mixRule.chroma),
            secondary: mixHexColors(baseRoles.secondary, mixRule.mix, mixRule.chroma),
            accent: mixHexColors(baseRoles.accent, mixRule.mix, mixRule.chroma),
            support: mixHexColors(baseRoles.support, mixRule.mix, mixRule.chroma),
            neutral: mixHexColors(baseRoles.neutral, mixRule.mix, mixRule.neutral),
        };
        identity[surface] = ensureDistinctRoleColors(surfaceRoles);
    });
    return identity;
}

function pickSyntaxColor(surfacePalette = {}, keys = [], fallback = "#c9d1d9") {
    for (const key of keys) {
        const value = surfacePalette?.[key];
        if (typeof value === "string" && value.trim()) {
            return value;
        }
    }
    return fallback;
}

function deriveSyntaxThemeIdentity(palette = {}) {
    const identity = {};
    SYNTAX_THEME_SURFACES.forEach((surface) => {
        const surfacePalette = palette?.[surface] || {};
        const primary = pickSyntaxColor(surfacePalette, ["keyword", "operator", "tag"]);
        const secondary = pickSyntaxColor(surfacePalette, ["atom", "def", "property", "attribute"], primary);
        const accent = pickSyntaxColor(surfacePalette, ["number", "builtin"], secondary || primary);
        const support = pickSyntaxColor(surfacePalette, ["string", "string-2", "qualifier", "variable-3"], accent || secondary || primary);
        const neutral = pickSyntaxColor(surfacePalette, ["comment", "meta"], primary);
        identity[surface] = { primary, secondary, accent, support, neutral };
    });
    return identity;
}

function normalizeSyntaxThemePalette(palette = {}, identity = deriveSyntaxThemeIdentity(palette)) {
    const buildSurface = (surface) => {
        const base = { ...(palette?.[surface] || {}) };
        const tokens = identity?.[surface] || {};
        const primary = tokens.primary || base.keyword || base.operator || base.tag || "#79c0ff";
        const secondary = tokens.secondary || base.atom || base.def || base.property || base.attribute || primary;
        const accent = tokens.accent || base.number || base.builtin || secondary;
        const support = tokens.support || base.string || base["string-2"] || base.qualifier || base["variable-3"] || accent;
        const neutral = tokens.neutral || base.comment || base.meta || primary;
        return Object.freeze({
            ...base,
            keyword: primary,
            operator: primary,
            tag: primary,
            atom: secondary,
            def: secondary,
            property: secondary,
            attribute: secondary,
            number: accent,
            builtin: accent,
            string: support,
            "string-2": support,
            qualifier: support,
            "variable-3": support,
            comment: neutral,
            meta: neutral,
        });
    };
    return Object.freeze({
        dark: buildSurface("dark"),
        light: buildSurface("light"),
        purple: buildSurface("purple"),
    });
}

const EDITOR_SYNTAX_THEME_ADDITIONS = Object.freeze({
    obsidian: buildSyntaxPaletteVariant(EDITOR_SYNTAX_THEME_PALETTES.arctic, {
        dark: { keyword: "#a1a1aa", atom: "#a78bfa", operator: "#e5e7eb", comment: "#71717a", string: "#d4d4d8" },
        light: { keyword: "#52525b", atom: "#6d28d9", operator: "#334155", comment: "#6b7280", string: "#475569" },
        purple: { keyword: "#d4d4d8", atom: "#c4b5fd", operator: "#e4e4e7", comment: "#9ca3af", string: "#ddd6fe" },
    }),
    royal: buildSyntaxPaletteVariant(EDITOR_SYNTAX_THEME_PALETTES.twilight, {
        dark: { keyword: "#a78bfa", atom: "#818cf8", operator: "#c4b5fd", comment: "#9588b8", string: "#c7d2fe" },
        light: { keyword: "#5b21b6", atom: "#4338ca", operator: "#6d28d9", comment: "#7a6ca0", string: "#4f46e5" },
        purple: { keyword: "#ddd6fe", atom: "#c4b5fd", operator: "#ede9fe", comment: "#b0a0d2", string: "#c7d2fe" },
    }),
    glacier: buildSyntaxPaletteVariant(EDITOR_SYNTAX_THEME_PALETTES.arctic, {
        dark: { keyword: "#a5f3fc", atom: "#bfdbfe", operator: "#7dd3fc", comment: "#8fa8b7", string: "#cffafe" },
        light: { keyword: "#0891b2", atom: "#1d4ed8", operator: "#0284c7", comment: "#6a8291", string: "#0e7490" },
        purple: { keyword: "#bae6fd", atom: "#dbeafe", operator: "#93c5fd", comment: "#a5bccb", string: "#e0f2fe" },
    }),
    retro: buildSyntaxPaletteVariant(EDITOR_SYNTAX_THEME_PALETTES.arctic, {
        dark: {
            keyword: "#d90429",
            atom: "#0051ba",
            number: "#ffd500",
            string: "#009b48",
            comment: "#d8dee4",
            "variable-2": "#0051ba",
            bracket: "#e5e7eb",
        },
        light: {
            keyword: "#b00020",
            atom: "#003f8a",
            number: "#c9a500",
            string: "#00753a",
            comment: "#77808a",
            "variable-2": "#003f8a",
            bracket: "#5b6470",
        },
        purple: {
            keyword: "#e22145",
            atom: "#2b6ed6",
            number: "#ffd93a",
            string: "#1dac5f",
            comment: "#9ea8b4",
            "variable-2": "#2b6ed6",
            bracket: "#c7ced8",
        },
    }),
    temple: buildSyntaxPaletteVariant(EDITOR_SYNTAX_THEME_PALETTES.arctic, {
        dark: {
            keyword: "#1f4fff",
            atom: "#00a9ff",
            number: "#d9a100",
            string: "#fff6db",
            comment: "#7d8eb2",
            operator: "#3f66ff",
            "variable-2": "#2f53da",
            bracket: "#e9edff",
        },
        light: {
            keyword: "#1b3ec2",
            atom: "#006fae",
            number: "#9b6f00",
            string: "#6d5310",
            comment: "#6b7897",
            operator: "#2c50d1",
            "variable-2": "#1f3ec2",
            bracket: "#1f2d5a",
        },
        purple: {
            keyword: "#4d79ff",
            atom: "#38c3ff",
            number: "#f2bf32",
            string: "#fff1c2",
            comment: "#9caccc",
            operator: "#7091ff",
            "variable-2": "#5e7cff",
            bracket: "#dde6ff",
        },
    }),
});

const EDITOR_RAW_SYNTAX_THEME_SOURCE = Object.freeze({
    ...EDITOR_SYNTAX_THEME_PALETTES,
    ...EDITOR_SYNTAX_THEME_ADDITIONS,
});

const EDITOR_SYNTAX_THEME_SOURCE_BY_NAME = Object.freeze({
    default: "dark",
    dark: "obsidian",
    light: "glacier",
    purple: "royal",
    retro: "retro",
    temple: "temple",
    midnight: "twilight",
    ocean: "deepsea",
    forest: "aurora",
    graphite: "obsidian",
    sunset: "solarflare",
});

const EDITOR_RAW_SYNTAX_THEME_PALETTES = Object.freeze(
    Object.fromEntries(
        EDITOR_SYNTAX_THEME_NAMES.map((themeName) => {
            const sourceName = EDITOR_SYNTAX_THEME_SOURCE_BY_NAME[themeName] || themeName;
            const palette = EDITOR_RAW_SYNTAX_THEME_SOURCE[sourceName] || EDITOR_RAW_SYNTAX_THEME_SOURCE[DEFAULT_EDITOR_SYNTAX_THEME];
            return [themeName, palette];
        })
    )
);

const EDITOR_ALL_SYNTAX_THEME_PALETTES = Object.freeze({
    ...Object.fromEntries(
        Object.entries(EDITOR_RAW_SYNTAX_THEME_PALETTES).map(([themeName, palette]) => {
            const identity = buildConfiguredSyntaxThemeIdentity(themeName, palette);
            return [themeName, normalizeSyntaxThemePalette(palette, identity)];
        })
    ),
});

let pendingDeleteUndo = null;
let pendingDeleteUndoTimer = null;
let quickOpenOpen = false;
let quickOpenQuery = "";
let quickOpenResults = [];
let quickOpenIndex = 0;
let promptDialogOpen = false;
let promptDialogState = null;
let promptDialogSecondaryButton = null;
let promptDialogSecondaryDisarmTimer = null;
let commandPaletteOpen = false;
let topCommandPaletteOpen = false;
let commandPaletteQuery = "";
let commandPaletteResults = [];
let commandPaletteIndex = 0;
let shortcutHelpOpen = false;
let lessonStatsOpen = false;
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
let symbolSourceCacheKey = "";
let symbolSourceCache = [];
let symbolSourceCachePromise = null;
let editorScopeSyncFrame = null;
let editorScopeRequestId = 0;
let editorMirrorLastOpen = false;
let editorMirrorLastFileId = "";
let editorMirrorLastSavedCode = null;
let editorMirrorLastCurrentCode = null;
let editorSplitScrollHost = null;
let editorSplitScrollSyncLock = false;
let editorSplitMirrorScrollHandler = null;
let editorSplitHostScrollHandler = null;
let editorSplitScrollSyncFrame = 0;
let editorBottomComfortSyncFrame = null;
let editorBottomComfortObserver = null;
let editorBottomComfortLastPx = -1;
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
let filesGutterSyncFrame = null;
let filesGutterLastWidth = -1;
let filesGutterLastClientWidth = -1;
let filesGutterLastValue = -1;
let layoutResizeSyncFrame = null;
let lastRenderedActiveDescendantId = "";
let lastRenderedEditorTabsMarkup = null;
let lastRenderedFileListMarkup = null;
let sandboxConsoleFlushFrame = null;
let sandboxConsoleFlushTimeout = null;
let sandboxConsoleQueue = [];
let sandboxRunReadyTimer = null;
let taskRunnerEntries = [];
let taskRunnerBusy = false;
let devTerminalUI = null;
let devTerminalBusy = false;
let devTerminalHistory = [];
let devTerminalHistoryIndex = -1;
let consoleInputHistory = [];
let consoleInputHistoryIndex = -1;
let consoleInputBusy = false;
let consoleEvalRequestId = 0;
let pendingConsoleEvalRequestId = 0;
let consoleFilterText = "";
let consoleFilterLevels = { system: true, info: true, warn: true, error: true, log: true };
let lastRuntimeJumpTarget = null;
let consoleViewMode = "console";
let toolsTabMode = "task-runner";
let toolsProblemsOpen = true;
let editorAutosaveTimer = null;
let persistenceWritesLocked = false;
let editorCompletionOpen = false;
let editorCompletionItems = [];
let editorCompletionIndex = 0;
let editorCompletionRange = null;
let editorCompletionGhost = null;
let editorSignatureHintSyncFrame = null;
let editorSignatureHintRequestId = 0;
let suppressEditorCompletionOnNextChange = false;
let suppressHtmlTagRenameChange = false;
let snippetSession = null;
let snippetRegistry = [...DEFAULT_SNIPPETS];
let fileCodeHistory = {};
let selectedHistoryEntryId = null;
let editorSettings = { ...EDITOR_PROFILES.balanced, profile: "balanced" };
let fileHistory = [];
let fileHistoryIndex = -1;
let historyDepth = 0;
const games = normalizeGames(GAMES);
const applications = normalizeApplications(APPLICATIONS);
const lessons = normalizeLessons(LESSONS);
const LESSON_XP_PER_CHAR = 1;
const LESSON_XP_STEP_COMPLETE = 12;
const LESSON_XP_LESSON_COMPLETE = 80;
const LESSON_XP_PERFECT_BONUS = 30;
const LESSON_BYTES_STEP_COMPLETE = 2;
const LESSON_BYTES_LESSON_COMPLETE = 15;
const LESSON_BYTES_PERFECT_BONUS = 5;
const LESSON_BYTES_STREAK_MILESTONE = 3;
const LESSON_BYTES_STREAK_INTERVAL = 20;
const THEME_BYTE_COSTS = Object.freeze({
    dark: 0,
    light: 120,
    purple: 180,
    retro: 220,
    temple: 260,
    midnight: 300,
    ocean: 320,
    forest: 340,
    graphite: 360,
    sunset: 400,
});
let selectedGameId = games[0]?.id ?? "";
let gamesSelectorOpen = false;
let selectedApplicationId = applications[0]?.id ?? "";
let applicationsSelectorOpen = false;
let selectedLessonId = lessons[0]?.id ?? "";
let lessonsSelectorOpen = false;
let lessonSession = null;
let lessonProfileDirtyWrites = 0;
let lessonSessionDirtyWrites = 0;
let lessonHudBurstTimer = 0;
let lessonHudLastTier = "none";
let lessonHudLastMood = "focus";
let lessonHudLastProgressBucket = -1;
let lessonHudLastStepKey = "";
let lessonHudLastRenderKey = "";
let lessonHudWasActive = false;
let lessonShopRenderKey = "";
let lessonHeaderStatsRenderKey = "";
let lessonEditorLevelUpTimer = 0;
let lessonStatsLiveTimer = 0;
let lessonHeaderStatsLastSyncAt = 0;
let lessonHudPulseLastAt = 0;
let lessonHapticLastAt = 0;
let lessonStatsView = "overview";
let lessonShopNotice = "";
let lessonProfile = {
    xp: 0,
    level: 1,
    bytes: 0,
    unlockedThemes: [DEFAULT_THEME],
    totalTypedChars: 0,
    lessonsCompleted: 0,
    bestStreak: 0,
    currentStreak: 0,
    dailyStreak: 0,
    lastActiveDay: "",
};
let openFileMenu = null;
let folderMenuTargetPath = null;
let dragFileId = null;
let dragFolderPath = null;
let dragFolderHoverPath = null;
let dragFileIds = [];
let dragFolderPaths = [];
let dragFilesSectionId = null;
let dragFilesSectionDropId = null;
let dragFilesSectionDropAfter = false;
let newFileTypePreference = "auto";
let currentTheme = DEFAULT_THEME;
let layoutState = cloneLayoutState(DEFAULT_LAYOUT_STATE);
let suppressChange = false;

const stateBoundaries = createStateBoundaries({
    getProject: () => ({
        fileCount: files.length,
        folderCount: folders.length,
        trashCount: trashFiles.length,
        activeFileId,
        activeFileName: String(getActiveFile()?.name || ""),
        openTabCount: openTabIds.length,
        selectedFileCount: selectedFileIds.size,
        selectedFolderCount: selectedFolderPaths.size,
        dirtyFileCount: getDirtyFiles().length,
        canUndoFileHistory: canUndoFileHistory(),
        canRedoFileHistory: canRedoFileHistory(),
    }),
    getWorkspace: () => ({
        theme: currentTheme,
        activeLayoutPreset: activeLayoutPresetName,
        layout: { ...layoutState },
        openPanels: {
            header: Boolean(layoutState.headerOpen),
            files: Boolean(layoutState.filesOpen),
            editor: Boolean(layoutState.editorOpen),
            sandbox: Boolean(layoutState.sandboxOpen),
            log: Boolean(layoutState.logOpen),
            tools: Boolean(layoutState.toolsOpen),
            footer: Boolean(layoutState.footerOpen),
        },
    }),
    getRuntime: () => ({
        runCount,
        hasRunToken: Boolean(currentToken),
        currentRunToken: currentToken || null,
        runContextId: currentRunContext?.id || null,
        inspectEnabled,
        debugMode,
        runnerFullscreen,
        sandboxPopoutOpen: isSandboxWindowOpen(),
        taskRunnerBusy,
    }),
});

function getStateBoundariesSnapshot() {
    return stateBoundaries.snapshot();
}

function getStateBoundary(name) {
    return stateBoundaries.snapshotBoundary(name);
}

const UI_ZOOM_DEFAULT = 100;
const UI_ZOOM_STEP = 10;
const UI_ZOOM_MIN = 70;
const UI_ZOOM_MAX = 160;
let uiZoomPercent = UI_ZOOM_DEFAULT;

function normalizeUiZoom(value) {
    const numeric = Number.parseInt(String(value ?? UI_ZOOM_DEFAULT), 10);
    if (!Number.isFinite(numeric)) return UI_ZOOM_DEFAULT;
    return clamp(numeric, UI_ZOOM_MIN, UI_ZOOM_MAX);
}

function applyUiZoom(value, { persist = true, announce = false, syncLayout = true, source = "manual" } = {}) {
    const previous = uiZoomPercent;
    const next = normalizeUiZoom(value);
    uiZoomPercent = next;
    const zoomScale = Math.max(0.01, next / 100);
    const zoomViewportRatio = Math.max(0.01, 1 / zoomScale);
    const inverseHeight = 100 / zoomScale;
    const inverseWidth = 100 / zoomScale;
    document.documentElement.style.zoom = `${next}%`;
    document.documentElement.style.setProperty("--ui-zoom-viewport-ratio", String(zoomViewportRatio));
    if (el.appShell) {
        el.appShell.style.width = `${inverseWidth}dvw`;
        el.appShell.style.minWidth = `${inverseWidth}dvw`;
        el.appShell.style.height = `${inverseHeight}dvh`;
        el.appShell.style.minHeight = `${inverseHeight}dvh`;
    }
    if (syncLayout) {
        normalizeLayoutWidths();
        applyLayout();
        syncLayoutControls();
    }
    if (persist) {
        save(STORAGE.UI_ZOOM, String(next));
    }
    syncFooterRuntimeStatus();
    if (typeof window !== "undefined" && window.dispatchEvent && next !== previous) {
        window.dispatchEvent(new CustomEvent("fazide:ui-zoom-changed", {
            detail: {
                previous,
                next,
                source,
            },
        }));
    }
    if (announce) {
        status.set(`Zoom ${next}%`);
    }
    return next;
}

function adjustUiZoom(delta, options = {}) {
    return applyUiZoom(uiZoomPercent + Number(delta || 0), options);
}

function resetUiZoom(options = {}) {
    return applyUiZoom(UI_ZOOM_DEFAULT, options);
}

function loadUiZoom() {
    const raw = load(STORAGE.UI_ZOOM);
    if (!raw) {
        return applyUiZoom(UI_ZOOM_DEFAULT, { persist: false, syncLayout: false, source: "boot" });
    }
    return applyUiZoom(raw, { persist: false, syncLayout: false, source: "boot" });
}

const debouncedFileFilterRender = createDebouncedTask(() => renderFileList(), FILE_FILTER_RENDER_DEBOUNCE_MS);
const debouncedProjectSearchScan = createDebouncedTask(() => {
    if (!projectSearchOpen) return;
    runProjectSearchScan();
}, PROJECT_SEARCH_SCAN_DEBOUNCE_MS);

const RESIZE_SNAP_STEP = 8;
const PANEL_REFLOW_ANIMATION_MS = 180;
const PANEL_REFLOW_ANIMATION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const PANEL_REFLOW_CLEANUP_BUFFER_MS = 96;
const WORKSPACE_ROW_MIN_HEIGHT = 72;
const LAYOUT_COLUMN_COUNT = 3;
const LAYOUT_EDITOR_ROW_MAX_COLUMNS = 2;
const LAYOUT_NON_EDITOR_ROW_MAX_SHARE = 0.9;
const PANEL_REDUCED_MOTION_QUERY = typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
const EDITOR_SOFT_MIN_WIDTH = 240;
const LOG_PANEL_MIN_WIDTH = 180;
const FILES_PANEL_MIN_WIDTH = 180;
const SANDBOX_PANEL_MIN_WIDTH = 180;
const TOOLS_PANEL_MIN_WIDTH = 180;
const PANEL_MIN_WIDTH_FLOOR = 96;
const PANEL_MIN_WIDTH_EDITOR_FLOOR = 128;
const PANEL_MIN_WIDTH_HARD_FLOOR = 64;
const PANEL_MIN_WIDTH_EDITOR_HARD_FLOOR = 96;
const PANEL_RATIO_MIN = 0.08;
const PANEL_RATIO_MAX = 0.92;
const BOTTOM_RATIO_MIN = 0.12;
const BOTTOM_RATIO_MAX = 0.88;
let rowGuide = null;
let colGuide = null;
let panelReflowFrame = null;
const panelReflowCleanupMap = new WeakMap();

function makeRunContext() {
    return createRunContext(runCount);
}

function loadLayout(raw = load(STORAGE.LAYOUT)) {
    if (!raw) return sanitizeLayoutState(layoutState);

    try {
        const parsed = JSON.parse(raw);
        return sanitizeLayoutState(parsed);
    } catch (err) {
        console.warn("FAZ IDE: invalid layout store", err);
        return sanitizeLayoutState(layoutState);
    }
}

function persistLayout() {
    // Persist only layout UI state (not code) so refresh keeps user preferences.
    const snapshot = {
        ...layoutState,
        panelRatios: buildPanelRatioSnapshot(layoutState),
    };
    layoutState.panelRatios = snapshot.panelRatios;
    const value = JSON.stringify(snapshot);
    const ok = saveBatchAtomic([
        { key: STORAGE.LAYOUT, value },
    ], { label: "layout-state" });
    if (!ok) {
        save(STORAGE.LAYOUT, value);
    }
}

function getPanelRow(panel) {
    const rows = layoutState.panelRows;
    if (rows?.top?.includes(panel)) return "top";
    if (rows?.bottom?.includes(panel)) return "bottom";
    return "top";
}

function getPanelRowFromRows(rows, panel) {
    if (rows?.top?.includes(panel)) return "top";
    if (rows?.bottom?.includes(panel)) return "bottom";
    return "top";
}

function normalizeSizeRatio(value, { min = PANEL_RATIO_MIN, max = PANEL_RATIO_MAX, fallback = 0.25 } = {}) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return clamp(numeric, min, max);
}

function resolvePanelRatioRowWidth(rowName) {
    const rowEl = rowName === "bottom" ? el.workspaceBottom : el.workspaceTop;
    const rowWidth = rowEl?.getBoundingClientRect?.().width;
    if (Number.isFinite(rowWidth) && rowWidth > 0) return rowWidth;
    const workspaceWidth = el.workspace?.getBoundingClientRect?.().width;
    if (Number.isFinite(workspaceWidth) && workspaceWidth > 0) return workspaceWidth;
    return window.innerWidth;
}

function resolveWorkspaceHeightForRatios() {
    const workspaceHeight = el.workspace?.getBoundingClientRect?.().height;
    if (Number.isFinite(workspaceHeight) && workspaceHeight > 0) return workspaceHeight;
    return window.innerHeight;
}

function buildPanelRatioSnapshot(state = layoutState) {
    const rows = normalizePanelRows(state?.panelRows || layoutState.panelRows);
    const rowTopWidth = resolvePanelRatioRowWidth("top");
    const rowBottomWidth = resolvePanelRatioRowWidth("bottom");
    const workspaceHeight = resolveWorkspaceHeightForRatios();
    const ratioFor = (panel, width) => {
        const rowName = getPanelRowFromRows(rows, panel);
        const rowWidth = rowName === "bottom" ? rowBottomWidth : rowTopWidth;
        if (!Number.isFinite(rowWidth) || rowWidth <= 0) return 0.25;
        return normalizeSizeRatio(width / rowWidth, { fallback: 0.25 });
    };

    return {
        logWidth: ratioFor("log", Number(state?.logWidth) || layoutState.logWidth),
        sidebarWidth: ratioFor("files", Number(state?.sidebarWidth) || layoutState.sidebarWidth),
        sandboxWidth: ratioFor("sandbox", Number(state?.sandboxWidth) || layoutState.sandboxWidth),
        toolsWidth: ratioFor("tools", Number(state?.toolsWidth) || layoutState.toolsWidth),
        bottomHeight: normalizeSizeRatio(
            (Number(state?.bottomHeight) || layoutState.bottomHeight) / Math.max(1, workspaceHeight),
            { min: BOTTOM_RATIO_MIN, max: BOTTOM_RATIO_MAX, fallback: 0.35 }
        ),
    };
}

function normalizePanelRatios(rawRatios, fallbackState) {
    const fallback = buildPanelRatioSnapshot(fallbackState || layoutState);
    const source = rawRatios && typeof rawRatios === "object" ? rawRatios : fallback;
    return {
        logWidth: normalizeSizeRatio(source.logWidth, { fallback: fallback.logWidth }),
        sidebarWidth: normalizeSizeRatio(source.sidebarWidth, { fallback: fallback.sidebarWidth }),
        sandboxWidth: normalizeSizeRatio(source.sandboxWidth, { fallback: fallback.sandboxWidth }),
        toolsWidth: normalizeSizeRatio(source.toolsWidth, { fallback: fallback.toolsWidth }),
        bottomHeight: normalizeSizeRatio(source.bottomHeight, {
            min: BOTTOM_RATIO_MIN,
            max: BOTTOM_RATIO_MAX,
            fallback: fallback.bottomHeight,
        }),
    };
}

function setPanelRows(rows, { syncModel = true } = {}) {
    const normalized = normalizePanelRows(rows);
    layoutState.panelRows = normalized;
    if (syncModel) {
        syncPanelLayoutFromRows();
    }
    return normalized;
}

function syncPanelRowsFromLayoutModel() {
    const rows = panelLayoutToRows(layoutState.panelLayout);
    return setPanelRows(rows, { syncModel: false });
}

function syncPanelLayoutFromRows() {
    layoutState.panelLayout = normalizePanelLayout(rowsToPanelLayout(layoutState.panelRows), {
        fallbackRows: layoutState.panelRows,
    });
    layoutState.panelRatios = buildPanelRatioSnapshot(layoutState);
    return layoutState.panelLayout;
}

function rowHasOpenPanels(row) {
    const order = layoutState.panelRows?.[row] || [];
    return order.some((name) => isPanelOpen(name));
}

function countOpenPanelsInRow(rows, row) {
    const order = Array.isArray(rows?.[row]) ? rows[row] : [];
    return order.reduce((total, panel) => total + (isPanelOpen(panel) ? 1 : 0), 0);
}

function pickOverflowPanel(rows, rowName, preservePanel = null) {
    const order = Array.isArray(rows?.[rowName]) ? rows[rowName] : [];
    const reversed = [...order].reverse();
    const preferred = reversed.find((panel) => isPanelOpen(panel) && panel !== "editor" && panel !== preservePanel);
    if (preferred) return preferred;
    const fallback = reversed.find((panel) => isPanelOpen(panel) && panel !== preservePanel);
    if (fallback) return fallback;
    return reversed.find((panel) => isPanelOpen(panel)) || null;
}

function solveDockingRows(rows, {
    preferredRow = null,
    preservePanel = null,
    widthFit = true,
} = {}) {
    const bounds = getLayoutBounds();
    return solvePanelRows({
        rows,
        normalizeRows: normalizePanelRows,
        isPanelOpen,
        rowWidthByName: {
            top: getRowWidth("top"),
            bottom: getRowWidth("bottom"),
        },
        panelGap: layoutState.panelGap || 0,
        getPanelMinWidth(panel) {
            return getPanelMinWidthForRowFit(panel, bounds);
        },
        maxOpenPerRow: LAYOUT_COLUMN_COUNT,
        preferredRow,
        preservePanel,
        widthFit,
    });
}

function enforceDockingRowCaps(rows, { preferredRow = null, preservePanel = null } = {}) {
    return solveDockingRows(rows, { preferredRow, preservePanel, widthFit: false });
}

function getPanelMinWidthForRowFit(panel, bounds) {
    if (panel === "editor") {
        return getAdaptivePanelMinimums().editorMin;
    }
    if (panel === "log") return bounds.logWidth.min;
    if (panel === "files") return bounds.sidebar.min;
    if (panel === "sandbox") return bounds.sandboxWidth.min;
    if (panel === "tools") return bounds.toolsWidth.min;
    return 0;
}

function getAdaptivePanelMinimums() {
    const workspaceWidth = el.workspace?.getBoundingClientRect().width || window.innerWidth || 0;
    const gap = layoutState.panelGap || 0;
    const zoom = normalizeUiZoom(uiZoomPercent);
    const zoomScale = Math.min(1, 100 / zoom);

    const threeColumnGap = Math.max(0, (LAYOUT_COLUMN_COUNT - 1) * 2) * gap;
    const threeColumnBudget = Math.floor((Math.max(0, workspaceWidth - threeColumnGap)) / LAYOUT_COLUMN_COUNT);
    const twoColumnBudget = Math.floor((Math.max(0, workspaceWidth - (2 * gap))) / 2);

    const scaledPanelMin = Math.round(FILES_PANEL_MIN_WIDTH * zoomScale);
    const scaledEditorMin = Math.round(EDITOR_SOFT_MIN_WIDTH * zoomScale);

    let panelMin = clamp(
        Math.min(FILES_PANEL_MIN_WIDTH, scaledPanelMin, threeColumnBudget || FILES_PANEL_MIN_WIDTH),
        PANEL_MIN_WIDTH_FLOOR,
        FILES_PANEL_MIN_WIDTH
    );
    let editorMin = clamp(
        Math.min(EDITOR_SOFT_MIN_WIDTH, scaledEditorMin, twoColumnBudget || EDITOR_SOFT_MIN_WIDTH),
        PANEL_MIN_WIDTH_EDITOR_FLOOR,
        EDITOR_SOFT_MIN_WIDTH
    );

    const editorRowBudget = Math.max(0, Math.floor(workspaceWidth - (4 * gap)));
    if (editorRowBudget > 0) {
        const currentRequired = (2 * panelMin) + editorMin;
        if (currentRequired > editorRowBudget) {
            const scale = editorRowBudget / Math.max(1, currentRequired);
            panelMin = Math.max(PANEL_MIN_WIDTH_HARD_FLOOR, Math.floor(panelMin * scale));
            editorMin = Math.max(PANEL_MIN_WIDTH_EDITOR_HARD_FLOOR, Math.floor(editorMin * scale));

            let guard = 0;
            while (((2 * panelMin) + editorMin) > editorRowBudget && guard < 128) {
                if (panelMin > PANEL_MIN_WIDTH_HARD_FLOOR) {
                    panelMin -= 1;
                }
                if (((2 * panelMin) + editorMin) > editorRowBudget && editorMin > PANEL_MIN_WIDTH_EDITOR_HARD_FLOOR) {
                    editorMin -= 1;
                }
                if (panelMin <= PANEL_MIN_WIDTH_HARD_FLOOR && editorMin <= PANEL_MIN_WIDTH_EDITOR_HARD_FLOOR) {
                    break;
                }
                guard += 1;
            }
        }
    }

    const maxPanelForEditorRow = Math.floor((Math.max(0, workspaceWidth - editorMin - (4 * gap))) / 2);
    panelMin = clamp(Math.min(panelMin, maxPanelForEditorRow || panelMin), PANEL_MIN_WIDTH_HARD_FLOOR, FILES_PANEL_MIN_WIDTH);

    const maxEditorForEditorRow = Math.floor(Math.max(0, workspaceWidth - (2 * panelMin) - (4 * gap)));
    editorMin = clamp(Math.min(editorMin, maxEditorForEditorRow || editorMin), PANEL_MIN_WIDTH_EDITOR_HARD_FLOOR, EDITOR_SOFT_MIN_WIDTH);

    return { panelMin, editorMin };
}

function syncAdaptivePanelMinimumStyles() {
    if (!el.appShell) return;
    const mins = getAdaptivePanelMinimums();
    el.appShell.style.setProperty("--panel-min-width", `${mins.panelMin}px`);
    el.appShell.style.setProperty("--panel-min-width-editor", `${mins.editorMin}px`);
}

function enforceDockingRowWidthFit(rows) {
    return solveDockingRows(rows, { widthFit: true });
}

function applyPanelOrder() {
    let rows = enforceDockingRowCaps(layoutState.panelRows);
    rows = enforceDockingRowWidthFit(rows);
    rows = enforceDockingRowCaps(rows);
    rows = setPanelRows(rows);
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

function applyLayout({ animatePanels = false } = {}) {
    // Single place to update DOM based on layout state.
    const enablePanelAnimation = animatePanels && shouldAnimatePanelReflow();
    const previousRects = enablePanelAnimation ? capturePanelRectsForReflow() : null;
    syncAdaptivePanelMinimumStyles();
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
    setAriaHidden(el.logPanel, !layoutState.logOpen);
    setAriaHidden(el.editorPanel, !layoutState.editorOpen);
    setAriaHidden(el.side, !layoutState.filesOpen);
    setAriaHidden(el.sandboxPanel, !layoutState.sandboxOpen);
    setAriaHidden(el.toolsPanel, !layoutState.toolsOpen);
    if (el.workspaceBottom) {
        const bottomOpen = rowHasOpenPanels("bottom");
        el.workspaceBottom.style.display = bottomOpen ? "" : "none";
    }
    if (el.splitRow) {
        const bottomOpen = rowHasOpenPanels("bottom");
        el.splitRow.style.display = bottomOpen ? "" : "none";
    }
    const header = document.querySelector(".top");
    if (header) setAriaHidden(header, !layoutState.headerOpen);
    const footer = document.querySelector(".foot");
    if (footer) setAriaHidden(footer, !layoutState.footerOpen);
    if (document.documentElement) {
        document.documentElement.style.setProperty("--radius", `${layoutState.panelRadius}px`);
        document.documentElement.style.setProperty("--radius-sm", `${Math.max(0, Math.round(layoutState.panelRadius * 0.8))}px`);
    }
    applyFilesLayout();
    applyPanelOrder();
    if (enablePanelAnimation) {
        animatePanelReflow(previousRects);
    }
    syncPanelToggles();
    syncQuickBar();
    syncLayoutControls();
    queueEditorBottomComfortSync();
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function snapDimension(value, min, max, { enabled = true, step = RESIZE_SNAP_STEP } = {}) {
    const clamped = clamp(value, min, max);
    if (!enabled) return clamped;
    const safeStep = Math.max(1, Number(step) || RESIZE_SNAP_STEP);
    const snapped = Math.round(clamped / safeStep) * safeStep;
    return clamp(snapped, min, max);
}

function shouldAnimatePanelReflow() {
    if (document.body?.hasAttribute("data-resize")) return false;
    if (!layoutState.panelReflowAnimation) return false;
    if (PANEL_REDUCED_MOTION_QUERY?.matches) return false;
    return true;
}

function getDockZoneMagnetDistance() {
    const bounds = getLayoutBounds().dockMagnet;
    return clamp(
        Number(layoutState.dockMagnetDistance || DEFAULT_DOCK_ZONE_MAGNET_DISTANCE),
        bounds.min,
        bounds.max
    );
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

function applyTheme(theme, { persist = true, source = "ui" } = {}) {
    const normalizedTheme = normalizeTheme(theme, THEMES, DEFAULT_THEME);
    if (!isThemeUnlocked(normalizedTheme)) {
        if (source !== "boot") {
            const cost = getThemeByteCost(normalizedTheme);
            setLessonShopNotice(`${getThemeDisplayLabel(normalizedTheme)} requires ${cost} Bytes.`);
            openLessonStats({ view: "shop" });
            status.set(`Theme locked: ${getThemeDisplayLabel(normalizedTheme)} (${cost} Bytes)`);
        }
        return currentTheme;
    }
    currentTheme = applyThemeState(normalizedTheme, {
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
    const matchedSyntaxTheme = normalizeEditorSyntaxTheme(EDITOR_SYNTAX_THEME_BY_UI_THEME[currentTheme]);
    if (normalizeEditorSyntaxTheme(editorSettings?.syntaxTheme) !== matchedSyntaxTheme) {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, syntaxTheme: matchedSyntaxTheme });
        if (persist) persistEditorSettings();
    }
    if (el.editorSyntaxThemeSelect) {
        el.editorSyntaxThemeSelect.value = matchedSyntaxTheme;
    }
    applyEditorSyntaxTheme();
    editor.refresh?.();
    syncSandboxTheme();
    updateLessonShopUi();
    return currentTheme;
}

function getSupportedThemeUsage() {
    return THEMES.join("|");
}

function getThemeDisplayLabel(themeName = "") {
    const key = String(themeName || "").trim().toLowerCase();
    if (!key) return "Theme";
    return key.charAt(0).toUpperCase() + key.slice(1);
}

function renderHeaderThemeSelectOptions() {
    const select = el.themeSelect;
    if (!select) return;
    const preferred = normalizeTheme(select.value || currentTheme || DEFAULT_THEME);
    const fragment = document.createDocumentFragment();
    THEMES.forEach((themeName) => {
        const option = document.createElement("option");
        option.value = themeName;
        const unlocked = isThemeUnlocked(themeName);
        option.textContent = unlocked
            ? getThemeDisplayLabel(themeName)
            : `${getThemeDisplayLabel(themeName)} • ${getThemeByteCost(themeName)} Bytes`;
        fragment.appendChild(option);
    });
    select.innerHTML = "";
    select.appendChild(fragment);
    select.value = preferred;
}

function applyFilesLayout() {
    if (el.filesPanel) {
        el.filesPanel.setAttribute("data-filters", layoutState.filesFiltersOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-games", layoutState.filesGamesOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-apps", layoutState.filesAppsOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-lessons", layoutState.filesLessonsOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-open-editors", layoutState.filesOpenEditorsOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-files-list", layoutState.filesListOpen ? "open" : "closed");
        el.filesPanel.setAttribute("data-trash", layoutState.filesTrashOpen ? "open" : "closed");
    }
    if (el.filesToolbar) {
        el.filesToolbar.setAttribute("aria-hidden", layoutState.filesFiltersOpen ? "false" : "true");
    }
    syncGamesUI();
    syncApplicationsUI();
    syncLessonsUI();
    queueFilesColumnGutterSync();
}

function setFilesFiltersOpen(open) {
    layoutState.filesFiltersOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
}

function getFilesSectionOrder() {
    return normalizeFilesSectionOrder(layoutState.filesSectionOrder);
}

function setFilesSectionOrder(order, { persist = true, render = true } = {}) {
    const nextOrder = normalizeFilesSectionOrder(order);
    const currentOrder = getFilesSectionOrder();
    const changed = nextOrder.length !== currentOrder.length
        || nextOrder.some((name, index) => name !== currentOrder[index]);
    if (!changed) return false;
    layoutState.filesSectionOrder = nextOrder;
    if (persist) persistLayout();
    if (render) renderFileList();
    return true;
}

function moveFilesSection(sourceId, targetId, { placeAfter = false } = {}) {
    if (!FILES_REORDERABLE_SECTIONS.has(sourceId) || !FILES_REORDERABLE_SECTIONS.has(targetId)) {
        return false;
    }
    if (sourceId === targetId) return false;
    const order = getFilesSectionOrder();
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return false;
    order.splice(sourceIndex, 1);
    const nextTargetIndex = order.indexOf(targetId);
    const insertIndex = placeAfter ? nextTargetIndex + 1 : nextTargetIndex;
    order.splice(Math.max(0, insertIndex), 0, sourceId);
    return setFilesSectionOrder(order, { persist: true, render: true });
}

function setFilesGamesOpen(open) {
    layoutState.filesGamesOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
    renderFileList();
}

function setFilesAppsOpen(open) {
    layoutState.filesAppsOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
    renderFileList();
}

function setFilesLessonsOpen(open) {
    layoutState.filesLessonsOpen = Boolean(open);
    applyFilesLayout();
    persistLayout();
    renderFileList();
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

function syncFilesColumnGutter() {
    if (!el.filesPanel || !el.fileList) return;
    const width = el.fileList.offsetWidth || 0;
    const clientWidth = el.fileList.clientWidth || 0;
    if (width === filesGutterLastWidth && clientWidth === filesGutterLastClientWidth) return;
    filesGutterLastWidth = width;
    filesGutterLastClientWidth = clientWidth;
    const gutter = Math.max(0, width - clientWidth);
    if (gutter === filesGutterLastValue) return;
    filesGutterLastValue = gutter;
    el.filesPanel.style.setProperty("--files-column-gutter", `${gutter}px`);
}

function queueFilesColumnGutterSync() {
    if (filesGutterSyncFrame != null) return;
    filesGutterSyncFrame = scheduleFrame(() => {
        filesGutterSyncFrame = null;
        syncFilesColumnGutter();
    });
}

function queueLayoutResizeSync() {
    if (layoutResizeSyncFrame != null) return;
    layoutResizeSyncFrame = scheduleFrame(() => {
        layoutResizeSyncFrame = null;
        normalizeLayoutWidths();
        syncLayoutControls();
        queueFilesColumnGutterSync();
        queueEditorBottomComfortSync();
    });
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

function getPanelElement(name) {
    if (name === "log") return el.logPanel;
    if (name === "editor") return el.editorPanel;
    if (name === "files") return el.side;
    if (name === "sandbox") return el.sandboxPanel;
    if (name === "tools") return el.toolsPanel;
    return null;
}

function capturePanelRectsForReflow() {
    const map = new Map();
    ["log", "editor", "files", "sandbox", "tools"].forEach((name) => {
        const panel = getPanelElement(name);
        if (!panel || !panel.isConnected) return;
        if (panel.classList.contains("panel-drag-source")) return;
        map.set(name, panel.getBoundingClientRect());
    });
    return map;
}

function clearPanelReflowAnimation(panel) {
    if (!panel) return;
    const active = panelReflowCleanupMap.get(panel);
    if (active) {
        panel.removeEventListener("transitionend", active.onEnd);
        clearTimeout(active.timeoutId);
        panelReflowCleanupMap.delete(panel);
    }
    panel.style.transition = "";
    panel.style.transform = "";
    panel.style.willChange = "";
    panel.removeAttribute("data-panel-reflow");
}

function animatePanelReflow(previousRects) {
    if (!(previousRects instanceof Map) || previousRects.size === 0) return;
    if (!shouldAnimatePanelReflow()) return;
    if (panelReflowFrame != null) {
        cancelAnimationFrame(panelReflowFrame);
        panelReflowFrame = null;
    }
    panelReflowFrame = requestAnimationFrame(() => {
        panelReflowFrame = null;
        previousRects.forEach((previousRect, panelName) => {
            const panel = getPanelElement(panelName);
            if (!panel || !panel.isConnected) return;
            if (panel.classList.contains("panel-drag-source")) return;
            if (panel.offsetParent === null) return;
            clearPanelReflowAnimation(panel);
            const nextRect = panel.getBoundingClientRect();
            const deltaX = previousRect.left - nextRect.left;
            const deltaY = previousRect.top - nextRect.top;
            if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

            panel.style.transition = "none";
            panel.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            panel.style.willChange = "transform";
            panel.setAttribute("data-panel-reflow", "true");
            if (typeof window !== "undefined") {
                const previous = window.__fazideLastPanelReflow;
                const existingPanels = Array.isArray(previous?.panels) ? previous.panels : [];
                const nextPanels = [...new Set([...existingPanels, panelName])];
                window.__fazideLastPanelReflow = {
                    at: Date.now(),
                    panels: nextPanels,
                };
            }
            panel.getBoundingClientRect();
            panel.style.transition = `transform ${PANEL_REFLOW_ANIMATION_MS}ms ${PANEL_REFLOW_ANIMATION_EASING}`;
            panel.style.transform = "";
            const cleanup = () => {
                clearPanelReflowAnimation(panel);
            };
            const onEnd = (event) => {
                if (event.target !== panel || event.propertyName !== "transform") return;
                cleanup();
            };
            const timeoutId = window.setTimeout(cleanup, PANEL_REFLOW_ANIMATION_MS + PANEL_REFLOW_CLEANUP_BUFFER_MS);
            panelReflowCleanupMap.set(panel, { onEnd, timeoutId });
            panel.addEventListener("transitionend", onEnd);
        });
    });
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
    const mins = getAdaptivePanelMinimums();
    const panelMin = mins.panelMin;
    const maxSidebar = Math.min(1400, Math.max(panelMin + 120, workspaceRect.width * 0.85));
    const minSidebar = Math.min(maxSidebar, panelMin);
    const maxLog = Math.min(1600, Math.max(panelMin + 120, workspaceRect.width * 0.9));
    const minLog = Math.min(maxLog, panelMin);
    const maxSandbox = Math.min(1600, Math.max(panelMin + 120, workspaceRect.width * 0.9));
    const minSandbox = Math.min(maxSandbox, panelMin);
    const maxTools = Math.min(1600, Math.max(panelMin + 120, workspaceRect.width * 0.9));
    const minTools = Math.min(maxTools, panelMin);
    const maxBottom = Math.max(160, Math.round(workspaceRect.height * 0.7));
    return {
        logWidth: { min: minLog, max: maxLog },
        sidebar: { min: minSidebar, max: maxSidebar },
        sandboxWidth: { min: minSandbox, max: maxSandbox },
        toolsWidth: { min: minTools, max: maxTools },
        panelGap: { min: 0, max: 24 },
        cornerRadius: { min: 0, max: 24 },
        bottomHeight: { min: WORKSPACE_ROW_MIN_HEIGHT, max: maxBottom },
        dockMagnet: { min: 32, max: 220 },
    };
}

function getOpenPanelsInRow(row) {
    const list = layoutState.panelRows?.[row] || [];
    return list.filter((name) => isPanelOpen(name));
}

function getRowColumnCap(panel, row) {
    if (!row) return Infinity;
    const openPanels = getOpenPanelsInRow(row);
    if (!openPanels.includes(panel)) return Infinity;
    const rowWidth = getRowWidth(row);
    if (!Number.isFinite(rowWidth) || rowWidth <= 0) return Infinity;
    const gapCount = Math.max(0, openPanels.length - 1) * 2;
    const gapTotal = gapCount * (layoutState.panelGap || 0);
    const usable = Math.max(0, rowWidth - gapTotal);
    if (!usable) return Infinity;
    if (openPanels.length <= 1) return usable;
    if (openPanels.includes("editor")) {
        return Math.round((usable * LAYOUT_EDITOR_ROW_MAX_COLUMNS) / LAYOUT_COLUMN_COUNT);
    }
    return Math.round(usable * LAYOUT_NON_EDITOR_ROW_MAX_SHARE);
}

function getRowWidth(row) {
    const node = row === "bottom" ? el.workspaceBottom : el.workspaceTop;
    return node?.getBoundingClientRect().width || el.workspace?.getBoundingClientRect().width || window.innerWidth;
}

function getEditorMinWidth(row) {
    if (!row) return 0;
    if (!getOpenPanelsInRow(row).includes("editor")) return 0;
    return getAdaptivePanelMinimums().editorMin;
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
    const columnCap = getRowColumnCap(panel, row);
    const hardMax = Math.min(baseBounds.max, maxByRow, columnCap);
    const max = Math.max(baseBounds.min, hardMax);
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
    const offset = clamp(Math.round(y - workspaceRect.top), 0, Math.max(0, Math.round(workspaceRect.height)));
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
    const maxOffset = Math.max(0, Math.round(workspaceRect.width));
    const leftOffset = clamp(Math.round(leftX - workspaceRect.left), 0, maxOffset);
    guide.style.left = `${leftOffset}px`;
    guide.style.top = "0px";
    guide.style.bottom = "0px";
    guide.setAttribute("data-active", "true");
}

function hideColGuide() {
    if (!colGuide) return;
    colGuide.style.left = "";
    colGuide.style.top = "";
    colGuide.style.bottom = "";
    colGuide.removeAttribute("data-active");
}

function showColGuideForPanels(leftEl, rightEl) {
    const leftRect = leftEl?.getBoundingClientRect() || null;
    const rightRect = rightEl?.getBoundingClientRect() || null;
    const workspaceRect = el.workspace?.getBoundingClientRect?.() || null;
    const applyVerticalSpan = (guide) => {
        if (!guide || !workspaceRect || (!leftRect && !rightRect)) return;
        const top = Math.min(
            Number.isFinite(leftRect?.top) ? leftRect.top : rightRect.top,
            Number.isFinite(rightRect?.top) ? rightRect.top : leftRect.top
        );
        const bottom = Math.max(
            Number.isFinite(leftRect?.bottom) ? leftRect.bottom : rightRect.bottom,
            Number.isFinite(rightRect?.bottom) ? rightRect.bottom : leftRect.bottom
        );
        const clampedTop = clamp(Math.round(top - workspaceRect.top), 0, Math.round(workspaceRect.height));
        const clampedBottom = clamp(Math.round(bottom - workspaceRect.top), clampedTop, Math.round(workspaceRect.height));
        guide.style.top = `${clampedTop}px`;
        guide.style.bottom = `${Math.max(0, Math.round(workspaceRect.height) - clampedBottom)}px`;
    };

    if (leftRect && rightRect) {
        showColGuideAt(leftRect.right, rightRect.left);
        applyVerticalSpan(colGuide);
        return;
    }
    if (leftRect) {
        showColGuideAt(leftRect.right);
        applyVerticalSpan(colGuide);
        return;
    }
    if (rightRect) {
        showColGuideAt(rightRect.left);
        applyVerticalSpan(colGuide);
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
    const hasExplicitPanelRows = state.panelRows !== undefined || Array.isArray(state.panelOrder);
    const normalizedPanelLayout = hasExplicitPanelRows
        ? normalizePanelLayout(rowsToPanelLayout(normalizedRows), { fallbackRows: normalizedRows })
        : normalizePanelLayout(state.panelLayout, { fallbackRows: normalizedRows });
    const rowsFromLayoutModel = normalizePanelRows(panelLayoutToRows(normalizedPanelLayout));

    const next = {
        ...layoutState,
        ...state,
        panelRows: rowsFromLayoutModel,
        panelLayout: normalizedPanelLayout,
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
    next.filesAppsOpen = state.filesAppsOpen !== undefined ? Boolean(state.filesAppsOpen) : layoutState.filesAppsOpen;
    next.filesLessonsOpen = state.filesLessonsOpen !== undefined ? Boolean(state.filesLessonsOpen) : layoutState.filesLessonsOpen;
    next.filesOpenEditorsOpen = state.filesOpenEditorsOpen !== undefined
        ? Boolean(state.filesOpenEditorsOpen)
        : layoutState.filesOpenEditorsOpen;
    next.filesListOpen = state.filesListOpen !== undefined
        ? Boolean(state.filesListOpen)
        : layoutState.filesListOpen;
    next.filesTrashOpen = state.filesTrashOpen !== undefined
        ? Boolean(state.filesTrashOpen)
        : layoutState.filesTrashOpen;
    next.filesSectionOrder = normalizeFilesSectionOrder(state.filesSectionOrder ?? layoutState.filesSectionOrder);

    const fallbackWidth = safeNumber(state.outputWidth, null);
    const baseLogWidth = clamp(safeNumber(state.logWidth ?? fallbackWidth, layoutState.logWidth), bounds.logWidth.min, bounds.logWidth.max);
    const baseSidebarWidth = clamp(safeNumber(state.sidebarWidth, layoutState.sidebarWidth), bounds.sidebar.min, bounds.sidebar.max);
    const baseSandboxWidth = clamp(safeNumber(state.sandboxWidth ?? fallbackWidth, layoutState.sandboxWidth), bounds.sandboxWidth.min, bounds.sandboxWidth.max);
    const baseToolsWidth = clamp(safeNumber(state.toolsWidth, layoutState.toolsWidth), bounds.toolsWidth.min, bounds.toolsWidth.max);
    const baseBottomHeight = clamp(safeNumber(state.bottomHeight, layoutState.bottomHeight), bounds.bottomHeight.min, bounds.bottomHeight.max);

    next.logWidth = baseLogWidth;
    next.sidebarWidth = baseSidebarWidth;
    next.sandboxWidth = baseSandboxWidth;
    next.toolsWidth = baseToolsWidth;
    next.bottomHeight = baseBottomHeight;

    const fallbackForRatios = {
        ...next,
        logWidth: baseLogWidth,
        sidebarWidth: baseSidebarWidth,
        sandboxWidth: baseSandboxWidth,
        toolsWidth: baseToolsWidth,
        bottomHeight: baseBottomHeight,
    };
    const ratios = normalizePanelRatios(state.panelRatios, fallbackForRatios);
    next.panelRatios = ratios;

    const rowFor = (panel) => getPanelRowFromRows(next.panelRows, panel);
    const widthFor = (panel, ratioKey) => {
        const rowName = rowFor(panel);
        const rowWidth = resolvePanelRatioRowWidth(rowName);
        return Math.round(rowWidth * ratios[ratioKey]);
    };
    const workspaceHeight = resolveWorkspaceHeightForRatios();

    next.logWidth = clamp(widthFor("log", "logWidth"), bounds.logWidth.min, bounds.logWidth.max);
    next.sidebarWidth = clamp(widthFor("files", "sidebarWidth"), bounds.sidebar.min, bounds.sidebar.max);
    next.sandboxWidth = clamp(widthFor("sandbox", "sandboxWidth"), bounds.sandboxWidth.min, bounds.sandboxWidth.max);
    next.toolsWidth = clamp(widthFor("tools", "toolsWidth"), bounds.toolsWidth.min, bounds.toolsWidth.max);
    next.bottomHeight = clamp(Math.round(workspaceHeight * ratios.bottomHeight), bounds.bottomHeight.min, bounds.bottomHeight.max);

    next.panelGap = clamp(safeNumber(state.panelGap, layoutState.panelGap), bounds.panelGap.min, bounds.panelGap.max);
    next.panelRadius = clamp(safeNumber(state.panelRadius, layoutState.panelRadius), bounds.cornerRadius.min, bounds.cornerRadius.max);
    next.dockMagnetDistance = clamp(
        safeNumber(state.dockMagnetDistance, layoutState.dockMagnetDistance),
        bounds.dockMagnet.min,
        bounds.dockMagnet.max
    );
    next.panelReflowAnimation = state.panelReflowAnimation !== undefined
        ? Boolean(state.panelReflowAnimation)
        : layoutState.panelReflowAnimation;
    return next;
}

function normalizeRowWidths(row) {
    const openPanels = getOpenPanelsInRow(row);
    if (!openPanels.length) return;
    const buildItems = () => openPanels
        .map((name) => {
            const control = getWidthControl(name);
            if (!control) return null;
            const bounds = getLayoutBounds()[control.boundsKey];
            const effective = getEffectiveBounds(name, row, bounds);
            return { name, control, bounds, effective };
        })
        .filter(Boolean);

    let items = buildItems();
    if (!items.length) return;

    items.forEach((item) => {
        const current = item.control.get();
        const next = clamp(current, item.effective.min, item.effective.max);
        if (next !== current) {
            item.control.set(next);
        }
    });

    items = buildItems();
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
                const min = item.effective.min;
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
    const minTop = rowHasOpenPanels("top") ? WORKSPACE_ROW_MIN_HEIGHT : 0;
    const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
    const next = clamp(layoutState.bottomHeight, bounds.min, maxBottom);
    if (next !== layoutState.bottomHeight) {
        setBottomHeight(next);
    }
}

function normalizeLayoutWidths() {
    syncPanelRowsFromLayoutModel();
    const rows = enforceDockingRowWidthFit(enforceDockingRowCaps(layoutState.panelRows));
    setPanelRows(rows);
    normalizeRowWidths("top");
    normalizeRowWidths("bottom");
    normalizeBottomHeight();
}

function commitLayoutResize() {
    normalizeLayoutWidths();
    applyLayout();
    persistLayout();
}

function setLayoutPanelOpen(open) {
    if (!el.layoutPanel || !el.layoutBackdrop) return;
    setOpenStateAttributes(el.layoutPanel, open);
    setOpenStateAttributes(el.layoutBackdrop, open);
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
    if (el.layoutRowLog) el.layoutRowLog.value = getPanelRow("log");
    if (el.layoutOrderEditor) el.layoutOrderEditor.value = String(idx("editor"));
    if (el.layoutRowEditor) el.layoutRowEditor.value = getPanelRow("editor");
    if (el.layoutOrderFiles) el.layoutOrderFiles.value = String(idx("files"));
    if (el.layoutRowFiles) el.layoutRowFiles.value = getPanelRow("files");
    if (el.layoutOrderSandbox) el.layoutOrderSandbox.value = String(idx("sandbox"));
    if (el.layoutRowSandbox) el.layoutRowSandbox.value = getPanelRow("sandbox");
    if (el.layoutOrderTools) el.layoutOrderTools.value = String(idx("tools"));
    if (el.layoutRowTools) el.layoutRowTools.value = getPanelRow("tools");
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
    if (el.layoutBottomHeight) {
        el.layoutBottomHeight.min = bounds.bottomHeight.min;
        el.layoutBottomHeight.max = bounds.bottomHeight.max;
        el.layoutBottomHeight.value = layoutState.bottomHeight;
    }
    if (el.layoutBottomHeightInput) {
        el.layoutBottomHeightInput.min = bounds.bottomHeight.min;
        el.layoutBottomHeightInput.max = bounds.bottomHeight.max;
        el.layoutBottomHeightInput.value = layoutState.bottomHeight;
    }
    if (el.layoutDockMagnet) {
        el.layoutDockMagnet.min = bounds.dockMagnet.min;
        el.layoutDockMagnet.max = bounds.dockMagnet.max;
        el.layoutDockMagnet.value = layoutState.dockMagnetDistance;
    }
    if (el.layoutDockMagnetInput) {
        el.layoutDockMagnetInput.min = bounds.dockMagnet.min;
        el.layoutDockMagnetInput.max = bounds.dockMagnet.max;
        el.layoutDockMagnetInput.value = layoutState.dockMagnetDistance;
    }
    if (el.layoutPanelAnimation) {
        el.layoutPanelAnimation.checked = layoutState.panelReflowAnimation;
    }

    if (el.layoutLogWidth) el.layoutLogWidth.disabled = !layoutState.logOpen;
    if (el.layoutLogWidthInput) el.layoutLogWidthInput.disabled = !layoutState.logOpen;
    if (el.layoutOrderLog) el.layoutOrderLog.disabled = !layoutState.logOpen;
    if (el.layoutRowLog) el.layoutRowLog.disabled = !layoutState.logOpen;
    if (el.layoutSidebarWidth) el.layoutSidebarWidth.disabled = !layoutState.filesOpen;
    if (el.layoutSidebarWidthInput) el.layoutSidebarWidthInput.disabled = !layoutState.filesOpen;
    if (el.layoutOrderFiles) el.layoutOrderFiles.disabled = !layoutState.filesOpen;
    if (el.layoutRowFiles) el.layoutRowFiles.disabled = !layoutState.filesOpen;
    if (el.layoutOrderEditor) el.layoutOrderEditor.disabled = !layoutState.editorOpen;
    if (el.layoutRowEditor) el.layoutRowEditor.disabled = !layoutState.editorOpen;
    if (el.layoutSandboxWidth) el.layoutSandboxWidth.disabled = !layoutState.sandboxOpen || isSandboxWindowOpen();
    if (el.layoutSandboxWidthInput) el.layoutSandboxWidthInput.disabled = !layoutState.sandboxOpen || isSandboxWindowOpen();
    if (el.layoutOrderSandbox) el.layoutOrderSandbox.disabled = !layoutState.sandboxOpen;
    if (el.layoutRowSandbox) el.layoutRowSandbox.disabled = !layoutState.sandboxOpen;
    if (el.layoutToolsWidth) el.layoutToolsWidth.disabled = !layoutState.toolsOpen;
    if (el.layoutToolsWidthInput) el.layoutToolsWidthInput.disabled = !layoutState.toolsOpen;
    if (el.layoutOrderTools) el.layoutOrderTools.disabled = !layoutState.toolsOpen;
    if (el.layoutRowTools) el.layoutRowTools.disabled = !layoutState.toolsOpen;
    if (el.layoutBottomHeight) el.layoutBottomHeight.disabled = !rowHasOpenPanels("bottom");
    if (el.layoutBottomHeightInput) el.layoutBottomHeightInput.disabled = !rowHasOpenPanels("bottom");
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
        syncEditorStatusBar();
        syncLessonStateForActiveFile();
        queueEditorScopeTrailSync();
        queueEditorSignatureHintSync();
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
    syncEditorStatusBar();
    syncLessonStateForActiveFile();
    queueEditorScopeTrailSync();
    queueEditorSignatureHintSync();
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
        const backend = getStorageBackendInfo();
        pushDiag("info", `Storage backend: ${backend.kind}${backend.indexedDbAvailable ? " (IndexedDB available)" : ""}.`);
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
        ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
    });

    window.addEventListener("fazide:clipboard-error", (event) => {
        const detail = event.detail || {};
        pushDiag("warn", detail.reason || "Clipboard blocked.");
        ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
    });

    window.addEventListener("fazide:storage-journal-commit", (event) => {
        const detail = event.detail || {};
        setHealth(health.storage, "ok", "Storage: OK");
        pushDiag("info", `Storage journal committed (${detail.entryCount || 0} entries).`);
    });

    window.addEventListener("fazide:storage-journal-recovered", (event) => {
        const detail = event.detail || {};
        setHealth(health.storage, "warn", "Storage: Recovered");
        pushDiag("warn", `Recovered pending storage journal (${detail.entryCount || 0} entries).`);
        ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
    });

    window.addEventListener("fazide:ui-zoom-changed", (event) => {
        const detail = event.detail || {};
        if (detail.source === "boot") return;
        const next = normalizeUiZoom(detail.next);
        if (next >= 140 || next <= 80) {
            pushDiag("warn", `UI zoom set to ${next}% (extreme scale).`);
            return;
        }
        pushDiag("info", `UI zoom set to ${next}%.`);
    });
}

function normalizeConsoleView(next = "") {
    return String(next || "").trim().toLowerCase() === "terminal" ? "terminal" : "console";
}

function ensureConsoleTabs() {
    const logBody = el.logPanel?.querySelector(".card-bd");
    if (!logBody || !el.log) return null;

    let tabs = logBody.querySelector("#consoleTabs");
    if (!tabs) {
        tabs = document.createElement("div");
        tabs.id = "consoleTabs";
        tabs.className = "console-tabs";
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Console views");
        tabs.innerHTML = `
            <button id="consoleTabConsole" type="button" class="console-tab" role="tab" data-console-view="console" aria-controls="consoleLogView" aria-selected="true">Console</button>
            <button id="consoleTabTerminal" type="button" class="console-tab" role="tab" data-console-view="terminal" aria-controls="consoleTerminalView" aria-selected="false">Terminal</button>
        `;
    }

    let logView = logBody.querySelector("#consoleLogView");
    if (!logView) {
        logView = document.createElement("section");
        logView.id = "consoleLogView";
        logView.className = "console-view console-view-log";
        logView.setAttribute("role", "tabpanel");
        logView.setAttribute("aria-labelledby", "consoleTabConsole");
        logView.setAttribute("aria-hidden", "false");
    }

    let consoleSurface = logView.querySelector("#consoleSurface");
    if (!consoleSurface) {
        consoleSurface = document.createElement("div");
        consoleSurface.id = "consoleSurface";
        consoleSurface.className = "console-surface";
    }
    if (!consoleSurface.contains(el.log)) {
        consoleSurface.appendChild(el.log);
    }

    let consoleFilterBar = consoleSurface.querySelector("#consoleFilterBar");
    if (!consoleFilterBar) {
        consoleFilterBar = document.createElement("div");
        consoleFilterBar.id = "consoleFilterBar";
        consoleFilterBar.className = "console-filter-bar";
        consoleFilterBar.innerHTML = `
            <div class="console-filter-levels" role="group" aria-label="Console level filters">
                <button id="consoleFilterAll" class="console-filter-toggle" type="button" data-console-filter-all="true">All</button>
                <button class="console-filter-toggle" type="button" data-console-filter-level="system" aria-pressed="true">System</button>
                <button class="console-filter-toggle" type="button" data-console-filter-level="info" aria-pressed="true">Info</button>
                <button class="console-filter-toggle" type="button" data-console-filter-level="warn" aria-pressed="true">Warn</button>
                <button class="console-filter-toggle" type="button" data-console-filter-level="error" aria-pressed="true">Error</button>
            </div>
            <label class="sr-only" for="consoleFilterInput">Filter console text</label>
            <input id="consoleFilterInput" class="console-filter-input" type="search" autocomplete="off" spellcheck="false" placeholder="Filter logs..." />
            <button id="consoleJumpLastError" class="console-filter-jump" type="button" disabled>Last Error</button>
        `;
    }
    if (!consoleSurface.contains(consoleFilterBar)) {
        consoleSurface.insertBefore(consoleFilterBar, el.log);
    }

    let consoleInputShell = consoleSurface.querySelector("#consoleInputShell");
    if (!consoleInputShell) {
        consoleInputShell = document.createElement("div");
        consoleInputShell.id = "consoleInputShell";
        consoleInputShell.className = "console-input-shell";
        consoleInputShell.setAttribute("role", "group");
        consoleInputShell.setAttribute("aria-label", "Console input");
        consoleInputShell.innerHTML = `
            <span class="console-input-prompt" aria-hidden="true">FAZ\\IDE ></span>
            <label class="sr-only" for="consoleInput">Console expression</label>
            <textarea id="consoleInput" rows="1" autocomplete="off" spellcheck="false" placeholder="Type JavaScript • Enter to run • Shift+Enter newline"></textarea>
        `;
    }
    if (!consoleSurface.contains(consoleInputShell)) {
        consoleSurface.appendChild(consoleInputShell);
    }

    if (!logView.contains(consoleSurface)) {
        logView.appendChild(consoleSurface);
    }

    let terminalView = logBody.querySelector("#consoleTerminalView");
    if (!terminalView) {
        terminalView = document.createElement("section");
        terminalView.id = "consoleTerminalView";
        terminalView.className = "console-view console-terminal-view";
        terminalView.setAttribute("role", "tabpanel");
        terminalView.setAttribute("aria-labelledby", "consoleTabTerminal");
        terminalView.setAttribute("aria-hidden", "true");
        terminalView.hidden = true;
    }

    if (tabs.parentElement !== logBody) {
        logBody.insertBefore(tabs, logBody.firstChild);
    }
    if (logView.parentElement !== logBody) {
        logBody.appendChild(logView);
    }
    if (terminalView.parentElement !== logBody) {
        logBody.appendChild(terminalView);
    }

    return {
        tabs,
        logView,
        terminalView,
        btnConsole: tabs.querySelector("#consoleTabConsole"),
        btnTerminal: tabs.querySelector("#consoleTabTerminal"),
        consoleSurface,
        consoleFilterBar,
        consoleFilterInput: consoleFilterBar.querySelector("#consoleFilterInput"),
        consoleFilterAll: consoleFilterBar.querySelector("#consoleFilterAll"),
        consoleJumpLastError: consoleFilterBar.querySelector("#consoleJumpLastError"),
        consoleInputShell,
        consoleInput: consoleInputShell.querySelector("#consoleInput"),
    };
}

function setConsoleView(next = "console", { focus = false } = {}) {
    const ui = ensureConsoleTabs();
    if (!ui?.btnConsole || !ui?.btnTerminal || !ui?.logView || !ui?.terminalView) return false;

    const view = normalizeConsoleView(next);
    const consoleActive = view === "console";
    consoleViewMode = view;

    if (el.logPanel) {
        el.logPanel.dataset.consoleView = view;
    }

    setTabActiveState(ui.btnConsole, consoleActive);
    setTabActiveState(ui.btnTerminal, !consoleActive);

    setVisibilityState(ui.logView, consoleActive);
    setVisibilityState(ui.terminalView, !consoleActive);

    if (el.btnCopyLog) {
        el.btnCopyLog.hidden = !consoleActive;
        el.btnCopyLog.disabled = !consoleActive;
    }
    if (el.btnClearLog) {
        el.btnClearLog.hidden = !consoleActive;
        el.btnClearLog.disabled = !consoleActive;
    }

    if (focus) {
        requestAnimationFrame(() => {
            if (consoleActive) {
                autosizeConsoleInput(ui.consoleInput);
                ui.consoleInput?.focus();
                return;
            }
            const terminalUi = ensureDevTerminalPanel();
            terminalUi?.input?.focus();
        });
    }
    return true;
}

function wireConsoleTabs() {
    const ui = ensureConsoleTabs();
    if (!ui?.tabs) return;
    if (ui.tabs.dataset.wired === "true") {
        setConsoleView(consoleViewMode);
        return;
    }
    ui.tabs.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-console-view]");
        if (!btn) return;
        setConsoleView(btn.dataset.consoleView, { focus: true });
    });
    ui.tabs.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = normalizeConsoleView(consoleViewMode === "console" ? "terminal" : "console");
        setConsoleView(next, { focus: true });
    });
    ui.tabs.dataset.wired = "true";
    setConsoleView(consoleViewMode);
}

function normalizeToolsTab(next = "") {
    const value = String(next || "").trim().toLowerCase();
    if (value === "diagnostics") return "diagnostics";
    if (value === "inspect" || value === "inspector") return "inspect";
    if (value === "debug" || value === "debugger") return "debug";
    return "task-runner";
}

function ensureToolsTabs() {
    if (!el.toolsPanel) return null;
    const tabs = el.toolsPanel.querySelector("#toolsTabs");
    if (!tabs) return null;
    const tabButtons = [...tabs.querySelectorAll("[role=\"tab\"][data-tools-tab]")];
    if (!tabButtons.length) return null;
    const panelsByName = new Map([
        ["task-runner", el.taskRunnerPanel],
        ["diagnostics", document.getElementById("diagnosticsPanel")],
        ["inspect", el.inspectPanel],
        ["debug", el.debugPanel],
    ]);
    return { tabs, tabButtons, panelsByName };
}

function setToolsProblemsOpen(next, { focusToggle = false } = {}) {
    const open = Boolean(next);
    toolsProblemsOpen = open;
    if (el.toolsProblemsDock) {
        el.toolsProblemsDock.dataset.open = open ? "true" : "false";
    }
    setVisibilityState(el.problemsPanel, open, { dataOpen: true });
    if (el.toolsProblemsToggle) {
        setAriaExpanded(el.toolsProblemsToggle, open);
        el.toolsProblemsToggle.textContent = open ? "Hide Problems" : "Show Problems";
        if (focusToggle) {
            el.toolsProblemsToggle.focus();
        }
    }
}

function setToolsTab(next, { focus = false } = {}) {
    const ui = ensureToolsTabs();
    if (!ui) return false;
    const target = normalizeToolsTab(next || toolsTabMode);
    toolsTabMode = target;

    ui.tabButtons.forEach((tab) => {
        const active = normalizeToolsTab(tab.dataset.toolsTab) === target;
        setTabActiveState(tab, active);
    });

    ui.panelsByName.forEach((panel, name) => {
        if (!panel) return;
        const active = name === target;
        setVisibilityState(panel, active, { dataOpen: true });
    });

    if (focus) {
        const activeTab = ui.tabButtons.find((tab) => normalizeToolsTab(tab.dataset.toolsTab) === target);
        activeTab?.focus();
    }
    return true;
}

function wireToolsTabs() {
    const ui = ensureToolsTabs();
    if (!ui?.tabs) return;

    ui.tabButtons.forEach((tab) => {
        const tabName = normalizeToolsTab(tab.dataset.toolsTab);
        const panel = ui.panelsByName.get(tabName);
        if (!panel) return;
        if (!tab.id) {
            tab.id = `toolsTab${tabName.replace(/(^.|-.?)/g, (segment) => segment.replace("-", "").toUpperCase())}`;
        }
        panel.setAttribute("aria-labelledby", tab.id);
    });

    if (ui.tabs.dataset.wired === "true") {
        setToolsTab(toolsTabMode);
        return;
    }

    ui.tabs.addEventListener("click", (event) => {
        const tab = event.target.closest("[role=\"tab\"][data-tools-tab]");
        if (!tab) return;
        setToolsTab(tab.dataset.toolsTab, { focus: true });
    });

    ui.tabs.addEventListener("keydown", (event) => {
        const index = ui.tabButtons.findIndex((tab) => tab === document.activeElement);
        if (index === -1) return;

        let nextIndex = index;
        if (event.key === "ArrowRight") {
            nextIndex = (index + 1) % ui.tabButtons.length;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (index - 1 + ui.tabButtons.length) % ui.tabButtons.length;
        } else if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = ui.tabButtons.length - 1;
        } else {
            return;
        }

        event.preventDefault();
        setToolsTab(ui.tabButtons[nextIndex].dataset.toolsTab, { focus: true });
    });

    ui.tabs.dataset.wired = "true";
    const initial = ui.tabButtons.find((tab) => tab.getAttribute("aria-selected") === "true");
    setToolsTab(initial?.dataset.toolsTab || toolsTabMode);
}

function wireToolsProblemsDock() {
    if (!el.toolsProblemsToggle) return;
    if (el.toolsProblemsToggle.dataset.wired === "true") {
        setToolsProblemsOpen(toolsProblemsOpen);
        return;
    }
    el.toolsProblemsToggle.addEventListener("click", () => {
        setToolsProblemsOpen(!toolsProblemsOpen, { focusToggle: true });
    });
    el.toolsProblemsToggle.dataset.wired = "true";
    setToolsProblemsOpen(toolsProblemsOpen);
}

function ensureLogOpen(reason, { view = "console" } = {}) {
    if (!layoutState.logOpen) {
        setPanelOpen("log", true);
        if (reason) pushDiag("info", reason);
    }
    setConsoleView(view);
}

function ensureToolsOpen(reason, { tab = "", problems = false } = {}) {
    if (!layoutState.toolsOpen) {
        setPanelOpen("tools", true);
        if (reason) pushDiag("info", reason);
    }
    if (tab) {
        setToolsTab(tab);
    }
    if (problems) {
        setToolsProblemsOpen(true);
    }
}

function queueProblemsRender() {
    if (problemsRenderFrame != null) return;
    problemsRenderFrame = scheduleFrame(() => {
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

function clearSandboxReadyTimer() {
    if (!sandboxRunReadyTimer) return;
    clearTimeout(sandboxRunReadyTimer);
    sandboxRunReadyTimer = null;
}

function markSandboxReady() {
    clearSandboxReadyTimer();
    if (health.sandbox?.dataset?.state === "warn") {
        setHealth(health.sandbox, "ok", "Sandbox: Ready");
    }
}

function flushSandboxConsoleQueue() {
    sandboxConsoleFlushFrame = null;
    if (sandboxConsoleFlushTimeout != null) {
        clearTimeout(sandboxConsoleFlushTimeout);
        sandboxConsoleFlushTimeout = null;
    }
    if (!sandboxConsoleQueue.length) return;
    const entries = sandboxConsoleQueue.splice(0, sandboxConsoleQueue.length);
    markSandboxReady();
    ensureLogOpen("Console opened for new logs.");
    if (typeof logger.appendMany === "function") {
        logger.appendMany(entries.map((entry) => ({ type: entry.level, parts: entry.args })));
    } else {
        entries.forEach((entry) => {
            logger.append(entry.level, entry.args);
        });
    }
}

function queueSandboxConsoleLog(level = "info", args = []) {
    const normalizedLevel = normalizeProblemLevel(level);
    const normalizedArgs = Array.isArray(args) ? args : [args];
    sandboxConsoleQueue.push({ level: normalizedLevel, args: normalizedArgs });
    if (sandboxConsoleQueue.length > SANDBOX_CONSOLE_QUEUE_LIMIT) {
        sandboxConsoleQueue.splice(0, sandboxConsoleQueue.length - SANDBOX_CONSOLE_QUEUE_LIMIT);
    }
    if (sandboxConsoleFlushFrame == null) {
        sandboxConsoleFlushFrame = scheduleFrame(() => flushSandboxConsoleQueue());
    }
    if (sandboxConsoleFlushTimeout == null) {
        sandboxConsoleFlushTimeout = setTimeout(() => flushSandboxConsoleQueue(), SANDBOX_CONSOLE_FLUSH_TIMEOUT_MS);
    }
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
        syncFooterRuntimeStatus();
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
    syncFooterRuntimeStatus();
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
    ensureToolsOpen("Tools opened for problems.", { problems: true });
    editor.focus();
    return true;
}

function wireProblemsPanel() {
    renderProblemsList();
    el.btnProblemsRefresh?.addEventListener("click", async () => {
        ensureToolsOpen("Tools opened for problems.", { problems: true });
        await refreshWorkspaceProblems({ announce: true });
    });
    el.btnProblemsClear?.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for problems.", { problems: true });
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
    const rawMessage = String(message || "");
    const explicitLocation = location && location.fileId
        ? {
            fileId: location.fileId,
            fileName: location.fileName || getFileById(location.fileId)?.name || "",
            line: Math.max(0, Number(location.line) || 0),
            ch: Math.max(0, Number(location.ch) || 0),
        }
        : null;
    const inferredLocation = explicitLocation || inferTaskRunnerLocation(rawMessage);
    const entry = {
        id: `task-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`,
        at: Date.now(),
        level: normalizeProblemLevel(level),
        task: String(task || ""),
        message: truncateText(rawMessage, TASK_RUNNER_MESSAGE_MAX_CHARS),
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
    ensureToolsOpen("Tools opened for tasks.", { tab: "task-runner" });
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

function ensureDevTerminalPanel() {
    const consoleUi = ensureConsoleTabs();
    const terminalHost = consoleUi?.terminalView;
    if (!terminalHost) return null;

    if (devTerminalUI?.panel && document.contains(devTerminalUI.panel)) {
        if (!terminalHost.contains(devTerminalUI.panel)) {
            terminalHost.appendChild(devTerminalUI.panel);
        }
        return devTerminalUI;
    }

    let panel = document.getElementById("devTerminalPanel");
    if (!panel) {
        panel = document.createElement("section");
        panel.id = "devTerminalPanel";
    }
    panel.className = "diagnostics-panel dev-terminal-panel";
    panel.setAttribute("aria-live", "polite");
    if (!panel.querySelector("#devTerminalInput")) {
        panel.innerHTML = `
        <header class="diagnostics-header">
            <div>
                <p class="diagnostics-label">Dev Terminal</p>
                <p class="diagnostics-sub">Safe local command runner</p>
            </div>
            <div class="diagnostics-actions">
                <span id="devTerminalStatus" class="dev-terminal-status" data-state="safe">Safe Mode</span>
                <button id="devTerminalClear" type="button">Clear</button>
            </div>
        </header>
        <div class="dev-terminal-shell" role="group" aria-label="Dev terminal input">
            <span class="dev-terminal-prompt" aria-hidden="true">$</span>
            <label class="sr-only" for="devTerminalInput">Dev terminal command</label>
            <input id="devTerminalInput" type="text" autocomplete="off" spellcheck="false" placeholder="Type 'help' for commands..." />
            <button id="devTerminalRun" type="button">Run</button>
        </div>
        <ul id="devTerminalOutput" class="diagnostics-list dev-terminal-output" role="list"></ul>
    `;
    }
    if (!terminalHost.contains(panel)) {
        terminalHost.appendChild(panel);
    }

    devTerminalUI = {
        panel,
        status: panel.querySelector("#devTerminalStatus"),
        clear: panel.querySelector("#devTerminalClear"),
        input: panel.querySelector("#devTerminalInput"),
        run: panel.querySelector("#devTerminalRun"),
        output: panel.querySelector("#devTerminalOutput"),
    };
    return devTerminalUI;
}

function formatDevTerminalTime(timestamp = Date.now()) {
    try {
        return new Date(timestamp).toLocaleTimeString([], { hour12: false });
    } catch {
        return "--:--:--";
    }
}

function syncDevTerminalStatus() {
    const ui = ensureDevTerminalPanel();
    if (!ui?.status) return;
    ui.status.dataset.state = "safe";
    ui.status.textContent = "Safe Mode";
}

function setDevTerminalBusy(active) {
    devTerminalBusy = Boolean(active);
    const ui = ensureDevTerminalPanel();
    if (!ui) return;
    if (ui.input) ui.input.disabled = devTerminalBusy;
    if (ui.run) ui.run.disabled = devTerminalBusy;
}

function clearDevTerminalOutput() {
    const ui = ensureDevTerminalPanel();
    if (!ui?.output) return;
    ui.output.innerHTML = `<li class="diagnostics-empty">No commands yet.</li>`;
}

function appendDevTerminalEntry(level = "info", message = "", { kind = "output" } = {}) {
    const ui = ensureDevTerminalPanel();
    if (!ui?.output) return;
    const list = ui.output;
    const emptyRow = list.querySelector(".diagnostics-empty");
    if (emptyRow) {
        list.innerHTML = "";
    }
    const safeLevel = normalizeProblemLevel(level);
    const safeKind = kind === "command" ? "command" : "output";
    const row = document.createElement("li");
    row.className = "diagnostics-item dev-terminal-item";
    row.dataset.level = safeLevel;
    row.dataset.kind = safeKind;
    const safeMessage = truncateText(String(message || ""), DEV_TERMINAL_MESSAGE_MAX_CHARS);
    row.innerHTML = `
        <span class="dev-terminal-meta">${escapeHTML(formatDevTerminalTime())}</span>
        <span class="dev-terminal-text">${escapeHTML(safeMessage)}</span>
    `;
    list.appendChild(row);
    while (list.children.length > DEV_TERMINAL_OUTPUT_LIMIT) {
        list.removeChild(list.firstElementChild);
    }
    row.scrollIntoView({ block: "nearest" });
}

function parseDevTerminalArgs(input = "") {
    const source = String(input || "");
    const tokens = [];
    const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
    let match;
    while ((match = regex.exec(source)) !== null) {
        const token = match[1] ?? match[2] ?? match[3] ?? "";
        tokens.push(token.replace(/\\(["'])/g, "$1"));
    }
    return tokens;
}

function maskDevTerminalCommand(input = "") {
    return String(input || "").trim();
}

async function resetAppToFirstLaunchState() {
    persistenceWritesLocked = true;
    flushEditorAutosave();

    const keysToRemove = new Set(
        Object.values(STORAGE)
            .map((value) => String(value || "").trim())
            .filter(Boolean)
    );

    try {
        if (typeof localStorage !== "undefined") {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = String(localStorage.key(i) || "");
                if (key.startsWith("fazide.")) {
                    keysToRemove.add(key);
                }
            }
        }
    } catch {
        // no-op
    }

    let removedKeys = 0;
    keysToRemove.forEach((key) => {
        try {
            localStorage.removeItem(key);
            removedKeys += 1;
        } catch {
            // no-op
        }
    });

    let removedSessionKeys = 0;
    try {
        if (typeof sessionStorage !== "undefined") {
            const sessionKeys = [];
            for (let i = 0; i < sessionStorage.length; i += 1) {
                const key = String(sessionStorage.key(i) || "");
                if (key.startsWith("fazide.")) {
                    sessionKeys.push(key);
                }
            }
            sessionKeys.forEach((key) => {
                sessionStorage.removeItem(key);
                removedSessionKeys += 1;
            });
        }
    } catch {
        // no-op
    }

    resetAllTutorialSeenState();
    safeLocalStorageSet(TUTORIAL_FORCE_START_STORAGE_KEY, "1");

    let serviceWorkersCleared = 0;
    try {
        if (typeof navigator !== "undefined" && navigator.serviceWorker?.getRegistrations) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(async (registration) => {
                try {
                    const ok = await registration.unregister();
                    if (ok) serviceWorkersCleared += 1;
                } catch {
                    // no-op
                }
            }));
        }
    } catch {
        // no-op
    }

    let cachesCleared = 0;
    try {
        if (typeof caches !== "undefined" && typeof caches.keys === "function") {
            const names = await caches.keys();
            await Promise.all(names.map(async (name) => {
                try {
                    const ok = await caches.delete(name);
                    if (ok) cachesCleared += 1;
                } catch {
                    // no-op
                }
            }));
        }
    } catch {
        // no-op
    }

    let indexedDbCleared = 0;
    try {
        if (
            typeof indexedDB !== "undefined"
            && indexedDB
            && typeof indexedDB.databases === "function"
            && typeof indexedDB.deleteDatabase === "function"
        ) {
            const databases = await indexedDB.databases();
            await Promise.all((Array.isArray(databases) ? databases : []).map(async (entry) => {
                const name = String(entry?.name || "").trim();
                if (!name) return;
                await new Promise((resolve) => {
                    try {
                        const request = indexedDB.deleteDatabase(name);
                        request.onsuccess = () => {
                            indexedDbCleared += 1;
                            resolve();
                        };
                        request.onerror = () => resolve();
                        request.onblocked = () => resolve();
                    } catch {
                        resolve();
                    }
                });
            }));
        }
    } catch {
        // no-op
    }

    return {
        removedKeys,
        removedSessionKeys,
        serviceWorkersCleared,
        cachesCleared,
        indexedDbCleared,
    };
}

function normalizeTaskRunnerCommand(task = "") {
    const input = String(task || "").trim().toLowerCase();
    if (!input) return "";
    const map = {
        all: "run-all",
        app: "run-app",
        lint: "lint-workspace",
        format: "format-active",
        save: "save-all",
    };
    return map[input] || input;
}

function pushDevTerminalHistory(input = "") {
    const raw = String(input || "").trim();
    if (!raw) return;
    const last = devTerminalHistory[devTerminalHistory.length - 1];
    if (last !== raw) {
        devTerminalHistory = [...devTerminalHistory, raw].slice(-DEV_TERMINAL_HISTORY_LIMIT);
    }
    devTerminalHistoryIndex = devTerminalHistory.length;
}

function pushConsoleInputHistory(input = "") {
    const raw = String(input || "").trim();
    if (!raw) return;
    const last = consoleInputHistory[consoleInputHistory.length - 1];
    if (last !== raw) {
        consoleInputHistory = [...consoleInputHistory, raw].slice(-CONSOLE_INPUT_HISTORY_LIMIT);
        save(CONSOLE_INPUT_HISTORY_STORAGE_KEY, JSON.stringify(consoleInputHistory));
    }
    consoleInputHistoryIndex = consoleInputHistory.length;
}

function loadConsoleInputHistory() {
    const raw = load(CONSOLE_INPUT_HISTORY_STORAGE_KEY);
    if (!raw) {
        consoleInputHistory = [];
        consoleInputHistoryIndex = 0;
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed)
            ? parsed.map((entry) => String(entry || "").trim()).filter(Boolean)
            : [];
        consoleInputHistory = list.slice(-CONSOLE_INPUT_HISTORY_LIMIT);
        consoleInputHistoryIndex = consoleInputHistory.length;
    } catch {
        consoleInputHistory = [];
        consoleInputHistoryIndex = 0;
    }
}

function setConsoleInputValue(value = "") {
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInput) return;
    ui.consoleInput.value = String(value || "");
    autosizeConsoleInput(ui.consoleInput);
}

function clearConsoleInputValue({ focus = true } = {}) {
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInput) return false;
    ui.consoleInput.value = "";
    if (focus) ui.consoleInput.focus();
    return true;
}

function navigateConsoleInputHistory(direction = 0) {
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInput) return;
    if (!consoleInputHistory.length) return;
    const step = Number(direction) || 0;
    if (step === 0) return;
    consoleInputHistoryIndex = clamp(consoleInputHistoryIndex + step, 0, consoleInputHistory.length);
    if (consoleInputHistoryIndex >= consoleInputHistory.length) {
        ui.consoleInput.value = "";
        return;
    }
    ui.consoleInput.value = consoleInputHistory[consoleInputHistoryIndex] || "";
    ui.consoleInput.setSelectionRange(ui.consoleInput.value.length, ui.consoleInput.value.length);
    autosizeConsoleInput(ui.consoleInput);
}

function autosizeConsoleInput(inputNode) {
    if (!(inputNode instanceof HTMLTextAreaElement)) return;
    const minHeight = 24;
    if (!String(inputNode.value || "").trim()) {
        inputNode.style.height = `${minHeight}px`;
        return;
    }
    inputNode.style.height = "auto";
    const maxHeight = 120;
    inputNode.style.height = `${Math.min(maxHeight, Math.max(minHeight, inputNode.scrollHeight))}px`;
}

function setConsoleInputBusy(active) {
    consoleInputBusy = Boolean(active);
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInput) return;
    ui.consoleInput.disabled = consoleInputBusy;
    if (ui.consoleInputRun) ui.consoleInputRun.disabled = consoleInputBusy;
}

function setConsoleFilterButtonState(button, active) {
    if (!button) return;
    setAriaPressed(button, active);
    setDataActive(button, active);
}

function applyConsoleLogFilter() {
    logger.setFilter?.({
        text: consoleFilterText,
        levels: { ...consoleFilterLevels },
    });
    const ui = ensureConsoleTabs();
    if (!ui?.consoleFilterBar) return;
    const levelButtons = [...ui.consoleFilterBar.querySelectorAll("[data-console-filter-level]")];
    levelButtons.forEach((button) => {
        const key = String(button.dataset.consoleFilterLevel || "").toLowerCase();
        setConsoleFilterButtonState(button, consoleFilterLevels[key] !== false);
    });
    const allOn = Object.values(consoleFilterLevels).every(Boolean);
    setConsoleFilterButtonState(ui.consoleFilterAll, allOn);
    if (ui.consoleFilterInput && ui.consoleFilterInput.value !== consoleFilterText) {
        ui.consoleFilterInput.value = consoleFilterText;
    }
}

function updateConsoleJumpLastErrorButton() {
    const ui = ensureConsoleTabs();
    if (!ui?.consoleJumpLastError) return;
    ui.consoleJumpLastError.disabled = !lastRuntimeJumpTarget?.fileId;
}

function focusConsoleInput({ openLog = true } = {}) {
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInput) return false;
    if (openLog) {
        ensureLogOpen("Console opened.", { view: "console" });
    } else {
        setConsoleView("console");
    }
    requestAnimationFrame(() => ui.consoleInput?.focus());
    return true;
}

function requestConsoleInputEval(input = "") {
    const rawInput = String(input || "");
    const raw = rawInput.trim();
    if (!raw || consoleInputBusy) return false;

    ensureLogOpen("Console opened.", { view: "console" });
    if (!currentToken) {
        logger.append("warn", ["Run the sandbox before evaluating console input."]);
        status.set("Run required");
        return false;
    }

    if (raw.length > CONSOLE_INPUT_MAX_CHARS) {
        logger.append("warn", [`Expression too long (${raw.length}/${CONSOLE_INPUT_MAX_CHARS}).`]);
        status.set("Expression too long");
        return false;
    }

    if (raw === "help") {
        logger.append("system", ["Console commands: help, clear, cls. Shift+Enter = newline."]);
        status.set("Console help");
        return true;
    }
    if (raw === "clear" || raw === "cls") {
        logger.clear();
        logger.append("system", ["Log cleared."]);
        status.set("Ready");
        return true;
    }

    logger.append("system", [`FAZ\\IDE > ${raw}`]);
    pushConsoleInputHistory(raw);
    setConsoleInputBusy(true);
    pendingConsoleEvalRequestId = ++consoleEvalRequestId;
    sendSandboxCommand("console_eval", {
        expression: rawInput,
        requestId: pendingConsoleEvalRequestId,
    });
    status.set("Evaluating...");
    return true;
}

function applyConsoleEvalResult(payload) {
    const requestId = Number(payload?.requestId || 0);
    if (pendingConsoleEvalRequestId && requestId && requestId !== pendingConsoleEvalRequestId) {
        return;
    }
    pendingConsoleEvalRequestId = 0;
    setConsoleInputBusy(false);

    const error = String(payload?.error || "").trim();
    const result = String(payload?.result || "").trim();
    if (error) {
        logger.append("error", [error]);
        status.set("Eval error");
        return;
    }
    if (result && result !== "undefined") {
        logger.append("info", [result]);
    }
    status.set("Eval complete");
}

function wireConsoleInput() {
    wireConsoleTabs();
    const ui = ensureConsoleTabs();
    if (!ui?.consoleInputShell || !ui.consoleInput) return;
    if (ui.consoleInputShell.dataset.wired === "true") return;

    loadConsoleInputHistory();
    setConsoleInputBusy(false);
    applyConsoleLogFilter();
    updateConsoleJumpLastErrorButton();

    ui.consoleFilterAll?.addEventListener("click", () => {
        const allOn = Object.values(consoleFilterLevels).every(Boolean);
        const next = !allOn;
        consoleFilterLevels = {
            system: next,
            info: next,
            warn: next,
            error: next,
            log: next,
        };
        applyConsoleLogFilter();
    });

    ui.consoleFilterBar?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-console-filter-level]");
        if (!button) return;
        const level = String(button.dataset.consoleFilterLevel || "").toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(consoleFilterLevels, level)) return;
        consoleFilterLevels[level] = !consoleFilterLevels[level];
        if (!Object.values(consoleFilterLevels).some(Boolean)) {
            consoleFilterLevels[level] = true;
        }
        applyConsoleLogFilter();
    });

    ui.consoleFilterInput?.addEventListener("input", (event) => {
        consoleFilterText = String(event.target?.value || "").trim();
        applyConsoleLogFilter();
    });

    ui.consoleJumpLastError?.addEventListener("click", () => {
        if (!lastRuntimeJumpTarget?.fileId) return;
        jumpToFileLocation(lastRuntimeJumpTarget.fileId, lastRuntimeJumpTarget.line, lastRuntimeJumpTarget.ch);
        ensureLogOpen("Console opened for runtime error.", { view: "console" });
    });

    ui.consoleInput.addEventListener("input", () => {
        autosizeConsoleInput(ui.consoleInput);
    });
    autosizeConsoleInput(ui.consoleInput);

    ui.consoleInput.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "l") {
            event.preventDefault();
            logger.clear();
            logger.append("system", ["Log cleared."]);
            status.set("Ready");
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            navigateConsoleInputHistory(-1);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            navigateConsoleInputHistory(1);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            ui.consoleInput.value = "";
            autosizeConsoleInput(ui.consoleInput);
            return;
        }
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        const value = ui.consoleInput.value || "";
        if (!requestConsoleInputEval(value)) return;
        setConsoleInputValue("");
        autosizeConsoleInput(ui.consoleInput);
    });

    ui.consoleInputShell.dataset.wired = "true";
}

function setDevTerminalInputValue(value = "") {
    const ui = ensureDevTerminalPanel();
    if (!ui?.input) return;
    ui.input.value = String(value || "");
}

function navigateDevTerminalHistory(direction = 0) {
    const ui = ensureDevTerminalPanel();
    if (!ui?.input) return;
    if (!devTerminalHistory.length) return;
    const step = Number(direction) || 0;
    if (step === 0) return;
    devTerminalHistoryIndex = clamp(devTerminalHistoryIndex + step, 0, devTerminalHistory.length);
    if (devTerminalHistoryIndex >= devTerminalHistory.length) {
        ui.input.value = "";
        return;
    }
    ui.input.value = devTerminalHistory[devTerminalHistoryIndex] || "";
    ui.input.setSelectionRange(ui.input.value.length, ui.input.value.length);
}

function focusDevTerminalInput({ openLog = true } = {}) {
    const ui = ensureDevTerminalPanel();
    if (!ui?.input) return false;
    if (openLog) {
        ensureLogOpen("Console opened for Dev Terminal.", { view: "terminal" });
    } else {
        setConsoleView("terminal");
    }
    requestAnimationFrame(() => ui.input?.focus());
    return true;
}

async function executeDevTerminalCommand(input = "") {
    const raw = String(input || "").trim();
    if (!raw) return false;

    appendDevTerminalEntry("info", `$ ${maskDevTerminalCommand(raw)}`, { kind: "command" });
    pushDevTerminalHistory(raw);

    const args = parseDevTerminalArgs(raw);
    if (!args.length) return false;
    const command = String(args[0] || "").toLowerCase();
    const values = args.slice(1);

    if (command === "clear") {
        clearDevTerminalOutput();
        return true;
    }

    if (command === "help") {
        const lines = [
            "Commands: help, clear, status, run, format, save, save-all",
            "Commands: task <run-all|run-app|lint-workspace|format-active|save-all>",
            `Commands: open <log|editor|files|sandbox|tools>, theme <${getSupportedThemeUsage()}>, files`,
            "Commands: tutorial <start|reset|status>",
            "Commands: tutorial list",
            "Commands: fresh-start confirm",
            "Safety: privileged/eval commands are disabled",
        ];
        lines.forEach((line) => appendDevTerminalEntry("info", line));
        return true;
    }

    if (command === "status") {
        appendDevTerminalEntry("info", `Mode: safe • history: ${devTerminalHistory.length}`);
        return true;
    }

    if (command === "run") {
        run();
        appendDevTerminalEntry("info", "Sandbox run started.");
        return true;
    }

    if (command === "format") {
        const ok = await formatCurrentEditor({ announce: false });
        appendDevTerminalEntry(ok ? "info" : "warn", ok ? "Formatted active file." : "Format skipped.");
        return ok;
    }

    if (command === "save") {
        const ok = saveActiveFile({ announce: false });
        appendDevTerminalEntry("info", ok ? "Saved active file." : "No changes to save.");
        return ok;
    }

    if (command === "save-all") {
        const ok = saveAllFiles({ announce: false });
        appendDevTerminalEntry("info", ok ? "Saved all dirty files." : "No dirty files.");
        return ok;
    }

    if (command === "task") {
        const taskId = normalizeTaskRunnerCommand(values[0] || "");
        if (!taskId) {
            appendDevTerminalEntry("warn", "Usage: task <run-all|run-app|lint-workspace|format-active|save-all>");
            return false;
        }
        const ok = await runTaskRunnerTask(taskId);
        appendDevTerminalEntry(ok ? "info" : "warn", ok ? `Task started: ${taskId}` : `Task failed: ${taskId}`);
        return ok;
    }

    if (command === "theme") {
        const nextTheme = normalizeTheme(values[0] || "", undefined, "");
        if (!nextTheme) {
            appendDevTerminalEntry("warn", `Usage: theme <${getSupportedThemeUsage()}>`);
            return false;
        }
        applyTheme(nextTheme);
        appendDevTerminalEntry("info", `Theme set to ${nextTheme}.`);
        return true;
    }

    if (command === "open") {
        const panel = String(values[0] || "").trim().toLowerCase();
        if (!["log", "editor", "files", "sandbox", "tools"].includes(panel)) {
            appendDevTerminalEntry("warn", "Usage: open <log|editor|files|sandbox|tools>");
            return false;
        }
        setPanelOpen(panel, true);
        appendDevTerminalEntry("info", `Opened panel: ${panel}.`);
        return true;
    }

    if (command === "files") {
        appendDevTerminalEntry("info", `Workspace files: ${files.length} • folders: ${collectFolderPaths(files, folders).size} • trash: ${trashFiles.length}`);
        return true;
    }

    if (command === "tutorial") {
        const sub = String(values[0] || "status").trim().toLowerCase();
        const tutorialArg = String(values[1] || values[0] || "").trim().toLowerCase();
        const targetTutorialId = normalizeTutorialId(tutorialArg || tutorialState.tutorialId || DEFAULT_TUTORIAL_ID, DEFAULT_TUTORIAL_ID);
        if (sub === "list") {
            appendDevTerminalEntry("info", `Available tutorials: ${getTutorialIds().join(", ")}`);
            return true;
        }
        if (sub === "start") {
            const requestedId = String(values[1] || DEFAULT_TUTORIAL_ID).trim().toLowerCase();
            const resolvedId = normalizeTutorialId(requestedId, DEFAULT_TUTORIAL_ID);
            const opened = openBeginnerTutorial({ force: true, tutorialId: resolvedId });
            appendDevTerminalEntry(opened ? "info" : "warn", opened ? `Tutorial started: ${resolvedId}.` : "Tutorial UI unavailable.");
            return opened;
        }
        if (sub === "reset") {
            setTutorialSeen(false, targetTutorialId);
            if (tutorialState.active && tutorialState.tutorialId === targetTutorialId) {
                closeBeginnerTutorial({ markSeen: false, tutorialId: targetTutorialId });
            }
            appendDevTerminalEntry("info", `Tutorial reset: ${targetTutorialId}. Use 'tutorial start ${targetTutorialId}' to run from step 1.`);
            return true;
        }
        if (sub === "status") {
            const definition = getTutorialDefinition(tutorialState.tutorialId);
            const steps = Array.isArray(definition.steps) ? definition.steps : [];
            appendDevTerminalEntry("info", `Tutorial id: ${tutorialState.tutorialId} • active: ${tutorialState.active ? "yes" : "no"} • seen: ${getTutorialSeen(tutorialState.tutorialId) ? "yes" : "no"} • step: ${tutorialState.index + 1}/${steps.length}`);
            return true;
        }
        appendDevTerminalEntry("warn", "Usage: tutorial <list|start [id]|reset [id]|status>");
        return false;
    }

    if (["fresh-start", "factory-reset", "reset-all"].includes(command)) {
        const confirmToken = String(values[0] || "").trim().toLowerCase();
        if (confirmToken !== "confirm") {
            appendDevTerminalEntry("warn", "Usage: fresh-start confirm");
            appendDevTerminalEntry("warn", "This removes FAZ IDE local data (files/layout/settings/history), clears related caches, then reloads.");
            return false;
        }
        appendDevTerminalEntry("info", "Factory reset in progress...");
        const summary = await resetAppToFirstLaunchState();
        appendDevTerminalEntry(
            "info",
            `Cleared local keys: ${summary.removedKeys}, session keys: ${summary.removedSessionKeys}, service workers: ${summary.serviceWorkersCleared}, caches: ${summary.cachesCleared}, indexedDB: ${summary.indexedDbCleared}. Reloading...`
        );
        setTimeout(() => {
            window.location.reload();
        }, 80);
        return true;
    }

    if (["lock", "set-code", "unlock", "remove-code", "dev-help", "dev-js"].includes(command)) {
        appendDevTerminalEntry("warn", `Command disabled for safety: ${command}`);
        return false;
    }

    appendDevTerminalEntry("warn", `Unknown command: ${command}. Type 'help'.`);
    return false;
}

function wireDevTerminal() {
    wireConsoleTabs();
    wireConsoleInput();
    const ui = ensureDevTerminalPanel();
    if (!ui) return;
    if (ui.panel.dataset.wired === "true") return;

    devTerminalHistory = [];
    devTerminalHistoryIndex = 0;
    syncDevTerminalStatus();
    clearDevTerminalOutput();
    appendDevTerminalEntry("info", "Dev Terminal ready. Type 'help' to list commands.");

    ui.clear?.addEventListener("click", () => {
        clearDevTerminalOutput();
    });
    ui.run?.addEventListener("click", async () => {
        const value = ui.input?.value || "";
        if (!value.trim() || devTerminalBusy) return;
        setDevTerminalBusy(true);
        try {
            await executeDevTerminalCommand(value);
        } catch (err) {
            appendDevTerminalEntry("error", `Command failed: ${String(err?.message || err)}`);
        } finally {
            setDevTerminalBusy(false);
            setDevTerminalInputValue("");
            ui.input?.focus();
        }
    });
    ui.input?.addEventListener("keydown", async (event) => {
        if (event.key === "ArrowUp") {
            event.preventDefault();
            navigateDevTerminalHistory(-1);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            navigateDevTerminalHistory(1);
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            ui.input.value = "";
            return;
        }
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (devTerminalBusy) return;
        const value = ui.input.value || "";
        if (!value.trim()) return;
        setDevTerminalBusy(true);
        try {
            await executeDevTerminalCommand(value);
        } catch (err) {
            appendDevTerminalEntry("error", `Command failed: ${String(err?.message || err)}`);
        } finally {
            setDevTerminalBusy(false);
            setDevTerminalInputValue("");
        }
    });
    ui.panel.dataset.wired = "true";
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
            :root[data-theme="retro"] {
                color-scheme: dark;
                --bg: #0f140f;
                --surface: #182018;
                --bar-bg: rgba(14, 19, 14, 0.96);
                --text: #d7f7c1;
                --muted: rgba(183, 227, 160, 0.86);
                --border: rgba(121, 163, 97, 0.38);
                --border-strong: rgba(180, 214, 132, 0.64);
                --button-bg: rgba(28, 38, 23, 0.9);
                --button-hover: rgba(38, 52, 31, 0.96);
                --runner-bg: #0f140f;
            }
            :root[data-theme="temple"] {
                color-scheme: light;
                --bg: #0f3fc6;
                --surface: #f7f0dc;
                --bar-bg: rgba(247, 240, 220, 0.96);
                --text: #15214a;
                --muted: rgba(21, 33, 74, 0.76);
                --border: rgba(26, 43, 102, 0.34);
                --border-strong: rgba(26, 43, 102, 0.52);
                --button-bg: rgba(248, 242, 226, 0.96);
                --button-hover: rgba(236, 226, 200, 0.98);
                --runner-bg: #0f3fc6;
            }
            :root[data-theme="midnight"] {
                color-scheme: dark;
                --bg: #070c18;
                --surface: #101a30;
                --bar-bg: rgba(9, 16, 30, 0.96);
                --text: #e6eefc;
                --muted: rgba(168, 190, 226, 0.86);
                --border: rgba(96, 165, 250, 0.34);
                --border-strong: rgba(147, 197, 253, 0.52);
                --button-bg: rgba(19, 31, 54, 0.9);
                --button-hover: rgba(30, 46, 76, 0.94);
                --runner-bg: #0a1222;
            }
            :root[data-theme="ocean"] {
                color-scheme: dark;
                --bg: #04171c;
                --surface: #0a232b;
                --bar-bg: rgba(5, 24, 31, 0.96);
                --text: #def8f6;
                --muted: rgba(155, 219, 214, 0.86);
                --border: rgba(45, 212, 191, 0.34);
                --border-strong: rgba(94, 234, 212, 0.52);
                --button-bg: rgba(13, 45, 55, 0.9);
                --button-hover: rgba(20, 62, 74, 0.94);
                --runner-bg: #072028;
            }
            :root[data-theme="forest"] {
                color-scheme: dark;
                --bg: #0a160d;
                --surface: #142116;
                --bar-bg: rgba(10, 22, 13, 0.96);
                --text: #e8f7e6;
                --muted: rgba(180, 214, 173, 0.86);
                --border: rgba(74, 222, 128, 0.32);
                --border-strong: rgba(134, 239, 172, 0.5);
                --button-bg: rgba(24, 41, 26, 0.9);
                --button-hover: rgba(34, 56, 36, 0.94);
                --runner-bg: #101d11;
            }
            :root[data-theme="graphite"] {
                color-scheme: dark;
                --bg: #0e1014;
                --surface: #171a20;
                --bar-bg: rgba(15, 17, 22, 0.96);
                --text: #eef1f6;
                --muted: rgba(181, 188, 200, 0.84);
                --border: rgba(148, 163, 184, 0.34);
                --border-strong: rgba(203, 213, 225, 0.5);
                --button-bg: rgba(28, 32, 39, 0.9);
                --button-hover: rgba(38, 45, 56, 0.94);
                --runner-bg: #12161d;
            }
            :root[data-theme="sunset"] {
                color-scheme: dark;
                --bg: #1b0f0b;
                --surface: #2a1711;
                --bar-bg: rgba(27, 15, 11, 0.96);
                --text: #fff0e6;
                --muted: rgba(241, 195, 167, 0.86);
                --border: rgba(251, 146, 60, 0.34);
                --border-strong: rgba(253, 186, 116, 0.52);
                --button-bg: rgba(53, 32, 22, 0.9);
                --button-hover: rgba(71, 42, 28, 0.94);
                --runner-bg: #24140e;
            }
            * { box-sizing: border-box; }
            html, body { margin: 0; height: 100%; }
            body {
                background: var(--bg);
                color: var(--text);
                font-family: "JetBrains Mono", "Cascadia Mono", "Consolas", monospace;
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
    if (!isSandboxWindowOpen() || event.source !== sandboxWindow) return;
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
        setDataActive(overlay, open);
        setAriaHidden(overlay, !open);
        if (!open) {
            overlay.removeAttribute("data-active-zone");
            overlay.removeAttribute("data-panel-label");
        }
    };

    let activeZone = null;
    let activePanel = null;
    let activePanelEl = null;
    let dragGhost = null;
    let dragOffset = { x: 0, y: 0 };
    let dragZoneRects = [];
    let lastGhostPoint = null;

    const updateActiveZone = (zone) => {
        if (activeZone === zone) return;
        if (activeZone) activeZone.removeAttribute("data-active");
        activeZone = zone;
        if (activeZone) {
            activeZone.setAttribute("data-active", "true");
            const zoneName = activeZone.getAttribute("data-dock-zone") || "";
            if (zoneName) {
                overlay.setAttribute("data-active-zone", zoneName);
            } else {
                overlay.removeAttribute("data-active-zone");
            }
        } else {
            overlay.removeAttribute("data-active-zone");
        }
    };

    const captureDragZoneRects = () => {
        dragZoneRects = zones.map((zone) => ({
            zone,
            rect: zone.getBoundingClientRect(),
        }));
    };

    const isPointInWorkspaceCenterBand = (x, y) => {
        const workspaceRect = el.workspace?.getBoundingClientRect();
        if (!workspaceRect) return false;
        if (x < workspaceRect.left || x > workspaceRect.right || y < workspaceRect.top || y > workspaceRect.bottom) {
            return false;
        }
        const width = Math.max(1, workspaceRect.width);
        const height = Math.max(1, workspaceRect.height);
        const centerX = workspaceRect.left + width / 2;
        const centerY = workspaceRect.top + height / 2;
        const centerBandX = Math.max(64, width * 0.24);
        const centerBandY = Math.max(48, height * 0.24);
        return Math.abs(x - centerX) <= centerBandX && Math.abs(y - centerY) <= centerBandY;
    };

    const isPointInCenterZoneRect = (x, y) => {
        const centerZone = zones.find((zone) => zone.getAttribute("data-dock-zone") === "center") || null;
        if (!centerZone) return false;
        const rect = centerZone.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const margin = 8;
        return (
            x >= rect.left - margin
            && x <= rect.right + margin
            && y >= rect.top - margin
            && y <= rect.bottom + margin
        );
    };

    const resolveZoneAtPoint = (x, y) => {
        for (const entry of dragZoneRects) {
            const rect = entry.rect;
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return entry.zone;
            }
        }

        const workspaceRect = el.workspace?.getBoundingClientRect();
        if (workspaceRect && x >= workspaceRect.left && x <= workspaceRect.right && y >= workspaceRect.top && y <= workspaceRect.bottom) {
            const width = Math.max(1, workspaceRect.width);
            const height = Math.max(1, workspaceRect.height);
            const leftEdge = workspaceRect.left + Math.max(36, width * 0.2);
            const rightEdge = workspaceRect.right - Math.max(36, width * 0.2);
            const bottomEdge = workspaceRect.bottom - Math.max(44, height * 0.24);
            const centerX = workspaceRect.left + width / 2;
            const centerY = workspaceRect.top + height / 2;
            const centerBandX = Math.max(64, width * 0.2);
            const centerBandY = Math.max(48, height * 0.2);

            const byName = (name) => zones.find((zone) => zone.getAttribute("data-dock-zone") === name) || null;
            if (Math.abs(x - centerX) <= centerBandX && Math.abs(y - centerY) <= centerBandY) {
                return byName("center");
            }
            if (y >= bottomEdge) return byName("bottom");
            if (x <= leftEdge) return byName("left");
            if (x >= rightEdge) return byName("right");
        }

        const elAt = document.elementFromPoint(x, y);
        const directZone = elAt ? elAt.closest(".dock-zone") : null;
        if (directZone) return directZone;

        let nearest = null;
        let nearestDistance = Infinity;
        dragZoneRects.forEach((entry) => {
            const rect = entry.rect;
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const dx = x - cx;
            const dy = y - cy;
            const distance = Math.hypot(dx, dy);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = entry.zone;
            }
        });

        return nearestDistance <= getDockZoneMagnetDistance() ? nearest : null;
    };

    const movePanelHorizontally = (panel, direction) => {
        const row = getPanelRow(panel);
        const order = Array.isArray(layoutState.panelRows?.[row]) ? [...layoutState.panelRows[row]] : [];
        const currentIndex = order.indexOf(panel);
        if (currentIndex === -1) return false;
        const nextIndex = clamp(currentIndex + direction, 0, order.length - 1);
        if (nextIndex === currentIndex) return false;
        setPanelOrder(panel, nextIndex, { animatePanels: true });
        return true;
    };

    const movePanelVertically = (panel, direction) => {
        const targetRow = direction < 0 ? "top" : "bottom";
        const currentRow = getPanelRow(panel);
        if (currentRow === targetRow) return false;
        const currentOrder = Array.isArray(layoutState.panelRows?.[currentRow]) ? layoutState.panelRows[currentRow] : [];
        const targetOrder = Array.isArray(layoutState.panelRows?.[targetRow]) ? layoutState.panelRows[targetRow] : [];
        const currentIndex = currentOrder.indexOf(panel);
        const targetIndex = clamp(currentIndex, 0, targetOrder.length);
        movePanelToRow(panel, targetRow, targetIndex, { animatePanels: true });
        return true;
    };

    const getDropIndexForRow = (rowName, pointerX, panelToMove) => {
        const rowOrder = Array.isArray(layoutState.panelRows?.[rowName]) ? [...layoutState.panelRows[rowName]] : [];
        const orderWithoutPanel = rowOrder.filter((name) => name !== panelToMove);
        if (!orderWithoutPanel.length) return 0;

        if (!Number.isFinite(pointerX)) return orderWithoutPanel.length;

        let sawVisiblePanel = false;
        for (let i = 0; i < orderWithoutPanel.length; i += 1) {
            const panelName = orderWithoutPanel[i];
            if (!isPanelOpen(panelName)) continue;
            const panelEl = getPanelEl(panelName);
            if (!panelEl || !panelEl.isConnected) continue;
            const rect = panelEl.getBoundingClientRect();
            if (!Number.isFinite(rect.width) || rect.width <= 0) continue;
            sawVisiblePanel = true;
            const midpoint = rect.left + rect.width / 2;
            if (pointerX < midpoint) return i;
        }

        if (sawVisiblePanel) return orderWithoutPanel.length;

        const rowEl = rowName === "bottom" ? el.workspaceBottom : el.workspaceTop;
        if (!rowEl) return orderWithoutPanel.length;
        const rowRect = rowEl.getBoundingClientRect();
        const rowMidpoint = rowRect.left + rowRect.width / 2;
        return pointerX < rowMidpoint ? 0 : orderWithoutPanel.length;
    };

    const applyDrop = (dropPoint = null) => {
        if (!activePanel) return;
        const overlayCenterActive = overlay.getAttribute("data-active-zone") === "center";
        if (
            overlayCenterActive
            || (
                dropPoint
                && (
                    isPointInWorkspaceCenterBand(dropPoint.x, dropPoint.y)
                    || isPointInCenterZoneRect(dropPoint.x, dropPoint.y)
                )
            )
        ) {
            applyActiveLayoutPreset();
            return;
        }
        const resolvedZone = activeZone || (
            dropPoint && Number.isFinite(dropPoint.x) && Number.isFinite(dropPoint.y)
                ? resolveZoneAtPoint(dropPoint.x, dropPoint.y)
                : null
        );
        if (!resolvedZone) return;
        const zoneName = resolvedZone.getAttribute("data-dock-zone");
        if (!zoneName) return;
        if (zoneName === "center") {
            applyActiveLayoutPreset();
            return;
        }
        if (zoneName === "left") {
            movePanelToRow(activePanel, "top", 0, { animatePanels: true });
            return;
        }
        if (zoneName === "right") {
            movePanelToRow(activePanel, "top", (layoutState.panelRows?.top || []).length, { animatePanels: true });
            return;
        }
        if (zoneName === "bottom") {
            const dropIndex = getDropIndexForRow("bottom", dropPoint?.x, activePanel);
            movePanelToRow(activePanel, "bottom", dropIndex, { animatePanels: true });
        }
    };

    handles.forEach((handle) => {
        handle.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home End");
        if (!handle.getAttribute("title")) {
            handle.setAttribute("title", "Drag to dock, or use arrow keys to move this panel");
        }

        handle.addEventListener("keydown", (event) => {
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            const panel = handle.getAttribute("data-panel");
            if (!panel) return;
            let moved = false;
            if (event.key === "ArrowLeft") moved = movePanelHorizontally(panel, -1);
            if (event.key === "ArrowRight") moved = movePanelHorizontally(panel, 1);
            if (event.key === "ArrowUp") moved = movePanelVertically(panel, -1);
            if (event.key === "ArrowDown") moved = movePanelVertically(panel, 1);
            if (event.key === "Home") {
                const row = getPanelRow(panel);
                movePanelToRow(panel, row, 0, { animatePanels: true });
                moved = true;
            }
            if (event.key === "End") {
                const row = getPanelRow(panel);
                const length = Array.isArray(layoutState.panelRows?.[row]) ? layoutState.panelRows[row].length : 1;
                movePanelToRow(panel, row, Math.max(0, length - 1), { animatePanels: true });
                moved = true;
            }
            if (moved) {
                event.preventDefault();
            }
        });

        handle.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            const panel = handle.getAttribute("data-panel");
            if (!panel) return;
            event.preventDefault();
            activePanel = panel;
            activePanelEl = getPanelEl(panel);
            if (activePanelEl) {
                activePanelEl.classList.add("panel-floating", "panel-drag-source");
                overlay.setAttribute("data-panel-label", panelLabels[panel] || panel);
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
                lastGhostPoint = { x: rect.left, y: rect.top };
            }
            captureDragZoneRects();
            setOverlayOpen(true);
            document.body?.classList.add("dock-dragging");
            handle.setPointerCapture(event.pointerId);

            let dragMoveFrame = null;
            let dragMoveState = null;
            let ended = false;

            const applyDragMove = (state) => {
                if (!state) return;
                const zone = resolveZoneAtPoint(state.x, state.y);
                updateActiveZone(zone);
                if (dragGhost) {
                    const nextX = state.x - dragOffset.x;
                    const nextY = state.y - dragOffset.y;
                    if (lastGhostPoint && Math.abs(nextX - lastGhostPoint.x) < 0.25 && Math.abs(nextY - lastGhostPoint.y) < 0.25) {
                        return;
                    }
                    dragGhost.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) rotate(-0.35deg) scale(1.02)`;
                    lastGhostPoint = { x: nextX, y: nextY };
                }
            };

            const onMove = (moveEvent) => {
                dragMoveState = { x: moveEvent.clientX, y: moveEvent.clientY };
                if (dragMoveFrame != null) return;
                dragMoveFrame = requestAnimationFrame(() => {
                    dragMoveFrame = null;
                    const next = dragMoveState;
                    dragMoveState = null;
                    applyDragMove(next);
                });
            };

            const onEnd = (endEvent) => {
                if (ended) return;
                ended = true;
                let dropPoint = null;
                if (dragMoveFrame != null) {
                    cancelAnimationFrame(dragMoveFrame);
                    dragMoveFrame = null;
                }
                if (endEvent && Number.isFinite(endEvent.clientX) && Number.isFinite(endEvent.clientY)) {
                    dropPoint = { x: endEvent.clientX, y: endEvent.clientY };
                    applyDragMove(dropPoint);
                } else if (dragMoveState) {
                    dropPoint = dragMoveState;
                    applyDragMove(dragMoveState);
                }
                dragMoveState = null;
                try {
                    handle.releasePointerCapture(event.pointerId);
                } catch (err) {
                    // no-op
                }
                handle.removeEventListener("pointermove", onMove);
                handle.removeEventListener("pointerup", onEnd);
                handle.removeEventListener("pointercancel", onEnd);
                window.removeEventListener("pointerup", onEnd, true);
                window.removeEventListener("pointercancel", onEnd, true);
                window.removeEventListener("blur", onWindowBlur, true);
                document.body?.classList.remove("dock-dragging");
                try {
                    applyDrop(dropPoint);
                } finally {
                    updateActiveZone(null);
                    setOverlayOpen(false);
                    if (activePanelEl) activePanelEl.classList.remove("panel-floating", "panel-drag-source");
                    if (dragGhost) {
                        dragGhost.remove();
                        dragGhost = null;
                    }
                    activePanel = null;
                    activePanelEl = null;
                    dragZoneRects = [];
                    lastGhostPoint = null;
                }
            };

            const onWindowBlur = () => {
                onEnd(null);
            };

            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onEnd);
            handle.addEventListener("pointercancel", onEnd);
            window.addEventListener("pointerup", onEnd, true);
            window.addEventListener("pointercancel", onEnd, true);
            window.addEventListener("blur", onWindowBlur, true);
        });
    });
}

function initSplitters() {
    const wireSplitter = (splitter, panel, getWidth, setWidth, boundsKey, label) => {
        if (!splitter) return;
        splitter.addEventListener("pointerdown", (event) => {
            if (!isPanelOpen(panel)) return;
            event.preventDefault();
            const pointerId = event.pointerId;
            const zoomScale = Math.max(0.01, normalizeUiZoom(uiZoomPercent) / 100);
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
            const leftEffective = leftControl ? getEffectiveBounds(leftName, row, leftBounds) : null;
            const rightEffective = rightControl ? getEffectiveBounds(rightName, row, rightBounds) : null;
            const startLeft = leftControl ? leftControl.get() : 0;
            const startRight = rightControl ? rightControl.get() : 0;
            const leftEl = getPanelElement(leftName);
            const rightEl = getPanelElement(rightName);
            setResizeActive([leftEl, rightEl], true);
            hideRowGuide();
            showColGuideForPanels(leftEl, rightEl);
            let moveFrame = null;
            let pendingMoveEvent = null;
            let ended = false;

            const applyMove = (moveEvent) => {
                if (!moveEvent) return;
                const delta = (moveEvent.clientX - startX) / zoomScale;
                const snapEnabled = !moveEvent.altKey;
                if (leftControl && rightControl) {
                    const minDelta = Math.max(
                        leftEffective.min - startLeft,
                        startRight - rightEffective.max
                    );
                    const maxDelta = Math.min(
                        leftEffective.max - startLeft,
                        startRight - rightEffective.min
                    );
                    const clamped = clamp(delta, minDelta, maxDelta);
                    const snapped = snapEnabled ? Math.round(clamped / RESIZE_SNAP_STEP) * RESIZE_SNAP_STEP : clamped;
                    const nextDelta = clamp(snapped, minDelta, maxDelta);
                    leftControl.set(startLeft + nextDelta);
                    rightControl.set(startRight - nextDelta);
                    normalizeRowWidths(row);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                if (leftControl && !rightControl) {
                    const next = snapDimension(startLeft + delta, leftEffective.min, leftEffective.max, { enabled: snapEnabled });
                    leftControl.set(next);
                    normalizeRowWidths(row);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                if (!leftControl && rightControl) {
                    const next = snapDimension(startRight - delta, rightEffective.min, rightEffective.max, { enabled: snapEnabled });
                    rightControl.set(next);
                    normalizeRowWidths(row);
                    showColGuideForPanels(leftEl, rightEl);
                    return;
                }
                const next = snapDimension(startWidth + delta, bounds.min, bounds.max, { enabled: snapEnabled });
                setWidth(next);
                normalizeRowWidths(row);
                showColGuideForPanels(leftEl, rightEl);
            };

            const onMove = (moveEvent) => {
                pendingMoveEvent = moveEvent;
                if (moveFrame != null) return;
                moveFrame = requestAnimationFrame(() => {
                    moveFrame = null;
                    const next = pendingMoveEvent;
                    pendingMoveEvent = null;
                    applyMove(next);
                });
            };

            const cleanup = () => {
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                splitter.removeEventListener("lostpointercapture", onLostPointerCapture);
                window.removeEventListener("pointerup", onWindowPointerEnd, true);
                window.removeEventListener("pointercancel", onWindowPointerEnd, true);
                window.removeEventListener("blur", onWindowBlur, true);
                document.body?.removeAttribute("data-resize");
                setResizeActive([leftEl, rightEl], false);
                hideColGuide();
                hideRowGuide();
                commitLayoutResize();
            };

            const onCancel = (cancelEvent) => {
                if (ended) return;
                if (Number.isFinite(cancelEvent?.pointerId) && cancelEvent.pointerId !== pointerId) return;
                ended = true;
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                try {
                    splitter.releasePointerCapture(pointerId);
                } catch (err) {
                    // no-op
                }
                cleanup();
            };

            const onUp = (upEvent) => {
                if (ended) return;
                if (Number.isFinite(upEvent?.pointerId) && upEvent.pointerId !== pointerId) return;
                ended = true;
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                try {
                    splitter.releasePointerCapture(pointerId);
                } catch (err) {
                    // no-op
                }
                cleanup();
            };

            const onWindowPointerEnd = (endEvent) => {
                if (Number.isFinite(endEvent?.pointerId) && endEvent.pointerId !== pointerId) return;
                onUp(endEvent);
            };

            const onWindowBlur = () => {
                onCancel(null);
            };

            const onLostPointerCapture = (lostEvent) => {
                if (Number.isFinite(lostEvent?.pointerId) && lostEvent.pointerId !== pointerId) return;
                onCancel(lostEvent);
            };

            splitter.setPointerCapture(pointerId);
            splitter.addEventListener("pointermove", onMove);
            splitter.addEventListener("pointerup", onUp);
            splitter.addEventListener("pointercancel", onCancel);
            splitter.addEventListener("lostpointercapture", onLostPointerCapture);
            window.addEventListener("pointerup", onWindowPointerEnd, true);
            window.addEventListener("pointercancel", onWindowPointerEnd, true);
            window.addEventListener("blur", onWindowBlur, true);
        });

        splitter.addEventListener("dblclick", () => {
            const fallback = LAYOUT_PRESETS.studio;
            if (panel === "log") setWidth(fallback.logWidth);
            if (panel === "files") setWidth(fallback.sidebarWidth);
            if (panel === "sandbox") setWidth(fallback.sandboxWidth);
            if (panel === "tools") setWidth(fallback.toolsWidth);
            commitLayoutResize();
            pushDiag("info", `${label} width reset.`);
        });

        splitter.addEventListener("keydown", (event) => {
            const step = event.altKey ? 2 : event.shiftKey ? 48 : 16;
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
                    const leftEffective = getEffectiveBounds(leftName, row, leftBounds);
                    const rightEffective = getEffectiveBounds(rightName, row, rightBounds);
                    const delta = dir * step;
                    const minDelta = Math.max(
                        leftEffective.min - leftControl.get(),
                        rightControl.get() - rightEffective.max
                    );
                    const maxDelta = Math.min(
                        leftEffective.max - leftControl.get(),
                        rightControl.get() - rightEffective.min
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
                commitLayoutResize();
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
            const pointerId = event.pointerId;
            const zoomScale = Math.max(0.01, normalizeUiZoom(uiZoomPercent) / 100);
            document.body?.setAttribute("data-resize", "row");
            const startY = event.clientY;
            const startHeight = layoutState.bottomHeight;
            const bounds = getLayoutBounds().bottomHeight;
            const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
            const minTop = rowHasOpenPanels("top") ? WORKSPACE_ROW_MIN_HEIGHT : 0;
            const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
            setResizeActive([el.workspaceTop, el.workspaceBottom], true);
            hideColGuide();
            const boundaryStart = getRowBoundaryY();
            if (boundaryStart !== null) showRowGuideAt(boundaryStart);

            let moveFrame = null;
            let pendingMoveEvent = null;
            let ended = false;

            const applyMove = (moveEvent) => {
                if (!moveEvent) return;
                const delta = (moveEvent.clientY - startY) / zoomScale;
                const next = snapDimension(startHeight - delta, bounds.min, maxBottom, { enabled: !moveEvent.altKey });
                setBottomHeight(next);
                const boundary = getRowBoundaryY();
                if (boundary !== null) showRowGuideAt(boundary);
            };

            const onMove = (moveEvent) => {
                pendingMoveEvent = moveEvent;
                if (moveFrame != null) return;
                moveFrame = requestAnimationFrame(() => {
                    moveFrame = null;
                    const next = pendingMoveEvent;
                    pendingMoveEvent = null;
                    applyMove(next);
                });
            };

            const cleanup = () => {
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                splitter.removeEventListener("pointermove", onMove);
                splitter.removeEventListener("pointerup", onUp);
                splitter.removeEventListener("pointercancel", onCancel);
                splitter.removeEventListener("lostpointercapture", onLostPointerCapture);
                window.removeEventListener("pointerup", onWindowPointerEnd, true);
                window.removeEventListener("pointercancel", onWindowPointerEnd, true);
                window.removeEventListener("blur", onWindowBlur, true);
                document.body?.removeAttribute("data-resize");
                setResizeActive([el.workspaceTop, el.workspaceBottom], false);
                hideRowGuide();
                hideColGuide();
                commitLayoutResize();
            };

            const onCancel = (cancelEvent) => {
                if (ended) return;
                if (Number.isFinite(cancelEvent?.pointerId) && cancelEvent.pointerId !== pointerId) return;
                ended = true;
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                try {
                    splitter.releasePointerCapture(pointerId);
                } catch (err) {
                    // no-op
                }
                cleanup();
            };

            const onUp = (upEvent) => {
                if (ended) return;
                if (Number.isFinite(upEvent?.pointerId) && upEvent.pointerId !== pointerId) return;
                ended = true;
                if (moveFrame != null) {
                    cancelAnimationFrame(moveFrame);
                    moveFrame = null;
                }
                applyMove(pendingMoveEvent);
                pendingMoveEvent = null;
                try {
                    splitter.releasePointerCapture(pointerId);
                } catch (err) {
                    // no-op
                }
                cleanup();
            };

            const onWindowPointerEnd = (endEvent) => {
                if (Number.isFinite(endEvent?.pointerId) && endEvent.pointerId !== pointerId) return;
                onUp(endEvent);
            };

            const onWindowBlur = () => {
                onCancel(null);
            };

            const onLostPointerCapture = (lostEvent) => {
                if (Number.isFinite(lostEvent?.pointerId) && lostEvent.pointerId !== pointerId) return;
                onCancel(lostEvent);
            };

            splitter.setPointerCapture(pointerId);
            splitter.addEventListener("pointermove", onMove);
            splitter.addEventListener("pointerup", onUp);
            splitter.addEventListener("pointercancel", onCancel);
            splitter.addEventListener("lostpointercapture", onLostPointerCapture);
            window.addEventListener("pointerup", onWindowPointerEnd, true);
            window.addEventListener("pointercancel", onWindowPointerEnd, true);
            window.addEventListener("blur", onWindowBlur, true);
        });

        splitter.addEventListener("dblclick", () => {
            const fallback = LAYOUT_PRESETS.studio;
            setBottomHeight(fallback.bottomHeight);
            commitLayoutResize();
            pushDiag("info", "Bottom dock height reset.");
        });

        splitter.addEventListener("keydown", (event) => {
            const step = event.altKey ? 2 : event.shiftKey ? 48 : 16;
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                const dir = event.key === "ArrowDown" ? 1 : -1;
                const bounds = getLayoutBounds().bottomHeight;
                const workspaceHeight = el.workspace?.getBoundingClientRect().height || 0;
                const minTop = rowHasOpenPanels("top") ? WORKSPACE_ROW_MIN_HEIGHT : 0;
                const maxBottom = Math.max(bounds.min, Math.min(bounds.max, workspaceHeight - minTop));
                const next = clamp(layoutState.bottomHeight - dir * step, bounds.min, maxBottom);
                setBottomHeight(next);
                commitLayoutResize();
                event.preventDefault();
            }
        });
    };

    wireRowSplitter(el.splitRow);
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
    const toggleStates = [
        [el.btnToggleLog, layoutState.logOpen, "Console"],
        [el.btnToggleEditor, layoutState.editorOpen, "Editor"],
        [el.btnToggleFiles, layoutState.filesOpen, "Files"],
        [el.btnToggleSandbox, layoutState.sandboxOpen, "Sandbox"],
        [el.btnToggleTools, layoutState.toolsOpen, "Tools"],
    ];
    toggleStates.forEach(([button, open, label]) => {
        if (!button) return;
        setAriaExpanded(button, open);
        setDataPanelOpen(button, open);
        button.textContent = label;
    });
}

function syncQuickBar() {
    [el.btnToggleHeader, el.quickHeader].forEach((button) => {
        if (!button) return;
        setAriaExpanded(button, layoutState.headerOpen);
        setDataPanelOpen(button, layoutState.headerOpen);
        button.textContent = "Header";
    });
    if (!el.quickBar) return;
    const visible = !layoutState.headerOpen;
    setBooleanAttribute(el.quickBar, "data-visible", visible);
    setAriaHidden(el.quickBar, !visible);
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

function panelRowsEqual(a, b) {
    const left = normalizePanelRows(a);
    const right = normalizePanelRows(b);
    return ["top", "bottom"].every((row) => {
        const leftRow = Array.isArray(left[row]) ? left[row] : [];
        const rightRow = Array.isArray(right[row]) ? right[row] : [];
        if (leftRow.length !== rightRow.length) return false;
        return leftRow.every((name, index) => name === rightRow[index]);
    });
}

function setPanelOpen(panel, open) {
    const nextOpen = Boolean(open);
    const previousOpen = isPanelOpen(panel);
    if (panel === "log") layoutState.logOpen = open;
    if (panel === "editor") layoutState.editorOpen = open;
    if (panel === "files") layoutState.filesOpen = open;
    if (panel === "sandbox") {
        if (nextOpen && isSandboxWindowOpen()) {
            sandboxWindow.focus();
            layoutState.sandboxOpen = false;
            applyLayout();
            syncPanelToggles();
            persistLayout();
            syncLayoutControls();
            return;
        }
        layoutState.sandboxOpen = nextOpen;
    }
    if (panel === "tools") layoutState.toolsOpen = nextOpen;
    if (panel === "log") layoutState.logOpen = nextOpen;
    if (panel === "editor") layoutState.editorOpen = nextOpen;
    if (panel === "files") layoutState.filesOpen = nextOpen;

    const nextRows = enforceDockingRowCaps(layoutState.panelRows, {
        preferredRow: getPanelRow(panel),
        preservePanel: nextOpen ? panel : null,
    });
    const rowsChanged = !panelRowsEqual(layoutState.panelRows, nextRows);
    const openChanged = previousOpen !== isPanelOpen(panel);
    if (!rowsChanged && !openChanged) {
        return;
    }
    if (rowsChanged) {
        setPanelRows(nextRows);
    }
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

function setPanelOrder(panel, index, { animatePanels = true } = {}) {
    const row = getPanelRow(panel);
    const order = Array.isArray(layoutState.panelRows?.[row]) ? [...layoutState.panelRows[row]] : [];
    const currentIndex = order.indexOf(panel);
    if (currentIndex === -1) return;
    const target = Number(index);
    const clamped = Number.isFinite(target) ? clamp(target, 0, order.length - 1) : currentIndex;
    if (clamped === currentIndex) return;
    order.splice(currentIndex, 1);
    order.splice(clamped, 0, panel);
    setPanelRows({
        ...layoutState.panelRows,
        [row]: order,
    });
    applyLayout({ animatePanels });
    persistLayout();
    syncLayoutControls();
}

function movePanelToRow(panel, row, index = 0, { animatePanels = true } = {}) {
    const targetRow = row === "bottom" ? "bottom" : "top";
    const currentRow = getPanelRow(panel);
    const currentOrder = Array.isArray(layoutState.panelRows?.[currentRow]) ? [...layoutState.panelRows[currentRow]] : [];
    const currentIndex = currentOrder.indexOf(panel);
    if (currentIndex !== -1 && currentRow === targetRow) {
        const target = Number(index);
        const clampedCurrent = Number.isFinite(target) ? clamp(target, 0, currentOrder.length - 1) : currentIndex;
        if (clampedCurrent === currentIndex) {
            return;
        }
    }
    const otherRow = targetRow === "top" ? "bottom" : "top";
    const nextRows = normalizePanelRows(layoutState.panelRows);
    nextRows[otherRow] = nextRows[otherRow].filter((name) => name !== panel);
    nextRows[targetRow] = nextRows[targetRow].filter((name) => name !== panel);
    const target = nextRows[targetRow];
    const clamped = clamp(Number(index), 0, target.length);
    target.splice(clamped, 0, panel);
    setPanelRows(enforceDockingRowCaps(nextRows, { preferredRow: targetRow, preservePanel: panel }));
    applyLayout({ animatePanels });
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
        const radius = Math.max(0, layoutState.panelRadius);
        const hasRadius = radius > 0;
        const radiusSm = hasRadius ? Math.max(4, Math.round(radius * 0.8)) : 0;
        const radiusXs = hasRadius ? Math.max(2, Math.round(radius * 0.6)) : 0;
        const radiusXxs = hasRadius ? Math.max(1, Math.round(radius * 0.45)) : 0;
        const radiusMd = hasRadius ? Math.max(radius, Math.round(radius * 1.1)) : 0;
        const radiusLg = hasRadius ? Math.max(radiusMd, Math.round(radius * 1.35)) : 0;
        const radiusXl = hasRadius ? Math.max(radiusLg, Math.round(radius * 1.6)) : 0;
        const radius2xl = hasRadius ? Math.max(radiusXl, Math.round(radius * 1.9)) : 0;
        const radius3xl = hasRadius ? Math.max(radius2xl, Math.round(radius * 2.2)) : 0;

        document.documentElement.style.setProperty("--radius", `${radius}px`);
        document.documentElement.style.setProperty("--radius-sm", `${radiusSm}px`);
        document.documentElement.style.setProperty("--radius-xs", `${radiusXs}px`);
        document.documentElement.style.setProperty("--radius-xxs", `${radiusXxs}px`);
        document.documentElement.style.setProperty("--radius-md", `${radiusMd}px`);
        document.documentElement.style.setProperty("--radius-lg", `${radiusLg}px`);
        document.documentElement.style.setProperty("--radius-xl", `${radiusXl}px`);
        document.documentElement.style.setProperty("--radius-2xl", `${radius2xl}px`);
        document.documentElement.style.setProperty("--radius-3xl", `${radius3xl}px`);
        document.documentElement.style.setProperty("--radius-pill", hasRadius ? "999px" : "0px");
    }
}

function applyLayoutPreset(name, { animatePanels = true } = {}) {
    const preset = LAYOUT_PRESETS[name];
    if (!preset) return;
    activeLayoutPresetName = name;
    const nextState = {
        ...layoutState,
        dockMagnetDistance: DEFAULT_LAYOUT_STATE.dockMagnetDistance,
        panelReflowAnimation: DEFAULT_LAYOUT_STATE.panelReflowAnimation,
        ...preset,
    };
    delete nextState.panelRatios;
    layoutState = sanitizeLayoutState(nextState);
    applyLayout({ animatePanels });
    persistLayout();
    syncLayoutControls();
    if (name === "studio") {
        requestAnimationFrame(() => syncDefaultEditorSandboxWidth({ persist: true }));
    }
}

function applyActiveLayoutPreset({ animatePanels = true } = {}) {
    const name = Object.prototype.hasOwnProperty.call(LAYOUT_PRESETS, activeLayoutPresetName)
        ? activeLayoutPresetName
        : "studio";
    applyLayoutPreset(name, { animatePanels });
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
    let currentCode = source;
    const applyFormattedCode = (nextCode, lintReason) => {
        const normalized = String(nextCode ?? "");
        if (normalized === currentCode) return false;
        setEditorValue(normalized, { silent: true });
        updateActiveFileCode(normalized);
        queueEditorLint(lintReason);
        currentCode = normalized;
        return true;
    };

    // Keep UX immediate: apply basic formatting synchronously before async formatter load.
    if (mode !== "prettier") {
        const basic = formatBasic(currentCode);
        applyFormattedCode(basic, "format-basic");
        if (mode === "basic") {
            if (announce) {
                logger.append("system", ["Formatted (basic)."]);
                status.set("Formatted (basic)");
            }
            return { ok: true, method: "basic", code: basic };
        }
    }

    const result = await formatter.formatJavaScript(currentCode, {
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
    const formatted = String(result.code ?? currentCode);
    applyFormattedCode(formatted, "format");
    if (announce) {
        const label = result.method || "basic";
        logger.append("system", [`Formatted (${label}).`]);
        status.set(`Formatted (${label})`);
    }
    return result;
}

function buildSavedDiffPreview(savedCode, currentCode) {
    const savedText = String(savedCode ?? "");
    const currentText = String(currentCode ?? "");
    if (savedText === currentText) return "No unsaved differences.\n";
    const saved = savedText.split("\n");
    const current = currentText.split("\n");
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
        if (editorSplitScrollSyncFrame) {
            cancelAnimationFrame(editorSplitScrollSyncFrame);
            editorSplitScrollSyncFrame = 0;
        }
        if (!editorMirrorLastOpen) return;
        el.editorMirror.setAttribute("data-open", "false");
        el.editorMirror.textContent = "";
        editorMirrorLastOpen = false;
        editorMirrorLastFileId = "";
        editorMirrorLastSavedCode = null;
        editorMirrorLastCurrentCode = null;
        return;
    }
    bindEditorSplitScrollSync();
    el.editorMirror.setAttribute("data-open", "true");
    if (!active) {
        if (
            editorMirrorLastOpen &&
            editorMirrorLastFileId === "__none__" &&
            editorMirrorLastSavedCode === null &&
            editorMirrorLastCurrentCode === null
        ) {
            return;
        }
        el.editorMirror.textContent = "No active file.";
        editorMirrorLastOpen = true;
        editorMirrorLastFileId = "__none__";
        editorMirrorLastSavedCode = null;
        editorMirrorLastCurrentCode = null;
        scheduleEditorSplitScrollSync("editor");
        return;
    }
    const savedCode = String(active.savedCode ?? "");
    const currentCode = String(active.code ?? "");
    if (
        editorMirrorLastOpen &&
        editorMirrorLastFileId === active.id &&
        editorMirrorLastSavedCode === savedCode &&
        editorMirrorLastCurrentCode === currentCode
    ) {
        return;
    }
    el.editorMirror.textContent = buildSavedDiffPreview(savedCode, currentCode);
    editorMirrorLastOpen = true;
    editorMirrorLastFileId = active.id;
    editorMirrorLastSavedCode = savedCode;
    editorMirrorLastCurrentCode = currentCode;
    scheduleEditorSplitScrollSync("editor");
}

function getEditorComfortHost() {
    if (editor.type === "codemirror") {
        const wrapper = editor.raw?.getWrapperElement?.();
        if (wrapper instanceof HTMLElement) return wrapper;
    }
    return editor.raw instanceof HTMLElement ? editor.raw : null;
}

function getEditorComfortViewportHeight() {
    const host = getEditorComfortHost();
    const paneHeight = el.editorPanel?.querySelector?.(".editor-pane")?.clientHeight || 0;
    if (editor.type === "codemirror") {
        const scroller = editor.raw?.getScrollerElement?.() || host?.querySelector?.(".CodeMirror-scroll");
        const scrollerHeight = scroller instanceof HTMLElement ? scroller.clientHeight : 0;
        return Math.max(0, scrollerHeight || paneHeight || host?.clientHeight || 0);
    }
    return Math.max(0, paneHeight || host?.clientHeight || 0);
}

function computeEditorBottomComfortPx() {
    const viewportHeight = getEditorComfortViewportHeight();
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
        return EDITOR_BOTTOM_COMFORT_MIN_PX;
    }
    return clamp(
        Math.round(viewportHeight * EDITOR_BOTTOM_COMFORT_RATIO),
        EDITOR_BOTTOM_COMFORT_MIN_PX,
        EDITOR_BOTTOM_COMFORT_MAX_PX
    );
}

function applyEditorBottomComfortSpacing({ force = false } = {}) {
    const targetPx = computeEditorBottomComfortPx();
    if (!force && targetPx === editorBottomComfortLastPx) return false;
    editorBottomComfortLastPx = targetPx;
    if (editor.type === "codemirror") {
        const wrapper = editor.raw?.getWrapperElement?.();
        const lines = wrapper?.querySelector?.(".CodeMirror-lines");
        if (lines instanceof HTMLElement) {
            const nextPadding = `${targetPx}px`;
            if (lines.style.paddingBottom !== nextPadding) {
                lines.style.paddingBottom = nextPadding;
                editor.raw?.refresh?.();
            }
            return true;
        }
    }
    if (editor.raw instanceof HTMLElement) {
        const nextPadding = `${targetPx}px`;
        if (editor.raw.style.paddingBottom !== nextPadding) {
            editor.raw.style.paddingBottom = nextPadding;
        }
        return true;
    }
    return false;
}

function queueEditorBottomComfortSync({ force = false } = {}) {
    if (editorBottomComfortSyncFrame != null) return;
    editorBottomComfortSyncFrame = scheduleFrame(() => {
        editorBottomComfortSyncFrame = null;
        applyEditorBottomComfortSpacing({ force });
    });
}

function wireEditorBottomComfortObserver() {
    if (editorBottomComfortObserver) {
        try {
            editorBottomComfortObserver.disconnect();
        } catch (_err) {
            // noop
        }
        editorBottomComfortObserver = null;
    }
    if (typeof ResizeObserver !== "function") return;
    const pane = el.editorPanel?.querySelector?.(".editor-pane");
    const host = getEditorComfortHost();
    editorBottomComfortObserver = new ResizeObserver(() => {
        queueEditorBottomComfortSync();
    });
    if (pane instanceof HTMLElement) editorBottomComfortObserver.observe(pane);
    if (host instanceof HTMLElement && host !== pane) editorBottomComfortObserver.observe(host);
}

function maintainEditorCursorComfort() {
    if (editor.type !== "codemirror") return false;
    const cm = editor.raw;
    const doc = cm?.getDoc?.();
    const scroller = cm?.getScrollerElement?.();
    if (!doc || !(scroller instanceof HTMLElement)) return false;
    const cursor = doc.getCursor?.();
    if (!cursor) return false;
    const viewportHeight = scroller.clientHeight || 0;
    if (!viewportHeight) return false;
    const rect = scroller.getBoundingClientRect();
    const cursorPage = cm.cursorCoords?.(cursor, "page");
    if (!cursorPage || !Number.isFinite(cursorPage.top)) return false;
    const cursorY = cursorPage.top - rect.top;
    const targetY = viewportHeight * EDITOR_CURSOR_COMFORT_TARGET_RATIO;
    const tolerance = Math.max(16, viewportHeight * EDITOR_CURSOR_COMFORT_TOLERANCE_RATIO);
    if (cursorY <= targetY + tolerance) return false;
    const info = cm.getScrollInfo?.();
    const currentTop = Number(info?.top) || scroller.scrollTop || 0;
    const delta = cursorY - targetY;
    cm.scrollTo?.(info?.left ?? null, Math.max(0, currentTop + delta));
    return true;
}

function getEditorSplitScrollContainer() {
    if (editor.type === "codemirror") {
        const cm = editor.raw;
        const scroller = cm?.getScrollerElement?.();
        if (scroller instanceof HTMLElement) return scroller;
        const wrapper = cm?.getWrapperElement?.();
        const fallback = wrapper?.querySelector?.(".CodeMirror-scroll");
        if (fallback instanceof HTMLElement) return fallback;
        return null;
    }
    return editor.raw instanceof HTMLElement ? editor.raw : null;
}

function bindEditorSplitScrollSync() {
    if (el.editorMirror && !editorSplitMirrorScrollHandler) {
        editorSplitMirrorScrollHandler = () => syncEditorSplitScroll("mirror");
        el.editorMirror.addEventListener("scroll", editorSplitMirrorScrollHandler, { passive: true });
    }
    const nextHost = getEditorSplitScrollContainer();
    if (nextHost === editorSplitScrollHost) return;
    if (editorSplitScrollHost && editorSplitHostScrollHandler) {
        editorSplitScrollHost.removeEventListener("scroll", editorSplitHostScrollHandler);
    }
    editorSplitScrollHost = nextHost;
    if (!editorSplitScrollHost) return;
    if (!editorSplitHostScrollHandler) {
        editorSplitHostScrollHandler = () => syncEditorSplitScroll("editor");
    }
    editorSplitScrollHost.addEventListener("scroll", editorSplitHostScrollHandler, { passive: true });
}

function setEditorSplitScrollTop(nextTop) {
    const top = Math.max(0, Number(nextTop) || 0);
    if (editor.type === "codemirror" && editor.raw && typeof editor.raw.scrollTo === "function") {
        const info = typeof editor.raw.getScrollInfo === "function"
            ? editor.raw.getScrollInfo()
            : null;
        editor.raw.scrollTo(info?.left ?? null, top);
        return;
    }
    const scroller = getEditorSplitScrollContainer();
    if (scroller) scroller.scrollTop = top;
}

function syncEditorSplitScroll(source = "editor") {
    if (!editorSplitOpen || !el.editorMirror) return;
    bindEditorSplitScrollSync();
    const mirror = el.editorMirror;
    const editorScroller = editorSplitScrollHost;
    if (!(editorScroller instanceof HTMLElement)) return;
    if (editorSplitScrollSyncLock) return;
    editorSplitScrollSyncLock = true;
    try {
        if (source === "mirror") {
            setEditorSplitScrollTop(mirror.scrollTop);
        } else {
            mirror.scrollTop = editorScroller.scrollTop;
        }
    } finally {
        editorSplitScrollSyncLock = false;
    }
}

function scheduleEditorSplitScrollSync(source = "editor") {
    if (!editorSplitOpen) return;
    if (editorSplitScrollSyncFrame) {
        cancelAnimationFrame(editorSplitScrollSyncFrame);
    }
    editorSplitScrollSyncFrame = requestAnimationFrame(() => {
        editorSplitScrollSyncFrame = 0;
        syncEditorSplitScroll(source);
    });
}

function setEditorSplitOpen(open) {
    editorSplitOpen = Boolean(open);
    if (el.editorPanel) {
        el.editorPanel.setAttribute("data-editor-split", editorSplitOpen ? "true" : "false");
    }
    bindEditorSplitScrollSync();
    if (!editorSplitOpen && editorSplitScrollSyncFrame) {
        cancelAnimationFrame(editorSplitScrollSyncFrame);
        editorSplitScrollSyncFrame = 0;
    }
    syncEditorToolButtons();
    renderEditorMirror();
    scheduleEditorSplitScrollSync("editor");
}

function syncEditorToolButtons() {
    const states = [
        [el.btnEditorFind, editorSearchOpen],
        [el.btnEditorSymbols, symbolPaletteOpen],
        [el.btnProjectSearch, projectSearchOpen],
        [el.btnEditorSplit, editorSplitOpen],
        [el.btnEditorHistory, editorHistoryOpen],
        [el.btnEditorSettings, editorSettingsOpen],
    ];
    states.forEach(([btn, active]) => {
        if (!btn) return;
        setDataActive(btn, active);
    });
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

function makeTrashGroupId() {
    return `trash-group-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
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
    const filePath = getNextUntitledFileName(normalizedFolder);
    const file = makeFile(filePath, "", { preserveExtensionless: true });
    files.push(file);
    activeFileId = file.id;
    setSingleSelection(file.id);
    ensureTabOpen(file.id);
    expandFolderAncestors(file.name);
    setEditorValue(file.code, { silent: true });
    recordCodeSnapshot(file.id, file.code, "create-in-folder", { force: true });
    editingFileId = rename ? file.id : null;
    editingDraft = rename ? getFileBaseName(file.name) : null;
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
        pushFilesToTrash(scopedFiles, {
            deletedFolderPath: normalized,
        });
        const removedIds = new Set(scopedFiles.map((file) => file.id));
        files = files.filter((file) => !removedIds.has(file.id));
        openTabIds = openTabIds.filter((tabId) => !removedIds.has(tabId));

        if (!files.length) {
            const fallback = makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
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

function makeFile(name = FILE_DEFAULT_NAME, code = DEFAULT_CODE, { preserveExtensionless = false } = {}) {
    const normalizedName = preserveExtensionless
        ? normalizeLooseFileName(name, FILE_DEFAULT_NAME)
        : normalizeFileName(name);
    return {
        id: makeFileId(),
        name: normalizedName,
        code,
        savedCode: code,
        touchedAt: Date.now(),
        pinned: false,
        locked: false,
        family: "workspace",
        lessonId: "",
    };
}

function normalizeFile(file) {
    if (!file) return null;
    const code = typeof file.code === "string" ? file.code : DEFAULT_CODE;
    const rawFamily = String(file.family || "workspace").trim().toLowerCase();
    const family = rawFamily === "lesson" ? "lesson" : "workspace";
    const lessonId = family === "lesson" ? String(file.lessonId || "").trim() : "";
    return {
        id: String(file.id ?? makeFileId()),
        name: normalizeFileName(file.name, FILE_DEFAULT_NAME),
        code,
        savedCode: typeof file.savedCode === "string" ? file.savedCode : code,
        touchedAt: Number.isFinite(file.touchedAt) ? file.touchedAt : Date.now(),
        pinned: Boolean(file.pinned),
        locked: Boolean(file.locked),
        family,
        lessonId,
    };
}

function normalizeTrashEntry(entry) {
    const normalized = normalizeFile(entry);
    if (!normalized) return null;
    const deletedFolderPath = normalizeFolderPath(entry?.deletedFolderPath, { allowEmpty: true });
    const deletedGroupId = typeof entry?.deletedGroupId === "string" ? entry.deletedGroupId.trim() : "";
    return {
        ...normalized,
        deletedAt: Number.isFinite(entry?.deletedAt) ? entry.deletedAt : Date.now(),
        deletedFolderPath: deletedFolderPath || "",
        deletedGroupId: deletedFolderPath && deletedGroupId ? deletedGroupId : "",
    };
}

function clampWorkspaceEntries(list = [], {
    normalizeEntry,
    maxItems = 0,
    maxPathChars = 0,
    maxCodeCharsPerEntry = 0,
    maxTotalCodeChars = 0,
} = {}) {
    const normalize = typeof normalizeEntry === "function" ? normalizeEntry : ((entry) => entry);
    const itemLimit = Math.max(0, Number(maxItems) || 0);
    const pathLimit = Math.max(0, Number(maxPathChars) || 0);
    const perEntryCodeLimit = Math.max(0, Number(maxCodeCharsPerEntry) || 0);
    const totalCodeLimit = Math.max(0, Number(maxTotalCodeChars) || 0);

    const out = [];
    const usedIds = new Set();
    let totalCodeChars = 0;
    let dropped = 0;
    let truncatedCode = 0;
    let dedupedIds = 0;

    (Array.isArray(list) ? list : []).forEach((entry) => {
        if (itemLimit > 0 && out.length >= itemLimit) {
            dropped += 1;
            return;
        }

        const normalized = normalize(entry);
        if (!normalized) {
            dropped += 1;
            return;
        }

        const next = { ...normalized };
        const pathValue = String(next.name || "");
        if (!pathValue || (pathLimit > 0 && pathValue.length > pathLimit)) {
            dropped += 1;
            return;
        }

        const id = String(next.id || makeFileId());
        if (usedIds.has(id)) {
            next.id = makeFileId();
            dedupedIds += 1;
        } else {
            next.id = id;
        }
        usedIds.add(next.id);

        const originalCode = String(next.code ?? "");
        let allowedChars = perEntryCodeLimit > 0 ? perEntryCodeLimit : originalCode.length;
        if (totalCodeLimit > 0) {
            const remaining = Math.max(0, totalCodeLimit - totalCodeChars);
            if (remaining <= 0) {
                dropped += 1;
                return;
            }
            allowedChars = Math.min(allowedChars, remaining);
        }
        allowedChars = Math.max(0, allowedChars);
        const nextCode = originalCode.slice(0, allowedChars);
        if (nextCode.length < originalCode.length) {
            truncatedCode += 1;
        }
        next.code = nextCode;
        next.savedCode = nextCode;
        totalCodeChars += nextCode.length;
        out.push(next);
    });

    return {
        entries: out,
        dropped,
        truncatedCode,
        dedupedIds,
        totalCodeChars,
    };
}

function applyWorkspaceSafetyLimits(payload, { source = "workspace" } = {}) {
    if (!payload || typeof payload !== "object") return null;

    const fileResult = clampWorkspaceEntries(payload.files, {
        normalizeEntry: normalizeFile,
        maxItems: WORKSPACE_MAX_FILES,
        maxPathChars: WORKSPACE_MAX_PATH_CHARS,
        maxCodeCharsPerEntry: WORKSPACE_MAX_FILE_CODE_CHARS,
        maxTotalCodeChars: WORKSPACE_MAX_TOTAL_CODE_CHARS,
    });
    const trashResult = clampWorkspaceEntries(payload.trash, {
        normalizeEntry: normalizeTrashEntry,
        maxItems: WORKSPACE_MAX_TRASH,
        maxPathChars: WORKSPACE_MAX_PATH_CHARS,
        maxCodeCharsPerEntry: WORKSPACE_MAX_FILE_CODE_CHARS,
        maxTotalCodeChars: WORKSPACE_MAX_TRASH_CODE_CHARS,
    });

    const rawFolders = normalizeFolderList(payload.folders);
    const folderLengthFiltered = rawFolders.filter((folderPath) => String(folderPath || "").length <= WORKSPACE_MAX_PATH_CHARS);
    const limitedFolders = folderLengthFiltered.slice(0, WORKSPACE_MAX_FOLDERS);

    const fallbackInserted = fileResult.entries.length === 0;
    const limitedFiles = fallbackInserted
        ? [makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE)]
        : fileResult.entries;

    const activeId = limitedFiles.some((file) => file.id === payload.activeId)
        ? payload.activeId
        : limitedFiles[0].id;

    const fileIds = new Set(limitedFiles.map((file) => file.id));
    const nextOpenIds = [];
    const seenOpenIds = new Set();
    (Array.isArray(payload.openIds) ? payload.openIds : []).forEach((id) => {
        const nextId = String(id || "");
        if (!nextId || seenOpenIds.has(nextId) || !fileIds.has(nextId)) return;
        if (nextOpenIds.length >= WORKSPACE_MAX_OPEN_TABS) return;
        seenOpenIds.add(nextId);
        nextOpenIds.push(nextId);
    });
    if (!nextOpenIds.includes(activeId)) {
        nextOpenIds.unshift(activeId);
    }
    const normalizedOpenIds = nextOpenIds.slice(0, WORKSPACE_MAX_OPEN_TABS);

    const summary = {
        source: String(source || "workspace"),
        droppedFiles: fileResult.dropped,
        truncatedFiles: fileResult.truncatedCode,
        dedupedFileIds: fileResult.dedupedIds,
        droppedTrash: trashResult.dropped,
        truncatedTrash: trashResult.truncatedCode,
        dedupedTrashIds: trashResult.dedupedIds,
        droppedFoldersForLength: rawFolders.length - folderLengthFiltered.length,
        droppedFoldersForCap: Math.max(0, folderLengthFiltered.length - limitedFolders.length),
        openTabsTrimmed: Math.max(0, (Array.isArray(payload.openIds) ? payload.openIds.length : 0) - normalizedOpenIds.length),
        fallbackInserted,
    };
    summary.hasAdjustments = Object.keys(summary)
        .filter((key) => key !== "source" && key !== "hasAdjustments")
        .some((key) => Boolean(summary[key]));

    return {
        ...payload,
        files: limitedFiles,
        trash: trashResult.entries,
        folders: limitedFolders,
        activeId,
        openIds: normalizedOpenIds.length ? normalizedOpenIds : [activeId],
        _limitSummary: summary,
    };
}

function logWorkspaceSafetyAdjustments(summary, { label = "Workspace safety limits applied." } = {}) {
    if (!summary?.hasAdjustments) return;
    const details = [];
    if (summary.droppedFiles) details.push(`files dropped: ${summary.droppedFiles}`);
    if (summary.truncatedFiles) details.push(`files trimmed: ${summary.truncatedFiles}`);
    if (summary.dedupedFileIds) details.push(`file IDs regenerated: ${summary.dedupedFileIds}`);
    if (summary.droppedTrash) details.push(`trash dropped: ${summary.droppedTrash}`);
    if (summary.truncatedTrash) details.push(`trash trimmed: ${summary.truncatedTrash}`);
    if (summary.dedupedTrashIds) details.push(`trash IDs regenerated: ${summary.dedupedTrashIds}`);
    if (summary.droppedFoldersForLength) details.push(`folders dropped (path length): ${summary.droppedFoldersForLength}`);
    if (summary.droppedFoldersForCap) details.push(`folders dropped (count cap): ${summary.droppedFoldersForCap}`);
    if (summary.openTabsTrimmed) details.push(`open tabs trimmed: ${summary.openTabsTrimmed}`);
    if (summary.fallbackInserted) details.push("fallback file inserted");
    const suffix = details.length ? ` ${details.join(" | ")}` : "";
    logger.append("warn", [`${label}${suffix}`]);
}

function resolveWorkspacePathCollisions(payload, { source = "workspace" } = {}) {
    if (!payload || typeof payload !== "object") return payload;
    const list = Array.isArray(payload.files) ? payload.files : [];
    if (!list.length) return payload;

    const usedPaths = new Set();
    const remapped = [];
    const normalizedFiles = list.map((entry) => {
        const file = normalizeFile(entry);
        if (!file) return null;
        const originalPath = normalizePathSlashes(String(file.name || "").trim());
        if (!originalPath) return file;
        const nextPath = ensureUniquePathInSet(originalPath, usedPaths);
        if (nextPath !== originalPath) {
            remapped.push([originalPath, nextPath]);
        }
        return {
            ...file,
            name: nextPath,
        };
    }).filter(Boolean);

    if (!remapped.length) {
        return {
            ...payload,
            files: normalizedFiles,
        };
    }

    return {
        ...payload,
        files: normalizedFiles,
        folders: normalizeFolderList([
            ...(Array.isArray(payload.folders) ? payload.folders : []),
            ...collectFolderPaths(normalizedFiles, []),
        ]),
        _pathRemapSummary: {
            source: String(source || "workspace"),
            remappedPaths: remapped.length,
            samples: remapped.slice(0, 5),
            hasAdjustments: remapped.length > 0,
        },
    };
}

function logWorkspacePathRemaps(summary, { label = "Workspace path safety applied." } = {}) {
    if (!summary?.hasAdjustments) return;
    const count = Math.max(0, Number(summary.remappedPaths) || 0);
    const samples = (Array.isArray(summary.samples) ? summary.samples : [])
        .slice(0, 3)
        .map((entry) => `${entry?.[0] || ""} -> ${entry?.[1] || ""}`)
        .filter(Boolean)
        .join(", ");
    const suffix = count > 3 ? "..." : "";
    const detail = samples ? ` (${samples}${suffix})` : "";
    logger.append("warn", [`${label} Remapped ${count} path collision${count === 1 ? "" : "s"}${detail}.`]);
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
    if (persistenceWritesLocked) return;
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
        const nextPayload = {
            files: filesValue,
            folders: parsedFolders,
            activeId,
            openIds: normalizedOpen,
            trash: parsedTrash,
            savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0,
        };
        const limitedPayload = applyWorkspaceSafetyLimits(nextPayload, { source: "storage" }) || nextPayload;
        if (limitedPayload?._limitSummary?.hasAdjustments) {
            console.warn("FAZ IDE: workspace payload adjusted by safety limits", limitedPayload._limitSummary);
        }
        return limitedPayload;
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
    const value = JSON.stringify(payload);
    const ok = saveBatchAtomic([
        { key: STORAGE.WORKSPACE_SNAPSHOT, value },
    ], { label: `workspace-snapshot:${reason}` });
    if (!ok) {
        save(STORAGE.WORKSPACE_SNAPSHOT, value);
    }
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

function pushFilesToTrash(list = [], { deletedFolderPath = "", deletedGroupId = "" } = {}) {
    const now = Date.now();
    const normalizedFolderPath = normalizeFolderPath(deletedFolderPath, { allowEmpty: true }) || "";
    const normalizedGroupId = normalizedFolderPath
        ? (String(deletedGroupId || "").trim() || makeTrashGroupId())
        : "";
    const normalized = list
        .map((file) => normalizeFile(file))
        .filter(Boolean)
        .map((file) => ({
            ...file,
            deletedAt: now,
            deletedFolderPath: normalizedFolderPath,
            deletedGroupId: normalizedGroupId,
        }));
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

function normalizeTemplateIconSource(value = "") {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    if (/^https:\/\//i.test(raw)) return raw;
    if (/^\.\.?\//.test(raw) || raw.startsWith("/") || raw.startsWith("assets/")) {
        return normalizePathSlashes(raw);
    }
    return "";
}

function normalizeTemplateIconSources(entry = {}) {
    const seen = new Set();
    const normalized = [];
    const add = (candidate) => {
        const source = normalizeTemplateIconSource(candidate);
        if (!source) return;
        const key = source.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(source);
    };

    const iconField = entry?.icon;
    if (typeof iconField === "string") add(iconField);
    if (iconField && typeof iconField === "object" && Array.isArray(iconField.sources)) {
        iconField.sources.forEach(add);
    }
    if (Array.isArray(entry?.iconSources)) {
        entry.iconSources.forEach(add);
    }
    if (entry?.iconSrc !== undefined) add(entry.iconSrc);

    return normalized.slice(0, TEMPLATE_ICON_SOURCE_LIMIT);
}

function normalizeTemplate(entry, index = 0, { fallbackLabel = "Template" } = {}) {
    if (!entry) return null;
    const rawId = String(entry.id ?? "").trim();
    const rawName = String(entry.name ?? "").trim();
    const name = rawName || rawId || `${fallbackLabel} ${index + 1}`;
    const id = rawId || name.toLowerCase().replace(/\s+/g, "-");
    const hasExplicitFolder = Object.prototype.hasOwnProperty.call(entry, "folder");
    const rawFolder = hasExplicitFolder ? entry.folder : id;
    const normalizedFolder = normalizeFolderPath(rawFolder, { allowEmpty: true });
    const folder = normalizedFolder || (hasExplicitFolder ? "" : id);
    const legacySrc = String(entry.src ?? "").trim();
    const legacyFileName = String(entry.fileName ?? "").trim();
    const rawFiles = Array.isArray(entry.files) && entry.files.length
        ? entry.files
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
    const preferredEntry = String(entry.entryFile ?? entry.entry ?? "").trim();
    const preferredKey = normalizeFileName(preferredEntry, preferredEntry || files[0].path).toLowerCase();
    const preferred = files.find((file) => file.path.toLowerCase() === preferredKey);
    const firstScript = files.find((file) => getFileBaseName(file.path).toLowerCase().endsWith(".js"));
    const entryFile = preferred?.path || firstScript?.path || files[0].path;
    const iconSources = normalizeTemplateIconSources(entry);
    return {
        id,
        name,
        folder,
        files,
        entryFile,
        iconSources,
    };
}

function normalizeTemplateList(list, { fallbackLabel = "Template" } = {}) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    return list
        .map((entry, index) => normalizeTemplate(entry, index, { fallbackLabel }))
        .filter(Boolean)
        .filter((entry) => {
            if (seen.has(entry.id)) return false;
            seen.add(entry.id);
            return true;
        });
}

function normalizeGames(list) {
    return normalizeTemplateList(list, { fallbackLabel: "Game" });
}

function normalizeApplications(list) {
    return normalizeTemplateList(list, { fallbackLabel: "Application" });
}

function normalizeLessons(list) {
    return normalizeTemplateList(list, { fallbackLabel: "Lesson" });
}

function getGameById(id) {
    return games.find((game) => game.id === id);
}

function getApplicationById(id) {
    return applications.find((app) => app.id === id);
}

function getLessonById(id) {
    return lessons.find((lesson) => lesson.id === id);
}

function syncGamesUI() {
    if (!el.filesGames || !el.gamesSelectorToggle || !el.gamesList) return;
    const visible = syncTemplateSelectorShell({
        section: el.filesGames,
        toggle: el.gamesSelectorToggle,
        list: el.gamesList,
        loadButton: el.gameLoad,
        sectionId: "games",
        sectionOpen: layoutState.filesGamesOpen,
        listOpen: gamesSelectorOpen,
        hasItems: games.length > 0,
        hasSelection: Boolean(selectedGameId),
    });
    if (!visible) return;

    if (!games.some((game) => game.id === selectedGameId)) {
        selectedGameId = games[0]?.id ?? "";
    }

    syncTemplateSelectorShell({
        section: el.filesGames,
        toggle: el.gamesSelectorToggle,
        list: el.gamesList,
        loadButton: el.gameLoad,
        sectionId: "games",
        sectionOpen: layoutState.filesGamesOpen,
        listOpen: gamesSelectorOpen,
        hasItems: games.length > 0,
        hasSelection: Boolean(selectedGameId),
    });

    renderTemplateSelectorOptions(el.gamesList, games, selectedGameId, {
        optionIdPrefix: "game-option",
        optionDatasetKey: "gameId",
        iconSourceLimit: TEMPLATE_ICON_SOURCE_LIMIT,
    });
}

function syncApplicationsUI() {
    if (!el.filesApps || !el.appsSelectorToggle || !el.applicationsList) return;
    const visible = syncTemplateSelectorShell({
        section: el.filesApps,
        toggle: el.appsSelectorToggle,
        list: el.applicationsList,
        loadButton: el.appLoad,
        sectionId: "applications",
        sectionOpen: layoutState.filesAppsOpen,
        listOpen: applicationsSelectorOpen,
        hasItems: applications.length > 0,
        hasSelection: Boolean(selectedApplicationId),
    });
    if (!visible) return;

    if (!applications.some((app) => app.id === selectedApplicationId)) {
        selectedApplicationId = applications[0]?.id ?? "";
    }

    syncTemplateSelectorShell({
        section: el.filesApps,
        toggle: el.appsSelectorToggle,
        list: el.applicationsList,
        loadButton: el.appLoad,
        sectionId: "applications",
        sectionOpen: layoutState.filesAppsOpen,
        listOpen: applicationsSelectorOpen,
        hasItems: applications.length > 0,
        hasSelection: Boolean(selectedApplicationId),
    });

    renderTemplateSelectorOptions(el.applicationsList, applications, selectedApplicationId, {
        optionIdPrefix: "application-option",
        optionDatasetKey: "applicationId",
        iconSourceLimit: TEMPLATE_ICON_SOURCE_LIMIT,
    });
}

function syncLessonsUI() {
    if (!el.filesLessons || !el.lessonsSelectorToggle || !el.lessonsList) return;
    const visible = syncTemplateSelectorShell({
        section: el.filesLessons,
        toggle: el.lessonsSelectorToggle,
        list: el.lessonsList,
        loadButton: el.lessonLoad,
        sectionId: "lessons",
        sectionOpen: layoutState.filesLessonsOpen,
        listOpen: lessonsSelectorOpen,
        hasItems: lessons.length > 0,
        hasSelection: Boolean(selectedLessonId),
    });
    if (!visible) return;

    if (!lessons.some((lesson) => lesson.id === selectedLessonId)) {
        selectedLessonId = lessons[0]?.id ?? "";
    }

    syncTemplateSelectorShell({
        section: el.filesLessons,
        toggle: el.lessonsSelectorToggle,
        list: el.lessonsList,
        loadButton: el.lessonLoad,
        sectionId: "lessons",
        sectionOpen: layoutState.filesLessonsOpen,
        listOpen: lessonsSelectorOpen,
        hasItems: lessons.length > 0,
        hasSelection: Boolean(selectedLessonId),
    });

    renderTemplateSelectorOptions(el.lessonsList, lessons, selectedLessonId, {
        optionIdPrefix: "lesson-option",
        optionDatasetKey: "lessonId",
        iconSourceLimit: TEMPLATE_ICON_SOURCE_LIMIT,
    });
}

async function loadTemplateFilesFromSources(templateFiles = [], contextLabel = "Template") {
    const sourceFiles = Array.isArray(templateFiles) ? templateFiles : [];
    const loaded = await Promise.all(
        sourceFiles.map(async (file) => {
            const response = await fetch(file.src, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`${contextLabel} fetch failed: HTTP ${response.status} ${response.statusText}`);
            }
            return {
                path: file.path,
                code: await response.text(),
            };
        })
    );
    return loaded.filter((entry) => entry && entry.path);
}

async function loadGameById(id, { runAfter = false } = {}) {
    const game = getGameById(id);
    if (!game) {
        status.set("Game not found");
        logger.append("error", [`Game "${id}" not found.`]);
        return false;
    }

    selectedGameId = game.id;
    syncGamesUI();
    status.set(`Loading ${game.name}...`);
    if (el.gameLoad) el.gameLoad.disabled = true;

    try {
        const before = snapshotWorkspaceState();
        const loadedFiles = await loadTemplateFilesFromSources(game.files, "Game template");
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

async function loadApplicationById(id, { runAfter = false } = {}) {
    const app = getApplicationById(id);
    if (!app) {
        status.set("Application not found");
        logger.append("error", [`Application "${id}" not found.`]);
        return false;
    }

    selectedApplicationId = app.id;
    syncApplicationsUI();
    status.set(`Loading ${app.name}...`);
    if (el.appLoad) el.appLoad.disabled = true;

    try {
        const before = snapshotWorkspaceState();
        const loadedFiles = await loadTemplateFilesFromSources(app.files, "Application template");
        if (!loadedFiles.length) {
            throw new Error("Application template is empty.");
        }
        const normalizedFolder = normalizeFolderPath(app.folder, { allowEmpty: true });
        const folderPath = normalizedFolder ? ensureUniqueFolderPath(normalizedFolder, { ignoreCase: true }) : "";
        const entryPath = normalizeFileName(app.entryFile || loadedFiles[0].path, loadedFiles[0].path);
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
        ) || created.find((file) => getFileBaseName(file.name).toLowerCase().endsWith(".js"))
            || created.find((file) => getFileBaseName(file.name).toLowerCase().endsWith(".html"))
            || created[0];

        activeFileId = activeTarget.id;
        ensureTabOpen(activeTarget.id);
        clearInlineRenameState();
        setEditorValue(activeTarget.code, { silent: true });
        persistFiles();
        renderFileList();
        recordFileHistory(`Load application ${app.name}`, before);

        status.set(runAfter ? `Loaded ${app.name} (running)` : `Loaded ${app.name}`);
        logger.append("system", [`Loaded application: ${app.name} into ${folderPath || "workspace root"} (${created.length} files)`]);

        if (runAfter) {
            run();
        }
        return true;
    } catch (err) {
        status.set("Application load failed");
        logger.append("error", [`Failed to load ${app.name}: ${String(err.message || err)}`]);
        return false;
    } finally {
        syncApplicationsUI();
    }
}

function getLessonCurrentStep() {
    if (!lessonSession) return null;
    const index = clamp(Number(lessonSession.stepIndex) || 0, 0, Math.max(0, lessonSession.steps.length - 1));
    return lessonSession.steps[index] || null;
}

function computeLessonLevel(xp = 0) {
    const safeXp = Math.max(0, Number(xp) || 0);
    return Math.floor(safeXp / 250) + 1;
}

function sanitizeLessonProfile(raw = null) {
    const source = raw && typeof raw === "object" ? raw : {};
    const xp = Math.max(0, Math.floor(Number(source.xp) || 0));
    const bytes = Math.max(0, Math.floor(Number(source.bytes ?? source.coins) || 0));
    const unlockedThemes = new Set([DEFAULT_THEME]);
    const rawUnlockedThemes = Array.isArray(source.unlockedThemes) ? source.unlockedThemes : [];
    rawUnlockedThemes.forEach((themeName) => {
        const normalizedTheme = normalizeTheme(themeName, THEMES, "");
        if (normalizedTheme) unlockedThemes.add(normalizedTheme);
    });
    const totalTypedChars = Math.max(0, Math.floor(Number(source.totalTypedChars) || 0));
    const lessonsCompleted = Math.max(0, Math.floor(Number(source.lessonsCompleted) || 0));
    const bestStreak = Math.max(0, Math.floor(Number(source.bestStreak) || 0));
    const currentStreak = Math.max(0, Math.floor(Number(source.currentStreak) || 0));
    const dailyStreak = Math.max(0, Math.floor(Number(source.dailyStreak) || 0));
    const lastActiveDay = String(source.lastActiveDay || "").trim();
    return {
        xp,
        level: Math.max(1, Math.floor(Number(source.level) || computeLessonLevel(xp))),
        bytes,
        unlockedThemes: [...unlockedThemes],
        totalTypedChars,
        lessonsCompleted,
        bestStreak,
        currentStreak,
        dailyStreak,
        lastActiveDay,
    };
}

function parseStoredJson(raw) {
    if (raw && typeof raw === "object") return raw;
    const text = String(raw || "").trim();
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}

function sanitizeStoredLessonSession(raw = null) {
    const source = raw && typeof raw === "object" ? raw : null;
    if (!source) return null;
    const fileId = String(source.fileId || "").trim();
    if (!fileId) return null;
    const fileName = String(source.fileName || "").trim();
    const lessonId = String(source.lessonId || "").trim();
    return {
        fileId,
        fileName,
        lessonId,
        stepIndex: Math.max(0, Math.floor(Number(source.stepIndex) || 0)),
        progress: Math.max(0, Math.floor(Number(source.progress) || 0)),
        startedAt: Math.max(0, Math.floor(Number(source.startedAt) || 0)) || Date.now(),
        typedChars: Math.max(0, Math.floor(Number(source.typedChars) || 0)),
        correctChars: Math.max(0, Math.floor(Number(source.correctChars) || 0)),
        streak: Math.max(0, Math.floor(Number(source.streak) || 0)),
        bestStreak: Math.max(0, Math.floor(Number(source.bestStreak) || 0)),
        coinMilestoneIndex: Math.max(0, Math.floor(Number(source.coinMilestoneIndex) || 0)),
        mistakes: Math.max(0, Math.floor(Number(source.mistakes) || 0)),
        sessionXp: Math.max(0, Math.floor(Number(source.sessionXp) || 0)),
    };
}

function clearPersistedLessonSession() {
    if (persistenceWritesLocked) return;
    lessonSessionDirtyWrites = 0;
    save(STORAGE.LESSON_SESSION, "");
}

function persistLessonSession({ force = false } = {}) {
    if (persistenceWritesLocked) return;
    if (!lessonSession || lessonSession.completed) {
        clearPersistedLessonSession();
        return;
    }
    lessonSessionDirtyWrites += 1;
    if (!force && lessonSessionDirtyWrites < 5) return;
    lessonSessionDirtyWrites = 0;
    const payload = {
        fileId: lessonSession.fileId,
        fileName: lessonSession.fileName,
        lessonId: String(selectedLessonId || ""),
        stepIndex: Math.max(0, Math.floor(Number(lessonSession.stepIndex) || 0)),
        progress: Math.max(0, Math.floor(Number(lessonSession.progress) || 0)),
        startedAt: Math.max(0, Math.floor(Number(lessonSession.startedAt) || 0)) || Date.now(),
        typedChars: Math.max(0, Math.floor(Number(lessonSession.typedChars) || 0)),
        correctChars: Math.max(0, Math.floor(Number(lessonSession.correctChars) || 0)),
        streak: Math.max(0, Math.floor(Number(lessonSession.streak) || 0)),
        bestStreak: Math.max(0, Math.floor(Number(lessonSession.bestStreak) || 0)),
        coinMilestoneIndex: Math.max(0, Math.floor(Number(lessonSession.coinMilestoneIndex) || 0)),
        mistakes: Math.max(0, Math.floor(Number(lessonSession.mistakes) || 0)),
        sessionXp: Math.max(0, Math.floor(Number(lessonSession.sessionXp) || 0)),
    };
    save(STORAGE.LESSON_SESSION, JSON.stringify(payload));
}

function restoreLessonSessionFromStorage() {
    const parsed = sanitizeStoredLessonSession(parseStoredJson(load(STORAGE.LESSON_SESSION)));
    if (!parsed) {
        clearPersistedLessonSession();
        return false;
    }

    const file = files.find((entry) => entry.id === parsed.fileId);
    if (!file) {
        clearPersistedLessonSession();
        return false;
    }

    const source = String(file.code || "");
    const steps = parseLessonSteps(source);
    if (!steps.length) {
        clearPersistedLessonSession();
        return false;
    }

    if (!isLessonFamilyFile(file)) {
        const lessonExists = lessons.some((entry) => entry.id === parsed.lessonId);
        if (!lessonExists) {
            clearPersistedLessonSession();
            return false;
        }
        file.family = "lesson";
        file.lessonId = parsed.lessonId;
    }

    const stepIndex = clamp(parsed.stepIndex, 0, Math.max(0, steps.length - 1));
    const step = steps[stepIndex] || steps[0];
    const progress = clamp(parsed.progress, 0, Math.max(0, Number(step?.expected?.length) || 0));

    lessonSession = {
        fileId: file.id,
        fileName: file.name,
        steps,
        stepIndex,
        progress,
        completed: false,
        startedAt: parsed.startedAt || Date.now(),
        typedChars: parsed.typedChars,
        correctChars: parsed.correctChars,
        streak: parsed.streak,
        bestStreak: Math.max(parsed.bestStreak, parsed.streak),
        coinMilestoneIndex: Math.max(parsed.coinMilestoneIndex, Math.floor(parsed.streak / LESSON_BYTES_STREAK_INTERVAL)),
        mistakes: parsed.mistakes,
        sessionXp: parsed.sessionXp,
    };

    const lessonExists = lessons.some((entry) => entry.id === parsed.lessonId);
    if (lessonExists) {
        selectedLessonId = parsed.lessonId;
        syncLessonsUI();
    }

    if (activeFileId === lessonSession.fileId) {
        syncLessonGhostMarks();
        setLessonCursorToProgress();
        updateLessonProgressStatus({ prefix: "Lesson resumed" });
    } else {
        editor.clearMarks?.("lesson-ghost");
        editor.clearMarks?.("lesson-active");
        editor.clearMarks?.("lesson-next");
        updateLessonHud();
    }

    persistLessonSession({ force: true });
    return true;
}

function getLessonDayStamp(now = Date.now()) {
    const date = new Date(now);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function persistLessonProfile({ force = false } = {}) {
    if (persistenceWritesLocked) return;
    lessonProfileDirtyWrites += 1;
    if (!force && lessonProfileDirtyWrites < 8) return;
    lessonProfileDirtyWrites = 0;
    save(STORAGE.LESSON_PROFILE, JSON.stringify(lessonProfile));
}

function loadLessonProfile() {
    lessonProfile = sanitizeLessonProfile(parseStoredJson(load(STORAGE.LESSON_PROFILE)));
    const storedTheme = normalizeTheme(load(STORAGE.THEME), THEMES, "");
    if (storedTheme && !lessonProfile.unlockedThemes.includes(storedTheme)) {
        lessonProfile.unlockedThemes = [...new Set([...lessonProfile.unlockedThemes, storedTheme])];
    }
    persistLessonProfile({ force: true });
    updateLessonHeaderStats();
}

function getThemeByteCost(themeName = "") {
    const normalizedTheme = normalizeTheme(themeName, THEMES, DEFAULT_THEME);
    return Math.max(0, Math.floor(Number(THEME_BYTE_COSTS[normalizedTheme]) || 0));
}

function isThemeUnlocked(themeName = "") {
    const normalizedTheme = normalizeTheme(themeName, THEMES, DEFAULT_THEME);
    const unlockedThemes = Array.isArray(lessonProfile?.unlockedThemes) ? lessonProfile.unlockedThemes : [];
    return unlockedThemes.includes(normalizedTheme);
}

function unlockLessonTheme(themeName = "", { spend = true } = {}) {
    const normalizedTheme = normalizeTheme(themeName, THEMES, DEFAULT_THEME);
    if (isThemeUnlocked(normalizedTheme)) return true;
    const cost = getThemeByteCost(normalizedTheme);
    const currentBytes = Math.max(0, Number(lessonProfile.bytes) || 0);
    if (spend && currentBytes < cost) return false;
    if (spend && cost > 0) {
        lessonProfile.bytes = Math.max(0, currentBytes - cost);
    }
    const nextUnlockedThemes = new Set(Array.isArray(lessonProfile.unlockedThemes) ? lessonProfile.unlockedThemes : [DEFAULT_THEME]);
    nextUnlockedThemes.add(DEFAULT_THEME);
    nextUnlockedThemes.add(normalizedTheme);
    lessonProfile.unlockedThemes = [...nextUnlockedThemes];
    persistLessonProfile({ force: true });
    return true;
}

function buildThemeShopSnapshot() {
    const currentBytes = Math.max(0, Number(lessonProfile.bytes) || 0);
    return THEMES.map((themeName) => {
        const cost = getThemeByteCost(themeName);
        const unlocked = isThemeUnlocked(themeName);
        return {
            id: themeName,
            label: getThemeDisplayLabel(themeName),
            cost,
            unlocked,
            active: currentTheme === themeName,
            affordable: currentBytes >= cost,
            bytes: currentBytes,
        };
    });
}

function setLessonShopNotice(message = "") {
    lessonShopNotice = String(message || "").trim();
    if (el.lessonStatsShopHint) {
        setNodeText(el.lessonStatsShopHint, lessonShopNotice || "Buy themes using Bytes earned from lessons.");
    }
}

function setLessonStatsView(view = "overview") {
    const normalizedView = view === "shop" ? "shop" : "overview";
    lessonStatsView = normalizedView;
    if (el.lessonStatsOverview) {
        setVisibilityState(el.lessonStatsOverview, normalizedView === "overview");
    }
    if (el.lessonStatsShop) {
        setVisibilityState(el.lessonStatsShop, normalizedView === "shop");
    }
    if (el.lessonStatsOverviewTab) {
        setDataActive(el.lessonStatsOverviewTab, normalizedView === "overview");
        setAriaPressed(el.lessonStatsOverviewTab, normalizedView === "overview");
    }
    if (el.lessonStatsShopTab) {
        setDataActive(el.lessonStatsShopTab, normalizedView === "shop");
        setAriaPressed(el.lessonStatsShopTab, normalizedView === "shop");
    }
}

function updateLessonShopUi({ force = false } = {}) {
    if (el.lessonShopBytes) {
        setNodeText(el.lessonShopBytes, `Bytes ${Math.max(0, Number(lessonProfile.bytes) || 0)}`);
    }
    setLessonShopNotice(lessonShopNotice);
    if (!el.lessonStatsShopList) return;
    if (!force && (!lessonStatsOpen || lessonStatsView !== "shop")) {
        return;
    }
    const fragment = document.createDocumentFragment();
    const themeEntries = buildThemeShopSnapshot();
    const renderKey = themeEntries
        .map((entry) => `${entry.id}:${entry.unlocked ? "1" : "0"}:${entry.active ? "1" : "0"}:${entry.affordable ? "1" : "0"}:${entry.cost}`)
        .join("|");
    if (!force && renderKey === lessonShopRenderKey) {
        return;
    }
    lessonShopRenderKey = renderKey;
    themeEntries.forEach((entry) => {
        const row = document.createElement("li");
        row.className = "lesson-shop-item";
        row.setAttribute("data-theme", entry.id);

        const meta = document.createElement("div");
        meta.className = "lesson-shop-meta";
        const title = document.createElement("strong");
        title.textContent = entry.label;
        const subtitle = document.createElement("span");
        subtitle.textContent = entry.unlocked
            ? (entry.active ? "Owned • Active" : "Owned")
            : `${entry.cost} Bytes`;
        meta.append(title, subtitle);

        const action = document.createElement("button");
        action.type = "button";
        action.className = "lesson-shop-action";
        action.dataset.lessonShopTheme = entry.id;

        if (entry.active) {
            action.textContent = "Active";
            action.disabled = true;
        } else if (entry.unlocked) {
            action.textContent = "Apply";
            action.dataset.lessonShopAction = "apply";
        } else {
            action.textContent = `Buy ${entry.cost}`;
            action.dataset.lessonShopAction = "buy";
            action.disabled = !entry.affordable;
        }

        row.append(meta, action);
        fragment.appendChild(row);
    });
    el.lessonStatsShopList.innerHTML = "";
    el.lessonStatsShopList.appendChild(fragment);
}

function setNodeText(node, text = "") {
    if (!node) return;
    const next = String(text || "");
    if (node.textContent !== next) {
        node.textContent = next;
    }
}

function animateLessonHudPulse(kind = "soft") {
    if (!el.lessonHud || typeof el.lessonHud.animate !== "function") return;
    const now = Date.now();
    const minGap = kind === "intense" ? 170 : 110;
    if (now - lessonHudPulseLastAt < minGap) return;
    lessonHudPulseLastAt = now;
    const keyframes = kind === "intense"
        ? [
            { transform: "translateY(0) scale(1)", filter: "saturate(1)", offset: 0 },
            { transform: "translateY(-1px) scale(1.012)", filter: "saturate(1.2)", offset: 0.45 },
            { transform: "translateY(0) scale(1)", filter: "saturate(1)", offset: 1 },
        ]
        : [
            { transform: "translateY(0) scale(1)", offset: 0 },
            { transform: "translateY(-1px) scale(1.006)", offset: 0.5 },
            { transform: "translateY(0) scale(1)", offset: 1 },
        ];
    const duration = kind === "intense" ? 420 : 280;
    el.lessonHud.animate(keyframes, {
        duration,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        iterations: 1,
    });
}

function triggerLessonHaptic(duration = 8) {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    const now = Date.now();
    const requested = Math.max(0, Math.min(24, Number(duration) || 0));
    const minGap = requested >= 10 ? 90 : 130;
    if (now - lessonHapticLastAt < minGap) return;
    lessonHapticLastAt = now;
    try {
        navigator.vibrate(requested);
    } catch {
    }
}

function triggerLessonEditorLevelUp(level = 1) {
    const editorPane = document.querySelector("#editorPanel .editor-pane");
    if (!(editorPane instanceof HTMLElement)) return;

    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    editorPane.setAttribute("data-lesson-levelup", "true");
    editorPane.setAttribute("data-lesson-level-label", `LEVEL UP • LV ${safeLevel}`);

    const prefersReducedMotion = typeof window !== "undefined"
        && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!prefersReducedMotion) {
        const codeSurface = editor.type === "codemirror"
            ? document.querySelector("#editorPanel .CodeMirror")
            : el.editor;

        if (codeSurface && typeof codeSurface.animate === "function") {
            codeSurface.animate([
                { transform: "translateY(0) scale(1)", filter: "saturate(1)", offset: 0 },
                { transform: "translateY(-2px) scale(1.008)", filter: "saturate(1.28)", offset: 0.28 },
                { transform: "translateY(0) scale(1)", filter: "saturate(1)", offset: 1 },
            ], {
                duration: 720,
                easing: "cubic-bezier(0.2, 0.85, 0.22, 1)",
                iterations: 1,
            });
        }
    }

    if (lessonEditorLevelUpTimer) {
        clearTimeout(lessonEditorLevelUpTimer);
    }
    lessonEditorLevelUpTimer = setTimeout(() => {
        const node = document.querySelector("#editorPanel .editor-pane");
        if (node instanceof HTMLElement) {
            node.removeAttribute("data-lesson-levelup");
            node.removeAttribute("data-lesson-level-label");
        }
        lessonEditorLevelUpTimer = 0;
    }, 980);
}

function getLessonSessionMetrics(session = lessonSession) {
    if (!session) {
        return { accuracy: 100, wpm: 0, typedChars: 0, correctChars: 0, elapsedMs: 0 };
    }
    const typedChars = Math.max(0, Number(session.typedChars) || 0);
    const correctChars = Math.max(0, Number(session.correctChars) || 0);
    const accuracy = typedChars > 0
        ? clamp(Math.round((correctChars / typedChars) * 100), 0, 100)
        : 100;
    const elapsedMs = Math.max(1, Date.now() - (Math.max(0, Number(session.startedAt) || 0) || Date.now()));
    const minutes = elapsedMs / 60000;
    const wpm = correctChars > 0
        ? clamp(Math.round((correctChars / 5) / Math.max(1 / 600, minutes)), 0, 999)
        : 0;
    return { accuracy, wpm, typedChars, correctChars, elapsedMs };
}

function formatLessonElapsedMs(elapsedMs = 0) {
    const safe = Math.max(0, Math.floor(Number(elapsedMs) || 0));
    const seconds = Math.floor(safe / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const remainSeconds = seconds % 60;
    const remainMinutes = minutes % 60;
    if (hours > 0) {
        return `${hours}h ${String(remainMinutes).padStart(2, "0")}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${String(remainSeconds).padStart(2, "0")}s`;
    }
    return `${remainSeconds}s`;
}

function getLessonMomentumTitle({ completed = 0, bestStreak = 0, accuracy = 100 } = {}) {
    if (completed >= 25 || bestStreak >= 60) return "Legend Builder";
    if (completed >= 12 || bestStreak >= 35) return "Flow Architect";
    if (completed >= 5 || bestStreak >= 15 || accuracy >= 96) return "Rhythm Runner";
    return "Code Cadet";
}

function updateLessonHeaderStats({ force = false } = {}) {
    if (!el.lessonHeaderStats) return;
    const now = Date.now();
    if (!lessonStatsOpen && !force && now - lessonHeaderStatsLastSyncAt < 900) {
        return;
    }

    const metrics = getLessonSessionMetrics(lessonSession);
    const state = getLessonStateSnapshot({ metrics });
    const levelText = `Lv ${Math.max(1, Number(lessonProfile.level) || 1)}`;
    const xpText = `XP ${Math.max(0, Number(lessonProfile.xp) || 0)}`;
    const bytesText = `Bytes ${Math.max(0, Number(lessonProfile.bytes) || 0)}`;
    const completedText = `Done ${Math.max(0, Number(lessonProfile.lessonsCompleted) || 0)}`;
    const bestText = `Best ${Math.max(0, Number(lessonProfile.bestStreak) || 0)}`;
    const dailyText = `Daily ${Math.max(0, Number(lessonProfile.dailyStreak) || 0)}`;
    const accuracyText = `Acc ${metrics.accuracy}%`;
    const wpmText = `WPM ${metrics.wpm}`;
    const currentXp = Math.max(0, Number(lessonProfile.xp) || 0);
    const xpIntoLevel = currentXp % 250;
    const xpToNext = Math.max(1, 250 - xpIntoLevel);
    const nextLevelProgress = clamp(Math.round((xpIntoLevel / 250) * 100), 0, 100);
    const momentumTitle = getLessonMomentumTitle({
        completed: Math.max(0, Number(lessonProfile.lessonsCompleted) || 0),
        bestStreak: Math.max(0, Number(lessonProfile.bestStreak) || 0),
        accuracy: metrics.accuracy,
    });
    const heroSubtitle = state?.active
        ? `Active lesson pressure: ${metrics.accuracy}% accuracy at ${metrics.wpm} WPM.`
        : "Build rhythm with clean, steady reps.";
    const nextLabel = `Next level in ${xpToNext} XP`;
    const lastActive = String(lessonProfile.lastActiveDay || "").trim() || "--";
    const sessionStateText = state?.active
        ? `Active: ${String(state.fileName || "Lesson")} (${state.completed ? "completed" : "in progress"})`
        : "No active lesson session";
    const stepText = state?.active ? String(state.stepId || "--") : "--";
    const progressText = state?.active ? `${Math.max(0, Number(state.progress) || 0)}/${Math.max(0, Number(state.expectedLength) || 0)}` : "0/0";
    const sessionXpText = String(Math.max(0, Number(state?.sessionXp) || 0));
    const mistakesText = String(Math.max(0, Number(state?.mistakes) || 0));
    const streakText = String(Math.max(0, Number(state?.streak) || 0));
    const typedText = String(metrics.typedChars);
    const correctText = String(metrics.correctChars);
    const elapsedText = formatLessonElapsedMs(metrics.elapsedMs);
    const renderKey = `${levelText}|${xpText}|${bytesText}|${completedText}|${bestText}|${dailyText}|${accuracyText}|${wpmText}|${momentumTitle}|${heroSubtitle}|${nextLabel}|${nextLevelProgress}|${lastActive}|${sessionStateText}|${stepText}|${progressText}|${sessionXpText}|${mistakesText}|${streakText}|${typedText}|${correctText}|${elapsedText}`;
    if (renderKey !== lessonHeaderStatsRenderKey) {
        lessonHeaderStatsRenderKey = renderKey;
        setNodeText(el.lessonHeaderLevel, levelText);
        setNodeText(el.lessonHeaderXp, xpText);
        setNodeText(el.lessonHeaderCoins, bytesText);
        setNodeText(el.lessonHeaderCompleted, completedText);
        setNodeText(el.lessonHeaderBest, bestText);
        setNodeText(el.lessonHeaderDaily, dailyText);
        setNodeText(el.lessonHeaderAccuracy, accuracyText);
        setNodeText(el.lessonHeaderWpm, wpmText);
        setNodeText(el.lessonStatsHeroTitle, momentumTitle);
        setNodeText(el.lessonStatsHeroSubtitle, heroSubtitle);
        setNodeText(el.lessonStatsNextLabel, nextLabel);
        setNodeText(el.lessonStatsLastActive, lastActive);
        setNodeText(el.lessonStatsSessionState, sessionStateText);
        setNodeText(el.lessonStatsStep, stepText);
        setNodeText(el.lessonStatsProgress, progressText);
        setNodeText(el.lessonStatsSessionXp, sessionXpText);
        setNodeText(el.lessonStatsMistakes, mistakesText);
        setNodeText(el.lessonStatsStreak, streakText);
        setNodeText(el.lessonStatsTyped, typedText);
        setNodeText(el.lessonStatsCorrect, correctText);
        setNodeText(el.lessonStatsElapsed, elapsedText);
        setNodeText(el.lessonStatsSafety, "Privacy-safe: all lesson stats stay local in your browser.");
        if (el.lessonStatsNextFill) {
            el.lessonStatsNextFill.style.setProperty("--lesson-next-progress", `${nextLevelProgress}%`);
        }
    }

    el.lessonHeaderStats.setAttribute(
        "aria-label",
        `Lesson stats: level ${Math.max(1, Number(lessonProfile.level) || 1)}, XP ${Math.max(0, Number(lessonProfile.xp) || 0)}, bytes ${Math.max(0, Number(lessonProfile.bytes) || 0)}, lessons completed ${Math.max(0, Number(lessonProfile.lessonsCompleted) || 0)}, best streak ${Math.max(0, Number(lessonProfile.bestStreak) || 0)}, daily streak ${Math.max(0, Number(lessonProfile.dailyStreak) || 0)}, accuracy ${metrics.accuracy} percent, pace ${metrics.wpm} WPM, next level in ${xpToNext} XP. Privacy-safe local storage only`
    );
    if (lessonStatsOpen && lessonStatsView === "shop") {
        updateLessonShopUi();
    }
    lessonHeaderStatsLastSyncAt = now;
}

function setLessonStatsLivePolling(active) {
    const shouldRun = Boolean(active);
    if (!shouldRun) {
        if (lessonStatsLiveTimer) {
            clearInterval(lessonStatsLiveTimer);
            lessonStatsLiveTimer = 0;
        }
        return;
    }

    if (lessonStatsLiveTimer) return;
    lessonStatsLiveTimer = setInterval(() => {
        if (!lessonStatsOpen) return;
        if (!lessonSession || lessonSession.completed) return;
        updateLessonHeaderStats({ force: true });
    }, 1000);
}

function updateLessonHud() {
    if (!el.lessonHud) return;
    const active = isLessonSessionActiveForCurrentFile();
    setDataActive(el.lessonHud, active);
    el.lessonHud.hidden = !active;
    if (!active) {
        lessonHudWasActive = false;
        lessonHudLastRenderKey = "";
        lessonHudLastStepKey = "";
        lessonHudLastProgressBucket = -1;
        lessonHudLastTier = "none";
        lessonHudLastMood = "focus";
        el.lessonHud.dataset.streakTier = "none";
        el.lessonHud.dataset.mood = "focus";
        el.lessonHud.style.setProperty("--lesson-progress", "0%");
        el.lessonHud.style.setProperty("--lesson-combo-progress", "0%");
        if (el.lessonHudFill) {
            el.lessonHudFill.style.setProperty("--lesson-progress", "0%");
        }
        if (lessonHudBurstTimer) {
            clearTimeout(lessonHudBurstTimer);
            lessonHudBurstTimer = 0;
        }
        el.lessonHud.setAttribute("data-burst", "false");
        setNodeText(el.lessonHudMood, "Calm rhythm. Ready when you are.");
        setNodeText(el.lessonHudPace, "WPM 0");
        setNodeText(el.lessonHudCoins, `Bytes ${Math.max(0, Number(lessonProfile.bytes) || 0)}`);
        updateLessonHeaderStats();
        return;
    }
    if (!lessonHudWasActive) {
        lessonHudWasActive = true;
        lessonHudLastRenderKey = "";
        lessonHudLastStepKey = "";
        lessonHudLastProgressBucket = -1;
        lessonHudLastTier = "none";
        lessonHudLastMood = "focus";
    }

    const step = getLessonCurrentStep();
    const stepId = step?.id || "lesson";
    const stepIndex = Math.max(1, (Number(lessonSession?.stepIndex) || 0) + 1);
    const stepCount = Math.max(1, Number(lessonSession?.steps?.length) || 1);
    const progress = Math.max(0, Number(lessonSession?.progress) || 0);
    const total = Math.max(1, Number(step?.expected?.length) || 1);
    const progressPercent = clamp(Math.round((progress / total) * 100), 0, 100);
    const mistakes = Math.max(0, Number(lessonSession?.mistakes) || 0);
    const metrics = getLessonSessionMetrics(lessonSession);
    const accuracy = metrics.accuracy;
    const paceText = `WPM ${metrics.wpm}`;
    const activeStreak = Math.max(0, Number(lessonSession?.streak) || lessonProfile.currentStreak || 0);
    const streakTier = activeStreak >= 25 ? "fire" : activeStreak >= 12 ? "hot" : activeStreak >= 5 ? "warm" : "none";
    const comboProgress = activeStreak > 0
        ? ((activeStreak % 10) === 0 ? 100 : clamp((activeStreak % 10) * 10, 0, 100))
        : 0;
    const stepKey = `${stepId}:${stepIndex}/${stepCount}`;
    if (stepKey !== lessonHudLastStepKey) {
        lessonHudLastStepKey = stepKey;
        lessonHudLastProgressBucket = -1;
    }
    el.lessonHud.dataset.streakTier = streakTier;
    el.lessonHud.style.setProperty("--lesson-progress", `${progressPercent}%`);
    el.lessonHud.style.setProperty("--lesson-combo-progress", `${comboProgress}%`);
    if (el.lessonHudFill) {
        el.lessonHudFill.style.setProperty("--lesson-progress", `${progressPercent}%`);
    }
    const mood = accuracy >= 98 && progressPercent >= 65
        ? "perfect"
        : accuracy >= 90
            ? "strong"
            : mistakes > 0
                ? "recovery"
                : "focus";
    el.lessonHud.dataset.mood = mood;
    const stepText = `${stepId} ${stepIndex}/${stepCount}`;
    const progressText = `${progress}/${total} (${progressPercent}%)`;
    const levelText = `Lv ${lessonProfile.level}`;
    const xpText = `XP ${lessonProfile.xp}`;
    const bytesText = `Bytes ${Math.max(0, Number(lessonProfile.bytes) || 0)}`;
    const streakText = `Streak ${activeStreak} • ${accuracy}%`;
    const moodText = mood === "perfect"
        ? "Locked in. Precision and pace are aligned."
        : mood === "strong"
            ? "Solid flow. Keep your cadence steady."
            : mood === "recovery"
                ? "Quick reset. Clean next keystroke."
                : "Smooth rhythm. Build confidence key by key.";
    const renderKey = `${stepText}|${progressText}|${levelText}|${xpText}|${bytesText}|${streakText}|${paceText}|${moodText}|${streakTier}|${mood}`;
    if (renderKey !== lessonHudLastRenderKey) {
        lessonHudLastRenderKey = renderKey;
        setNodeText(el.lessonHudStep, stepText);
        setNodeText(el.lessonHudProgress, progressText);
        setNodeText(el.lessonHudLevel, levelText);
        setNodeText(el.lessonHudXp, xpText);
        setNodeText(el.lessonHudCoins, bytesText);
        setNodeText(el.lessonHudStreak, streakText);
        setNodeText(el.lessonHudPace, paceText);
        setNodeText(el.lessonHudMood, moodText);
    }

    if (streakTier !== lessonHudLastTier || mood !== lessonHudLastMood) {
        animateLessonHudPulse(streakTier === "fire" || mood === "perfect" ? "intense" : "soft");
        lessonHudLastTier = streakTier;
        lessonHudLastMood = mood;
    }

    const progressBucket = Math.floor(progressPercent / 25);
    if (progressBucket > lessonHudLastProgressBucket && progressBucket > 0 && progressPercent < 100) {
        lessonHudLastProgressBucket = progressBucket;
        triggerLessonHudBurst(`Checkpoint ${progressBucket * 25}%`);
    }

    el.lessonHud.setAttribute(
        "aria-label",
        `Lesson ${stepId}, step ${stepIndex} of ${stepCount}, progress ${progress} of ${total} (${progressPercent} percent), streak ${activeStreak}, accuracy ${accuracy} percent, pace ${metrics.wpm} WPM`
    );
    updateLessonHeaderStats();
}

function triggerLessonHudBurst(message = "") {
    if (!el.lessonHud || !el.lessonHudBurst) return;
    const text = String(message || "").trim();
    if (!text) return;
    setNodeText(el.lessonHudBurst, text);
    el.lessonHud.setAttribute("data-burst", "true");
    animateLessonHudPulse("intense");
    if (lessonHudBurstTimer) {
        clearTimeout(lessonHudBurstTimer);
    }
    lessonHudBurstTimer = setTimeout(() => {
        el.lessonHud?.setAttribute("data-burst", "false");
        lessonHudBurstTimer = 0;
    }, 620);
}

function awardLessonXp(amount = 0, { typedChars = 0 } = {}) {
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta) return;
    const previousLevel = lessonProfile.level;
    lessonProfile.xp += delta;
    lessonProfile.level = computeLessonLevel(lessonProfile.xp);
    const typedCount = Math.max(0, Math.floor(Number(typedChars) || 0));
    if (typedCount > 0) {
        lessonProfile.totalTypedChars += typedCount;
    }
    if (lessonProfile.level > previousLevel) {
        status.set(`Level up! Lv ${lessonProfile.level}`);
        logger.append("system", [`Lesson level up: ${previousLevel} → ${lessonProfile.level}`]);
        triggerLessonHudBurst(`Level ${lessonProfile.level}`);
        triggerLessonEditorLevelUp(lessonProfile.level);
        triggerLessonHaptic(12);
    }
    persistLessonProfile();
}

function awardLessonBytes(amount = 0, { burst = "" } = {}) {
    const delta = Math.max(0, Math.floor(Number(amount) || 0));
    if (!delta) return;
    lessonProfile.bytes = Math.max(0, Number(lessonProfile.bytes) || 0) + delta;
    if (burst) {
        triggerLessonHudBurst(String(burst));
    }
    persistLessonProfile();
}

function isLessonFamilyFile(file = null) {
    if (!file || typeof file !== "object") return false;
    return String(file.family || "workspace") === "lesson";
}

function isLessonSessionActiveForCurrentFile() {
    const active = getActiveFile();
    if (!isLessonFamilyFile(active)) return false;
    return Boolean(lessonSession && lessonSession.fileId === activeFileId && !lessonSession.completed);
}

function syncLessonStateForActiveFile() {
    if (lessonSession) {
        const sessionFile = files.find((entry) => entry.id === lessonSession.fileId);
        if (!sessionFile || !isLessonFamilyFile(sessionFile)) {
            lessonSession = null;
            clearPersistedLessonSession();
        }
    }
    if (isLessonSessionActiveForCurrentFile()) {
        syncLessonGhostMarks();
        updateLessonHud();
        return;
    }
    editor.clearMarks?.("lesson-ghost");
    editor.clearMarks?.("lesson-active");
    editor.clearMarks?.("lesson-next");
    updateLessonHud();
}

function setLessonCursorToProgress() {
    const step = getLessonCurrentStep();
    if (!step) return;
    const index = step.startIndex + Math.max(0, Number(lessonSession.progress) || 0);
    const pos = editor.posFromIndex?.(index);
    if (!pos) return;
    editor.setCursor(pos);
    editor.scrollIntoView?.(pos, 80);
}

function syncLessonGhostMarks() {
    editor.clearMarks?.("lesson-ghost");
    editor.clearMarks?.("lesson-active");
    editor.clearMarks?.("lesson-next");
    const step = getLessonCurrentStep();
    if (!step || lessonSession?.completed) return;
    const progress = clamp(Number(lessonSession.progress) || 0, 0, step.expected.length);
    const stepStart = editor.posFromIndex?.(step.startIndex);
    const nextCharStartIndex = step.startIndex + progress;
    const nextCharEndIndex = Math.min(step.endIndex, nextCharStartIndex + 1);
    const typedTo = editor.posFromIndex?.(nextCharStartIndex);
    const nextCharEnd = editor.posFromIndex?.(nextCharEndIndex);
    const stepEnd = editor.posFromIndex?.(step.endIndex);
    if (stepStart && stepEnd) {
        editor.markRange?.(stepStart, stepEnd, {
            className: "cm-lesson-active",
            kind: "lesson-active",
            title: `Lesson step: ${step.id}`,
        });
    }
    if (typedTo && nextCharEnd && nextCharStartIndex < step.endIndex) {
        editor.markRange?.(typedTo, nextCharEnd, {
            className: "cm-lesson-next",
            kind: "lesson-next",
            title: "Next character",
        });
    }
    if (nextCharEnd && stepEnd && nextCharEndIndex < step.endIndex) {
        editor.markRange?.(nextCharEnd, stepEnd, {
            className: "cm-lesson-ghost",
            kind: "lesson-ghost",
            title: "Type this remaining section",
        });
    } else if (typedTo && stepEnd && nextCharStartIndex < step.endIndex) {
        editor.markRange?.(typedTo, stepEnd, {
            className: "cm-lesson-ghost",
            kind: "lesson-ghost",
            title: "Type this remaining section",
        });
    }
}

function stopTypingLesson({ announce = true } = {}) {
    if (!lessonSession) return false;
    lessonProfile.currentStreak = 0;
    persistLessonProfile({ force: true });
    lessonSession = null;
    clearPersistedLessonSession();
    editor.clearMarks?.("lesson-ghost");
    editor.clearMarks?.("lesson-active");
    editor.clearMarks?.("lesson-next");
    updateLessonHud();
    if (announce) {
        status.set("Lesson mode stopped");
    }
    return true;
}

function startTypingLessonForFile(fileId = activeFileId, { announce = true } = {}) {
    const file = files.find((entry) => entry.id === fileId);
    if (!file) {
        status.set("Lesson file not found");
        return false;
    }

    if (activeFileId !== file.id) {
        activeFileId = file.id;
        ensureTabOpen(file.id);
        setEditorValue(file.code, { silent: true });
        renderFileList();
    }

    const source = activeFileId === file.id
        ? String(editor.get?.() || file.code || "")
        : String(file.code || "");
    const steps = parseLessonSteps(source);
    if (!steps.length) {
        status.set("No lesson STEP markers found");
        logger.append("warn", ["Lesson mode expects markers like [STEP:id:START] / [STEP:id:END]."]);
        return false;
    }

    if (!isLessonFamilyFile(file)) {
        file.family = "lesson";
        file.lessonId = String(selectedLessonId || file.lessonId || "");
    }

    lessonSession = {
        fileId: file.id,
        fileName: file.name,
        steps,
        stepIndex: 0,
        progress: 0,
        completed: false,
        startedAt: Date.now(),
        typedChars: 0,
        correctChars: 0,
        streak: 0,
        bestStreak: 0,
        coinMilestoneIndex: 0,
        mistakes: 0,
        sessionXp: 0,
    };
    persistLessonSession({ force: true });
    syncLessonGhostMarks();
    setLessonCursorToProgress();
    updateLessonProgressStatus({ prefix: "Lesson started" });
    updateLessonHud();
    if (announce) {
        logger.append("system", [
            `Lesson mode started in ${file.name} (${steps.length} step${steps.length === 1 ? "" : "s"}). Strict typing is enabled: every character counts.`,
        ]);
    }
    return true;
}

function advanceLessonStep({ announce = true } = {}) {
    if (!lessonSession || lessonSession.completed) return false;
    const nextIndex = lessonSession.stepIndex + 1;
    if (nextIndex >= lessonSession.steps.length) {
        const metrics = getLessonSessionMetrics(lessonSession);
        const completionBonus = LESSON_XP_LESSON_COMPLETE + (lessonSession.mistakes === 0 ? LESSON_XP_PERFECT_BONUS : 0);
        const completionBytes = LESSON_BYTES_LESSON_COMPLETE + (lessonSession.mistakes === 0 ? LESSON_BYTES_PERFECT_BONUS : 0);
        lessonSession.sessionXp += completionBonus;
        awardLessonXp(completionBonus);
        awardLessonBytes(completionBytes, { burst: `+${completionBytes} Bytes` });
        lessonProfile.lessonsCompleted += 1;
        lessonProfile.currentStreak = lessonSession.streak;
        lessonProfile.bestStreak = Math.max(lessonProfile.bestStreak, lessonSession.bestStreak);

        const todayStamp = getLessonDayStamp();
        const lastStamp = String(lessonProfile.lastActiveDay || "");
        if (!lastStamp) {
            lessonProfile.dailyStreak = 1;
        } else if (todayStamp !== lastStamp) {
            const then = new Date(`${lastStamp}T00:00:00`);
            const now = new Date(`${todayStamp}T00:00:00`);
            const diffDays = Math.round((now.getTime() - then.getTime()) / 86400000);
            if (diffDays === 1) {
                lessonProfile.dailyStreak += 1;
            } else if (diffDays > 1) {
                lessonProfile.dailyStreak = 1;
            }
        }
        lessonProfile.lastActiveDay = todayStamp;

        persistLessonProfile({ force: true });
        lessonSession.completed = true;
        clearPersistedLessonSession();
        editor.clearMarks?.("lesson-ghost");
        editor.clearMarks?.("lesson-active");
        editor.clearMarks?.("lesson-next");
        updateLessonHud();
        status.set("Lesson complete. Running...");
        logger.append("system", [
            `Lesson complete: ${lessonSession.fileName} • +${completionBonus} XP • +${completionBytes} Bytes • session XP ${lessonSession.sessionXp} • ${metrics.accuracy}% acc • ${metrics.wpm} WPM • daily streak ${lessonProfile.dailyStreak}`,
        ]);
        run();
        return true;
    }
    lessonSession.stepIndex = nextIndex;
    lessonSession.progress = 0;
    lessonSession.sessionXp += LESSON_XP_STEP_COMPLETE;
    awardLessonXp(LESSON_XP_STEP_COMPLETE);
    awardLessonBytes(LESSON_BYTES_STEP_COMPLETE);
    persistLessonSession();
    syncLessonGhostMarks();
    setLessonCursorToProgress();
    updateLessonProgressStatus({ prefix: announce ? "Lesson step" : "Lesson" });
    updateLessonHud();
    return true;
}

function describeLessonExpectedChar(char = "") {
    const value = String(char || "");
    if (!value) return "end of step";
    if (value === " ") return "space";
    if (value === "\t") return "tab";
    if (value === "\n") return "enter";
    if (value === "\r") return "carriage return";
    return `"${value}"`;
}

function updateLessonProgressStatus({ prefix = "Lesson" } = {}) {
    if (!lessonSession || lessonSession.completed) return;
    const step = getLessonCurrentStep();
    if (!step) return;
    const stepNumber = Math.max(1, Number(lessonSession.stepIndex) + 1);
    const stepTotal = Math.max(1, Number(lessonSession.steps?.length) || 1);
    const progress = Math.max(0, Number(lessonSession.progress) || 0);
    const total = Math.max(1, Number(step.expected?.length) || 1);
    const nextExpected = String(step.expected?.[progress] || "");
    const needsHint = nextExpected === " " || nextExpected === "\t" || nextExpected === "\n";
    const hint = needsHint ? ` • next ${describeLessonExpectedChar(nextExpected)}` : "";
    status.set(`${prefix}: ${step.id} (${stepNumber}/${stepTotal}) ${progress}/${total}${hint}`);
    updateLessonHud();
}

function resolveLessonInputSequence(inputChar = "", step = null, progress = 0) {
    const value = String(inputChar || "");
    if (!value || !step) return "";
    const expectedText = String(step?.expected || "");
    if (!expectedText) return "";
    if (value !== "\t") return value;

    const expectedNow = String(expectedText[progress] || "");
    if (expectedNow === "\t") return "\t";
    if (expectedNow !== " ") return "\t";

    const lineStart = Math.max(0, expectedText.lastIndexOf("\n", Math.max(0, progress - 1)) + 1);
    const linePrefix = expectedText.slice(lineStart, progress);
    if (/[^ \t]/.test(linePrefix)) return "\t";

    const tabSize = clamp(Math.floor(Number(editorSettings?.tabSize) || 2), 2, 8);
    let count = 0;
    while ((progress + count) < expectedText.length && expectedText[progress + count] === " " && count < tabSize) {
        count += 1;
    }
    if (count <= 0) return "\t";
    return " ".repeat(count);
}

function applyLessonInputChar(inputChar = "") {
    if (!isLessonSessionActiveForCurrentFile()) return { ok: false, reason: "inactive" };
    const step = getLessonCurrentStep();
    if (!step) return { ok: false, reason: "missing-step" };
    const value = String(inputChar || "");
    if (!value) return { ok: false, reason: "empty" };

    if (value === "\r") {
        return { ok: true, reason: "skip-cr", progress: lessonSession.progress };
    }

    if (value === "\b") {
        if (lessonSession.progress > 0) {
            lessonSession.progress -= 1;
            lessonSession.streak = 0;
            lessonProfile.currentStreak = 0;
            persistLessonProfile({ force: true });
            persistLessonSession();
            syncLessonGhostMarks();
            setLessonCursorToProgress();
            updateLessonProgressStatus();
        }
        return { ok: true, reason: "backspace", progress: lessonSession.progress };
    }

    while (step.expected[lessonSession.progress] === "\r") {
        lessonSession.progress += 1;
    }

    const expected = step.expected[lessonSession.progress] || "";
    if (!expected) {
        advanceLessonStep({ announce: true });
        return { ok: true, reason: "step-complete", progress: lessonSession.progress };
    }

    const inputSequence = resolveLessonInputSequence(value, step, lessonSession.progress) || value;
    const expectedText = String(step.expected || "");
    const expectedSequence = expectedText.slice(lessonSession.progress, lessonSession.progress + inputSequence.length);

    if (inputSequence !== expectedSequence) {
        lessonSession.typedChars += 1;
        lessonSession.mistakes += 1;
        lessonSession.streak = 0;
        lessonProfile.currentStreak = 0;
        persistLessonProfile({ force: true });
        persistLessonSession();
        triggerLessonHaptic(4);
        status.set(`Lesson: expected ${describeLessonExpectedChar(expected)}`);
        updateLessonHud();
        return { ok: false, reason: "mismatch", expected, received: value, progress: lessonSession.progress };
    }

    const matchedLength = Math.max(1, inputSequence.length);
    lessonSession.typedChars += matchedLength;
    lessonSession.correctChars += matchedLength;
    lessonSession.progress += matchedLength;
    lessonSession.streak += matchedLength;
    lessonSession.bestStreak = Math.max(lessonSession.bestStreak, lessonSession.streak);
    lessonSession.sessionXp += LESSON_XP_PER_CHAR * matchedLength;
    lessonProfile.currentStreak = lessonSession.streak;
    lessonProfile.bestStreak = Math.max(lessonProfile.bestStreak, lessonSession.bestStreak);
    awardLessonXp(LESSON_XP_PER_CHAR * matchedLength, { typedChars: matchedLength });
    const milestoneIndex = Math.floor(lessonSession.streak / LESSON_BYTES_STREAK_INTERVAL);
    const previousMilestoneIndex = Math.max(0, Number(lessonSession.coinMilestoneIndex) || 0);
    if (milestoneIndex > previousMilestoneIndex) {
        lessonSession.coinMilestoneIndex = milestoneIndex;
        const streakBytes = LESSON_BYTES_STREAK_MILESTONE * (milestoneIndex - previousMilestoneIndex);
        awardLessonBytes(streakBytes, { burst: `+${streakBytes} Bytes` });
    }
    if (lessonSession.streak > 0 && lessonSession.streak % 10 === 0) {
        triggerLessonHudBurst(`Streak ${lessonSession.streak}`);
        triggerLessonHaptic(8);
    }
    persistLessonSession();
    const finishedStep = lessonSession.progress >= step.expected.length;
    if (finishedStep) {
        advanceLessonStep({ announce: true });
        return { ok: true, reason: "step-complete", progress: lessonSession.progress };
    }
    syncLessonGhostMarks();
    setLessonCursorToProgress();
    updateLessonProgressStatus();
    return { ok: true, reason: "typed", progress: lessonSession.progress };
}

function handleLessonTypingKeyDown(event) {
    if (!isLessonSessionActiveForCurrentFile()) return false;
    const key = String(event?.key || "");

    if (key === "Escape") {
        event.preventDefault();
        stopTypingLesson({ announce: true });
        return true;
    }
    if (key === "Backspace") {
        event.preventDefault();
        applyLessonInputChar("\b");
        return true;
    }

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(key)) {
        event.preventDefault();
        setLessonCursorToProgress();
        return true;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
        const normalizedKey = key.toLowerCase();
        const allowReadOnlyShortcut = !event.altKey && !event.shiftKey && normalizedKey === "c";
        if (allowReadOnlyShortcut) {
            return false;
        }
        event.preventDefault();
        return true;
    }

    const char = normalizeLessonInputChar(key);
    if (!char) {
        event.preventDefault();
        return true;
    }

    event.preventDefault();
    applyLessonInputChar(char);
    return true;
}

function typeLessonInputText(value = "") {
    const source = String(value || "");
    let applied = 0;
    for (const char of source) {
        const result = applyLessonInputChar(char);
        if (!result.ok && result.reason === "mismatch") break;
        applied += 1;
    }
    return applied;
}

function getLessonStateSnapshot({ metrics = null } = {}) {
    if (!lessonSession) return null;
    const step = getLessonCurrentStep();
    const progress = Number(lessonSession.progress) || 0;
    const expectedNext = String(step?.expected?.[progress] || "");
    const sessionMetrics = metrics || getLessonSessionMetrics(lessonSession);
    return {
        active: isLessonSessionActiveForCurrentFile(),
        completed: Boolean(lessonSession.completed),
        fileId: lessonSession.fileId,
        fileName: lessonSession.fileName,
        stepIndex: lessonSession.stepIndex,
        stepCount: lessonSession.steps.length,
        stepId: step?.id || null,
        progress,
        expectedLength: step?.expected?.length || 0,
        expectedNext,
        remaining: Math.max(0, (step?.expected?.length || 0) - progress),
        streak: Number(lessonSession.streak) || 0,
        bestStreak: Number(lessonSession.bestStreak) || 0,
        mistakes: Number(lessonSession.mistakes) || 0,
        typedChars: sessionMetrics.typedChars,
        correctChars: sessionMetrics.correctChars,
        accuracy: sessionMetrics.accuracy,
        wpm: sessionMetrics.wpm,
        elapsedMs: sessionMetrics.elapsedMs,
        sessionXp: Number(lessonSession.sessionXp) || 0,
        totalXp: Number(lessonProfile.xp) || 0,
        level: Number(lessonProfile.level) || 1,
    };
}

function getLessonProfileSnapshot() {
    return {
        xp: Number(lessonProfile.xp) || 0,
        level: Number(lessonProfile.level) || 1,
        bytes: Number(lessonProfile.bytes) || 0,
        coins: Number(lessonProfile.bytes) || 0,
        unlockedThemes: Array.isArray(lessonProfile.unlockedThemes) ? [...lessonProfile.unlockedThemes] : [DEFAULT_THEME],
        totalTypedChars: Number(lessonProfile.totalTypedChars) || 0,
        lessonsCompleted: Number(lessonProfile.lessonsCompleted) || 0,
        bestStreak: Number(lessonProfile.bestStreak) || 0,
        currentStreak: Number(lessonProfile.currentStreak) || 0,
        dailyStreak: Number(lessonProfile.dailyStreak) || 0,
        lastActiveDay: String(lessonProfile.lastActiveDay || ""),
    };
}

async function loadLessonById(id, { startTyping = true, runAfter = false } = {}) {
    const lesson = getLessonById(id);
    if (!lesson) {
        status.set("Lesson not found");
        logger.append("error", [`Lesson "${id}" not found.`]);
        return false;
    }

    selectedLessonId = lesson.id;
    syncLessonsUI();
    status.set(`Loading ${lesson.name}...`);

    try {
        const before = snapshotWorkspaceState();
        const loadedFiles = await loadTemplateFilesFromSources(lesson.files, "Lesson template");
        if (!loadedFiles.length) {
            throw new Error("Lesson template is empty.");
        }
        const normalizedFolder = normalizeFolderPath(lesson.folder, { allowEmpty: true });
        const folderPath = normalizedFolder ? ensureUniqueFolderPath(normalizedFolder, { ignoreCase: true }) : "";
        const entryPath = normalizeFileName(lesson.entryFile || loadedFiles[0].path, loadedFiles[0].path);
        const created = [];
        const reservedPaths = new Set(files.map((file) => file.name));

        stashActiveFile();
        loadedFiles.forEach((file) => {
            const desiredPath = folderPath ? `${folderPath}/${file.path}` : file.path;
            const workspacePath = ensureUniquePathInSet(desiredPath, reservedPaths);
            const target = makeFile(workspacePath, file.code);
            target.savedCode = file.code;
            target.family = "lesson";
            target.lessonId = lesson.id;
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
        ) || created[0];

        activeFileId = activeTarget.id;
        ensureTabOpen(activeTarget.id);
        clearInlineRenameState();
        setEditorValue(activeTarget.code, { silent: true });
        persistFiles();
        renderFileList();
        recordFileHistory(`Load lesson ${lesson.name}`, before);

        if (startTyping) {
            startTypingLessonForFile(activeTarget.id, { announce: false });
        }

        status.set(`Loaded ${lesson.name}`);
        logger.append("system", [`Loaded lesson: ${lesson.name} into ${folderPath || "workspace root"} (${created.length} files)`]);
        if (startTyping) {
            const step = getLessonCurrentStep();
            if (step) {
                status.set(`Lesson step: ${step.id}`);
            }
        }
        if (runAfter) {
            run();
        }
        return true;
    } catch (err) {
        status.set("Lesson load failed");
        logger.append("error", [`Failed to load ${lesson.name}: ${String(err.message || err)}`]);
        return false;
    } finally {
        syncLessonsUI();
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
    setOpenStateAttributes(el.promptDialog, promptDialogOpen);
    setOpenStateAttributes(el.promptDialogBackdrop, promptDialogOpen);
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

function ensurePromptDialogSecondaryButton() {
    if (promptDialogSecondaryButton && document.contains(promptDialogSecondaryButton)) {
        return promptDialogSecondaryButton;
    }
    const actions = el.promptDialog?.querySelector(".prompt-dialog-actions");
    if (!actions) return null;
    const existing = actions.querySelector(".prompt-dialog-secondary");
    if (existing instanceof HTMLButtonElement) {
        promptDialogSecondaryButton = existing;
        return promptDialogSecondaryButton;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "prompt-dialog-secondary";
    btn.setAttribute("data-visible", "false");
    btn.hidden = true;
    actions.insertBefore(btn, el.promptDialogConfirm || null);
    promptDialogSecondaryButton = btn;
    return promptDialogSecondaryButton;
}

function clearPromptDialogSecondaryDisarmTimer() {
    if (!promptDialogSecondaryDisarmTimer) return;
    clearTimeout(promptDialogSecondaryDisarmTimer);
    promptDialogSecondaryDisarmTimer = null;
}

function setPromptDialogSecondaryArmed(armed, { focus = false } = {}) {
    if (!promptDialogState?.hasSecondaryAction || !promptDialogSecondaryButton) return;
    const next = Boolean(armed);
    promptDialogState.secondaryArmed = next;
    promptDialogSecondaryButton.setAttribute("data-armed", next ? "true" : "false");
    if (next) {
        promptDialogSecondaryButton.textContent = String(
            promptDialogState.secondaryArmedText || promptDialogState.secondaryText || "Delete forever"
        );
        promptDialogSecondaryButton.title = "Armed: click again to permanently delete";
        promptDialogSecondaryButton.setAttribute("aria-label", "Armed delete forever. Click again to confirm.");
    } else {
        promptDialogSecondaryButton.textContent = String(promptDialogState.secondaryText || "Delete forever");
        promptDialogSecondaryButton.title = "Click once to lift safety cover, click again to confirm";
        promptDialogSecondaryButton.setAttribute("aria-label", "Protected delete forever. Click once to arm.");
    }
    if (focus) {
        requestAnimationFrame(() => promptDialogSecondaryButton?.focus());
    }
}

function schedulePromptDialogSecondaryDisarm(delayMs = 2400) {
    clearPromptDialogSecondaryDisarmTimer();
    const delay = Math.max(350, Number(delayMs) || 2400);
    promptDialogSecondaryDisarmTimer = setTimeout(() => {
        promptDialogSecondaryDisarmTimer = null;
        if (!promptDialogState?.hasSecondaryAction) return;
        if (!promptDialogState.secondaryRequiresConfirm || !promptDialogState.secondaryArmed) return;
        setPromptDialogSecondaryArmed(false);
    }, delay);
}

function closePromptDialog(result) {
    if (!promptDialogState) return;
    const { resolve, restoreFocusEl } = promptDialogState;
    promptDialogState = null;
    clearPromptDialogSecondaryDisarmTimer();
    setPromptDialogOpen(false);
    el.promptDialog.setAttribute("data-mode", "confirm");
    el.promptDialogList.innerHTML = "";
    el.promptDialogInput.value = "";
    if (promptDialogSecondaryButton) {
        promptDialogSecondaryButton.textContent = "";
        promptDialogSecondaryButton.setAttribute("data-visible", "false");
        promptDialogSecondaryButton.setAttribute("data-variant", "neutral");
        promptDialogSecondaryButton.setAttribute("data-armable", "false");
        promptDialogSecondaryButton.setAttribute("data-armed", "false");
        promptDialogSecondaryButton.removeAttribute("data-shield-label");
        promptDialogSecondaryButton.removeAttribute("data-armed-label");
        promptDialogSecondaryButton.hidden = true;
    }
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
    closePromptDialog(promptDialogState.confirmValue);
}

function submitPromptDialogSecondary() {
    if (!promptDialogState?.hasSecondaryAction) return;
    if (promptDialogState.secondaryRequiresConfirm && !promptDialogState.secondaryArmed) {
        setPromptDialogSecondaryArmed(true, { focus: true });
        schedulePromptDialogSecondaryDisarm(2600);
        return;
    }
    clearPromptDialogSecondaryDisarmTimer();
    closePromptDialog(promptDialogState.secondaryValue);
}

function openPromptDialog(config = {}) {
    if (promptDialogState?.resolve) {
        closePromptDialog(promptDialogState.cancelValue);
    }
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeLessonStats({ focusEditor: false });
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
    const confirmValue = Object.prototype.hasOwnProperty.call(config, "confirmValue")
        ? config.confirmValue
        : true;
    const cancelText = String(config.cancelText || "Cancel");
    const cancelValue = Object.prototype.hasOwnProperty.call(config, "cancelValue")
        ? config.cancelValue
        : (mode === "prompt" ? null : false);
    const danger = Boolean(config.danger);
    const secondaryText = String(config.secondaryText || "").trim();
    const hasSecondaryAction = mode === "confirm" && Boolean(secondaryText);
    const secondaryValue = Object.prototype.hasOwnProperty.call(config, "secondaryValue")
        ? config.secondaryValue
        : null;
    const secondaryDanger = Boolean(config.secondaryDanger);
    const secondaryRequiresConfirm = Boolean(config.secondaryRequiresConfirm);
    const secondaryArmedText = String(config.secondaryArmedText || "Delete forever");
    const secondaryShieldLabel = String(config.secondaryShieldLabel || "Protected");
    const secondaryArmedLabel = Object.prototype.hasOwnProperty.call(config, "secondaryArmedLabel")
        ? String(config.secondaryArmedLabel ?? "")
        : "Armed";
    const inputPlaceholder = String(config.inputPlaceholder || "");
    const inputValue = String(config.inputValue ?? "");
    const listTitle = String(config.listTitle || "");
    const restoreFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise((resolve) => {
        promptDialogState = {
            mode,
            resolve,
            cancelValue,
            confirmValue,
            hasSecondaryAction,
            secondaryValue,
            secondaryRequiresConfirm,
            secondaryArmed: false,
            secondaryText,
            secondaryArmedText,
            secondaryArmedLabel,
            validate: config.validate,
            normalize: config.normalize,
            restoreFocusEl,
        };

        el.promptDialogTitle.textContent = title;
        el.promptDialog.setAttribute("data-mode", mode);
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
        const secondaryBtn = ensurePromptDialogSecondaryButton();
        if (secondaryBtn) {
            if (hasSecondaryAction) {
                secondaryBtn.textContent = secondaryText;
                secondaryBtn.hidden = false;
                secondaryBtn.setAttribute("data-visible", "true");
                secondaryBtn.setAttribute("data-variant", secondaryDanger ? "danger" : "neutral");
                secondaryBtn.setAttribute("data-armable", secondaryRequiresConfirm ? "true" : "false");
                secondaryBtn.setAttribute("data-armed", "false");
                secondaryBtn.setAttribute("data-armed-label", secondaryArmedLabel);
                if (secondaryRequiresConfirm) {
                    secondaryBtn.setAttribute("data-shield-label", secondaryShieldLabel);
                    setPromptDialogSecondaryArmed(false);
                } else {
                    secondaryBtn.removeAttribute("data-shield-label");
                    secondaryBtn.title = "";
                    secondaryBtn.setAttribute("aria-label", secondaryText);
                }
            } else {
                secondaryBtn.textContent = "";
                secondaryBtn.hidden = true;
                secondaryBtn.setAttribute("data-visible", "false");
                secondaryBtn.setAttribute("data-variant", "neutral");
                secondaryBtn.setAttribute("data-armable", "false");
                secondaryBtn.setAttribute("data-armed", "false");
                secondaryBtn.removeAttribute("data-shield-label");
                secondaryBtn.removeAttribute("data-armed-label");
                secondaryBtn.title = "";
                secondaryBtn.removeAttribute("aria-label");
                clearPromptDialogSecondaryDisarmTimer();
            }
        }

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

function getNextUntitledFileName(directory = "") {
    const folder = normalizeFolderPath(directory, { allowEmpty: true });
    const base = folder ? `${folder}/untitled` : "untitled";
    return ensureUniqueName(base, null, { preserveExtensionless: true });
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
        const fallback = makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
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
    setOpenStateAttributes(el.quickOpenPalette, quickOpenOpen);
    setOpenStateAttributes(el.quickOpenBackdrop, quickOpenOpen);
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
    closeLessonStats({ focusEditor: false });
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
    setOpenStateAttributes(el.shortcutHelpPanel, shortcutHelpOpen);
    setOpenStateAttributes(el.shortcutHelpBackdrop, shortcutHelpOpen);
    if (shortcutHelpOpen) {
        requestAnimationFrame(() => {
            if (el.shortcutHelpClose) el.shortcutHelpClose.focus();
        });
    }
}

function setLessonStatsOpen(open) {
    lessonStatsOpen = Boolean(open);
    if (!el.lessonStatsPanel || !el.lessonStatsBackdrop) return;
    setOpenStateAttributes(el.lessonStatsPanel, lessonStatsOpen);
    setOpenStateAttributes(el.lessonStatsBackdrop, lessonStatsOpen);
    if (el.btnLessonStats) {
        el.btnLessonStats.setAttribute("aria-expanded", lessonStatsOpen ? "true" : "false");
    }
    if (lessonStatsOpen) {
        setLessonStatsView(lessonStatsView || "overview");
        updateLessonHeaderStats({ force: true });
        updateLessonShopUi({ force: true });
        setLessonStatsLivePolling(true);
        requestAnimationFrame(() => {
            if (el.lessonStatsClose) el.lessonStatsClose.focus();
        });
    } else {
        lessonShopRenderKey = "";
        setLessonStatsLivePolling(false);
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
    closeLessonStats({ focusEditor: false });
    setShortcutHelpOpen(true);
}

function closeShortcutHelp({ focusEditor = true } = {}) {
    if (!shortcutHelpOpen) return;
    setShortcutHelpOpen(false);
    if (focusEditor) editor.focus();
}

function openLessonStats({ view = "overview" } = {}) {
    closeFileMenus();
    closeQuickOpen({ focusEditor: false });
    closeCommandPalette({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    closeShortcutHelp({ focusEditor: false });
    closeLessonStats({ focusEditor: false });
    setLessonStatsView(view);
    setLessonStatsOpen(true);
}

function closeLessonStats({ focusEditor = true } = {}) {
    if (!lessonStatsOpen) return;
    setLessonStatsOpen(false);
    if (focusEditor) editor.focus();
}

const FOUNDATION_COMMAND_IDS = Object.freeze({
    RUN_EXECUTE: "foundation.run.execute",
    FILE_SAVE_ACTIVE: "foundation.file.saveActive",
    FILE_SAVE_ALL: "foundation.file.saveAll",
    FILE_NEW: "foundation.file.new",
    SEARCH_COMMAND_PALETTE: "foundation.search.commandPalette",
    SEARCH_QUICK_OPEN: "foundation.search.quickOpen",
    WORKSPACE_IMPORT: "foundation.workspace.import",
    WORKSPACE_OPEN_FOLDER: "foundation.workspace.openFolder",
    WORKSPACE_SAVE_FOLDER: "foundation.workspace.saveFolder",
    HISTORY_UNDO: "foundation.history.undo",
    HISTORY_REDO: "foundation.history.redo",
});

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

function executeRegisteredCommand(commandId, fallback = null) {
    const result = commandRegistry.execute(commandId);
    if (result?.ok) {
        return result.value;
    }
    if (result?.reason === "error") {
        logger.append("error", [`Command \"${commandId}\" failed: ${String(result.error?.message || result.error)}`]);
        status.set("Command failed");
        return false;
    }
    if (typeof fallback === "function") {
        return fallback();
    }
    return false;
}

function registerFoundationCommands() {
    const commands = [
        {
            id: FOUNDATION_COMMAND_IDS.RUN_EXECUTE,
            label: "Run: Execute",
            keywords: "run execute sandbox preview",
            shortcut: "Ctrl/Cmd+Enter",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => run(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.FILE_SAVE_ACTIVE,
            label: "File: Save Active",
            keywords: "save file write",
            shortcut: "Ctrl/Cmd+S",
            includeInPalette: false,
            source: "foundation",
            enabled: () => Boolean(getActiveFile()),
            run: () => saveActiveFile({ announce: true }),
        },
        {
            id: FOUNDATION_COMMAND_IDS.FILE_SAVE_ALL,
            label: "File: Save All",
            keywords: "save all write",
            shortcut: "Ctrl/Cmd+Shift+S",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => saveAllFiles({ announce: true }),
        },
        {
            id: FOUNDATION_COMMAND_IDS.FILE_NEW,
            label: "File: New",
            keywords: "create file new",
            shortcut: "Ctrl/Cmd+N",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => createFile(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.SEARCH_COMMAND_PALETTE,
            label: "Search: Command Palette",
            keywords: "search command palette",
            shortcut: "Ctrl/Cmd+Shift+P",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => openCommandPalette(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.SEARCH_QUICK_OPEN,
            label: "Search: Quick Open",
            keywords: "quick open files",
            shortcut: "Ctrl/Cmd+P",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => openQuickOpen(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.WORKSPACE_IMPORT,
            label: "Workspace: Import",
            keywords: "workspace import files",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => triggerWorkspaceImportPicker(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.WORKSPACE_OPEN_FOLDER,
            label: "Workspace: Open Folder",
            keywords: "workspace open local folder",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => openLocalProjectFolder(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.WORKSPACE_SAVE_FOLDER,
            label: "Workspace: Save To Folder",
            keywords: "workspace save local folder",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => saveWorkspaceToLocalFolder(),
        },
        {
            id: FOUNDATION_COMMAND_IDS.HISTORY_UNDO,
            label: "History: Undo",
            keywords: "undo file history",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => {
                if (!undoFileHistory()) {
                    undoLastDelete();
                }
            },
        },
        {
            id: FOUNDATION_COMMAND_IDS.HISTORY_REDO,
            label: "History: Redo",
            keywords: "redo file history",
            includeInPalette: false,
            source: "foundation",
            enabled: true,
            run: () => redoFileHistory(),
        },
    ];
    commands.forEach((command) => {
        commandRegistry.register(command, { replace: true });
    });
}

registerFoundationCommands();

function getRegisteredCommandEntries() {
    return commandRegistry.list().filter((entry) => entry.includeInPalette !== false).map((entry) => ({
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

function normalizeEditorSyntaxTheme(value) {
    const raw = String(value || "").trim().toLowerCase();
    const normalized = EDITOR_SYNTAX_THEME_ALIASES[raw] || raw;
    if (EDITOR_SYNTAX_THEME_NAME_SET.has(normalized)) {
        return normalized;
    }
    return DEFAULT_EDITOR_SYNTAX_THEME;
}

function toTitleCaseThemeName(value = "") {
    return String(value || "")
        .trim()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b([a-z])/gi, (match) => match.toUpperCase());
}

function getEditorSyntaxThemeLabel(themeName = "") {
    const normalized = normalizeEditorSyntaxTheme(themeName);
    const meta = EDITOR_SYNTAX_THEME_METADATA[normalized];
    if (meta?.label) return meta.label;
    return toTitleCaseThemeName(normalized);
}

function getEditorSyntaxThemeColorSummary(themeName = "") {
    const normalized = normalizeEditorSyntaxTheme(themeName);
    const meta = EDITOR_SYNTAX_THEME_METADATA[normalized];
    if (Array.isArray(meta?.colors) && meta.colors.length) {
        return meta.colors.slice(0, 5).join(" / ");
    }
    const palette = EDITOR_ALL_SYNTAX_THEME_PALETTES[normalized];
    const fallbackIdentity = deriveSyntaxThemeIdentity(palette || {});
    const surfaceIdentity = fallbackIdentity.dark || fallbackIdentity.light || fallbackIdentity.purple || {};
    const fallback = [
        surfaceIdentity.primary,
        surfaceIdentity.secondary,
        surfaceIdentity.accent,
        surfaceIdentity.support,
        surfaceIdentity.neutral,
    ].filter(Boolean);
    return fallback.slice(0, 5).join(" / ");
}

function buildEditorSyntaxThemeOptionText(themeName = "") {
    const label = getEditorSyntaxThemeLabel(themeName);
    const summary = getEditorSyntaxThemeColorSummary(themeName);
    return summary ? `${label} (${summary})` : label;
}

function applyEditorSyntaxThemeSelection(themeValue, { persist = true } = {}) {
    const normalized = normalizeEditorSyntaxTheme(themeValue);
    editorSettings = sanitizeEditorSettings({ ...editorSettings, syntaxTheme: normalized });
    applyEditorSettings({ persist, refreshUI: true });
    const label = getEditorSyntaxThemeLabel(normalized);
    status.set(`Syntax theme: ${label}`);
}

function renderEditorSyntaxThemeSelectOptions() {
    const select = el.editorSyntaxThemeSelect;
    if (!select) return;
    const preferred = normalizeEditorSyntaxTheme(editorSettings?.syntaxTheme || select.value || DEFAULT_EDITOR_SYNTAX_THEME);
    const fragment = document.createDocumentFragment();
    EDITOR_SYNTAX_THEME_NAMES.forEach((themeName) => {
        const option = document.createElement("option");
        option.value = themeName;
        option.textContent = buildEditorSyntaxThemeOptionText(themeName);
        fragment.appendChild(option);
    });
    select.innerHTML = "";
    select.appendChild(fragment);
    select.value = preferred;
}

function getEditorSyntaxThemeSurface(themeValue = currentTheme) {
    const normalizedTheme = normalizeTheme(themeValue);
    if (normalizedTheme === "light" || normalizedTheme === "temple") return "light";
    if (normalizedTheme === "purple") return "purple";
    return "dark";
}

function applyEditorSyntaxTheme() {
    const syntaxThemeName = normalizeEditorSyntaxTheme(editorSettings?.syntaxTheme);
    const syntaxTheme = EDITOR_ALL_SYNTAX_THEME_PALETTES[syntaxThemeName] || EDITOR_ALL_SYNTAX_THEME_PALETTES[DEFAULT_EDITOR_SYNTAX_THEME];
    const surface = getEditorSyntaxThemeSurface(currentTheme);
    const palette = syntaxTheme?.[surface] || syntaxTheme?.dark || {};
    const root = document?.documentElement;
    if (!root) return;
    EDITOR_SYNTAX_VAR_KEYS.forEach((token) => {
        const cssVar = `--syntax-${token}`;
        const nextColor = palette[token];
        if (nextColor) {
            root.style.setProperty(cssVar, String(nextColor));
        } else {
            root.style.removeProperty(cssVar);
        }
    });
    root.setAttribute("data-syntax-theme", syntaxThemeName);
}

function applyEditorFontFamily() {
    const fontFamily = normalizeEditorFontFamily(editorSettings.fontFamily);
    const fontStack = EDITOR_FONT_FAMILY_OPTIONS[fontFamily] || EDITOR_FONT_FAMILY_OPTIONS.default;
    document.documentElement.style.setProperty("--editor-font-family", fontStack);
    editor.setFontFamily?.(fontStack);
    editor.refresh?.();
}

function getEditorCompletionMaxItems() {
    return clamp(
        Number(editorSettings?.completionMaxItems ?? EDITOR_COMPLETION_MAX_ITEMS),
        EDITOR_COMPLETION_MAX_ITEMS_MIN,
        EDITOR_COMPLETION_MAX_ITEMS_MAX
    );
}

function applyEditorUXTuning() {
    const completionOpacity = clamp(
        Number(editorSettings?.completionOpacity ?? EDITOR_COMPLETION_OPACITY_DEFAULT),
        EDITOR_COMPLETION_OPACITY_MIN,
        EDITOR_COMPLETION_OPACITY_MAX
    );
    const completionAlpha = completionOpacity / 100;
    if (el.editorCompletion) {
        el.editorCompletion.style.setProperty("--editor-completion-alpha", String(completionAlpha));
    }
    if (el.editorSignatureHint) {
        el.editorSignatureHint.style.setProperty("--editor-completion-alpha", String(completionAlpha));
    }
    if (!editorSettings?.signatureHintEnabled) {
        hideEditorSignatureHint();
    } else {
        queueEditorSignatureHintSync();
    }
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
        syntaxTheme: normalizeEditorSyntaxTheme(input.syntaxTheme ?? profileDefaults.syntaxTheme ?? DEFAULT_EDITOR_SYNTAX_THEME),
        lineWrapping: Boolean(input.lineWrapping ?? profileDefaults.lineWrapping),
        lintEnabled: Boolean(input.lintEnabled ?? profileDefaults.lintEnabled),
        errorLensEnabled: Boolean(input.errorLensEnabled ?? profileDefaults.errorLensEnabled ?? true),
        snippetEnabled: Boolean(input.snippetEnabled ?? profileDefaults.snippetEnabled),
        signatureHintEnabled: Boolean(input.signatureHintEnabled ?? profileDefaults.signatureHintEnabled ?? true),
        completionMaxItems: clamp(
            Number(input.completionMaxItems ?? profileDefaults.completionMaxItems ?? EDITOR_COMPLETION_MAX_ITEMS),
            EDITOR_COMPLETION_MAX_ITEMS_MIN,
            EDITOR_COMPLETION_MAX_ITEMS_MAX
        ),
        completionOpacity: clamp(
            Number(input.completionOpacity ?? profileDefaults.completionOpacity ?? EDITOR_COMPLETION_OPACITY_DEFAULT),
            EDITOR_COMPLETION_OPACITY_MIN,
            EDITOR_COMPLETION_OPACITY_MAX
        ),
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
    applyEditorSyntaxTheme();
    applyEditorUXTuning();
    editor.refresh?.();
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
    if (el.editorSyntaxThemeSelect) el.editorSyntaxThemeSelect.value = normalizeEditorSyntaxTheme(editorSettings.syntaxTheme);
    if (el.editorAutoSaveMs) el.editorAutoSaveMs.value = String(editorSettings.autosaveMs);
    if (el.editorWrapToggle) el.editorWrapToggle.checked = editorSettings.lineWrapping;
    if (el.editorLintToggle) el.editorLintToggle.checked = editorSettings.lintEnabled;
    if (el.editorErrorLensToggle) el.editorErrorLensToggle.checked = editorSettings.errorLensEnabled;
    if (el.editorSnippetToggle) el.editorSnippetToggle.checked = editorSettings.snippetEnabled;
    if (el.editorSignatureHintToggle) el.editorSignatureHintToggle.checked = editorSettings.signatureHintEnabled;
    if (el.editorCompletionMaxItems) el.editorCompletionMaxItems.value = String(getEditorCompletionMaxItems());
    if (el.editorCompletionOpacity) {
        el.editorCompletionOpacity.value = String(
            clamp(Number(editorSettings.completionOpacity), EDITOR_COMPLETION_OPACITY_MIN, EDITOR_COMPLETION_OPACITY_MAX)
        );
    }
    if (el.snippetScopeSelect) el.snippetScopeSelect.value = getActiveSnippetScope();
    renderSnippetList();
}

function setEditorSettingsOpen(open) {
    editorSettingsOpen = Boolean(open);
    syncEditorToolButtons();
    if (!el.editorSettingsPanel || !el.editorSettingsBackdrop) return;
    setOpenStateAttributes(el.editorSettingsPanel, editorSettingsOpen);
    setOpenStateAttributes(el.editorSettingsBackdrop, editorSettingsOpen);
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
    const beforeText = String(beforeCode ?? "");
    const afterText = String(afterCode ?? "");
    if (beforeText === afterText) {
        return {
            added: 0,
            removed: 0,
            preview: ["No line changes."],
        };
    }
    const beforeLines = beforeText.split("\n");
    const afterLines = afterText.split("\n");
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

function formatHistoryReason(reason = "snapshot") {
    const raw = String(reason || "snapshot").trim() || "snapshot";
    return {
        full: raw,
        short: truncateText(raw, EDITOR_HISTORY_REASON_MAX_CHARS, { suffix: "..." }),
    };
}

function syncEditorHistoryActionState({ hasActiveFile = false, entries = [], selectedEntry = null } = {}) {
    const entryCount = Array.isArray(entries) ? entries.length : 0;
    if (el.editorHistorySnapshot) {
        el.editorHistorySnapshot.disabled = !hasActiveFile;
    }
    if (el.editorHistoryRestore) {
        el.editorHistoryRestore.disabled = !(hasActiveFile && selectedEntry);
    }
    if (el.editorHistoryClear) {
        el.editorHistoryClear.disabled = !(hasActiveFile && entryCount > 0);
    }
}

function setEditorHistoryRowActiveState(row, active) {
    if (!(row instanceof HTMLElement)) return;
    setDataActive(row, active);
    setAriaPressed(row, active);
    row.tabIndex = active ? 0 : -1;
}

function renderEditorHistoryEntries(entries = []) {
    if (!el.editorHistoryList) return;
    if (!entries.length) {
        const empty = document.createElement("li");
        empty.className = "quick-open-empty";
        empty.textContent = "No snapshots yet.";
        el.editorHistoryList.replaceChildren(empty);
        return;
    }
    const fragment = document.createDocumentFragment();
    entries.forEach((entry) => {
        const isActive = entry.id === selectedHistoryEntryId;
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "editor-history-row";
        button.dataset.historyId = entry.id;
        setEditorHistoryRowActiveState(button, isActive);

        const main = document.createElement("span");
        main.className = "editor-history-main";

        const title = document.createElement("strong");
        title.className = "editor-history-title";
        title.textContent = formatSnapshotTime(entry.at);

        const reason = document.createElement("span");
        reason.className = "editor-history-meta editor-history-reason";
        const reasonLabel = formatHistoryReason(entry.reason);
        reason.textContent = reasonLabel.short;
        if (reasonLabel.short !== reasonLabel.full) {
            reason.title = reasonLabel.full;
        }

        main.append(title, reason);

        const meta = document.createElement("span");
        meta.className = "editor-history-meta editor-history-age";
        meta.textContent = formatRelativeTime(entry.at);

        button.append(main, meta);
        li.appendChild(button);
        fragment.appendChild(li);
    });
    el.editorHistoryList.replaceChildren(fragment);
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
        renderEditorHistoryDiff(null);
        el.editorHistoryList.replaceChildren();
        selectedHistoryEntryId = null;
        syncEditorHistoryActionState({ hasActiveFile: false, entries: [], selectedEntry: null });
        return;
    }
    const entries = getFileHistoryEntries(active.id);
    if (!entries.length) {
        renderEditorHistoryEntries([]);
        selectedHistoryEntryId = null;
        renderEditorHistoryDiff(null);
        syncEditorHistoryActionState({ hasActiveFile: true, entries, selectedEntry: null });
        return;
    }
    let selected = entries.find((entry) => entry.id === selectedHistoryEntryId) || null;
    if (!selected) {
        selected = entries[0];
        selectedHistoryEntryId = selected?.id || null;
    }
    renderEditorHistoryEntries(entries);
    renderEditorHistoryDiff(selected);
    syncEditorHistoryActionState({ hasActiveFile: true, entries, selectedEntry: selected });
}

function selectHistoryEntry(id, { focusRow = false } = {}) {
    const entries = getFileHistoryEntries(activeFileId);
    const selected = entries.find((entry) => entry.id === id) || null;
    if (!selected) return false;
    selectedHistoryEntryId = id;
    if (el.editorHistoryList && editorHistoryOpen) {
        const rows = Array.from(el.editorHistoryList.querySelectorAll(".editor-history-row[data-history-id]"));
        let selectedRow = null;
        rows.forEach((row) => {
            const active = row.dataset.historyId === id;
            setEditorHistoryRowActiveState(row, active);
            if (active) selectedRow = row;
        });
        if (focusRow && selectedRow && typeof selectedRow.focus === "function") {
            selectedRow.focus();
        }
        renderEditorHistoryDiff(selected);
        syncEditorHistoryActionState({ hasActiveFile: Boolean(getActiveFile()), entries, selectedEntry: selected });
        return true;
    }
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
    syncEditorToolButtons();
    if (!el.editorHistoryPanel || !el.editorHistoryBackdrop) return;
    setOpenStateAttributes(el.editorHistoryPanel, editorHistoryOpen);
    setOpenStateAttributes(el.editorHistoryBackdrop, editorHistoryOpen);
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
    if (persistenceWritesLocked) return;
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
    if (editorAutosaveTimer) {
        clearTimeout(editorAutosaveTimer);
        editorAutosaveTimer = null;
    }
    if (persistenceWritesLocked) return;
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
    setAriaPressed(button, active);
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
    const baseRegex = buildFindRegex(findState, { global: true });
    if (!baseRegex) return [];
    const regexSource = baseRegex.source;
    const regexFlags = baseRegex.flags;
    const scopes = getFindScopes(findState, source);
    if (!scopes.length) return [];
    const results = [];
    for (const scope of scopes) {
        const segment = source.slice(scope.start, scope.end);
        const regex = new RegExp(regexSource, regexFlags);
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
    const matchCount = findResults.length;
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
    if (replaced === code) {
        status.set("No replacements applied");
        return false;
    }
    setEditorValue(replaced, { silent: true });
    updateActiveFileCode(replaced);
    refreshFindResults({ preserveIndex: false, focusSelection: false });
    renderFileList();
    queueEditorLint("replace-all");
    status.set(`Replaced ${matchCount} match${matchCount === 1 ? "" : "es"}`);
    return true;
}

function setEditorSearchOpen(open, { replaceMode = false } = {}) {
    editorSearchOpen = Boolean(open);
    syncEditorToolButtons();
    if (!el.editorSearchPanel || !el.editorSearchBackdrop) return;
    setOpenStateAttributes(el.editorSearchPanel, editorSearchOpen);
    setOpenStateAttributes(el.editorSearchBackdrop, editorSearchOpen);
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
    closeLessonStats({ focusEditor: false });
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
    syncEditorToolButtons();
    if (!el.projectSearchPanel || !el.projectSearchBackdrop) return;
    setOpenStateAttributes(el.projectSearchPanel, projectSearchOpen);
    setOpenStateAttributes(el.projectSearchBackdrop, projectSearchOpen);
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
    closeLessonStats({ focusEditor: false });
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
    const reservedMethodNames = new Set(["if", "for", "while", "switch", "catch"]);
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
            if (!reservedMethodNames.has(method[1])) {
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

function buildSymbolSourceCacheKey(code = "") {
    const source = String(code ?? "");
    const active = getActiveFile();
    const fileId = active?.id || "none";
    const touchedAt = Number(active?.touchedAt) || 0;
    const length = source.length;
    const head = length ? source.charCodeAt(0) : 0;
    const mid = length ? source.charCodeAt((length / 2) | 0) : 0;
    const tail = length ? source.charCodeAt(length - 1) : 0;
    return `${fileId}:${touchedAt}:${length}:${head}:${mid}:${tail}`;
}

async function getSymbolsForCurrentCode(sourceCode = editor.get()) {
    const code = String(sourceCode ?? "");
    try {
        const astSymbols = await astClient.symbols(code);
        if (Array.isArray(astSymbols) && astSymbols.length) {
            const normalizedAstSymbols = astSymbols.map((entry) => ({
                id: String(entry.id || `symbol-${entry.line || 0}-${entry.ch || 0}-${entry.name || "item"}`),
                line: Math.max(0, Number(entry.line) || 0),
                ch: Math.max(0, Number(entry.ch) || 0),
                name: String(entry.name || ""),
                kind: String(entry.kind || "symbol"),
                signature: String(entry.detail || entry.signature || entry.name || ""),
                start: Number(entry.start) || 0,
                end: Number(entry.end) || 0,
            }));
            const fallbackSymbols = parseSymbolsFromCodeFallback(code);
            const byKey = new Map();
            normalizedAstSymbols.forEach((entry) => {
                const key = `${entry.line}:${entry.ch}:${String(entry.kind || "").toLowerCase()}:${String(entry.name || "").toLowerCase()}`;
                byKey.set(key, entry);
            });
            fallbackSymbols.forEach((entry) => {
                const key = `${entry.line}:${entry.ch}:${String(entry.kind || "").toLowerCase()}:${String(entry.name || "").toLowerCase()}`;
                if (!byKey.has(key)) {
                    byKey.set(key, entry);
                }
            });
            return [...byKey.values()];
        }
    } catch {
        // fallback below
    }
    return parseSymbolsFromCodeFallback(code);
}

async function getCachedSymbolsForCurrentCode(sourceCode = editor.get()) {
    const code = String(sourceCode ?? "");
    const nextKey = buildSymbolSourceCacheKey(code);
    if (symbolSourceCacheKey === nextKey) {
        return symbolSourceCache;
    }
    if (symbolSourceCachePromise?.key === nextKey) {
        return symbolSourceCachePromise.promise;
    }
    const promise = getSymbolsForCurrentCode(code)
        .then((symbols) => {
            const nextSymbols = Array.isArray(symbols) ? symbols : [];
            symbolSourceCacheKey = nextKey;
            symbolSourceCache = nextSymbols;
            return nextSymbols;
        })
        .finally(() => {
            if (symbolSourceCachePromise?.key === nextKey) {
                symbolSourceCachePromise = null;
            }
        });
    symbolSourceCachePromise = { key: nextKey, promise };
    return promise;
}

function isScopeSymbolKind(kind = "") {
    return EDITOR_SCOPE_KIND_SET.has(String(kind || "").trim().toLowerCase());
}

function normalizeScopeSymbolEntry(entry, sourceLength = 0) {
    if (!entry || !isScopeSymbolKind(entry.kind)) return null;
    const line = Math.max(0, Number(entry.line) || 0);
    const ch = Math.max(0, Number(entry.ch) || 0);
    const start = Number(entry.start);
    const end = Number(entry.end);
    const hasRange = Number.isFinite(start) && Number.isFinite(end) && end > start;
    return {
        id: String(entry.id || `${entry.kind}:${line}:${ch}:${entry.name || "item"}`),
        name: String(entry.name || "").trim() || "(anonymous)",
        kind: String(entry.kind || "symbol").trim().toLowerCase(),
        line,
        ch,
        start: hasRange ? Math.max(0, Math.floor(start)) : null,
        end: hasRange ? Math.min(Math.max(0, Math.floor(end)), Math.max(0, sourceLength)) : null,
        signature: String(entry.signature || entry.name || "").trim(),
    };
}

function buildScopeTrailFromSymbols(symbols = [], cursorIndex = 0, cursorLine = 0) {
    const sourceLength = String(editor.get() || "").length;
    const all = (Array.isArray(symbols) ? symbols : [])
        .map((entry) => normalizeScopeSymbolEntry(entry, sourceLength))
        .filter(Boolean);
    if (!all.length) return [];

    const withRanges = all
        .filter((entry) => Number.isFinite(entry.start) && Number.isFinite(entry.end))
        .filter((entry) => cursorIndex >= entry.start && cursorIndex <= entry.end)
        .sort((a, b) => a.start - b.start || b.end - a.end || a.line - b.line);
    if (withRanges.length) {
        const byLineAsc = all
            .filter((entry) => entry.line <= cursorLine)
            .sort((a, b) => a.line - b.line || a.ch - b.ch);
        const trail = [...withRanges].sort((a, b) => a.line - b.line || a.ch - b.ch);
        const seen = new Set(trail.map((entry) => entry.id));

        for (let i = 0; i < trail.length - 1; i += 1) {
            const previous = trail[i];
            const next = trail[i + 1];
            const bridge = byLineAsc
                .filter((entry) => !seen.has(entry.id))
                .filter((entry) => entry.line > previous.line && entry.line < next.line)
                .filter((entry) => entry.kind === "class" || entry.kind === "method" || entry.kind === "function" || entry.kind === "arrow")
                .pop();
            if (!bridge) continue;
            trail.splice(i + 1, 0, bridge);
            seen.add(bridge.id);
            i += 1;
        }

        return trail;
    }

    const byLine = all
        .filter((entry) => entry.line <= cursorLine)
        .sort((a, b) => b.line - a.line || b.ch - a.ch);
    if (!byLine.length) return [];

    const nearestCallable = byLine.find((entry) => entry.kind === "function" || entry.kind === "method" || entry.kind === "arrow") || null;
    const nearestClass = byLine.find((entry) => entry.kind === "class") || null;
    const result = [];
    if (nearestClass) result.push(nearestClass);
    if (nearestCallable && (!nearestClass || nearestCallable.id !== nearestClass.id)) result.push(nearestCallable);
    return result;
}

function renderEditorScopeTrail(items = []) {
    if (!el.editorScopeBar || !el.editorScopeTrail) return;
    const trail = Array.isArray(items) ? items : [];
    if (!trail.length) {
        el.editorScopeBar.setAttribute("data-visible", "false");
        el.editorScopeTrail.innerHTML = "";
        return;
    }

    el.editorScopeBar.setAttribute("data-visible", "true");
    const html = trail
        .map((entry, index) => {
            const sep = index > 0 ? `<span class="editor-scope-sep" aria-hidden="true">›</span>` : "";
            const active = index === trail.length - 1;
            return `${sep}
                <button
                    type="button"
                    class="editor-scope-item"
                    data-scope-item="${escapeHTML(entry.id)}"
                    data-scope-kind="${escapeHTML(entry.kind)}"
                    data-scope-line="${entry.line}"
                    data-scope-ch="${entry.ch}"
                    data-active="${active ? "true" : "false"}"
                    aria-current="${active ? "location" : "false"}">
                    <span class="editor-scope-item-name">${escapeHTML(entry.name)}</span>
                    <span class="editor-scope-item-kind">${escapeHTML(entry.kind)}</span>
                </button>`;
        })
        .join("");
    el.editorScopeTrail.innerHTML = html;
}

async function refreshEditorScopeTrail() {
    if (!el.editorScopeBar || !el.editorScopeTrail) return false;
    const activeFile = getActiveFile();
    if (!activeFile) {
        renderEditorScopeTrail([]);
        return false;
    }

    const cursor = editor.getCursor?.();
    if (!cursor) {
        renderEditorScopeTrail([]);
        return false;
    }

    const code = String(editor.get() || "");
    const cursorIndex = Number(editor.indexFromPos?.(cursor));
    if (!Number.isFinite(cursorIndex)) {
        renderEditorScopeTrail([]);
        return false;
    }

    const requestId = ++editorScopeRequestId;
    const symbols = await getCachedSymbolsForCurrentCode(code);
    if (requestId !== editorScopeRequestId) return false;
    const trail = buildScopeTrailFromSymbols(symbols, cursorIndex, Math.max(0, Number(cursor.line) || 0));
    renderEditorScopeTrail(trail);
    return trail.length > 0;
}

function queueEditorScopeTrailSync() {
    if (editorScopeSyncFrame != null) return;
    editorScopeSyncFrame = scheduleFrame(() => {
        editorScopeSyncFrame = null;
        refreshEditorScopeTrail();
    });
}

function wireEditorScopeTrail() {
    const getScopeButtons = () => Array.from(el.editorScopeTrail?.querySelectorAll?.("[data-scope-item][data-scope-line]") || []);

    el.editorScopeTrail?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-scope-item][data-scope-line]");
        if (!button) return;
        const line = Number(button.dataset.scopeLine);
        const ch = Number(button.dataset.scopeCh);
        const activeFile = getActiveFile();
        if (!activeFile) return;
        jumpToFileLocation(activeFile.id, line, ch);
        status.set(`Jumped to ${String(button.dataset.scopeKind || "scope")}`);
    });

    el.editorScopeTrail?.addEventListener("keydown", (event) => {
        const key = String(event.key || "");
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
        const buttons = getScopeButtons();
        if (!buttons.length) return;
        const current = event.target.closest("[data-scope-item][data-scope-line]");
        const currentIndex = Math.max(0, buttons.findIndex((node) => node === current));
        let nextIndex = currentIndex;
        if (key === "ArrowRight") nextIndex = Math.min(buttons.length - 1, currentIndex + 1);
        if (key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
        if (key === "Home") nextIndex = 0;
        if (key === "End") nextIndex = buttons.length - 1;
        if (nextIndex === currentIndex) return;
        event.preventDefault();
        buttons[nextIndex]?.focus();
    });
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
    const sourceSymbols = await getCachedSymbolsForCurrentCode(editor.get());
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
    syncEditorToolButtons();
    if (!el.symbolPalette || !el.symbolPaletteBackdrop) return;
    setOpenStateAttributes(el.symbolPalette, symbolPaletteOpen);
    setOpenStateAttributes(el.symbolPaletteBackdrop, symbolPaletteOpen);
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
    closeLessonStats({ focusEditor: false });
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

function normalizeEditorSelectionInfo() {
    const selections = editor.getSelections?.() || [];
    if (!Array.isArray(selections) || !selections.length) return [];
    return selections
        .map((selection, index) => {
            const anchor = selection?.anchor || selection?.head;
            const head = selection?.head || selection?.anchor;
            if (!anchor || !head) return null;
            const anchorIndex = Number(editor.indexFromPos?.(anchor));
            const headIndex = Number(editor.indexFromPos?.(head));
            if (!Number.isFinite(anchorIndex) || !Number.isFinite(headIndex)) return null;
            const start = Math.min(anchorIndex, headIndex);
            const end = Math.max(anchorIndex, headIndex);
            return {
                index,
                anchor,
                head,
                anchorIndex,
                headIndex,
                start,
                end,
                collapsed: start === end,
            };
        })
        .filter(Boolean);
}

function getEditorCharsAroundIndex(index) {
    const safeIndex = Math.max(0, Number(index) || 0);
    const beforeStart = Math.max(0, safeIndex - 1);
    const beforePos = editor.posFromIndex?.(beforeStart);
    const atPos = editor.posFromIndex?.(safeIndex);
    const afterPos = editor.posFromIndex?.(safeIndex + 1);
    if (!beforePos || !atPos || !afterPos) {
        return { before: "", after: "" };
    }
    const before = editor.getRange?.(beforePos, atPos) || "";
    const after = editor.getRange?.(atPos, afterPos) || "";
    return { before, after };
}

function shouldAutoPairQuoteAtCursor(quoteChar, cursorIndex) {
    const { before, after } = getEditorCharsAroundIndex(cursorIndex);
    if (before === "\\") return false;
    if (!after) return true;
    if (/\s/.test(after)) return true;
    if (EDITOR_AUTO_PAIR_SAFE_NEXT.has(after)) return true;
    if (after === quoteChar) return true;
    return false;
}

function getHtmlAutoCloseTagName(beforeCursorLineText = "") {
    const line = String(beforeCursorLineText || "");
    const tagStart = line.lastIndexOf("<");
    if (tagStart < 0) return "";
    const segment = line.slice(tagStart + 1);
    if (!segment) return "";
    const head = segment.trimStart();
    if (!head || head.startsWith("/") || head.startsWith("!") || head.startsWith("?")) return "";
    if (/\/\s*$/.test(segment)) return "";
    const match = head.match(/^([A-Za-z][A-Za-z0-9:-]*)\b/);
    if (!match) return "";
    const tagName = String(match[1] || "");
    if (!tagName) return "";
    if (EDITOR_HTML_VOID_TAGS.has(tagName.toLowerCase())) return "";
    return tagName;
}

function maskTextRange(value = "", start = 0, end = 0) {
    const source = String(value || "");
    const from = Math.max(0, Math.min(source.length, Number(start) || 0));
    const to = Math.max(from, Math.min(source.length, Number(end) || from));
    if (to <= from) return source;
    return `${source.slice(0, from)}${" ".repeat(to - from)}${source.slice(to)}`;
}

function maskHtmlIgnoredContent(source = "") {
    let masked = String(source || "");

    const commentPattern = /<!--[\s\S]*?-->/g;
    masked = masked.replace(commentPattern, (match) => " ".repeat(match.length));

    const blockPattern = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
    masked = masked.replace(blockPattern, (segment) => {
        const openEnd = segment.indexOf(">");
        const closeStart = segment.toLowerCase().lastIndexOf("</");
        if (openEnd < 0 || closeStart <= openEnd) {
            return " ".repeat(segment.length);
        }
        return `${segment.slice(0, openEnd + 1)}${" ".repeat(Math.max(0, closeStart - (openEnd + 1)))}${segment.slice(closeStart)}`;
    });

    return masked;
}

function isInsideHtmlCommentAtIndex(source = "", index = 0) {
    const text = String(source || "");
    const cursor = Math.max(0, Number(index) || 0);
    const openIndex = text.lastIndexOf("<!--", cursor);
    if (openIndex < 0) return false;
    const closeIndex = text.lastIndexOf("-->", cursor);
    return closeIndex < openIndex;
}

function isInsideHtmlRawTagBlockAtIndex(source = "", tagName = "", index = 0) {
    const text = String(source || "");
    const cursor = Math.max(0, Number(index) || 0);
    const name = String(tagName || "").trim();
    if (!text || !name) return false;

    const openPattern = new RegExp(`<${name}\\b[^>]*>`, "gi");
    const closePattern = new RegExp(`</${name}\\s*>`, "gi");
    let lastOpen = -1;
    let lastClose = -1;

    for (const match of text.matchAll(openPattern)) {
        const at = Number(match.index);
        if (!Number.isFinite(at) || at >= cursor) continue;
        lastOpen = at;
    }
    for (const match of text.matchAll(closePattern)) {
        const at = Number(match.index);
        if (!Number.isFinite(at) || at >= cursor) continue;
        lastClose = at;
    }

    return lastOpen > lastClose;
}

function isInsideHtmlIgnoredContext(source = "", index = 0) {
    const text = String(source || "");
    if (!text) return false;
    if (isInsideHtmlCommentAtIndex(text, index)) return true;
    if (isInsideHtmlRawTagBlockAtIndex(text, "script", index)) return true;
    if (isInsideHtmlRawTagBlockAtIndex(text, "style", index)) return true;
    return false;
}

function parseHtmlTagTokens(source = "") {
    const text = String(source || "");
    if (!text) return [];
    const parseSource = maskHtmlIgnoredContent(text);
    const tokens = [];
    const pattern = /<\/?([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/g;
    let match;
    while ((match = pattern.exec(parseSource))) {
        const raw = String(match[0] || "");
        const name = String(match[1] || "");
        if (!name) continue;
        const isClosing = raw.startsWith("</");
        const isSelfClosing = /\/\s*>$/.test(raw);
        const nameStart = (Number(match.index) || 0) + (isClosing ? 2 : 1);
        const nameEnd = nameStart + name.length;
        tokens.push({
            index: Number(match.index) || 0,
            end: (Number(match.index) || 0) + raw.length,
            raw,
            name,
            nameLower: name.toLowerCase(),
            nameStart,
            nameEnd,
            isClosing,
            isSelfClosing,
            isVoid: EDITOR_HTML_VOID_TAGS.has(name.toLowerCase()),
        });
    }
    return tokens;
}

function inferHtmlClosingTagNameBeforeIndex(source = "", index = 0) {
    const safeSource = String(source || "");
    const safeIndex = Math.max(0, Number(index) || 0);
    const tokens = parseHtmlTagTokens(safeSource.slice(0, safeIndex));
    if (!tokens.length) return "";

    const stack = [];
    tokens.forEach((token) => {
        if (!token.isClosing) {
            if (token.isSelfClosing || token.isVoid) return;
            stack.push(token.name);
            return;
        }
        const closeName = token.nameLower;
        for (let i = stack.length - 1; i >= 0; i -= 1) {
            if (String(stack[i] || "").toLowerCase() === closeName) {
                stack.splice(i, 1);
                break;
            }
        }
    });

    return stack.length ? String(stack[stack.length - 1] || "") : "";
}

function getHtmlOpenTokenAtCursor(source = "", cursorIndex = 0) {
    const safeSource = String(source || "");
    const safeCursor = Math.max(0, Number(cursorIndex) || 0);
    const tokens = parseHtmlTagTokens(safeSource);
    if (!tokens.length) return { tokens: [], token: null };
    const token = tokens.find((entry) => {
        if (!entry || entry.isClosing || entry.isSelfClosing || entry.isVoid) return false;
        return safeCursor >= entry.nameStart && safeCursor <= entry.nameEnd;
    }) || null;
    return { tokens, token };
}

function findStructuralHtmlClosingToken(tokens = [], openToken = null) {
    if (!openToken) return null;
    const openIndex = (Array.isArray(tokens) ? tokens : []).findIndex((entry) => entry === openToken);
    if (openIndex < 0) return null;
    let depth = 0;
    for (let i = openIndex + 1; i < tokens.length; i += 1) {
        const token = tokens[i];
        if (!token) continue;
        if (!token.isClosing) {
            if (token.isSelfClosing || token.isVoid) continue;
            depth += 1;
            continue;
        }
        if (depth === 0) return token;
        depth -= 1;
    }
    return null;
}

function syncHtmlPairedClosingTagName() {
    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    if (language !== "html") return false;

    const selections = normalizeEditorSelectionInfo();
    if (selections.length !== 1 || !selections[0].collapsed) return false;
    const cursorIndex = selections[0].start;
    const source = String(editor.get?.() || "");
    if (!source) return false;
    if (isInsideHtmlIgnoredContext(source, cursorIndex)) return false;

    const { before, after } = getEditorCharsAroundIndex(cursorIndex);
    if (!/[A-Za-z0-9:-]/.test(`${before}${after}`)) return false;
    const openBracketIndex = source.lastIndexOf("<", cursorIndex);
    if (openBracketIndex < 0) return false;
    const closeBracketIndex = source.indexOf(">", openBracketIndex);
    if (closeBracketIndex < 0 || cursorIndex <= openBracketIndex || cursorIndex > closeBracketIndex) return false;
    const shell = source.slice(openBracketIndex, closeBracketIndex + 1);
    if (!shell || /^<\//.test(shell) || /^<!/.test(shell) || /^<\?/.test(shell) || /\/\s*>$/.test(shell)) return false;

    const { tokens, token: openToken } = getHtmlOpenTokenAtCursor(source, cursorIndex);
    if (!openToken) return false;
    const closeToken = findStructuralHtmlClosingToken(tokens, openToken);
    if (!closeToken || !closeToken.isClosing) return false;
    if (closeToken.name === openToken.name) return false;

    const from = editor.posFromIndex?.(closeToken.nameStart);
    const to = editor.posFromIndex?.(closeToken.nameEnd);
    if (!from || !to) return false;

    suppressHtmlTagRenameChange = true;
    editor.replaceRange?.(openToken.name, from, to);
    return true;
}

function handleEditorHtmlCloseTagCompletion(e) {
    if (String(e.key || "") !== "/") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    if (language !== "html") return false;

    const selections = normalizeEditorSelectionInfo();
    if (selections.length !== 1 || !selections[0].collapsed) return false;
    const entry = selections[0];
    const { before } = getEditorCharsAroundIndex(entry.start);
    if (before !== "<") return false;

    const source = String(editor.get?.() || "");
    if (isInsideHtmlIgnoredContext(source, entry.start)) return false;
    const tagName = inferHtmlClosingTagNameBeforeIndex(source, entry.start - 1);
    if (!tagName) return false;

    const cursorPos = editor.posFromIndex?.(entry.start);
    if (!cursorPos) return false;
    const afterPos = editor.posFromIndex?.(entry.start + tagName.length + 3);
    const afterText = afterPos ? String(editor.getRange?.(cursorPos, afterPos) || "") : "";
    const existingCloseTag = `</${tagName}>`;

    if (afterText.startsWith(existingCloseTag)) {
        editor.operation?.(() => {
            const dropFrom = editor.posFromIndex?.(Math.max(0, entry.start - 1));
            const dropTo = editor.posFromIndex?.(entry.start);
            if (dropFrom && dropTo) {
                editor.replaceRange?.("", dropFrom, dropTo);
            }
            const nextPos = editor.posFromIndex?.(entry.start + tagName.length + 2);
            if (nextPos) {
                editor.setSelections?.([{ anchor: nextPos, head: nextPos }]);
            }
        });
        e.preventDefault();
        return true;
    }

    editor.operation?.(() => {
        editor.replaceRange?.(`/${tagName}>`, cursorPos, cursorPos);
        const nextPos = editor.posFromIndex?.(entry.start + tagName.length + 2);
        if (nextPos) {
            editor.setSelections?.([{ anchor: nextPos, head: nextPos }]);
        }
    });
    e.preventDefault();
    return true;
}

function handleEditorHtmlSmartEnter(e) {
    if (String(e.key || "") !== "Enter") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    if (language !== "html") return false;

    const selections = normalizeEditorSelectionInfo();
    if (selections.length !== 1 || !selections[0].collapsed) return false;
    const entry = selections[0];
    const source = String(editor.get?.() || "");
    const cursorIndex = entry.start;
    if (isInsideHtmlIgnoredContext(source, cursorIndex)) return false;
    const { before, after } = getEditorCharsAroundIndex(cursorIndex);
    if (before !== ">" || after !== "<") return false;

    const closingName = inferHtmlClosingTagNameBeforeIndex(source, cursorIndex);
    if (!closingName) return false;

    const afterSlice = source.slice(cursorIndex);
    const closeMatch = afterSlice.match(/^<\/([A-Za-z][A-Za-z0-9:-]*)\b[^>]*>/);
    if (!closeMatch) return false;
    const closeTagName = String(closeMatch[1] || "");
    if (!closeTagName || closeTagName.toLowerCase() !== closingName.toLowerCase()) return false;

    const cursorPos = editor.posFromIndex?.(cursorIndex);
    if (!cursorPos) return false;
    const lineText = String(editor.getLine?.(cursorPos.line) || "");
    const baseIndent = (lineText.match(/^\s*/) || [""])[0];
    const innerIndent = `${baseIndent}${getEditorIndentUnit()}`;
    const insert = `\n${innerIndent}\n${baseIndent}`;

    editor.operation?.(() => {
        editor.replaceRange?.(insert, cursorPos, cursorPos);
        const nextPos = editor.posFromIndex?.(cursorIndex + 1 + innerIndent.length);
        if (nextPos) {
            editor.setSelections?.([{ anchor: nextPos, head: nextPos }]);
        }
    });
    e.preventDefault();
    return true;
}

function handleEditorHtmlAutoCloseTag(e) {
    if (String(e.key || "") !== ">") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    if (language !== "html") return false;

    const selections = normalizeEditorSelectionInfo();
    if (selections.length !== 1 || !selections[0].collapsed) return false;

    const entry = selections[0];
    const source = String(editor.get?.() || "");
    if (isInsideHtmlIgnoredContext(source, entry.start)) return false;
    const cursorPos = editor.posFromIndex?.(entry.start);
    if (!cursorPos) return false;
    const lineText = String(editor.getLine?.(cursorPos.line) || "");
    const beforeLineText = lineText.slice(0, cursorPos.ch);
    const tagName = getHtmlAutoCloseTagName(beforeLineText);
    if (!tagName) return false;

    const closeTag = `</${tagName}>`;
    const afterEndPos = editor.posFromIndex?.(entry.start + closeTag.length + 1);
    const afterSlice = afterEndPos ? String(editor.getRange?.(cursorPos, afterEndPos) || "") : "";
    const shouldOnlyCloseOpenTag = afterSlice.startsWith(closeTag) || afterSlice.startsWith(`>${closeTag}`);
    const insertText = shouldOnlyCloseOpenTag ? ">" : `>${closeTag}`;

    editor.operation?.(() => {
        editor.replaceRange?.(insertText, cursorPos, cursorPos);
        const nextPos = editor.posFromIndex?.(entry.start + 1);
        if (nextPos) {
            editor.setSelections?.([{ anchor: nextPos, head: nextPos }]);
        }
    });
    e.preventDefault();
    return true;
}

function handleEditorAutoOpenPair(e) {
    const openChar = String(e.key || "");
    const closeChar = EDITOR_AUTO_PAIR_OPEN_TO_CLOSE.get(openChar);
    if (!closeChar) return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length) return false;
    if (EDITOR_AUTO_PAIR_QUOTES.has(openChar)) {
        const allCollapsed = selections.every((entry) => entry.collapsed);
        if (allCollapsed) {
            const canPair = selections.every((entry) => shouldAutoPairQuoteAtCursor(openChar, entry.start));
            if (!canPair) return false;
        }
    }

    const ordered = [...selections].sort((a, b) => b.start - a.start || b.index - a.index);
    const nextSelections = new Map();

    editor.operation?.(() => {
        ordered.forEach((entry) => {
            const from = editor.posFromIndex?.(entry.start);
            const to = editor.posFromIndex?.(entry.end);
            if (!from || !to) return;
            if (entry.collapsed) {
                editor.replaceRange?.(`${openChar}${closeChar}`, from, to);
                const cursor = editor.posFromIndex?.(entry.start + 1);
                if (!cursor) return;
                nextSelections.set(entry.index, { anchor: cursor, head: cursor });
                return;
            }

            const selectedText = editor.getRange?.(from, to) || "";
            editor.replaceRange?.(`${openChar}${selectedText}${closeChar}`, from, to);
            const nextStartIndex = entry.start + 1;
            const nextEndIndex = nextStartIndex + selectedText.length;
            const nextAnchor = editor.posFromIndex?.(nextStartIndex);
            const nextHead = editor.posFromIndex?.(nextEndIndex);
            if (!nextAnchor || !nextHead) return;
            nextSelections.set(entry.index, { anchor: nextAnchor, head: nextHead });
        });
    });

    const normalizedNext = selections
        .map((entry) => nextSelections.get(entry.index))
        .filter(Boolean);
    if (normalizedNext.length) {
        editor.setSelections?.(normalizedNext);
    }
    e.preventDefault();
    return true;
}

function handleEditorAutoCloseSkip(e) {
    const closeChar = String(e.key || "");
    if (!EDITOR_AUTO_PAIR_CLOSE_TO_OPEN.has(closeChar)) return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length || selections.some((entry) => !entry.collapsed)) return false;

    const canSkip = selections.every((entry) => {
        const { after } = getEditorCharsAroundIndex(entry.start);
        return after === closeChar;
    });
    if (!canSkip) return false;

    const next = selections
        .map((entry) => {
            const pos = editor.posFromIndex?.(entry.start + 1);
            if (!pos) return null;
            return { anchor: pos, head: pos };
        })
        .filter(Boolean);
    if (!next.length) return false;

    editor.setSelections?.(next);
    e.preventDefault();
    return true;
}

function handleEditorAutoPairBackspace(e) {
    if (String(e.key || "") !== "Backspace") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length || selections.some((entry) => !entry.collapsed)) return false;

    const canRemovePairs = selections.every((entry) => {
        const { before, after } = getEditorCharsAroundIndex(entry.start);
        const expectedClose = EDITOR_AUTO_PAIR_OPEN_TO_CLOSE.get(before);
        return Boolean(expectedClose && expectedClose === after);
    });
    if (!canRemovePairs) return false;

    const ordered = [...selections].sort((a, b) => b.start - a.start || b.index - a.index);
    const nextSelections = new Map();

    editor.operation?.(() => {
        ordered.forEach((entry) => {
            const from = editor.posFromIndex?.(entry.start - 1);
            const to = editor.posFromIndex?.(entry.start + 1);
            if (!from || !to) return;
            editor.replaceRange?.("", from, to);
            const nextPos = editor.posFromIndex?.(entry.start - 1);
            if (!nextPos) return;
            nextSelections.set(entry.index, { anchor: nextPos, head: nextPos });
        });
    });

    const normalizedNext = selections
        .map((entry) => nextSelections.get(entry.index))
        .filter(Boolean);
    if (normalizedNext.length) {
        editor.setSelections?.(normalizedNext);
    }
    e.preventDefault();
    return true;
}

function handleEditorAutoPairs(e) {
    if (handleEditorAutoOpenPair(e)) return true;
    if (handleEditorAutoCloseSkip(e)) return true;
    if (handleEditorAutoPairBackspace(e)) return true;
    return false;
}

function getEditorIndentUnit() {
    const size = Math.max(1, Number(editorSettings?.tabSize) || 2);
    return " ".repeat(size);
}

function handleEditorSmartEnter(e) {
    if (String(e.key || "") !== "Enter") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length || selections.some((entry) => !entry.collapsed)) return false;

    const canExpand = selections.every((entry) => {
        const { before, after } = getEditorCharsAroundIndex(entry.start);
        const expectedClose = EDITOR_AUTO_PAIR_OPEN_TO_CLOSE.get(before);
        return Boolean(expectedClose && expectedClose === after && !EDITOR_AUTO_PAIR_QUOTES.has(before));
    });
    if (!canExpand) return false;

    const indentUnit = getEditorIndentUnit();
    const ordered = [...selections].sort((a, b) => b.start - a.start || b.index - a.index);
    const nextSelections = new Map();

    editor.operation?.(() => {
        ordered.forEach((entry) => {
            const cursorPos = editor.posFromIndex?.(entry.start);
            if (!cursorPos) return;
            const lineText = editor.getLine?.(cursorPos.line) || "";
            const baseIndent = (lineText.match(/^\s*/) || [""])[0];
            const innerIndent = `${baseIndent}${indentUnit}`;
            const from = editor.posFromIndex?.(entry.start);
            if (!from) return;
            const insert = `\n${innerIndent}\n${baseIndent}`;
            editor.replaceRange?.(insert, from, from);
            const nextPos = editor.posFromIndex?.(entry.start + 1 + innerIndent.length);
            if (!nextPos) return;
            nextSelections.set(entry.index, { anchor: nextPos, head: nextPos });
        });
    });

    const normalizedNext = selections
        .map((entry) => nextSelections.get(entry.index))
        .filter(Boolean);
    if (normalizedNext.length) {
        editor.setSelections?.(normalizedNext);
    }
    e.preventDefault();
    return true;
}

function getSelectedEditorLines(selectionEntries = []) {
    const lines = new Set();
    (Array.isArray(selectionEntries) ? selectionEntries : []).forEach((entry) => {
        const anchor = editor.posFromIndex?.(entry.anchorIndex);
        const head = editor.posFromIndex?.(entry.headIndex);
        if (!anchor || !head) return;
        let startLine = Math.min(anchor.line, head.line);
        let endLine = Math.max(anchor.line, head.line);
        if (!entry.collapsed) {
            const tail = headIndexIsTail(entry) ? head : anchor;
            if (tail.ch === 0 && endLine > startLine) {
                endLine -= 1;
            }
        }
        for (let line = startLine; line <= endLine; line += 1) {
            lines.add(line);
        }
    });
    return [...lines].sort((a, b) => a - b);
}

function headIndexIsTail(entry) {
    return entry.headIndex >= entry.anchorIndex;
}

function getEditorSelectedLineRange() {
    const selections = normalizeEditorSelectionInfo();
    if (!selections.length) return null;
    const selectedLines = getSelectedEditorLines(selections);
    if (!selectedLines.length) return null;
    return {
        selections,
        startLine: selectedLines[0],
        endLine: selectedLines[selectedLines.length - 1],
    };
}

function buildEditorLineBlockSelection(lines, startLine, endLine) {
    const safeStart = Math.max(0, Number(startLine) || 0);
    const safeEnd = Math.max(safeStart, Number(endLine) || safeStart);
    const endLineText = String(lines[safeEnd] || "");
    return [{
        anchor: { line: safeStart, ch: 0 },
        head: { line: safeEnd, ch: endLineText.length },
    }];
}

function applyEditorQolCode(nextCode, nextSelections = null, reason = "editor-qol") {
    setEditorValue(String(nextCode ?? ""), { silent: true });
    updateActiveFileCode(editor.get());
    if (Array.isArray(nextSelections) && nextSelections.length) {
        editor.setSelections?.(nextSelections);
    }
    queueEditorLint(reason);
    syncEditorStatusBar();
}

function duplicateEditorSelectedLines(direction = 1) {
    const step = Number(direction) < 0 ? -1 : 1;
    const range = getEditorSelectedLineRange();
    if (!range) return false;
    const source = String(editor.get?.() || "");
    const lines = source.split("\n");
    if (!lines.length) return false;

    const { selections, startLine, endLine } = range;
    const block = lines.slice(startLine, endLine + 1);
    let nextStart = startLine;
    let nextEnd = endLine;

    if (step < 0) {
        lines.splice(startLine, 0, ...block);
    } else {
        lines.splice(endLine + 1, 0, ...block);
        nextStart = startLine + block.length;
        nextEnd = endLine + block.length;
    }

    let nextSelections = buildEditorLineBlockSelection(lines, nextStart, nextEnd);
    if (selections.length === 1 && selections[0].collapsed) {
        const anchor = selections[0].anchor || { line: startLine, ch: 0 };
        const lineOffset = step < 0 ? 0 : block.length;
        const targetLine = Math.min(lines.length - 1, Math.max(0, anchor.line + lineOffset));
        const targetCh = Math.min(Math.max(0, anchor.ch), String(lines[targetLine] || "").length);
        nextSelections = [{
            anchor: { line: targetLine, ch: targetCh },
            head: { line: targetLine, ch: targetCh },
        }];
    }

    applyEditorQolCode(lines.join("\n"), nextSelections, "editor-duplicate-line");
    status.set(step < 0 ? "Duplicated line up" : "Duplicated line down");
    return true;
}

function duplicateEditorSelectedLinesDown() {
    return duplicateEditorSelectedLines(1);
}

function duplicateEditorSelectedLinesUp() {
    return duplicateEditorSelectedLines(-1);
}

function moveEditorSelectedLines(direction = 1) {
    const step = Number(direction) < 0 ? -1 : 1;
    const range = getEditorSelectedLineRange();
    if (!range) return false;
    const source = String(editor.get?.() || "");
    const lines = source.split("\n");
    if (!lines.length) return false;

    const { selections, startLine, endLine } = range;
    if (step < 0 && startLine <= 0) return false;
    if (step > 0 && endLine >= lines.length - 1) return false;

    const block = lines.slice(startLine, endLine + 1);
    let nextStart = startLine;
    let nextEnd = endLine;
    if (step < 0) {
        const swapLine = lines[startLine - 1];
        lines.splice(startLine - 1, block.length + 1, ...block, swapLine);
        nextStart = startLine - 1;
        nextEnd = endLine - 1;
    } else {
        const swapLine = lines[endLine + 1];
        lines.splice(startLine, block.length + 1, swapLine, ...block);
        nextStart = startLine + 1;
        nextEnd = endLine + 1;
    }

    let nextSelections = buildEditorLineBlockSelection(lines, nextStart, nextEnd);
    if (selections.length === 1 && selections[0].collapsed) {
        const anchor = selections[0].anchor || { line: startLine, ch: 0 };
        const targetLine = Math.min(lines.length - 1, Math.max(0, anchor.line + step));
        const targetCh = Math.min(Math.max(0, anchor.ch), String(lines[targetLine] || "").length);
        nextSelections = [{
            anchor: { line: targetLine, ch: targetCh },
            head: { line: targetLine, ch: targetCh },
        }];
    }

    applyEditorQolCode(lines.join("\n"), nextSelections, "editor-move-line");
    status.set(step < 0 ? "Moved line up" : "Moved line down");
    return true;
}

function getEditorCommentStyleForLanguage(language = "text") {
    const normalized = String(language || "text").toLowerCase();
    if (EDITOR_LINE_COMMENT_PREFIX_LANGS.has(normalized)) {
        return { kind: "line", prefix: "//" };
    }
    if (normalized === "html" || normalized === "markdown") {
        return { kind: "wrap", open: "<!--", close: "-->" };
    }
    return { kind: "line", prefix: "//" };
}

function toggleEditorComments() {
    const range = getEditorSelectedLineRange();
    if (!range) return false;
    const source = String(editor.get?.() || "");
    const lines = source.split("\n");
    const { startLine, endLine } = range;
    const targetLines = lines.slice(startLine, endLine + 1);
    if (!targetLines.length) return false;

    const active = getActiveFile();
    const language = detectLanguageFromFileName(active?.name || "");
    const style = getEditorCommentStyleForLanguage(language);

    const isCommentedLine = (lineText) => {
        const text = String(lineText || "");
        const trimmed = text.trim();
        if (!trimmed) return true;
        if (style.kind === "line") {
            const indent = (text.match(/^\s*/) || [""])[0];
            return text.slice(indent.length).startsWith(style.prefix);
        }
        return trimmed.startsWith(style.open) && trimmed.endsWith(style.close);
    };

    const uncommentLine = (lineText) => {
        const text = String(lineText || "");
        const indent = (text.match(/^\s*/) || [""])[0];
        const afterIndent = text.slice(indent.length);
        if (style.kind === "line") {
            if (!afterIndent.startsWith(style.prefix)) return text;
            let rest = afterIndent.slice(style.prefix.length);
            if (rest.startsWith(" ")) rest = rest.slice(1);
            return `${indent}${rest}`;
        }
        const trimmed = text.trim();
        if (!(trimmed.startsWith(style.open) && trimmed.endsWith(style.close))) return text;
        const body = trimmed.slice(style.open.length, trimmed.length - style.close.length).trim();
        return `${indent}${body}`;
    };

    const commentLine = (lineText) => {
        const text = String(lineText || "");
        const indent = (text.match(/^\s*/) || [""])[0];
        const body = text.slice(indent.length);
        if (style.kind === "line") {
            return body.length ? `${indent}${style.prefix} ${body}` : `${indent}${style.prefix}`;
        }
        const trimmedBody = body.trim();
        return trimmedBody
            ? `${indent}${style.open} ${trimmedBody} ${style.close}`
            : `${indent}${style.open} ${style.close}`;
    };

    const nonEmpty = targetLines.filter((line) => String(line || "").trim().length > 0);
    const allCommented = (nonEmpty.length ? nonEmpty : targetLines).every((line) => isCommentedLine(line));

    for (let line = startLine; line <= endLine; line += 1) {
        const current = lines[line];
        lines[line] = allCommented ? uncommentLine(current) : commentLine(current);
    }

    const nextSelections = buildEditorLineBlockSelection(lines, startLine, endLine);
    applyEditorQolCode(lines.join("\n"), nextSelections, "editor-toggle-comment");
    status.set(allCommented ? "Comments removed" : "Comments added");
    return true;
}

function deleteEditorSelectedLines() {
    const range = getEditorSelectedLineRange();
    if (!range) return false;
    const source = String(editor.get?.() || "");
    const lines = source.split("\n");
    if (!lines.length) return false;

    const { startLine, endLine } = range;
    const removeCount = Math.max(1, (endLine - startLine) + 1);
    lines.splice(startLine, removeCount);
    if (!lines.length) {
        lines.push("");
    }

    const targetLine = Math.min(startLine, lines.length - 1);
    const nextSelections = [{
        anchor: { line: targetLine, ch: 0 },
        head: { line: targetLine, ch: 0 },
    }];

    applyEditorQolCode(lines.join("\n"), nextSelections, "editor-delete-line");
    status.set(removeCount > 1 ? "Deleted lines" : "Deleted line");
    return true;
}

function rangeOverlapsAny(start, end, ranges = []) {
    const safeStart = Math.max(0, Number(start) || 0);
    const safeEnd = Math.max(safeStart, Number(end) || safeStart);
    return (Array.isArray(ranges) ? ranges : []).some((entry) => {
        const from = Math.max(0, Number(entry?.start) || 0);
        const to = Math.max(from, Number(entry?.end) || from);
        return safeStart < to && safeEnd > from;
    });
}

function selectEditorNextOccurrence() {
    const multiCursor = Boolean(editor.supportsMultiCursor);

    const source = String(editor.get?.() || "");
    if (!source) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length) return false;
    const primary = selections[0];
    if (!primary) return false;

    if (primary.collapsed) {
        const word = editor.getWordAt?.(primary.head || primary.anchor);
        const text = String(word?.word || "");
        if (!text) return false;
        const from = word?.from;
        const to = word?.to;
        if (!from || !to) return false;
        editor.setSelections?.([{ anchor: from, head: to }]);
        status.set("Selected occurrence");
        return true;
    }

    const needle = source.slice(primary.start, primary.end);
    if (!needle) return false;

    const occupiedRanges = selections.map((entry) => ({ start: entry.start, end: entry.end }));
    const afterStart = Math.max(...occupiedRanges.map((entry) => entry.end));
    const windows = [
        { start: Math.max(0, afterStart), end: source.length },
        { start: 0, end: Math.max(0, primary.start) },
    ];

    let nextIndex = -1;
    for (const window of windows) {
        if (nextIndex >= 0) break;
        let cursor = Math.max(0, Number(window?.start) || 0);
        const limit = Math.max(cursor, Number(window?.end) || cursor);
        while (cursor <= limit) {
            const found = source.indexOf(needle, cursor);
            if (found < 0 || found >= limit) break;
            const nextEnd = found + needle.length;
            if (!rangeOverlapsAny(found, nextEnd, occupiedRanges)) {
                nextIndex = found;
                break;
            }
            cursor = found + 1;
        }
    }

    if (nextIndex < 0) {
        status.set("No further occurrence");
        return false;
    }

    const nextStartPos = editor.posFromIndex?.(nextIndex);
    const nextEndPos = editor.posFromIndex?.(nextIndex + needle.length);
    if (!nextStartPos || !nextEndPos) return false;

    const nextSelections = getUniqueSelections([
        ...selections.map((entry) => ({ anchor: entry.anchor, head: entry.head })),
        { anchor: nextStartPos, head: nextEndPos },
    ]);
    if (multiCursor) {
        if (!nextSelections.length) return false;
        editor.setSelections?.(nextSelections);
        status.set("Added occurrence");
        return true;
    }

    editor.setSelections?.([{ anchor: nextStartPos, head: nextEndPos }]);
    status.set("Selected next occurrence");
    return true;
}

function selectAllEditorOccurrences() {
    const source = String(editor.get?.() || "");
    if (!source) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length) return false;
    const primary = selections[0];
    if (!primary) return false;

    let needle = "";
    let currentStart = Math.max(0, Number(primary.start) || 0);

    if (primary.collapsed) {
        const word = editor.getWordAt?.(primary.head || primary.anchor);
        const text = String(word?.word || "");
        if (!text) return false;
        const from = word?.from;
        const to = word?.to;
        if (!from || !to) return false;
        const fromIndex = Number(editor.indexFromPos?.(from));
        if (Number.isFinite(fromIndex)) {
            currentStart = Math.max(0, fromIndex);
        }
        needle = text;
    } else {
        needle = source.slice(primary.start, primary.end);
    }

    if (!needle) return false;

    const occurrences = [];
    let cursor = 0;
    while (cursor <= source.length) {
        const found = source.indexOf(needle, cursor);
        if (found < 0) break;
        occurrences.push({ start: found, end: found + needle.length });
        cursor = found + Math.max(needle.length, 1);
        if (occurrences.length >= 600) break;
    }
    if (!occurrences.length) return false;

    if (editor.supportsMultiCursor) {
        const nextSelections = occurrences
            .map((entry) => {
                const anchor = editor.posFromIndex?.(entry.start);
                const head = editor.posFromIndex?.(entry.end);
                if (!anchor || !head) return null;
                return { anchor, head };
            })
            .filter(Boolean);
        if (!nextSelections.length) return false;
        editor.setSelections?.(getUniqueSelections(nextSelections));
        status.set(`Selected ${nextSelections.length} occurrences`);
        return true;
    }

    const fallback = occurrences.find((entry) => entry.start > currentStart) || occurrences[0];
    const anchor = editor.posFromIndex?.(fallback.start);
    const head = editor.posFromIndex?.(fallback.end);
    if (!anchor || !head) return false;
    editor.setSelections?.([{ anchor, head }]);
    status.set("Selected occurrence");
    return true;
}

function handleEditorTabIndent(e, { outdent = false } = {}) {
    if (String(e.key || "") !== "Tab") return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    if (Boolean(e.shiftKey) !== Boolean(outdent)) return false;

    const selections = normalizeEditorSelectionInfo();
    if (!selections.length) return false;
    const lines = getSelectedEditorLines(selections);
    if (!lines.length) return false;

    const indentUnit = getEditorIndentUnit();
    const indentLen = indentUnit.length;
    const removedByLine = new Map();

    editor.operation?.(() => {
        for (let index = lines.length - 1; index >= 0; index -= 1) {
            const line = lines[index];
            const linePos = { line, ch: 0 };
            if (!outdent) {
                editor.replaceRange?.(indentUnit, linePos, linePos);
                continue;
            }

            const lineText = editor.getLine?.(line) || "";
            if (!lineText) continue;
            let removeCount = 0;
            if (lineText.startsWith("\t")) {
                removeCount = 1;
            } else {
                const match = lineText.match(/^ +/);
                removeCount = Math.min(indentLen, match ? match[0].length : 0);
            }
            if (removeCount <= 0) continue;
            removedByLine.set(line, removeCount);
            editor.replaceRange?.("", { line, ch: 0 }, { line, ch: removeCount });
        }
    });

    const adjustedSelections = selections.map((entry) => {
        const anchorPos = entry.anchor;
        const headPos = entry.head;
        const anchorDelta = !outdent
            ? (lines.includes(anchorPos.line) ? indentLen : 0)
            : (removedByLine.get(anchorPos.line) || 0);
        const headDelta = !outdent
            ? (lines.includes(headPos.line) ? indentLen : 0)
            : (removedByLine.get(headPos.line) || 0);
        const nextAnchor = {
            line: anchorPos.line,
            ch: Math.max(0, anchorPos.ch + (!outdent ? anchorDelta : -anchorDelta)),
        };
        const nextHead = {
            line: headPos.line,
            ch: Math.max(0, headPos.ch + (!outdent ? headDelta : -headDelta)),
        };
        return { anchor: nextAnchor, head: nextHead };
    });

    if (adjustedSelections.length) {
        editor.setSelections?.(getUniqueSelections(adjustedSelections));
    }
    e.preventDefault();
    return true;
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

function getCompletionWordAtCursor() {
    const selections = normalizeEditorSelectionInfo();
    if (!selections.length || selections.length > 1) return null;
    if (!selections[0].collapsed) return null;
    const word = editor.getWordAt?.();
    if (!word || !word.from || !word.to) return null;
    const cursor = editor.getCursor?.();
    if (!cursor) return null;
    const cursorIndex = Number(editor.indexFromPos?.(cursor));
    const fromIndex = Number(editor.indexFromPos?.(word.from));
    const toIndex = Number(editor.indexFromPos?.(word.to));
    if (!Number.isFinite(cursorIndex) || !Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return null;
    if (cursorIndex < fromIndex || cursorIndex > toIndex) return null;
    const prefix = String(word.word || "").slice(0, cursorIndex - fromIndex);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(prefix)) return null;
    return {
        prefix,
        from: word.from,
        to: word.to,
        cursor,
    };
}

function getEditorCompletionLanguageKeywords(language = "text") {
    const base = EDITOR_COMPLETION_KEYWORDS[language] || [];
    if (language === "typescript") {
        return [...(EDITOR_COMPLETION_KEYWORDS.javascript || []), ...base];
    }
    return base;
}

function getCompletionSymbolKindMap(sourceCode = editor.get()) {
    const source = String(sourceCode || "");
    const key = buildSymbolSourceCacheKey(source);
    const symbols = symbolSourceCacheKey === key && Array.isArray(symbolSourceCache)
        ? symbolSourceCache
        : parseSymbolsFromCodeFallback(source);
    const rankByKind = {
        class: 60,
        method: 50,
        function: 50,
        arrow: 48,
        variable: 30,
        keyword: 20,
    };
    const map = new Map();
    (Array.isArray(symbols) ? symbols : []).forEach((entry) => {
        const name = String(entry?.name || "").trim();
        if (!name) return;
        const keyName = name.toLowerCase();
        const kind = String(entry?.kind || "variable").trim().toLowerCase();
        const nextRank = rankByKind[kind] || 0;
        const prev = map.get(keyName);
        if (!prev || nextRank >= prev.rank) {
            map.set(keyName, { kind, rank: nextRank });
        }
    });
    return map;
}

function getEditorCompletionIcon(kind = "", source = "") {
    const normalizedKind = String(kind || "").trim().toLowerCase();
    const normalizedSource = String(source || "").trim().toLowerCase();
    if (normalizedSource === "snippet" || normalizedKind === "snippet") {
        return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 2h10a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9l-3.4 2.6a.6.6 0 0 1-.96-.48V11.5H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm1.2 2.8h7.6v1H4.2v-1Zm0 2.5h5.4v1H4.2v-1Z"/></svg>`;
    }
    if (normalizedKind === "class") {
        return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9Zm3.2 2.3h5.6v1H5.2v-1Zm0 2.2h5.6v1H5.2V8Zm0 2.2h3.2v1H5.2v-1Z"/></svg>`;
    }
    if (normalizedKind === "function" || normalizedKind === "method" || normalizedKind === "arrow") {
        return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4.4 3.3a2.1 2.1 0 1 1 0 4.2H3v1h1.4a3.1 3.1 0 1 0 0-6.2H3a1 1 0 0 0-1 1v1.7h1V3.3h1.4Zm4.2 0h4.4v1h-2.5L14 7.8l-1.5 1.5-2.6-2.6v2.9h-1V3.3Zm0 6.9h1v2.5H13v1H8.6v-3.5Z"/></svg>`;
    }
    if (normalizedKind === "variable") {
        return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M2.6 2.5h1.2l2.2 6.8 2.2-6.8h1.2l-3 8.6H5.6l-3-8.6Zm8.6 0h1.2v8.6h-1.2V2.5ZM4.5 12.6h7v1h-7v-1Z"/></svg>`;
    }
    if (normalizedKind === "keyword") {
        return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 2.5h1.2v4.1l3.5-4.1h1.5L5.8 6.4l3.7 4.7H8l-3-3.8-.8.9v2.9H3V2.5Zm8.2 0h1.2v8.6h-1.2V2.5Z"/></svg>`;
    }
    return `<svg class="editor-completion-icon-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="2.2" fill="currentColor"/></svg>`;
}

function collectEditorCompletionItems(prefix = "") {
    const input = String(prefix || "").trim();
    if (input.length < EDITOR_COMPLETION_MIN_PREFIX) return [];
    const lower = input.toLowerCase();
    const language = getActiveSnippetScope();
    const source = String(editor.get?.() || "");
    const symbolKindMap = getCompletionSymbolKindMap(source);
    const ranked = new Map();
    const push = (value, detail, sourceName, baseScore = 0, kind = "") => {
        const text = String(value || "").trim();
        if (!text) return;
        const key = text.toLowerCase();
        if (!key.startsWith(lower)) return;
        const exactBoost = key === lower ? 100 : 0;
        const closenessBoost = Math.max(0, 24 - (text.length - input.length));
        const score = baseScore + exactBoost + closenessBoost;
        const prev = ranked.get(key);
        if (!prev || score > prev.score) {
            ranked.set(key, { value: text, detail, source: sourceName, score, kind: kind || "variable" });
        }
    };

    snippetRegistry.forEach((entry) => {
        const scope = normalizeSnippetScope(entry.scope);
        if (scope !== "*" && scope !== language) return;
        push(entry.trigger, `snippet • ${scope === "*" ? "all" : scope}`, "snippet", 400, "snippet");
    });

    getEditorCompletionLanguageKeywords(language).forEach((keyword) => {
        push(keyword, `keyword • ${language}`, "keyword", 300, "keyword");
    });

    const matches = source.match(/[A-Za-z_$][A-Za-z0-9_$]{2,}/g) || [];
    const seen = new Set();
    for (let i = 0; i < matches.length; i += 1) {
        const token = matches[i];
        const key = token.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const symbolKind = symbolKindMap.get(key)?.kind || "variable";
        push(token, "in file", "local", 200, symbolKind);
        if (seen.size >= 600) break;
    }

    return [...ranked.values()]
        .sort((a, b) => b.score - a.score || a.value.localeCompare(b.value))
        .slice(0, getEditorCompletionMaxItems());
}

function renderEditorCompletionList() {
    if (!el.editorCompletionList) return;
    if (!editorCompletionItems.length) {
        el.editorCompletionList.innerHTML = "";
        el.editorCompletionList.removeAttribute("aria-activedescendant");
        return;
    }
    el.editorCompletionList.innerHTML = editorCompletionItems
        .map((item, index) => {
            const active = index === editorCompletionIndex;
            const itemId = `editorCompletionItem-${index}`;
            return `
                <li role="presentation">
                    <button
                        id="${itemId}"
                        type="button"
                        class="editor-completion-item"
                        role="option"
                        data-completion-index="${index}"
                        data-completion-kind="${escapeHTML(String(item.kind || "variable"))}"
                        data-active="${active ? "true" : "false"}"
                        aria-selected="${active ? "true" : "false"}">
                        <span class="editor-completion-item-main">
                            <span class="editor-completion-item-icon" data-kind="${escapeHTML(String(item.kind || "variable"))}" aria-hidden="true">${getEditorCompletionIcon(item.kind, item.source)}</span>
                            <span class="editor-completion-item-label">${escapeHTML(item.value)}</span>
                        </span>
                        <span class="editor-completion-item-sub">${escapeHTML(item.detail || item.source || "")}</span>
                    </button>
                </li>
            `;
        })
        .join("");
    const activeId = `editorCompletionItem-${editorCompletionIndex}`;
    el.editorCompletionList.setAttribute("aria-activedescendant", activeId);
}

function clearEditorCompletionGhost() {
    if (!editorCompletionGhost) return false;
    const ghostNode = editorCompletionGhost.node;
    try {
        editorCompletionGhost.bookmark?.clear?.();
    } catch (_err) {
        // noop
    }
    if (ghostNode?.parentNode) {
        ghostNode.parentNode.removeChild(ghostNode);
    }
    editorCompletionGhost = null;
    return true;
}

function setEditorCompletionGhost(suffix = "", pos = null) {
    clearEditorCompletionGhost();
    const text = String(suffix || "");
    if (!text) return false;
    if (editor.type !== "codemirror" || !editor.raw?.getDoc || !pos) return false;
    const line = Math.max(0, Number(pos.line) || 0);
    const ch = Math.max(0, Number(pos.ch) || 0);
    const node = document.createElement("span");
    node.className = "editor-inline-ghost";
    node.setAttribute("aria-hidden", "true");
    node.textContent = text;
    const bookmark = editor.raw.getDoc().setBookmark({ line, ch }, {
        widget: node,
        insertLeft: true,
        handleMouseEvents: false,
    });
    editorCompletionGhost = { bookmark, node };
    return true;
}

function syncEditorCompletionGhost() {
    if (!editorCompletionOpen || !editorCompletionItems.length) {
        clearEditorCompletionGhost();
        return false;
    }
    if (editor.type !== "codemirror") {
        clearEditorCompletionGhost();
        return false;
    }
    const word = getCompletionWordAtCursor();
    if (!word?.prefix || !word?.cursor) {
        clearEditorCompletionGhost();
        return false;
    }
    const active = editorCompletionItems[clamp(editorCompletionIndex, 0, Math.max(0, editorCompletionItems.length - 1))];
    if (!active?.value) {
        clearEditorCompletionGhost();
        return false;
    }
    const cursorIndex = Number(editor.indexFromPos?.(word.cursor));
    const toIndex = Number(editor.indexFromPos?.(word.to));
    const fromIndex = Number(editor.indexFromPos?.(word.from));
    if (!Number.isFinite(cursorIndex) || !Number.isFinite(toIndex) || !Number.isFinite(fromIndex)) {
        clearEditorCompletionGhost();
        return false;
    }
    if (cursorIndex !== toIndex) {
        clearEditorCompletionGhost();
        return false;
    }
    const typedLength = Math.max(0, cursorIndex - fromIndex);
    const suffix = String(active.value).slice(typedLength);
    if (!suffix) {
        clearEditorCompletionGhost();
        return false;
    }
    return setEditorCompletionGhost(suffix, word.cursor);
}

function hideEditorSignatureHint() {
    if (!el.editorSignatureHint) return false;
    el.editorSignatureHint.setAttribute("data-visible", "false");
    el.editorSignatureHint.setAttribute("aria-hidden", "true");
    el.editorSignatureHint.removeAttribute("data-active-param");
    el.editorSignatureHint.innerHTML = "";
    return true;
}

function splitSignatureParams(signature = "") {
    const raw = String(signature || "");
    const open = raw.indexOf("(");
    const close = raw.lastIndexOf(")");
    if (open < 0 || close <= open) return [];
    const body = raw.slice(open + 1, close);
    if (!body.trim()) return [];
    const params = [];
    let depth = 0;
    let token = "";
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (ch === "(" || ch === "{" || ch === "[") depth += 1;
        if (ch === ")" || ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
        if (ch === "," && depth === 0) {
            const next = token.trim();
            if (next) params.push(next);
            token = "";
            continue;
        }
        token += ch;
    }
    const tail = token.trim();
    if (tail) params.push(tail);
    return params;
}

function getCallContextAtCursor(sourceCode = "", cursorIndex = 0) {
    const code = String(sourceCode || "");
    const index = clamp(Number(cursorIndex) || 0, 0, code.length);
    if (!code || index <= 0) return null;

    let depth = 0;
    let openIndex = -1;
    for (let i = index - 1; i >= 0; i -= 1) {
        const ch = code[i];
        if (ch === ")") {
            depth += 1;
            continue;
        }
        if (ch === "(") {
            if (depth === 0) {
                openIndex = i;
                break;
            }
            depth = Math.max(0, depth - 1);
            continue;
        }
        if (depth === 0 && (ch === "\n" || ch === ";" || ch === "{" || ch === "}")) {
            break;
        }
    }
    if (openIndex < 0) return null;

    let nameEnd = openIndex - 1;
    while (nameEnd >= 0 && /\s/.test(code[nameEnd])) nameEnd -= 1;
    if (nameEnd < 0) return null;
    let nameStart = nameEnd;
    while (nameStart >= 0 && /[A-Za-z0-9_$.]/.test(code[nameStart])) nameStart -= 1;
    nameStart += 1;
    const rawName = code.slice(nameStart, nameEnd + 1).trim();
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(rawName)) return null;

    let argIndex = 0;
    let nestedDepth = 0;
    let quote = "";
    for (let i = openIndex + 1; i < index; i += 1) {
        const ch = code[i];
        const prev = i > 0 ? code[i - 1] : "";
        if (quote) {
            if (ch === quote && prev !== "\\") quote = "";
            continue;
        }
        if (ch === "\"" || ch === "'" || ch === "`") {
            quote = ch;
            continue;
        }
        if (ch === "(" || ch === "{" || ch === "[") {
            nestedDepth += 1;
            continue;
        }
        if (ch === ")" || ch === "}" || ch === "]") {
            nestedDepth = Math.max(0, nestedDepth - 1);
            continue;
        }
        if (ch === "," && nestedDepth === 0) {
            argIndex += 1;
        }
    }

    const shortName = rawName.includes(".") ? rawName.split(".").pop() : rawName;
    return {
        rawName,
        shortName: String(shortName || "").trim(),
        argIndex,
    };
}

function resolveCallSignature(symbols = [], context = null, cursorLine = 0) {
    if (!context?.shortName) return null;
    const symbolList = Array.isArray(symbols) ? symbols : [];
    const callKinds = new Set(["function", "method", "arrow"]);
    const target = context.shortName.toLowerCase();
    const line = Math.max(0, Number(cursorLine) || 0);
    const candidates = symbolList
        .filter((entry) => callKinds.has(String(entry?.kind || "").toLowerCase()))
        .filter((entry) => String(entry?.name || "").trim().toLowerCase() === target)
        .sort((a, b) => {
            const aLine = Number(a?.line) || 0;
            const bLine = Number(b?.line) || 0;
            const aDist = aLine <= line ? line - aLine : Number.MAX_SAFE_INTEGER / 2 + aLine;
            const bDist = bLine <= line ? line - bLine : Number.MAX_SAFE_INTEGER / 2 + bLine;
            return aDist - bDist;
        });
    const best = candidates[0] || null;
    const signature = String(best?.signature || `${context.shortName}(...)`).trim();
    const params = splitSignatureParams(signature);
    const safeArgIndex = params.length ? clamp(context.argIndex, 0, params.length - 1) : 0;
    return {
        name: context.shortName,
        signature,
        params,
        argIndex: safeArgIndex,
    };
}

function renderEditorSignatureHint(model = null) {
    if (!el.editorSignatureHint) return false;
    if (!model?.name) {
        hideEditorSignatureHint();
        return false;
    }

    const params = Array.isArray(model.params) ? model.params : [];
    const safeArgIndex = params.length ? clamp(Number(model.argIndex) || 0, 0, params.length - 1) : 0;
    const paramsHtml = params.length
        ? params.map((param, index) => `<span class="editor-signature-hint-param" data-param-index="${index}" data-active="${index === safeArgIndex ? "true" : "false"}">${escapeHTML(param)}</span>`).join(`<span class="editor-signature-hint-punct">, </span>`)
        : `<span class="editor-signature-hint-param" data-param-index="0" data-active="true">...</span>`;

    el.editorSignatureHint.innerHTML = `<span class="editor-signature-hint-name">${escapeHTML(model.name)}</span><span class="editor-signature-hint-punct">(</span>${paramsHtml}<span class="editor-signature-hint-punct">)</span>`;
    el.editorSignatureHint.setAttribute("data-visible", "true");
    el.editorSignatureHint.setAttribute("aria-hidden", "false");
    el.editorSignatureHint.setAttribute("data-active-param", String(safeArgIndex));
    return true;
}

function positionEditorSignatureHint() {
    if (!el.editorSignatureHint || el.editorSignatureHint.getAttribute("data-visible") !== "true") return false;
    const host = el.editorSignatureHint.parentElement;
    if (!(host instanceof HTMLElement)) return false;

    if (editor.type !== "codemirror" || !editor.raw?.cursorCoords) {
        el.editorSignatureHint.style.left = `${EDITOR_SIGNATURE_HINT_EDGE_GAP_PX}px`;
        el.editorSignatureHint.style.top = `${EDITOR_SIGNATURE_HINT_EDGE_GAP_PX}px`;
        return true;
    }

    const cursor = editor.getCursor?.();
    if (!cursor) return false;
    const cursorPage = editor.raw.cursorCoords(cursor, "page");
    if (!cursorPage) return false;
    const hostRect = host.getBoundingClientRect();
    const hintHeight = Math.max(EDITOR_SIGNATURE_HINT_MIN_HEIGHT_PX, Math.ceil(el.editorSignatureHint.getBoundingClientRect().height || 0));
    const hintWidth = Math.ceil(el.editorSignatureHint.getBoundingClientRect().width || 260);

    const maxLeft = Math.max(EDITOR_SIGNATURE_HINT_EDGE_GAP_PX, hostRect.width - hintWidth - EDITOR_SIGNATURE_HINT_EDGE_GAP_PX);
    const left = clamp(Math.floor(cursorPage.left - hostRect.left), EDITOR_SIGNATURE_HINT_EDGE_GAP_PX, Math.floor(maxLeft));

    const preferredTop = Math.floor(cursorPage.top - hostRect.top - hintHeight - EDITOR_SIGNATURE_HINT_CURSOR_GAP_PX);
    const fallbackTop = Math.floor(cursorPage.bottom - hostRect.top + EDITOR_SIGNATURE_HINT_CURSOR_GAP_PX);
    const maxTop = Math.max(EDITOR_SIGNATURE_HINT_EDGE_GAP_PX, hostRect.height - hintHeight - EDITOR_SIGNATURE_HINT_EDGE_GAP_PX);
    const top = preferredTop >= EDITOR_SIGNATURE_HINT_EDGE_GAP_PX
        ? preferredTop
        : clamp(fallbackTop, EDITOR_SIGNATURE_HINT_EDGE_GAP_PX, Math.floor(maxTop));

    el.editorSignatureHint.style.left = `${left}px`;
    el.editorSignatureHint.style.top = `${top}px`;
    return true;
}

async function refreshEditorSignatureHint() {
    if (!el.editorSignatureHint) return false;
    const activeFile = getActiveFile();
    if (!activeFile || editor.type !== "codemirror" || !editorSettings?.signatureHintEnabled) {
        hideEditorSignatureHint();
        return false;
    }
    const cursor = editor.getCursor?.();
    if (!cursor) {
        hideEditorSignatureHint();
        return false;
    }

    const code = String(editor.get() || "");
    const cursorIndex = Number(editor.indexFromPos?.(cursor));
    if (!Number.isFinite(cursorIndex)) {
        hideEditorSignatureHint();
        return false;
    }

    const context = getCallContextAtCursor(code, cursorIndex);
    if (!context) {
        hideEditorSignatureHint();
        return false;
    }

    const requestId = ++editorSignatureHintRequestId;
    const symbols = await getCachedSymbolsForCurrentCode(code);
    if (requestId !== editorSignatureHintRequestId) return false;
    const model = resolveCallSignature(symbols, context, Math.max(0, Number(cursor.line) || 0));
    const shown = renderEditorSignatureHint(model);
    if (shown) positionEditorSignatureHint();
    return shown;
}

function queueEditorSignatureHintSync() {
    if (editorSignatureHintSyncFrame != null) return;
    editorSignatureHintSyncFrame = scheduleFrame(() => {
        editorSignatureHintSyncFrame = null;
        refreshEditorSignatureHint();
    });
}

function positionEditorCompletionPanel() {
    if (!editorCompletionOpen || !el.editorCompletion) return false;
    const host = el.editorCompletion.parentElement;
    if (!(host instanceof HTMLElement)) return false;

    if (editor.type !== "codemirror" || !editor.raw?.cursorCoords) {
        el.editorCompletion.style.left = `${EDITOR_COMPLETION_PANEL_EDGE_GAP_PX}px`;
        el.editorCompletion.style.top = `${EDITOR_COMPLETION_PANEL_EDGE_GAP_PX}px`;
        el.editorCompletion.style.maxHeight = `${EDITOR_COMPLETION_PANEL_MAX_HEIGHT_PX}px`;
        el.editorCompletion.style.width = `min(${EDITOR_COMPLETION_PANEL_MAX_WIDTH_PX}px, calc(100% - ${EDITOR_COMPLETION_PANEL_EDGE_GAP_PX * 2}px))`;
        el.editorCompletion.setAttribute("data-placement", "below");
        return true;
    }

    const cursor = editor.getCursor?.();
    if (!cursor) return false;

    const hostRect = host.getBoundingClientRect();
    if (!Number.isFinite(hostRect.width) || !Number.isFinite(hostRect.height) || hostRect.width <= 0 || hostRect.height <= 0) {
        return false;
    }

    const cursorTop = editor.raw.cursorCoords(cursor, "page");
    const cursorBottom = editor.raw.cursorCoords(cursor, "page");
    if (!cursorTop || !cursorBottom) return false;

    const maxWidth = Math.min(EDITOR_COMPLETION_PANEL_MAX_WIDTH_PX, Math.max(EDITOR_COMPLETION_PANEL_MIN_WIDTH_PX, hostRect.width - (EDITOR_COMPLETION_PANEL_EDGE_GAP_PX * 2)));
    const estimatedHeight = Math.min(
        EDITOR_COMPLETION_PANEL_MAX_HEIGHT_PX,
        Math.max(EDITOR_COMPLETION_PANEL_MIN_HEIGHT_PX, 28 + (Math.min(editorCompletionItems.length || 0, getEditorCompletionMaxItems()) * 22))
    );

    const roomBelow = hostRect.bottom - cursorBottom.bottom - EDITOR_COMPLETION_PANEL_EDGE_GAP_PX - EDITOR_COMPLETION_PANEL_CURSOR_GAP_PX;
    const roomAbove = cursorTop.top - hostRect.top - EDITOR_COMPLETION_PANEL_EDGE_GAP_PX - EDITOR_COMPLETION_PANEL_CURSOR_GAP_PX;
    const placeAbove = roomBelow < EDITOR_COMPLETION_PANEL_MIN_HEIGHT_PX && roomAbove > roomBelow;

    const availableHeight = Math.max(
        EDITOR_COMPLETION_PANEL_MIN_HEIGHT_PX,
        Math.min(EDITOR_COMPLETION_PANEL_MAX_HEIGHT_PX, Math.floor(placeAbove ? roomAbove : roomBelow))
    );

    const rawLeft = cursorBottom.left - hostRect.left;
    const maxLeft = Math.max(EDITOR_COMPLETION_PANEL_EDGE_GAP_PX, hostRect.width - maxWidth - EDITOR_COMPLETION_PANEL_EDGE_GAP_PX);
    const left = clamp(Math.floor(rawLeft), EDITOR_COMPLETION_PANEL_EDGE_GAP_PX, Math.floor(maxLeft));

    const rawTop = placeAbove
        ? (cursorTop.top - hostRect.top - availableHeight - EDITOR_COMPLETION_PANEL_CURSOR_GAP_PX)
        : (cursorBottom.bottom - hostRect.top + EDITOR_COMPLETION_PANEL_CURSOR_GAP_PX);
    const maxTop = Math.max(EDITOR_COMPLETION_PANEL_EDGE_GAP_PX, hostRect.height - availableHeight - EDITOR_COMPLETION_PANEL_EDGE_GAP_PX);
    const top = clamp(Math.floor(rawTop), EDITOR_COMPLETION_PANEL_EDGE_GAP_PX, Math.floor(maxTop));

    el.editorCompletion.style.left = `${left}px`;
    el.editorCompletion.style.top = `${top}px`;
    el.editorCompletion.style.width = `${Math.floor(maxWidth)}px`;
    el.editorCompletion.style.maxHeight = `${Math.floor(availableHeight)}px`;
    el.editorCompletion.setAttribute("data-placement", placeAbove ? "above" : "below");
    return true;
}

function setEditorCompletionOpen(open) {
    editorCompletionOpen = Boolean(open);
    if (!editorCompletionOpen) {
        editorCompletionItems = [];
        editorCompletionIndex = 0;
        editorCompletionRange = null;
        clearEditorCompletionGhost();
    }
    if (el.editorCompletion) {
        el.editorCompletion.setAttribute("aria-hidden", editorCompletionOpen ? "false" : "true");
    }
    renderEditorCompletionList();
    if (editorCompletionOpen) {
        positionEditorCompletionPanel();
    }
}

function closeEditorCompletion() {
    if (!editorCompletionOpen) return false;
    setEditorCompletionOpen(false);
    return true;
}

function updateEditorCompletion() {
    const word = getCompletionWordAtCursor();
    if (!word || !word.prefix || word.prefix.length < EDITOR_COMPLETION_MIN_PREFIX) {
        closeEditorCompletion();
        return false;
    }
    const items = collectEditorCompletionItems(word.prefix).filter((item) => item.value.toLowerCase() !== word.prefix.toLowerCase());
    if (!items.length) {
        closeEditorCompletion();
        return false;
    }
    editorCompletionItems = items;
    editorCompletionIndex = clamp(editorCompletionIndex, 0, Math.max(0, items.length - 1));
    editorCompletionRange = { from: word.from, to: word.to };
    setEditorCompletionOpen(true);
    positionEditorCompletionPanel();
    syncEditorCompletionGhost();
    return true;
}

function moveEditorCompletionIndex(step = 1) {
    if (!editorCompletionOpen || !editorCompletionItems.length) return false;
    const max = editorCompletionItems.length - 1;
    if (max < 0) return false;
    editorCompletionIndex = (editorCompletionIndex + step + editorCompletionItems.length) % editorCompletionItems.length;
    renderEditorCompletionList();
    positionEditorCompletionPanel();
    syncEditorCompletionGhost();
    return true;
}

function acceptEditorCompletion(index = editorCompletionIndex) {
    if (!editorCompletionOpen || !editorCompletionItems.length) return false;
    const item = editorCompletionItems[clamp(Number(index) || 0, 0, editorCompletionItems.length - 1)];
    if (!item || !editorCompletionRange?.from || !editorCompletionRange?.to) return false;
    suppressEditorCompletionOnNextChange = true;
    editor.replaceRange?.(item.value, editorCompletionRange.from, editorCompletionRange.to);
    const fromIndex = Number(editor.indexFromPos?.(editorCompletionRange.from));
    const nextPos = editor.posFromIndex?.((Number.isFinite(fromIndex) ? fromIndex : 0) + item.value.length);
    if (nextPos) {
        editor.setSelections?.([{ anchor: nextPos, head: nextPos }]);
    }
    closeEditorCompletion();
    updateActiveFileCode(editor.get());
    queueEditorLint("completion");
    return true;
}

function handleEditorCompletionKeyDown(e) {
    if (!editorCompletionOpen) return false;
    if (e.altKey || e.ctrlKey || e.metaKey) return false;
    const key = String(e.key || "");
    if (key === "ArrowDown") {
        e.preventDefault();
        return moveEditorCompletionIndex(1);
    }
    if (key === "ArrowUp") {
        e.preventDefault();
        return moveEditorCompletionIndex(-1);
    }
    if (key === "Escape") {
        e.preventDefault();
        return closeEditorCompletion();
    }
    if ((key === "Tab" && !e.shiftKey) || key === "Enter") {
        e.preventDefault();
        return acceptEditorCompletion();
    }
    return false;
}

function syncEditorCompletionForCursorActivity() {
    if (!editorCompletionOpen) return false;
    const word = getCompletionWordAtCursor();
    if (!word?.prefix || word.prefix.length < EDITOR_COMPLETION_MIN_PREFIX) {
        closeEditorCompletion();
        return false;
    }
    const cursorIndex = Number(editor.indexFromPos?.(word.cursor));
    const toIndex = Number(editor.indexFromPos?.(word.to));
    if (!Number.isFinite(cursorIndex) || !Number.isFinite(toIndex) || cursorIndex !== toIndex) {
        closeEditorCompletion();
        return false;
    }
    const currentFromIndex = Number(editor.indexFromPos?.(editorCompletionRange?.from));
    const currentToIndex = Number(editor.indexFromPos?.(editorCompletionRange?.to));
    const nextFromIndex = Number(editor.indexFromPos?.(word.from));
    const nextToIndex = Number(editor.indexFromPos?.(word.to));
    const sameRange = Number.isFinite(currentFromIndex)
        && Number.isFinite(currentToIndex)
        && Number.isFinite(nextFromIndex)
        && Number.isFinite(nextToIndex)
        && currentFromIndex === nextFromIndex
        && currentToIndex === nextToIndex;
    if (!sameRange) {
        updateEditorCompletion();
        return true;
    }
    positionEditorCompletionPanel();
    syncEditorCompletionGhost();
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

function getLanguageLabel(language = "text") {
    if (language === "javascript") return "JavaScript";
    if (language === "typescript") return "TypeScript";
    if (language === "json") return "JSON";
    if (language === "html") return "HTML";
    if (language === "css") return "CSS";
    if (language === "markdown") return "Markdown";
    return "Text";
}

function getEditorSelectionStats() {
    const selections = editor.getSelections?.() || [];
    if (!Array.isArray(selections) || !selections.length) {
        return { ranges: 0, chars: 0 };
    }
    let ranges = 0;
    let chars = 0;
    selections.forEach((selection) => {
        const anchor = selection?.anchor || selection?.head;
        const head = selection?.head || selection?.anchor;
        if (!anchor || !head) return;
        ranges += 1;
        const anchorIndex = Number(editor.indexFromPos?.(anchor));
        const headIndex = Number(editor.indexFromPos?.(head));
        if (Number.isFinite(anchorIndex) && Number.isFinite(headIndex)) {
            chars += Math.max(0, Math.abs(headIndex - anchorIndex));
        }
    });
    return { ranges, chars };
}

function syncEditorStatusBar() {
    if (!el.footerEditorStatus) return;
    const active = getActiveFile();
    const cursor = editor.getCursor?.() || { line: 0, ch: 0 };
    const line = Math.max(0, Number(cursor.line) || 0) + 1;
    const col = Math.max(0, Number(cursor.ch) || 0) + 1;
    const code = String(editor.get?.() ?? active?.code ?? "");
    const chars = code.length;
    const language = detectLanguageFromFileName(active?.name || "");
    const languageLabel = getLanguageLabel(language);
    const selection = getEditorSelectionStats();
    const dirty = Boolean(active && isFileDirty(active));
    const activeLeaf = getFileBaseName(active?.name || "");
    const parsedLeaf = splitLeafExtension(activeLeaf);
    const fileStem = parsedLeaf.stem || activeLeaf || "-";

    if (el.footerEditorFile) {
        el.footerEditorFile.textContent = `File Name: ${fileStem}`;
        el.footerEditorFile.title = active?.name || "No active file";
    }
    if (el.footerEditorLang) {
        el.footerEditorLang.textContent = `Lang: ${languageLabel}`;
        el.footerEditorLang.title = `Language: ${languageLabel}`;
    }
    if (el.footerEditorDirty) {
        el.footerEditorDirty.dataset.dirty = dirty ? "true" : "false";
        el.footerEditorDirty.textContent = dirty ? "Unsaved" : "Saved";
        el.footerEditorDirty.title = dirty ? "File has unsaved changes" : "File is saved";
    }
    if (el.footerEditorCursor) {
        el.footerEditorCursor.textContent = `Ln ${line}, Col ${col}`;
        el.footerEditorCursor.title = `Cursor at line ${line}, column ${col}`;
    }
    if (el.footerEditorSelection) {
        el.footerEditorSelection.textContent = `Sel ${selection.chars}`;
        el.footerEditorSelection.title = selection.ranges > 0
            ? `${selection.chars} selected character${selection.chars === 1 ? "" : "s"}`
            : "No selection";
    }
    if (el.footerEditorChars) {
        el.footerEditorChars.textContent = `Chars ${chars}`;
        el.footerEditorChars.title = `${chars} total character${chars === 1 ? "" : "s"} in active file`;
    }
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
    el.editorHistoryList?.addEventListener("keydown", (event) => {
        const key = String(event.key || "");
        if (!["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(key)) return;
        const rows = Array.from(el.editorHistoryList.querySelectorAll(".editor-history-row[data-history-id]"));
        if (!rows.length) return;
        const current = event.target.closest(".editor-history-row[data-history-id]");
        const currentIndex = Math.max(0, rows.findIndex((row) => row === current));
        let nextIndex = currentIndex;
        if (key === "ArrowDown") nextIndex = Math.min(rows.length - 1, currentIndex + 1);
        if (key === "ArrowUp") nextIndex = Math.max(0, currentIndex - 1);
        if (key === "PageDown") nextIndex = Math.min(rows.length - 1, currentIndex + 8);
        if (key === "PageUp") nextIndex = Math.max(0, currentIndex - 8);
        if (key === "Home") nextIndex = 0;
        if (key === "End") nextIndex = rows.length - 1;
        const target = rows[nextIndex];
        const targetId = target?.dataset?.historyId;
        if (!targetId) return;
        event.preventDefault();
        selectHistoryEntry(targetId, { focusRow: true });
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
    const onSyntaxThemeSelect = (event) => {
        applyEditorSyntaxThemeSelection(event?.target?.value, { persist: true });
    };
    el.editorSyntaxThemeSelect?.addEventListener("input", onSyntaxThemeSelect);
    el.editorSyntaxThemeSelect?.addEventListener("change", onSyntaxThemeSelect);
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
    el.editorSignatureHintToggle?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, signatureHintEnabled: Boolean(event.target.checked) });
        applyEditorSettings({ persist: true, refreshUI: true });
    });
    el.editorCompletionMaxItems?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, completionMaxItems: Number(event.target.value) });
        applyEditorSettings({ persist: true, refreshUI: true });
        if (editorCompletionOpen) {
            updateEditorCompletion();
        }
    });
    el.editorCompletionOpacity?.addEventListener("input", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, completionOpacity: Number(event.target.value) });
        applyEditorUXTuning();
    });
    el.editorCompletionOpacity?.addEventListener("change", (event) => {
        editorSettings = sanitizeEditorSettings({ ...editorSettings, completionOpacity: Number(event.target.value) });
        persistEditorSettings();
        syncEditorSettingsPanel();
        applyEditorUXTuning();
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
    const selectedFilesCount = getSelectedFiles().length;
    const dirtyCount = getDirtyFiles().length;
    const coreEntries = [
        {
            id: "cmd-new-file",
            label: "File: New",
            keywords: "create file new",
            shortcut: "Ctrl/Cmd+N",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_NEW, () => createFile()),
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
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ACTIVE, () => saveActiveFile({ announce: true })),
        },
        {
            id: "cmd-save-all",
            label: "File: Save All",
            keywords: "save all write",
            shortcut: "Ctrl/Cmd+Shift+S",
            enabled: dirtyCount > 0,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ALL, () => saveAllFiles({ announce: true })),
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
            id: "cmd-run",
            label: "Run: Execute in Sandbox",
            keywords: "run execute sandbox preview",
            shortcut: "Ctrl/Cmd+Enter",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.RUN_EXECUTE, () => run()),
        },
        {
            id: "cmd-clear-editor",
            label: "Editor: Clear Active File",
            keywords: "editor clear reset contents",
            shortcut: "",
            enabled: true,
            run: () => clearEditor(),
        },
        {
            id: "cmd-console-clear",
            label: "Console: Clear Output",
            keywords: "console clear logs",
            shortcut: "",
            enabled: true,
            run: () => clearLog(),
        },
        {
            id: "cmd-console-copy",
            label: "Console: Copy Output",
            keywords: "console copy logs clipboard",
            shortcut: "",
            enabled: true,
            run: () => copyLog(),
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
            id: "cmd-dev-terminal",
            label: "Console: Focus Dev Terminal",
            keywords: "console dev terminal safe utility commands",
            shortcut: "",
            enabled: true,
            run: () => focusDevTerminalInput({ openLog: true }),
        },
        {
            id: "cmd-console-view-logs",
            label: "Console: Show Logs",
            keywords: "console logs view",
            shortcut: "",
            enabled: true,
            run: () => ensureLogOpen("Console opened.", { view: "console" }),
        },
        {
            id: "cmd-console-focus-input",
            label: "Console: Focus Input",
            keywords: "console input eval expression javascript",
            shortcut: "",
            enabled: true,
            run: () => focusConsoleInput({ openLog: true }),
        },
        {
            id: "cmd-console-view-terminal",
            label: "Console: Show Terminal",
            keywords: "console terminal view",
            shortcut: "",
            enabled: true,
            run: () => focusDevTerminalInput({ openLog: true }),
        },
        {
            id: "cmd-open-command-palette",
            label: "Search: Open Command Palette",
            keywords: "search command palette",
            shortcut: "Ctrl/Cmd+Shift+P",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.SEARCH_COMMAND_PALETTE, () => openCommandPalette()),
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
            id: "cmd-tools-tab-problems",
            label: "Tools: Focus Problems",
            keywords: "tools problems diagnostics",
            shortcut: "",
            enabled: true,
            run: () => ensureToolsOpen("Tools opened for problems.", { tab: "problems", problems: true }),
        },
        {
            id: "cmd-tools-tab-task-runner",
            label: "Tools: Focus Task Runner",
            keywords: "tools task runner",
            shortcut: "",
            enabled: true,
            run: () => ensureToolsOpen("Tools opened for tasks.", { tab: "task-runner" }),
        },
        {
            id: "cmd-tools-tab-inspect",
            label: "Tools: Focus Inspect",
            keywords: "tools inspect",
            shortcut: "",
            enabled: true,
            run: () => ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" }),
        },
        {
            id: "cmd-tools-tab-debug",
            label: "Tools: Focus Debug",
            keywords: "tools debug breakpoints watch",
            shortcut: "",
            enabled: true,
            run: () => ensureToolsOpen("Tools opened for debug.", { tab: "debug" }),
        },
        {
            id: "cmd-tools-toggle-problems-dock",
            label: "Tools: Toggle Problems Dock",
            keywords: "tools problems dock toggle",
            shortcut: "",
            enabled: true,
            run: () => setToolsProblemsOpen(!toolsProblemsOpen),
        },
        {
            id: "cmd-problems-refresh",
            label: "Problems: Refresh",
            keywords: "problems diagnostics lint refresh",
            shortcut: "",
            enabled: true,
            run: async () => {
                ensureToolsOpen("Tools opened for problems.", { tab: "problems", problems: true });
                await refreshWorkspaceProblems({ announce: true });
            },
        },
        {
            id: "cmd-problems-clear",
            label: "Problems: Clear",
            keywords: "problems diagnostics clear",
            shortcut: "",
            enabled: true,
            run: () => {
                ensureToolsOpen("Tools opened for problems.", { tab: "problems", problems: true });
                clearProblemsPanel();
            },
        },
        {
            id: "cmd-task-clear-output",
            label: "Task Runner: Clear Output",
            keywords: "task runner clear output",
            shortcut: "",
            enabled: true,
            run: () => clearTaskRunnerOutput(),
        },
        {
            id: "cmd-diagnostics-clear",
            label: "Diagnostics: Clear",
            keywords: "diagnostics clear",
            shortcut: "",
            enabled: true,
            run: () => {
                ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
                diagnostics.clear();
            },
        },
        {
            id: "cmd-diagnostics-toggle-verbose",
            label: "Diagnostics: Toggle Verbose",
            keywords: "diagnostics verbose toggle",
            shortcut: "",
            enabled: true,
            run: () => {
                ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
                setDiagnosticsVerbose(!diagnosticsVerbose);
            },
        },
        {
            id: "cmd-inspect-toggle",
            label: "Inspect: Toggle",
            keywords: "inspect toggle selector",
            shortcut: "",
            enabled: true,
            run: () => {
                ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" });
                ensureSandboxOpen("Sandbox opened for inspect.");
                toggleInspect();
            },
        },
        {
            id: "cmd-inspect-copy-selector",
            label: "Inspect: Copy Selector",
            keywords: "inspect copy selector",
            shortcut: "",
            enabled: true,
            run: async () => {
                ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" });
                await copyInspectSelectorToClipboard();
            },
        },
        {
            id: "cmd-runner-toggle-fullscreen",
            label: "Sandbox: Toggle Fullscreen",
            keywords: "sandbox runner fullscreen",
            shortcut: "",
            enabled: true,
            run: () => toggleRunnerFullscreen(),
        },
        {
            id: "cmd-runner-exit-fullscreen",
            label: "Sandbox: Exit Fullscreen",
            keywords: "sandbox runner exit fullscreen",
            shortcut: "",
            enabled: runnerFullscreen,
            run: () => exitRunnerFullscreen(),
        },
        {
            id: "cmd-sandbox-popout",
            label: "Sandbox: Toggle Popout",
            keywords: "sandbox popout window",
            shortcut: "",
            enabled: true,
            run: () => toggleSandboxPopout(),
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
            id: "cmd-clear-selection",
            label: "Selection: Clear Selection",
            keywords: "selection clear",
            shortcut: "Esc",
            enabled: selectedCount > 0,
            run: () => clearFileSelection({ keepActive: true }),
        },
        {
            id: "cmd-duplicate-selected",
            label: "Selection: Duplicate Selected",
            keywords: "duplicate selected files",
            shortcut: "",
            enabled: selectedFilesCount > 0,
            run: () => duplicateSelectedFiles(),
        },
        {
            id: "cmd-pin-selected",
            label: "Selection: Pin Selected",
            keywords: "pin selected files",
            shortcut: "",
            enabled: selectedFilesCount > 0,
            run: () => bulkSetPinned(true),
        },
        {
            id: "cmd-unpin-selected",
            label: "Selection: Unpin Selected",
            keywords: "unpin selected files",
            shortcut: "",
            enabled: selectedFilesCount > 0,
            run: () => bulkSetPinned(false),
        },
        {
            id: "cmd-lock-selected",
            label: "Selection: Lock Selected",
            keywords: "lock selected files",
            shortcut: "",
            enabled: selectedFilesCount > 0,
            run: () => bulkSetLocked(true),
        },
        {
            id: "cmd-unlock-selected",
            label: "Selection: Unlock Selected",
            keywords: "unlock selected files",
            shortcut: "",
            enabled: selectedFilesCount > 0,
            run: () => bulkSetLocked(false),
        },
        {
            id: "cmd-delete-all-files",
            label: "File: Delete All",
            keywords: "delete all files",
            shortcut: "",
            enabled: files.length > 1,
            run: () => deleteAllFiles(),
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
            id: "cmd-restore-last",
            label: "Trash: Restore Last",
            keywords: "trash restore last",
            shortcut: "",
            enabled: trashFiles.length > 0,
            run: () => restoreLastDeletedFile(),
        },
        {
            id: "cmd-restore-all",
            label: "Trash: Restore All",
            keywords: "trash restore all",
            shortcut: "",
            enabled: trashFiles.length > 0,
            run: () => restoreAllDeletedFiles(),
        },
        {
            id: "cmd-empty-trash",
            label: "Trash: Empty",
            keywords: "trash empty delete permanently",
            shortcut: "",
            enabled: trashFiles.length > 0,
            run: () => emptyTrash(),
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
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.WORKSPACE_IMPORT, () => triggerWorkspaceImportPicker()),
        },
        {
            id: "cmd-open-folder",
            label: "Workspace: Open Local Folder",
            keywords: "folder filesystem open",
            shortcut: "",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.WORKSPACE_OPEN_FOLDER, () => openLocalProjectFolder()),
        },
        {
            id: "cmd-save-folder",
            label: "Workspace: Save All To Folder",
            keywords: "folder filesystem save write",
            shortcut: "",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.WORKSPACE_SAVE_FOLDER, () => saveWorkspaceToLocalFolder()),
        },
        {
            id: "cmd-open-quick-open",
            label: "Search: Quick Open Files",
            keywords: "quick open files search",
            shortcut: "Ctrl/Cmd+P",
            enabled: true,
            run: () => executeRegisteredCommand(FOUNDATION_COMMAND_IDS.SEARCH_QUICK_OPEN, () => openQuickOpen()),
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
            id: "cmd-layout-reset",
            label: "Layout: Reset to Default",
            keywords: "layout reset default",
            shortcut: "",
            enabled: true,
            run: () => {
                window.fazide?.resetLayout?.();
                syncLayoutControls();
            },
        },
        {
            id: "cmd-files-open-menu",
            label: "Files: Open Actions Menu",
            keywords: "files actions menu",
            shortcut: "",
            enabled: Boolean(el.filesMenuButton),
            run: () => {
                if (el.filesMenuButton) openFilesMenu(el.filesMenuButton);
            },
        },
        {
            id: "cmd-games-load-selected",
            label: "Games: Load Selected",
            keywords: "games load selected",
            shortcut: "",
            enabled: Boolean(selectedGameId),
            run: async () => {
                if (!selectedGameId) return;
                await loadGameById(selectedGameId, { runAfter: false });
            },
        },
        {
            id: "cmd-apps-load-selected",
            label: "Apps: Load Selected",
            keywords: "applications apps load selected",
            shortcut: "",
            enabled: Boolean(selectedApplicationId),
            run: async () => {
                if (!selectedApplicationId) return;
                await loadApplicationById(selectedApplicationId, { runAfter: false });
            },
        },
        {
            id: "cmd-lessons-load-selected",
            label: "Lessons: Load Selected",
            keywords: "lesson learn typing starter load selected",
            shortcut: "",
            enabled: Boolean(selectedLessonId),
            run: async () => {
                if (!selectedLessonId) return;
                await loadLessonById(selectedLessonId, { startTyping: true, runAfter: false });
            },
        },
        {
            id: "cmd-lessons-start-active",
            label: "Lessons: Start Typing On Active File",
            keywords: "lesson start typing active file step marker",
            shortcut: "",
            enabled: Boolean(getActiveFile()),
            run: () => startTypingLessonForFile(activeFileId, { announce: true }),
        },
        {
            id: "cmd-lessons-next-step",
            label: "Lessons: Skip To Next Step",
            keywords: "lesson next step skip",
            shortcut: "",
            enabled: Boolean(isLessonSessionActiveForCurrentFile()),
            run: () => advanceLessonStep({ announce: true }),
        },
        {
            id: "cmd-lessons-stop",
            label: "Lessons: Stop Typing Mode",
            keywords: "lesson stop typing exit",
            shortcut: "Esc",
            enabled: Boolean(lessonSession && !lessonSession.completed),
            run: () => stopTypingLesson({ announce: true }),
        },
        {
            id: "cmd-help-list-commands",
            label: "Help: List All Commands",
            keywords: "help commands inventory audit",
            shortcut: "",
            enabled: true,
            run: () => {
                const entries = getCommandPaletteEntries();
                ensureLogOpen("Console opened for command inventory.");
                logger.append("system", [`Commands available: ${entries.length}`]);
                entries
                    .map((entry) => `${entry.id} — ${entry.label}`)
                    .slice(0, 300)
                    .forEach((line) => logger.append("system", [line]));
                status.set(`Listed ${entries.length} commands`);
            },
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
            id: "cmd-toggle-games",
            label: "View: Toggle Games",
            keywords: "view games templates",
            shortcut: "",
            enabled: true,
            run: () => setFilesGamesOpen(!layoutState.filesGamesOpen),
        },
        {
            id: "cmd-toggle-apps",
            label: "View: Toggle Apps",
            keywords: "view applications apps templates",
            shortcut: "",
            enabled: true,
            run: () => setFilesAppsOpen(!layoutState.filesAppsOpen),
        },
        {
            id: "cmd-toggle-lessons",
            label: "View: Toggle Lessons",
            keywords: "view lessons typing learn templates",
            shortcut: "",
            enabled: true,
            run: () => setFilesLessonsOpen(!layoutState.filesLessonsOpen),
        },
        ...lessons.map((lesson) => ({
            id: `cmd-lesson-${lesson.id}`,
            label: `Lessons: Load ${lesson.name}`,
            keywords: `lesson typing learn game ${lesson.id}`,
            shortcut: "",
            enabled: true,
            run: async () => {
                selectedLessonId = lesson.id;
                await loadLessonById(lesson.id, { startTyping: true, runAfter: false });
            },
        })),
        {
            id: "cmd-toggle-open-editors",
            label: "View: Toggle Open Editors",
            keywords: "view open editors",
            shortcut: "",
            enabled: true,
            run: () => setFilesSectionOpen("open-editors", !layoutState.filesOpenEditorsOpen),
        },
        {
            id: "cmd-toggle-files-list",
            label: "View: Toggle Files List",
            keywords: "view files list",
            shortcut: "",
            enabled: true,
            run: () => setFilesSectionOpen("files", !layoutState.filesListOpen),
        },
        {
            id: "cmd-toggle-trash",
            label: "View: Toggle Trash",
            keywords: "view trash",
            shortcut: "",
            enabled: true,
            run: () => setFilesSectionOpen("trash", !layoutState.filesTrashOpen),
        },
        {
            id: "cmd-toggle-log-panel",
            label: "View: Toggle Console Panel",
            keywords: "toggle panel console log",
            shortcut: "",
            enabled: true,
            run: () => setPanelOpen("log", !layoutState.logOpen),
        },
        {
            id: "cmd-toggle-editor-panel",
            label: "View: Toggle Editor Panel",
            keywords: "toggle panel editor",
            shortcut: "",
            enabled: true,
            run: () => setPanelOpen("editor", !layoutState.editorOpen),
        },
        {
            id: "cmd-toggle-files-panel",
            label: "View: Toggle Files Panel",
            keywords: "toggle panel files sidebar",
            shortcut: "",
            enabled: true,
            run: () => setPanelOpen("files", !layoutState.filesOpen),
        },
        {
            id: "cmd-toggle-sandbox-panel",
            label: "View: Toggle Sandbox Panel",
            keywords: "toggle panel sandbox preview",
            shortcut: "",
            enabled: true,
            run: () => setPanelOpen("sandbox", !layoutState.sandboxOpen),
        },
        {
            id: "cmd-toggle-tools-panel",
            label: "View: Toggle Tools Panel",
            keywords: "toggle panel tools diagnostics",
            shortcut: "",
            enabled: true,
            run: () => setPanelOpen("tools", !layoutState.toolsOpen),
        },
        {
            id: "cmd-toggle-layout-panel",
            label: "View: Toggle Layout Panel",
            keywords: "toggle layout panel",
            shortcut: "",
            enabled: true,
            run: () => setLayoutPanelOpen(el.layoutPanel?.getAttribute("data-open") !== "true"),
        },
        {
            id: "cmd-toggle-header",
            label: "View: Toggle Header",
            keywords: "toggle top header",
            shortcut: "",
            enabled: true,
            run: () => setHeaderOpen(!layoutState.headerOpen),
        },
        ...THEMES.map((theme) => ({
            id: `cmd-theme-${theme}`,
            label: `Theme: Switch to ${theme.charAt(0).toUpperCase()}${theme.slice(1)}`,
            keywords: `theme color style ${theme}`,
            shortcut: "",
            enabled: currentTheme !== theme || !isThemeUnlocked(theme),
            run: () => {
                if (!isThemeUnlocked(theme)) {
                    const cost = getThemeByteCost(theme);
                    setLessonShopNotice(`${getThemeDisplayLabel(theme)} requires ${cost} Bytes.`);
                    openLessonStats({ view: "shop" });
                    return;
                }
                applyTheme(theme, { source: "command" });
            },
        })),
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

function getCommandPaletteCategory(entry = {}) {
    const label = String(entry?.label || "").trim();
    if (!label) return "General";
    const idx = label.indexOf(":");
    if (idx <= 0) return "General";
    const category = label.slice(0, idx).trim();
    return category || "General";
}

function groupCommandPaletteResults(entries = []) {
    const source = Array.isArray(entries) ? entries : [];
    if (!source.length) return [];
    const pinnedCategoryOrder = [
        "File",
        "Folders",
        "Selection",
        "Trash",
        "Editor",
        "Run",
        "Debug",
        "Console",
        "Task",
        "Project",
        "Search",
        "View",
        "Layout",
        "Tools",
        "Diagnostics",
        "Problems",
        "Inspect",
        "Sandbox",
        "Games",
        "Apps",
        "Lessons",
        "Theme",
        "Workspace",
        "History",
        "Help",
        "General",
    ];
    const categoryOrder = [];
    const byCategory = new Map();
    source.forEach((entry) => {
        const category = getCommandPaletteCategory(entry);
        if (!byCategory.has(category)) {
            byCategory.set(category, []);
        }
        byCategory.get(category).push(entry);
    });
    pinnedCategoryOrder.forEach((category) => {
        if (byCategory.has(category)) {
            categoryOrder.push(category);
        }
    });
    [...byCategory.keys()]
        .filter((category) => !categoryOrder.includes(category))
        .sort((a, b) => a.localeCompare(b))
        .forEach((category) => categoryOrder.push(category));
    return categoryOrder.flatMap((category) => byCategory.get(category) || []);
}

function getCommandPaletteHintText(count = 0) {
    const safeCount = Math.max(0, Number(count) || 0);
    return `${safeCount} command${safeCount === 1 ? "" : "s"} • Enter to run`;
}

function buildCommandPaletteEntryRow(entry, index, previousCategory = null) {
    const active = index === commandPaletteIndex;
    const disabled = !entry.enabled;
    const shortcut = entry.shortcut ? escapeHTML(entry.shortcut) : "Action";
    const category = getCommandPaletteCategory(entry);
    const categoryRow = category !== previousCategory
        ? `<li class="quick-open-group" role="presentation" aria-hidden="true">${escapeHTML(category)}</li>`
        : "";
    return `
                ${categoryRow}
                <li class="quick-open-item-wrap" role="presentation">
                    <button type="button" class="quick-open-item command-palette-item" role="option" data-command-id="${entry.id}" data-active="${active}" data-disabled="${disabled}" aria-selected="${active}" ${disabled ? "disabled" : ""}>
                        <span class="quick-open-name">${escapeHTML(entry.label)}</span>
                        <span class="quick-open-meta">${shortcut}</span>
                    </button>
                </li>
            `;
}

function syncCommandPaletteInputs(value = "") {
    const nextValue = String(value || "");
    if (el.commandPaletteInput && el.commandPaletteInput.value !== nextValue) {
        el.commandPaletteInput.value = nextValue;
    }
    if (el.topCommandPaletteInput && el.topCommandPaletteInput.value !== nextValue) {
        el.topCommandPaletteInput.value = nextValue;
    }
}

function clearPrimaryCommandPaletteUi() {
    if (el.commandPaletteInput) el.commandPaletteInput.value = "";
    if (el.commandPaletteList) el.commandPaletteList.innerHTML = "";
}

function clearTopCommandPaletteUi() {
    if (el.topCommandPaletteList) el.topCommandPaletteList.innerHTML = "";
    if (el.topCommandPaletteHint) el.topCommandPaletteHint.textContent = "Enter to run • Esc to close";
}

function wireCommandPaletteListClick(listNode, { closeTopAfter = false } = {}) {
    if (!listNode) return;
    listNode.addEventListener("click", (event) => {
        const row = event.target.closest("[data-command-id]");
        if (!row) return;
        const index = commandPaletteResults.findIndex((entry) => entry.id === row.dataset.commandId);
        if (index === -1) return;
        commandPaletteIndex = index;
        const activated = activateCommandPalette(index);
        if (!closeTopAfter) return;
        setTopCommandPaletteOpen(false);
        if (activated) {
            el.topCommandPaletteInput?.blur();
        }
    });
}

function renderCommandPaletteResultsList(listNode, hintNode) {
    if (!listNode) return;
    if (!commandPaletteResults.length) {
        listNode.innerHTML = `<li class="quick-open-empty">No commands found.</li>`;
        if (hintNode) {
            hintNode.textContent = "No match. Try another query.";
        }
        return;
    }
    commandPaletteIndex = clamp(commandPaletteIndex, 0, commandPaletteResults.length - 1);
    const rows = commandPaletteResults
        .map((entry, index) => {
            const previous = index > 0 ? getCommandPaletteCategory(commandPaletteResults[index - 1]) : null;
            return buildCommandPaletteEntryRow(entry, index, previous);
        })
        .join("");
    listNode.innerHTML = rows;
    const activeOption = listNode.querySelector('[data-command-id][data-active="true"]');
    if (activeOption && typeof activeOption.scrollIntoView === "function") {
        activeOption.scrollIntoView({ block: "nearest" });
    }
    if (hintNode) {
        hintNode.textContent = getCommandPaletteHintText(commandPaletteResults.length);
    }
}

function renderCommandPaletteResults() {
    renderCommandPaletteResultsList(el.commandPaletteList, el.commandPaletteHint);
    renderCommandPaletteResultsList(el.topCommandPaletteList, el.topCommandPaletteHint);
}

function updateCommandPaletteResults(query = commandPaletteQuery) {
    commandPaletteQuery = String(query || "");
    syncCommandPaletteInputs(commandPaletteQuery);
    commandPaletteResults = groupCommandPaletteResults(getCommandPaletteMatches(commandPaletteQuery));
    if (commandPaletteResults.length && commandPaletteIndex >= commandPaletteResults.length) {
        commandPaletteIndex = 0;
    }
    renderCommandPaletteResults();
}

function setCommandPaletteOpen(open, { query = "", focusInput = true } = {}) {
    commandPaletteOpen = Boolean(open);
    if (!el.commandPalette || !el.commandPaletteBackdrop) return;
    setOpenStateAttributes(el.commandPalette, commandPaletteOpen);
    setOpenStateAttributes(el.commandPaletteBackdrop, commandPaletteOpen);
    if (!commandPaletteOpen) {
        commandPaletteQuery = "";
        commandPaletteResults = [];
        commandPaletteIndex = 0;
        clearPrimaryCommandPaletteUi();
        return;
    }
    const nextQuery = String(query || "");
    commandPaletteIndex = 0;
    updateCommandPaletteResults(nextQuery);
    requestAnimationFrame(() => {
        if (focusInput && el.commandPaletteInput) {
            el.commandPaletteInput.focus();
            el.commandPaletteInput.select();
        }
    });
}

function setTopCommandPaletteOpen(open) {
    topCommandPaletteOpen = Boolean(open);
    if (!el.topCommandPaletteMenu) return;
    setOpenStateAttributes(el.topCommandPaletteMenu, topCommandPaletteOpen);
    if (topCommandPaletteOpen) {
        positionTopCommandPaletteMenu();
    }
    if (!topCommandPaletteOpen) {
        clearTopCommandPaletteUi();
    }
}

function positionTopCommandPaletteMenu() {
    if (!el.topCommandPaletteMenu || !el.topCommandPaletteInput || !topCommandPaletteOpen) return;
    const rect = el.topCommandPaletteInput.getBoundingClientRect();
    const viewportPad = 8;
    const gap = 6;
    const maxWidth = Math.min(680, Math.max(240, window.innerWidth - (viewportPad * 2)));
    const width = Math.min(maxWidth, Math.max(240, rect.width));
    const minLeft = viewportPad;
    const maxLeft = Math.max(minLeft, window.innerWidth - width - viewportPad);
    const left = clamp(rect.left, minLeft, maxLeft);
    const top = Math.min(window.innerHeight - viewportPad, rect.bottom + gap);
    el.topCommandPaletteMenu.style.left = `${Math.round(left)}px`;
    el.topCommandPaletteMenu.style.top = `${Math.round(top)}px`;
    el.topCommandPaletteMenu.style.width = `${Math.round(width)}px`;
}

function openCommandPalette({ query = "", focusInput = true } = {}) {
    const nextQuery = String(query || "");
    setTopCommandPaletteOpen(false);
    if (commandPaletteOpen) {
        commandPaletteIndex = 0;
        updateCommandPaletteResults(nextQuery);
        if (focusInput && el.commandPaletteInput) {
            el.commandPaletteInput.focus();
            el.commandPaletteInput.select();
        }
        return;
    }
    closeQuickOpen({ focusEditor: false });
    closeFileMenus();
    closeShortcutHelp({ focusEditor: false });
    closeLessonStats({ focusEditor: false });
    closeEditorSearch({ focusEditor: false });
    closeSymbolPalette({ focusEditor: false });
    closeProjectSearch({ focusEditor: false });
    closeEditorHistory({ focusEditor: false });
    closeEditorSettings({ focusEditor: false });
    setCommandPaletteOpen(true, { query: nextQuery, focusInput });
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
    const fromTopInput = event.target === el.topCommandPaletteInput;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (fromTopInput && !topCommandPaletteOpen) {
            setTopCommandPaletteOpen(true);
            commandPaletteIndex = 0;
            updateCommandPaletteResults(el.topCommandPaletteInput?.value || "");
        }
        if (!commandPaletteResults.length) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        commandPaletteIndex = clamp(commandPaletteIndex + step, 0, commandPaletteResults.length - 1);
        renderCommandPaletteResults();
        return;
    }
    if (event.key === "Enter") {
        event.preventDefault();
        const activated = activateCommandPalette();
        if (fromTopInput) {
            setTopCommandPaletteOpen(false);
            if (activated) {
                el.topCommandPaletteInput?.blur();
            }
        }
        return;
    }
    if (event.key === "Escape") {
        event.preventDefault();
        if (fromTopInput) {
            setTopCommandPaletteOpen(false);
            el.topCommandPaletteInput?.blur();
            return;
        }
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
    if (el.topCommandPaletteInput) {
        el.topCommandPaletteInput.addEventListener("focus", () => {
            commandPaletteIndex = 0;
            setTopCommandPaletteOpen(true);
            updateCommandPaletteResults(el.topCommandPaletteInput.value || "");
        });
        el.topCommandPaletteInput.addEventListener("input", (event) => {
            const value = event.target?.value || "";
            commandPaletteIndex = 0;
            setTopCommandPaletteOpen(true);
            updateCommandPaletteResults(value);
        });
        el.topCommandPaletteInput.addEventListener("keydown", onCommandPaletteKeyDown);
    }
    wireCommandPaletteListClick(el.commandPaletteList, { closeTopAfter: false });
    if (el.commandPaletteBackdrop) {
        el.commandPaletteBackdrop.addEventListener("click", () => closeCommandPalette({ focusEditor: false }));
    }
    wireCommandPaletteListClick(el.topCommandPaletteList, { closeTopAfter: true });
    document.addEventListener("pointerdown", (event) => {
        if (!topCommandPaletteOpen) return;
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("#topCommandPaletteInput") || target.closest("#topCommandPaletteMenu")) return;
        setTopCommandPaletteOpen(false);
    });
    window.addEventListener("resize", () => {
        if (!topCommandPaletteOpen) return;
        positionTopCommandPaletteMenu();
    });
    document.addEventListener("scroll", () => {
        if (!topCommandPaletteOpen) return;
        positionTopCommandPaletteMenu();
    }, true);
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

function wireLessonStats() {
    if (el.btnLessonStats) {
        el.btnLessonStats.addEventListener("click", () => openLessonStats({ view: "overview" }));
    }
    if (el.lessonStatsClose) {
        el.lessonStatsClose.addEventListener("click", () => closeLessonStats({ focusEditor: true }));
    }
    if (el.lessonStatsBackdrop) {
        el.lessonStatsBackdrop.addEventListener("click", () => closeLessonStats({ focusEditor: false }));
    }
    if (el.lessonStatsOverviewTab) {
        el.lessonStatsOverviewTab.addEventListener("click", () => setLessonStatsView("overview"));
    }
    if (el.lessonStatsShopTab) {
        el.lessonStatsShopTab.addEventListener("click", () => {
            setLessonStatsView("shop");
            updateLessonShopUi({ force: true });
        });
    }
    if (el.lessonStatsShopList) {
        el.lessonStatsShopList.addEventListener("click", (event) => {
            const button = event.target?.closest?.("button[data-lesson-shop-theme]");
            if (!(button instanceof HTMLElement)) return;
            const themeName = normalizeTheme(button.dataset.lessonShopTheme, THEMES, "");
            const action = String(button.dataset.lessonShopAction || "").trim().toLowerCase();
            if (!themeName) return;

            if (action === "buy") {
                const cost = getThemeByteCost(themeName);
                const bought = unlockLessonTheme(themeName, { spend: true });
                if (!bought) {
                    setLessonShopNotice(`Not enough Bytes for ${getThemeDisplayLabel(themeName)}.`);
                    status.set("Not enough Bytes");
                    updateLessonShopUi();
                    return;
                }
                setLessonShopNotice(`Unlocked ${getThemeDisplayLabel(themeName)} for ${cost} Bytes.`);
                logger.append("system", [`Theme unlocked: ${getThemeDisplayLabel(themeName)} (${cost} Bytes)`]);
                renderHeaderThemeSelectOptions();
                applyTheme(themeName, { source: "shop" });
                updateLessonHeaderStats({ force: true });
                updateLessonHud();
                updateLessonShopUi({ force: true });
                return;
            }

            if (action === "apply") {
                applyTheme(themeName, { source: "shop" });
                setLessonShopNotice(`Applied ${getThemeDisplayLabel(themeName)}.`);
                updateLessonShopUi({ force: true });
            }
        });
    }
}

function wirePromptDialog() {
    setPromptDialogOpen(false);
    clearPromptDialogError();
    ensurePromptDialogSecondaryButton();
    el.promptDialogBackdrop?.addEventListener("click", () => cancelPromptDialog());
    el.promptDialogCancel?.addEventListener("click", () => cancelPromptDialog());
    promptDialogSecondaryButton?.addEventListener("click", () => submitPromptDialogSecondary());
    promptDialogSecondaryButton?.addEventListener("mouseleave", () => {
        if (!promptDialogState?.hasSecondaryAction) return;
        if (!promptDialogState.secondaryRequiresConfirm || !promptDialogState.secondaryArmed) return;
        clearPromptDialogSecondaryDisarmTimer();
        setPromptDialogSecondaryArmed(false);
    });
    promptDialogSecondaryButton?.addEventListener("contextmenu", (event) => {
        if (!promptDialogState?.hasSecondaryAction) return;
        if (!promptDialogState.secondaryRequiresConfirm || !promptDialogState.secondaryArmed) return;
        event.preventDefault();
        clearPromptDialogSecondaryDisarmTimer();
        setPromptDialogSecondaryArmed(false, { focus: true });
    });
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
            if (promptDialogState?.hasSecondaryAction && promptDialogState.secondaryRequiresConfirm && promptDialogState.secondaryArmed) {
                event.preventDefault();
                clearPromptDialogSecondaryDisarmTimer();
                setPromptDialogSecondaryArmed(false, { focus: true });
                return;
            }
            event.preventDefault();
            cancelPromptDialog();
            return;
        }
        if (event.key === "Enter" && promptDialogState?.mode === "confirm") {
            const targetButton = event.target instanceof Element ? event.target.closest("button") : null;
            if (targetButton && targetButton !== el.promptDialogConfirm) {
                return;
            }
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
    if (legacy != null) {
        const legacyFile = makeFile(FILE_DEFAULT_NAME, legacy ?? DEFAULT_CODE);
        return {
            files: [legacyFile],
            folders: [],
            activeId: legacyFile.id,
            openIds: [legacyFile.id],
            trash: [],
            source: "legacy",
        };
    }

    const welcomeTemplates = Array.isArray(DEFAULT_WELCOME_FILES) ? DEFAULT_WELCOME_FILES : [];
    const welcomeFiles = welcomeTemplates
        .map((entry) => {
            const rawName = String(entry?.name || "").trim();
            const rawCode = typeof entry?.code === "string" ? entry.code : "";
            return rawName ? makeFile(rawName, rawCode) : null;
        })
        .filter(Boolean);

    if (welcomeFiles.length) {
        const automation = isAutomationEnvironment();
        const preferredActive =
            (automation
                ? welcomeFiles.find((file) => String(file.name || "").toLowerCase().endsWith("/app.js"))
                : null) ||
            welcomeFiles.find((file) => String(file.name || "").toLowerCase().endsWith("/index.html")) ||
            welcomeFiles.find((file) => String(file.name || "").toLowerCase().endsWith("/app.js")) ||
            welcomeFiles[0];
        const derivedFolders = normalizeFolderList(
            welcomeFiles
                .map((file) => getFileDirectory(file.name))
                .filter(Boolean)
        );
        return {
            files: welcomeFiles,
            folders: derivedFolders,
            activeId: preferredActive.id,
            openIds: [preferredActive.id],
            trash: [],
            source: "welcome-default",
        };
    }

    const defaultFile = makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
    return {
        files: [defaultFile],
        folders: [],
        activeId: defaultFile.id,
        openIds: [defaultFile.id],
        trash: [],
        source: "default",
    };
}

function persistFiles(reason = "autosave") {
    if (persistenceWritesLocked) return;
    if (!files.length || !activeFileId) return;
    openTabIds = normalizeOpenTabIds(openTabIds);
    pruneTrashEntries();
    pruneProblemDiagnostics();
    const payload = buildWorkspacePayload();
    const entries = [{ key: STORAGE.FILES, value: JSON.stringify(payload) }];
    const active = getActiveFile();
    if (active) {
        entries.push({ key: STORAGE.CODE, value: active.code });
    }
    entries.push({
        key: STORAGE.WORKSPACE_SNAPSHOT,
        value: JSON.stringify({
            ...payload,
            snapshotReason: reason,
        }),
    });
    const ok = saveBatchAtomic(entries, { label: `workspace-persist:${reason}` });
    if (!ok) {
        save(STORAGE.FILES, JSON.stringify(payload));
        if (active) save(STORAGE.CODE, active.code);
        persistWorkspaceSnapshot(reason);
    }
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
    const normalized = normalizeImportedWorkspacePayload(input, {
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
    if (!normalized) return null;
    const limited = applyWorkspaceSafetyLimits(normalized, { source: "import" });
    if (!limited) return null;
    return resolveWorkspacePathCollisions(limited, { source: "import" });
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
    logWorkspaceSafetyAdjustments(normalized._limitSummary, {
        label: "Import safety limits applied.",
    });
    logWorkspacePathRemaps(normalized._pathRemapSummary, {
        label: "Import path safety applied.",
    });
    if (focusEditor) editor.focus();
    return true;
}

function triggerWorkspaceImportPicker() {
    if (!el.workspaceImportInput) return;
    el.workspaceImportInput.value = "";
    el.workspaceImportInput.click();
}

function isWorkspaceJsonFile(file) {
    const name = String(file?.name || "").trim().toLowerCase();
    const type = String(file?.type || "").trim().toLowerCase();
    return name.endsWith(".json") || type.includes("application/json") || type.includes("text/json");
}

function buildWorkspaceImportSafetyPreview(normalized = null) {
    if (!normalized || typeof normalized !== "object") return "";
    const limit = normalized._limitSummary;
    const remap = normalized._pathRemapSummary;
    const details = [];

    if (limit?.hasAdjustments) {
        if (limit.droppedFiles) details.push(`- Files dropped by safety limits: ${limit.droppedFiles}`);
        if (limit.truncatedFiles) details.push(`- Files trimmed by safety limits: ${limit.truncatedFiles}`);
        if (limit.droppedTrash) details.push(`- Trash entries dropped by safety limits: ${limit.droppedTrash}`);
        if (limit.truncatedTrash) details.push(`- Trash entries trimmed by safety limits: ${limit.truncatedTrash}`);
        if (limit.droppedFoldersForLength) details.push(`- Folders dropped (path length): ${limit.droppedFoldersForLength}`);
        if (limit.droppedFoldersForCap) details.push(`- Folders dropped (count cap): ${limit.droppedFoldersForCap}`);
        if (limit.openTabsTrimmed) details.push(`- Open tabs trimmed: ${limit.openTabsTrimmed}`);
        if (limit.fallbackInserted) details.push("- Added fallback default file to keep workspace valid");
    }

    if (remap?.hasAdjustments) {
        details.push(`- Path collisions auto-remapped: ${Math.max(0, Number(remap.remappedPaths) || 0)}`);
    }

    if (!details.length) {
        return "Safety preview: no adjustments required.";
    }

    return ["Safety preview:", ...details].join("\n");
}

async function importWorkspaceFromFile(file) {
    if (!file) return false;
    const text = await file.text();
    const parsed = parseWorkspaceImportText(text, {
        normalizeImportedWorkspace,
        maxInputChars: WORKSPACE_IMPORT_MAX_INPUT_CHARS,
    });
    if (!parsed.ok && parsed.error === "input-too-large") {
        status.set("Import too large");
        logger.append("error", [String(parsed.message || `Import failed: workspace file too large (max ${WORKSPACE_IMPORT_MAX_INPUT_CHARS} chars).`)]);
        return false;
    }
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
    const safetyPreview = buildWorkspaceImportSafetyPreview(normalized);
    const confirmImport = await showConfirmDialog({
        title: "Import Workspace",
        message: [
            buildImportWorkspaceConfirmMessage({
                fileCount: normalized.files.length,
                trashCount: normalized.trash.length,
            }),
            safetyPreview,
        ].filter(Boolean).join("\n\n"),
        confirmText: "Import",
        cancelText: "Cancel",
        danger: true,
    });
    if (!confirmImport) return false;
    return applyImportedWorkspace(normalized, { label: "Import workspace", focusEditor: true });
}

async function tryImportWorkspaceOrFallback(file) {
    if (!file) return false;
    const workspaceResult = await importWorkspaceFromFile(file);
    if (workspaceResult) return true;

    if (!isWorkspaceJsonFile(file)) return false;

    const importedAsCode = await importCodeFilesFromPicker([file]);
    if (importedAsCode) {
        logger.append("system", ["Imported JSON file as code file (not a workspace payload)."]);
        return true;
    }
    return false;
}

async function importCodeFilesFromPicker(fileList = []) {
    const selectedFiles = Array.isArray(fileList) ? fileList : [];
    if (!selectedFiles.length) return false;

    const before = snapshotWorkspaceState();
    stashActiveFile();

    const reservedPaths = new Set(files.map((entry) => entry.name));
    const existingCodeChars = files.reduce((total, entry) => total + String(entry?.code || "").length, 0);
    let remainingChars = Math.max(0, WORKSPACE_MAX_TOTAL_CODE_CHARS - existingCodeChars);
    let fileSlotsRemaining = Math.max(0, WORKSPACE_MAX_FILES - files.length);

    const imported = [];
    let skippedUnsupported = 0;
    let skippedByCap = 0;
    let skippedByTotalChars = 0;
    let trimmedByPerFileCap = 0;
    let trimmedByTotalCap = 0;

    for (const fileEntry of selectedFiles) {
        const rawPath = normalizePathSlashes(String(fileEntry?.webkitRelativePath || fileEntry?.name || "").trim());
        const normalizedPath = normalizeFileName(rawPath, FILE_DEFAULT_NAME);
        if (!isSupportedLocalFolderFileName(normalizedPath)) {
            skippedUnsupported += 1;
            continue;
        }

        if (fileSlotsRemaining <= 0) {
            skippedByCap += 1;
            continue;
        }

        let code = String(await fileEntry.text() || "");
        const originalLength = code.length;
        if (code.length > WORKSPACE_MAX_FILE_CODE_CHARS) {
            code = code.slice(0, WORKSPACE_MAX_FILE_CODE_CHARS);
            trimmedByPerFileCap += 1;
        }
        if (remainingChars <= 0) {
            skippedByTotalChars += 1;
            continue;
        }
        if (code.length > remainingChars) {
            code = code.slice(0, remainingChars);
            trimmedByTotalCap += 1;
        }
        if (code.length === 0 && originalLength > 0) {
            skippedByTotalChars += 1;
            continue;
        }

        const safePath = ensureUniquePathInSet(normalizedPath, reservedPaths);
        const importedFile = makeFile(safePath, code);
        importedFile.savedCode = code;
        imported.push(importedFile);

        remainingChars = Math.max(0, remainingChars - code.length);
        fileSlotsRemaining = Math.max(0, fileSlotsRemaining - 1);
    }

    if (!imported.length) {
        status.set("No supported files imported");
        logger.append("warn", ["No supported code files were imported."]);
        return false;
    }

    files = [...files, ...imported];
    folders = normalizeFolderList([
        ...folders,
        ...collectFolderPaths(imported, []),
    ]);

    const firstImported = imported[0];
    if (firstImported) {
        activeFileId = firstImported.id;
        setSingleSelection(firstImported.id);
        ensureTabOpen(firstImported.id);
        expandFolderAncestors(firstImported.name);
        setEditorValue(firstImported.code, { silent: true });
    }

    imported.forEach((entry) => {
        recordCodeSnapshot(entry.id, entry.code, "import-file", { force: true });
    });

    persistFiles("import-files");
    renderFileList();
    queueEditorLint("import-files");
    recordFileHistory(`Import ${imported.length} file${imported.length === 1 ? "" : "s"}`, before);

    status.set(`Imported ${imported.length} file${imported.length === 1 ? "" : "s"}`);
    logger.append("system", [`Imported ${imported.length} code file${imported.length === 1 ? "" : "s"}.`]);
    if (skippedUnsupported) {
        logger.append("warn", [`Skipped ${skippedUnsupported} unsupported file${skippedUnsupported === 1 ? "" : "s"}.`]);
    }
    if (skippedByCap) {
        logger.append("warn", [`Skipped ${skippedByCap} file${skippedByCap === 1 ? "" : "s"} due to workspace file cap (${WORKSPACE_MAX_FILES}).`]);
    }
    if (skippedByTotalChars) {
        logger.append("warn", [`Skipped ${skippedByTotalChars} file${skippedByTotalChars === 1 ? "" : "s"} after hitting total workspace code cap.`]);
    }
    if (trimmedByPerFileCap) {
        logger.append("warn", [`Trimmed ${trimmedByPerFileCap} imported file${trimmedByPerFileCap === 1 ? "" : "s"} by per-file code cap (${WORKSPACE_MAX_FILE_CODE_CHARS} chars).`]);
    }
    if (trimmedByTotalCap) {
        logger.append("warn", [`Trimmed ${trimmedByTotalCap} imported file${trimmedByTotalCap === 1 ? "" : "s"} by total workspace code cap.`]);
    }
    editor.focus();
    return true;
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

async function readDirectoryWorkspaceEntries(handle, prefix = "", budget = null) {
    const nextBudget = budget || {
        maxFiles: WORKSPACE_MAX_FILES,
        maxFolders: WORKSPACE_MAX_FOLDERS,
        maxFileBytes: LOCAL_FOLDER_MAX_FILE_BYTES,
        maxTotalBytes: LOCAL_FOLDER_MAX_TOTAL_BYTES,
        filesRead: 0,
        foldersRead: 0,
        filesDropped: 0,
        foldersDropped: 0,
        filesSkippedBySize: 0,
        filesSkippedByTotalBytes: 0,
        bytesRead: 0,
    };
    const out = { files: [], folders: [] };
    if (!handle || typeof handle.entries !== "function") return out;

    for await (const [name, entry] of handle.entries()) {
        const nextPath = prefix ? `${prefix}/${name}` : name;
        if (entry.kind === "directory") {
            const folderPath = normalizeFolderPath(nextPath, { allowEmpty: true });
            if (folderPath) {
                if (nextBudget.foldersRead < nextBudget.maxFolders) {
                    out.folders.push(folderPath);
                    nextBudget.foldersRead += 1;
                } else {
                    nextBudget.foldersDropped += 1;
                }
            }
            if (nextBudget.filesRead >= nextBudget.maxFiles) continue;
            const nested = await readDirectoryWorkspaceEntries(entry, nextPath, nextBudget);
            out.files.push(...nested.files);
            out.folders.push(...nested.folders);
            continue;
        }
        if (entry.kind !== "file" || !isSupportedLocalFolderFileName(name)) continue;
        if (nextBudget.filesRead >= nextBudget.maxFiles) {
            nextBudget.filesDropped += 1;
            continue;
        }
        const file = await entry.getFile();
        const fileSize = Math.max(0, Number(file?.size) || 0);
        if (nextBudget.maxFileBytes > 0 && fileSize > nextBudget.maxFileBytes) {
            nextBudget.filesSkippedBySize += 1;
            continue;
        }
        if (nextBudget.maxTotalBytes > 0 && nextBudget.bytesRead + fileSize > nextBudget.maxTotalBytes) {
            nextBudget.filesSkippedByTotalBytes += 1;
            continue;
        }
        const code = await file.text();
        out.files.push({
            path: normalizePathSlashes(nextPath),
            code: String(code ?? ""),
        });
        nextBudget.filesRead += 1;
        nextBudget.bytesRead += fileSize;
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
        const localFolderBudget = {
            maxFiles: WORKSPACE_MAX_FILES,
            maxFolders: WORKSPACE_MAX_FOLDERS,
            maxFileBytes: LOCAL_FOLDER_MAX_FILE_BYTES,
            maxTotalBytes: LOCAL_FOLDER_MAX_TOTAL_BYTES,
            filesRead: 0,
            foldersRead: 0,
            filesDropped: 0,
            foldersDropped: 0,
            filesSkippedBySize: 0,
            filesSkippedByTotalBytes: 0,
            bytesRead: 0,
        };
        const { files: entries, folders: discoveredFolders } = await readDirectoryWorkspaceEntries(handle, "", localFolderBudget);
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
        const mappedFiles = sortedEntries.map((entry) => {
            const originalPath = normalizePathSlashes(String(entry?.path || ""));
            const normalizedPath = ensureUniquePathInSet(originalPath, usedPaths);
            if (normalizedPath !== originalPath) {
                remappedPaths.push([originalPath, normalizedPath]);
            }
            const file = makeFile(normalizedPath, entry.code);
            file.savedCode = entry.code;
            return file;
        });
        const importedWorkspace = applyWorkspaceSafetyLimits({
            files: mappedFiles,
            folders: normalizeFolderList([
                ...discoveredFolders,
                ...collectFolderPaths(mappedFiles, []),
            ]),
            activeId: mappedFiles[0]?.id || null,
            openIds: mappedFiles[0]?.id ? [mappedFiles[0].id] : [],
            trash: [],
        }, { source: "local-folder" });
        files = importedWorkspace?.files || [];
        folders = normalizeFolderList(importedWorkspace?.folders || []);
        activeFileId = files[0]?.id || null;
        openTabIds = activeFileId ? [activeFileId] : [];
        selectedFileIds = activeFileId ? new Set([activeFileId]) : new Set();
        selectedFolderPaths = new Set();
        selectionAnchorFileId = activeFileId;
        clearInlineRenameState();
        setEditorValue(files[0]?.code ?? DEFAULT_CODE, { silent: true });
        cleanupCodeHistoryForKnownFiles();
        files.forEach((file) => recordCodeSnapshot(file.id, file.code, "folder-open", { force: true }));
        projectDirectoryHandle = handle;
        persistFiles("open-folder");
        renderFileList();
        queueEditorLint("open-folder");
        recordFileHistory("Open local folder", before);
        status.set(`Loaded ${files.length} file${files.length === 1 ? "" : "s"} from folder`);
        logger.append("system", [`Loaded ${files.length} workspace file${files.length === 1 ? "" : "s"} from local folder.`]);
        if (folders.length) {
            logger.append("system", [`Detected ${folders.length} folder path${folders.length === 1 ? "" : "s"} from local folder.`]);
        }
        if (localFolderBudget.filesDropped > 0) {
            logger.append("warn", [`Skipped ${localFolderBudget.filesDropped} file${localFolderBudget.filesDropped === 1 ? "" : "s"} due to local folder file cap (${WORKSPACE_MAX_FILES}).`]);
        }
        if (localFolderBudget.foldersDropped > 0) {
            logger.append("warn", [`Skipped ${localFolderBudget.foldersDropped} folder path${localFolderBudget.foldersDropped === 1 ? "" : "s"} due to folder cap (${WORKSPACE_MAX_FOLDERS}).`]);
        }
        if (localFolderBudget.filesSkippedBySize > 0) {
            logger.append("warn", [`Skipped ${localFolderBudget.filesSkippedBySize} file${localFolderBudget.filesSkippedBySize === 1 ? "" : "s"} over per-file size cap (${LOCAL_FOLDER_MAX_FILE_BYTES} bytes).`]);
        }
        if (localFolderBudget.filesSkippedByTotalBytes > 0) {
            logger.append("warn", [`Skipped ${localFolderBudget.filesSkippedByTotalBytes} file${localFolderBudget.filesSkippedByTotalBytes === 1 ? "" : "s"} after hitting total import cap (${LOCAL_FOLDER_MAX_TOTAL_BYTES} bytes).`]);
        }
        if (remappedPaths.length) {
            const sample = remappedPaths
                .slice(0, 3)
                .map(([fromPath, toPath]) => `${fromPath} -> ${toPath}`)
                .join(", ");
            const suffix = remappedPaths.length > 3 ? "..." : "";
            logger.append("warn", [`Resolved ${remappedPaths.length} file path collision${remappedPaths.length === 1 ? "" : "s"} (${sample}${suffix}).`]);
        }
        logWorkspaceSafetyAdjustments(importedWorkspace?._limitSummary, {
            label: "Local folder safety limits applied.",
        });
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

function setFilesMenuOpenState(open) {
    setOpenStateAttributes(el.filesMenu, open);
    if (el.filesMenuButton) {
        el.filesMenuButton.setAttribute("aria-expanded", open ? "true" : "false");
    }
}

function closeFloatingMenu(menuEl) {
    if (!menuEl) return;
    setOpenStateAttributes(menuEl, false);
    menuEl.style.visibility = "";
}

function syncFileRowMenuActions(file) {
    if (!el.fileRowMenu || !file) return;
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
}

function syncFolderMenuActions(normalizedFolderPath) {
    if (!el.fileFolderMenu) return;
    const knownFolders = collectFolderPaths(files);
    const folderFiles = files.filter((file) => file.name.startsWith(`${normalizedFolderPath}/`));
    const hasLockedFiles = folderFiles.some((file) => file.locked);
    const renameBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="rename"]');
    const newFileBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-file"]');
    const newFolderBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="new-folder"]');
    const deleteBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="delete"]');
    const collapseBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="collapse-all"]');
    const expandBtn = el.fileFolderMenu.querySelector('[data-folder-menu-action="expand-all"]');
    const deleteSelection = shouldDeleteSelectionFromFolderMenu(normalizedFolderPath);
    if (renameBtn) renameBtn.disabled = !knownFolders.has(normalizedFolderPath);
    if (newFileBtn) newFileBtn.disabled = false;
    if (newFolderBtn) newFolderBtn.disabled = false;
    if (deleteBtn) {
        deleteBtn.textContent = deleteSelection ? "Delete Selected Items" : "Delete Folder";
        deleteBtn.disabled = deleteSelection ? false : !knownFolders.has(normalizedFolderPath) || hasLockedFiles;
    }
    if (collapseBtn) collapseBtn.disabled = knownFolders.size === 0;
    if (expandBtn) expandBtn.disabled = collapsedFolderPaths.size === 0;
}

function closeFileMenus() {
    setFilesMenuOpenState(false);
    closeFloatingMenu(el.fileRowMenu);
    closeFloatingMenu(el.fileFolderMenu);
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
    const duplicateSelectedBtn = el.filesMenu.querySelector('[data-files-menu="duplicate-selected"]');
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
    if (importWorkspaceBtn) {
        importWorkspaceBtn.disabled = false;
        importWorkspaceBtn.title = "Import workspace JSON or code files (.js, .html, .css, .ts, .md, .txt, etc.)";
    }
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
    if (duplicateSelectedBtn) {
        duplicateSelectedBtn.disabled = selectedFileCount === 0;
        duplicateSelectedBtn.textContent = selectedFileCount ? `Duplicate (${selectedFileCount})` : "Duplicate";
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
    setFilesMenuOpenState(true);
    syncFilesMenuToggles();
    el.filesMenu.scrollTop = 0;
    positionMenu(el.filesMenu, anchorEl);
}

function openFilesMenuAt(clientX, clientY) {
    if (!el.filesMenu) return;
    closeFileMenus();
    openFileMenu = "header";
    syncFilesMenuActions();
    setFilesMenuOpenState(true);
    syncFilesMenuToggles();
    el.filesMenu.scrollTop = 0;
    positionMenuAt(el.filesMenu, clientX, clientY);
}

function openFileRowMenu(fileId, anchorEl) {
    if (!el.fileRowMenu) return;
    const file = getFileById(fileId);
    if (!file) return;
    closeFileMenus();
    openFileMenu = "row";
    fileMenuTargetId = fileId;
    syncFileRowMenuActions(file);
    setOpenStateAttributes(el.fileRowMenu, true);
    positionMenu(el.fileRowMenu, anchorEl);
}

function openFileRowMenuAt(fileId, clientX, clientY) {
    if (!el.fileRowMenu) return;
    const file = getFileById(fileId);
    if (!file) return;
    closeFileMenus();
    openFileMenu = "row";
    fileMenuTargetId = fileId;
    syncFileRowMenuActions(file);
    setOpenStateAttributes(el.fileRowMenu, true);
    positionMenuAt(el.fileRowMenu, clientX, clientY);
}

function openFolderMenu(folderPath, anchorEl) {
    if (!el.fileFolderMenu) return;
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    closeFileMenus();
    openFileMenu = "folder";
    folderMenuTargetPath = normalized;
    syncFolderMenuActions(normalized);
    setOpenStateAttributes(el.fileFolderMenu, true);
    positionMenu(el.fileFolderMenu, anchorEl);
}

function openFolderMenuAt(folderPath, clientX, clientY) {
    if (!el.fileFolderMenu) return;
    const normalized = normalizeFolderPath(folderPath, { allowEmpty: true });
    if (!normalized) return;
    closeFileMenus();
    openFileMenu = "folder";
    folderMenuTargetPath = normalized;
    syncFolderMenuActions(normalized);
    setOpenStateAttributes(el.fileFolderMenu, true);
    positionMenuAt(el.fileFolderMenu, clientX, clientY);
}

function syncFilesMenuToggleButton(button, { open = false, label = "", disabled = false } = {}) {
    if (!button) return;
    setAriaPressed(button, open);
    button.textContent = String(label || "");
    button.disabled = Boolean(disabled);
}

function syncFilesMenuToggles() {
    if (!el.filesMenu) return;
    const filtersBtn = el.filesMenu.querySelector('[data-files-toggle="filters"]');
    const gamesBtn = el.filesMenu.querySelector('[data-files-toggle="games"]');
    const appsBtn = el.filesMenu.querySelector('[data-files-toggle="applications"]');
    const lessonsBtn = el.filesMenu.querySelector('[data-files-toggle="lessons"]');
    const openEditorsBtn = el.filesMenu.querySelector('[data-files-toggle="open-editors"]');
    const filesBtn = el.filesMenu.querySelector('[data-files-toggle="files"]');
    const trashBtn = el.filesMenu.querySelector('[data-files-toggle="trash"]');
    syncFilesMenuToggleButton(filtersBtn, {
        open: layoutState.filesFiltersOpen,
        label: "Filters",
    });
    syncFilesMenuToggleButton(gamesBtn, {
        open: layoutState.filesGamesOpen,
        label: "Games",
        disabled: games.length === 0,
    });
    syncFilesMenuToggleButton(appsBtn, {
        open: layoutState.filesAppsOpen,
        label: "Apps",
        disabled: applications.length === 0,
    });
    syncFilesMenuToggleButton(lessonsBtn, {
        open: layoutState.filesLessonsOpen,
        label: "Lessons",
        disabled: lessons.length === 0,
    });
    syncFilesMenuToggleButton(openEditorsBtn, {
        open: layoutState.filesOpenEditorsOpen,
        label: "Editors",
    });
    syncFilesMenuToggleButton(filesBtn, {
        open: layoutState.filesListOpen,
        label: "Files",
    });
    syncFilesMenuToggleButton(trashBtn, {
        open: layoutState.filesTrashOpen,
        label: "Trash",
    });
}

function renderEditorTabs() {
    if (!el.editorTabs) return;
    openTabIds = normalizeOpenTabIds(openTabIds);
    if (!openTabIds.length) {
        if (lastRenderedEditorTabsMarkup !== "") {
            el.editorTabs.innerHTML = "";
            lastRenderedEditorTabsMarkup = "";
        }
        el.editorTabs.removeAttribute("aria-activedescendant");
        syncEditorStatusBar();
        return;
    }

    const disableClose = openTabIds.length <= 1;
    const tabs = openTabIds
        .map((id) => {
            const file = getFileById(id);
            if (!file) return "";
            const active = id === activeFileId;
            const dirty = isFileDirty(file);
            const label = getFileBaseName(file.name) || file.name;
            const safeLabel = escapeHTML(label);
            const safePath = escapeHTML(file.name);
            const dirtyBadge = dirty ? `<span class="editor-tab-dirty" aria-label="Unsaved">*</span>` : "";
            return `
                <div class="editor-tab" role="tab" tabindex="0" id="tab-${id}" data-tab-id="${id}" data-active="${active}" data-dirty="${dirty}" aria-selected="${active}" title="${safePath}">
                    <span class="editor-tab-label">${safeLabel}</span>
                    ${dirtyBadge}
                    <button type="button" class="editor-tab-close" data-tab-close="${id}" aria-label="Close ${safeLabel}" ${disableClose ? "disabled" : ""}>×</button>
                </div>
            `;
        })
        .join("");

    if (tabs !== lastRenderedEditorTabsMarkup) {
        el.editorTabs.innerHTML = tabs;
        lastRenderedEditorTabsMarkup = tabs;
    }
    if (activeFileId) {
        el.editorTabs.setAttribute("aria-activedescendant", `tab-${activeFileId}`);
    } else {
        el.editorTabs.removeAttribute("aria-activedescendant");
    }
    syncEditorStatusBar();
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

function onHorizontalHeaderWheel(event) {
    if (event.defaultPrevented || event.ctrlKey) return;
    const container = event.currentTarget;
    if (!(container instanceof HTMLElement)) return;
    if ((container.scrollWidth - container.clientWidth) <= 1) return;
    const deltaX = Number(event.deltaX) || 0;
    const deltaY = Number(event.deltaY) || 0;
    const rawDelta = Math.abs(deltaX) > 0 ? deltaX : deltaY;
    if (!rawDelta) return;
    const deltaMode = Number(event.deltaMode) || 0;
    const unit = deltaMode === 1
        ? 16
        : deltaMode === 2
            ? Math.max(1, container.clientWidth)
            : 1;
    const before = container.scrollLeft;
    container.scrollLeft += rawDelta * unit;
    if (container.scrollLeft !== before) {
        event.preventDefault();
    }
}

function wireHorizontalHeaderScroll() {
    const headers = document.querySelectorAll(HORIZONTAL_HEADER_SCROLL_SELECTOR);
    headers.forEach((header) => {
        if (!(header instanceof HTMLElement)) return;
        if (header.dataset.horizontalWheelBound === "true") return;
        header.dataset.horizontalWheelBound = "true";
        header.addEventListener("wheel", onHorizontalHeaderWheel, { passive: false });
    });
}

function wireFooterMiddleMouseScroll() {
    const footer = document.querySelector(".foot");
    if (!(footer instanceof HTMLElement)) return;
    if (footer.dataset.middleMousePanBound === "true") return;
    footer.dataset.middleMousePanBound = "true";

    footer.addEventListener("pointerdown", (event) => {
        if (event.button !== 1) return;
        if ((footer.scrollWidth - footer.clientWidth) <= 1) return;

        event.preventDefault();
        footer.dataset.middlePanActive = "true";

        const startX = event.clientX;
        const startScrollLeft = footer.scrollLeft;

        const cleanup = (endEvent) => {
            footer.removeEventListener("pointermove", onMove);
            footer.removeEventListener("pointerup", cleanup);
            footer.removeEventListener("pointercancel", cleanup);
            footer.removeEventListener("lostpointercapture", cleanup);
            delete footer.dataset.middlePanActive;

            if (endEvent?.pointerId !== undefined) {
                try {
                    footer.releasePointerCapture(endEvent.pointerId);
                } catch (err) {
                    // no-op
                }
            }
        };

        const onMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            footer.scrollLeft = startScrollLeft - deltaX;
        };

        footer.addEventListener("pointermove", onMove);
        footer.addEventListener("pointerup", cleanup);
        footer.addEventListener("pointercancel", cleanup);
        footer.addEventListener("lostpointercapture", cleanup);

        if (event.pointerId !== undefined) {
            try {
                footer.setPointerCapture(event.pointerId);
            } catch (err) {
                // no-op
            }
        }
    });
}

function onEditorTabsWheel(event) {
    if (!el.editorTabs) return;
    if (event.ctrlKey) return;
    const container = el.editorTabs;
    if ((container.scrollWidth - container.clientWidth) <= 1) return;
    const deltaX = Number(event.deltaX) || 0;
    const deltaY = Number(event.deltaY) || 0;
    const rawDelta = Math.abs(deltaX) > 0 ? deltaX : deltaY;
    if (!rawDelta) return;
    const deltaMode = Number(event.deltaMode) || 0;
    const unit = deltaMode === 1
        ? 16
        : deltaMode === 2
            ? Math.max(1, container.clientWidth)
            : 1;
    event.preventDefault();
    container.scrollLeft += rawDelta * unit;
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

function isReorderableFilesSection(id) {
    return FILES_REORDERABLE_SECTIONS.has(String(id || "").trim());
}

function renderStaticFilesSectionSlot(sectionId) {
    return `<li class="file-section-slot file-section-slot-static" data-files-static-slot="${escapeHTML(sectionId)}"></li>`;
}

function mountStaticFilesSection(sectionId, node) {
    if (!el.fileList || !node) return;
    const slot = el.fileList.querySelector(`[data-files-static-slot="${sectionId}"]`);
    if (!slot) return;
    slot.appendChild(node);
}

function clearFilesSectionDropIndicators() {
    if (!el.fileList) return;
    el.fileList.querySelectorAll("[data-files-section-id][data-drop-before], [data-files-section-id][data-drop-after]").forEach((node) => {
        node.removeAttribute("data-drop-before");
        node.removeAttribute("data-drop-after");
    });
}

function clearFilesSectionDragState() {
    dragFilesSectionId = null;
    dragFilesSectionDropId = null;
    dragFilesSectionDropAfter = false;
    if (!el.fileList) return;
    el.fileList.querySelectorAll("[data-files-section-id][data-dragging-section]").forEach((node) => {
        node.removeAttribute("data-dragging-section");
    });
    clearFilesSectionDropIndicators();
}

function resolveFilesSectionDragHandle(target) {
    if (!(target instanceof Element)) return null;
    const handle = target.closest("[data-files-section-id]");
    if (!handle) return null;
    const sectionId = String(handle.dataset.filesSectionId || "").trim();
    if (!isReorderableFilesSection(sectionId)) return null;
    return { handle, sectionId };
}

function resolveFilesSectionDropTarget(event) {
    const resolved = resolveFilesSectionDragHandle(event.target);
    if (!resolved) return null;
    const { handle, sectionId } = resolved;
    const rect = handle.getBoundingClientRect();
    const pointerY = Number(event.clientY) || rect.top;
    const placeAfter = pointerY > rect.top + (rect.height / 2);
    return { handle, sectionId, placeAfter };
}

function updateFilesSectionDropIndicator(sectionId, { placeAfter = false } = {}) {
    if (!el.fileList || !isReorderableFilesSection(sectionId)) return;
    clearFilesSectionDropIndicators();
    const target = el.fileList.querySelector(`[data-files-section-id="${sectionId}"]`);
    if (!target) return;
    target.setAttribute(placeAfter ? "data-drop-after" : "data-drop-before", "true");
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
        setDataActive(el.fileSearchClear, query);
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
        const draftValue = editing ? (editingDraft ?? getFileBaseName(file.name)) : file.name;
        const invalid = editing && Boolean(editingError);
        const label = displayName || file.name;
        const activeTag = !editing && active
            ? `<span class="file-active-tag" aria-label="Active file">ACTIVE</span>`
            : "";
        const iconPath = getFileIconPath(file.name);
        const iconBlock = `<img class="file-row-icon" src="${escapeHTML(iconPath)}" alt="" aria-hidden="true" loading="lazy" decoding="async" />`;
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
                    ${iconBlock}
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
        const buildGuideLevels = (depthValue = 0) => {
            const depthLimit = Math.max(0, Number(depthValue) || 0);
            return Array.from({ length: depthLimit }, (_, level) => level);
        };
        const walk = (node, depth = 0) => {
            const guideLevels = buildGuideLevels(depth);
            node.folders.forEach((folderNode) => {
                const expanded = isFolderExpanded(folderNode.path);
                const editingFolder = allowEditing && editingFolderPath === folderNode.path;
                const folderDraftValue = editingFolder ? (editingFolderDraft ?? folderNode.path) : folderNode.path;
                const folderInvalid = editingFolder && Boolean(editingFolderError);
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
                            <img class="file-folder-icon" src="${escapeHTML(getFolderIconPath(expanded))}" alt="" aria-hidden="true" loading="lazy" decoding="async" />
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
                    walk(folderNode, depth + 1);
                }
            });
            node.files.forEach((file) => {
                out.push(renderFileRow(file, sectionId, allowEditing, {
                    depth,
                    displayName: getFileBaseName(file.name),
                    showDirectory: false,
                    guideLevels,
                }));
            });
        };
        walk(tree, 0);
        return out.join("");
    };

    const renderTrashRows = (list, sectionId) => list
        .map((file) => `
            <li class="file-item file-item-trash" data-file-row-section="${sectionId}">
                <div class="file-row file-row-trash" role="note" data-trash-id="${file.id}" data-file-row-section="${sectionId}">
                    <img class="file-row-icon" src="${escapeHTML(getFileIconPath(file.name))}" alt="" aria-hidden="true" loading="lazy" decoding="async" />
                    <span class="file-name-wrap">
                        <span class="file-name">${escapeHTML(file.name)}</span>
                        <span class="file-info">Deleted ${formatRelativeTime(file.deletedAt)}</span>
                        ${file.deletedFolderPath ? `<span class="file-info">Folder: ${escapeHTML(file.deletedFolderPath)}</span>` : ""}
                    </span>
                </div>
            </li>
        `)
        .join("");

    const renderSectionHeader = (label, id, open, options = {}) => {
        const caretSide = "left";
        const content = `
            <span class="file-section-caret" aria-hidden="true"></span>
            <span class="file-section-label">${label}</span>
        `;
        const showTrashAction = id === "trash" && options.showTrashAction;
        const trashAction = showTrashAction
            ? `
            <button
                type="button"
                class="file-section-action"
                data-trash-action="empty"
                data-variant="danger"
                aria-label="Empty trash"
                title="Empty trash"
            >
                <span class="file-section-action-mark" aria-hidden="true"></span>
            </button>
        `
            : "";
        const reorderable = options.reorderable !== false && isReorderableFilesSection(id);
        const dragAttrs = reorderable
            ? `draggable="true" data-files-section-id="${id}"`
            : "";
        return `
        <li class="file-section-header" data-file-section-wrap="${id}">
            <button type="button" class="file-section-toggle" data-file-section="${id}" data-caret-side="${caretSide}" aria-expanded="${open}" ${dragAttrs}>
                ${content}
            </button>
            ${trashAction}
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
        trashSection = renderSectionHeader(label, "trash", trashOpen, { showTrashAction: true });
        if (trashOpen) {
            trashSection += renderTrashRows(visibleTrash, "trash");
        }
    }

    const sectionMarkupById = {
        games: renderStaticFilesSectionSlot("games"),
        applications: renderStaticFilesSectionSlot("applications"),
        lessons: renderStaticFilesSectionSlot("lessons"),
        "open-editors": openEditorsSection,
        files: filesSection,
    };
    const orderedSections = getFilesSectionOrder()
        .map((sectionId) => sectionMarkupById[sectionId] || "")
        .join("");
    const hasAnyVisibleRows = Boolean(orderedFiles.length || openEditors.length || visibleTrash.length);
    const emptyCopy = query ? "No matches" : "No files";
    const emptySection = hasAnyVisibleRows ? "" : `<li class="file-item"><span class="files-sub">${emptyCopy}</span></li>`;
    const fileListMarkup = `${orderedSections}${trashSection}${emptySection}`;
    if (fileListMarkup !== lastRenderedFileListMarkup) {
        el.fileList.innerHTML = fileListMarkup;
        bindFileListIconFallbacks(el.fileList);
        lastRenderedFileListMarkup = fileListMarkup;
    }
    mountStaticFilesSection("games", el.filesGames);
    mountStaticFilesSection("applications", el.filesApps);
    mountStaticFilesSection("lessons", el.filesLessons);
    if (dragFilesSectionId) {
        const dragHandle = el.fileList.querySelector(`[data-files-section-id="${dragFilesSectionId}"]`);
        if (dragHandle) {
            dragHandle.setAttribute("data-dragging-section", "true");
        }
    }
    if (dragFilesSectionDropId) {
        updateFilesSectionDropIndicator(dragFilesSectionDropId, { placeAfter: dragFilesSectionDropAfter });
    }

    const activeInFiles = activeFileId ? document.getElementById(`file-option-files-${activeFileId}`) : null;
    const activeInOpenEditors = activeFileId ? document.getElementById(`file-option-open-editors-${activeFileId}`) : null;
    let activeDescendantId = "";
    if (activeInFiles) {
        activeDescendantId = activeInFiles.id;
        el.fileList.setAttribute("aria-activedescendant", activeDescendantId);
    } else if (activeInOpenEditors) {
        activeDescendantId = activeInOpenEditors.id;
        el.fileList.setAttribute("aria-activedescendant", activeDescendantId);
    } else {
        el.fileList.removeAttribute("aria-activedescendant");
    }
    if (activeDescendantId && activeDescendantId !== lastRenderedActiveDescendantId) {
        scrollActiveFileRowIntoView();
    }
    lastRenderedActiveDescendantId = activeDescendantId;
    if (quickOpenOpen) {
        updateQuickOpenResults(quickOpenQuery);
    }
    if (commandPaletteOpen) {
        updateCommandPaletteResults(commandPaletteQuery);
    }

    queueFilesColumnGutterSync();
    renderEditorTabs();

    if (editingFileId) {
        requestAnimationFrame(() => {
            const input = el.fileList.querySelector(`[data-file-rename="${editingFileId}"]`);
            if (input) {
                input.focus();
                const file = files.find((item) => item.id === editingFileId);
                if (file && editingDraft === getFileBaseName(file.name)) {
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
        const needsSelectionReset = selectedFolderPaths.size > 0 || selectedFileIds.size !== 1 || !selectedFileIds.has(id);
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
    syncEditorStatusBar();
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
    const defaultName = getNextUntitledFileName("");
    stashActiveFile();
    const file = makeFile(defaultName, "", { preserveExtensionless: true });
    files.push(file);
    expandFolderAncestors(file.name);
    activeFileId = file.id;
    setSingleSelection(file.id);
    ensureTabOpen(file.id);
    setEditorValue(file.code, { silent: true });
    recordCodeSnapshot(file.id, file.code, "create", { force: true });
    persistFiles();
    editingFileId = file.id;
    editingDraft = getFileBaseName(file.name);
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

function getTrashGroupEntries(groupId) {
    const normalized = String(groupId || "").trim();
    if (!normalized) return [];
    return trashFiles.filter((entry) => String(entry?.deletedGroupId || "").trim() === normalized);
}

function restoreTrashGroupById(groupId, {
    preferredTrashId = "",
    activate = true,
    focus = true,
} = {}) {
    pruneTrashEntries();
    const entries = getTrashGroupEntries(groupId);
    if (!entries.length) return false;

    const before = snapshotWorkspaceState();
    stashActiveFile();

    const groupIds = new Set(entries.map((entry) => entry.id));
    trashFiles = trashFiles.filter((entry) => !groupIds.has(entry.id));

    const restoredByTrashId = new Map();
    const ordered = [...entries].reverse();
    ordered.forEach((entry) => {
        const restored = restoreTrashEntry(entry, { activate: false });
        if (restored) restoredByTrashId.set(entry.id, restored);
    });

    if (!restoredByTrashId.size) {
        persistFiles();
        renderFileList();
        return false;
    }

    if (activate) {
        const preferred = preferredTrashId ? restoredByTrashId.get(preferredTrashId) : null;
        const fallback = preferred || restoredByTrashId.get(ordered[ordered.length - 1]?.id) || [...restoredByTrashId.values()][0];
        if (fallback) {
            activeFileId = fallback.id;
            setSingleSelection(fallback.id);
            ensureTabOpen(fallback.id);
            expandFolderAncestors(fallback.name);
            setEditorValue(fallback.code, { silent: true });
        }
    }

    openTabIds = normalizeOpenTabIds(openTabIds);
    persistFiles();
    renderFileList();

    const restoredCount = restoredByTrashId.size;
    const folderPath = normalizeFolderPath(entries[0]?.deletedFolderPath, { allowEmpty: true }) || "";
    const folderLabel = folderPath ? `folder ${folderPath}` : "folder";
    status.set(`Restored ${folderLabel}`);
    logger.append("system", [`Restored ${restoredCount} ${restoredCount === 1 ? "file" : "files"} from ${folderLabel} in Trash.`]);
    recordFileHistory(`Restore ${folderLabel} (${restoredCount})`, before);
    if (focus) editor.focus();
    return true;
}

function permanentlyDeleteTrashById(trashId, { focus = true } = {}) {
    pruneTrashEntries();
    const index = trashFiles.findIndex((entry) => entry.id === trashId);
    if (index === -1) return false;
    const before = snapshotWorkspaceState();
    const [entry] = trashFiles.splice(index, 1);
    persistFiles();
    renderFileList();
    status.set(`Deleted ${entry.name} permanently`);
    logger.append("system", [`Permanently deleted ${entry.name} from Trash.`]);
    recordFileHistory(`Permanent delete ${entry.name}`, before);
    if (focus) editor.focus();
    return true;
}

async function confirmRestoreTrashById(trashId) {
    pruneTrashEntries();
    const entry = trashFiles.find((item) => item.id === trashId);
    if (!entry) return false;
    const folderPath = normalizeFolderPath(entry.deletedFolderPath, { allowEmpty: true });
    const groupedEntries = getTrashGroupEntries(entry.deletedGroupId);
    const hasFolderGroup = Boolean(folderPath && groupedEntries.length > 1);
    const groupedFileNames = hasFolderGroup
        ? [...new Set(groupedEntries.map((item) => item.name))]
        : [];
    const groupedPreview = groupedFileNames.length > 8
        ? [...groupedFileNames.slice(0, 8), `...and ${groupedFileNames.length - 8} more`]
        : groupedFileNames;
    const choice = await openPromptDialog({
        mode: "confirm",
        title: hasFolderGroup ? `Restore folder ${folderPath}?` : `Restore ${entry.name}?`,
        message: hasFolderGroup
            ? `Restore all ${groupedEntries.length} files from this folder.\nDelete forever removes only the selected file permanently.`
            : "Restore returns this file to your workspace.\nDelete forever removes it permanently.",
        items: hasFolderGroup ? groupedPreview : [entry.name],
        listTitle: hasFolderGroup ? `Folder files (${groupedEntries.length})` : "Trash file",
        confirmText: hasFolderGroup ? "Restore folder" : "Restore",
        confirmValue: hasFolderGroup ? "restore-folder" : "restore",
        cancelText: "Cancel",
        cancelValue: false,
        secondaryText: "Delete forever",
        secondaryValue: "delete",
        secondaryDanger: true,
        secondaryRequiresConfirm: true,
        secondaryArmedText: "Delete forever",
        secondaryShieldLabel: "Safety cover",
        secondaryArmedLabel: "",
        danger: false,
    });
    if (choice === "delete") {
        return permanentlyDeleteTrashById(trashId, { focus: true });
    }
    if (choice === "restore-folder") {
        return restoreTrashGroupById(entry.deletedGroupId, {
            preferredTrashId: trashId,
            activate: true,
            focus: true,
        });
    }
    if (choice !== "restore") return false;
    return restoreTrashById(trashId, { activate: true, focus: true });
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
    const count = trashFiles.length;
    const choice = await openPromptDialog({
        mode: "confirm",
        title: `Empty Trash (${count} ${count === 1 ? "file" : "files"})?`,
        message: "Delete forever permanently removes everything in Trash.\nThis cannot be undone.",
        items: trashFiles.map((file) => file.name),
        listTitle: count === 1 ? "Trash file" : "Trash files",
        confirmText: "Keep Trash",
        confirmValue: false,
        cancelText: "Cancel",
        cancelValue: false,
        secondaryText: "Delete forever",
        secondaryValue: "delete",
        secondaryDanger: true,
        secondaryRequiresConfirm: true,
        secondaryArmedText: "Delete forever",
        secondaryShieldLabel: "Safety cover",
        secondaryArmedLabel: "",
        danger: false,
    });
    if (choice !== "delete") return false;
    const before = snapshotWorkspaceState();
    trashFiles = [];
    persistFiles();
    renderFileList();
    status.set(`Deleted ${count} ${count === 1 ? "file" : "files"} forever`);
    logger.append("system", [`Permanently deleted ${count} ${count === 1 ? "file" : "files"} from Trash.`]);
    recordFileHistory(`Permanent empty trash (${count})`, before);
    return true;
}

async function deleteAllFiles() {
    const total = files.length;
    const folderCount = collectFolderPaths(files, folders).size;
    if (!total && !folderCount) return;
    const lockedCount = files.filter((file) => file.locked).length;
    if (lockedCount > 0) {
        const noun = lockedCount === 1 ? "file is" : "files are";
        status.set("Locked files");
        logger.append("system", [`${lockedCount} locked ${noun} blocking Delete all. Unlock first.`]);
        return;
    }

    const before = snapshotWorkspaceState();
    const summary = folderCount
        ? `Move all ${total} files to Trash and delete ${folderCount} folder${folderCount === 1 ? "" : "s"}?`
        : `Move all ${total} files to Trash?`;
    const confirmDelete = await confirmWithFilePreview(
        summary,
        files.map((file) => file.name),
        { detail: folderCount ? "All folder entries are removed. This keeps one fresh file open." : "This keeps one fresh file open." }
    );
    if (!confirmDelete) return;
    queueDeleteUndo(folderCount ? "Deleted all files and folders" : "Deleted all files");
    pushFilesToTrash(files);

    const fallback = makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
    files = [fallback];
    folders = [];
    collapsedFolderPaths.clear();
    activeFileId = fallback.id;
    setSingleSelection(fallback.id);
    openTabIds = [fallback.id];
    clearInlineRenameState();
    fileMenuTargetId = null;
    setEditorValue(fallback.code, { silent: true });
    persistFiles();
    renderFileList();
    const folderLabel = folderCount ? ` and removed ${folderCount} folder${folderCount === 1 ? "" : "s"}` : "";
    status.set(`Moved ${total} files to Trash${folderCount ? ` + removed ${folderCount} folders` : ""}`);
    logger.append("system", [`Moved ${total} files to Trash${folderLabel}. Reset to ${fallback.name}. Undo available for 15s.`]);
    recordFileHistory(
        folderCount
            ? `Delete all files (${total}) + folders (${folderCount})`
            : `Delete all files (${total})`,
        before
    );
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
    const sectionHandle = resolveFilesSectionDragHandle(event.target);
    if (sectionHandle) {
        const { handle, sectionId } = sectionHandle;
        dragFilesSectionId = sectionId;
        dragFilesSectionDropId = null;
        dragFilesSectionDropAfter = false;
        handle.setAttribute("data-dragging-section", "true");
        clearFilesSectionDropIndicators();
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", `section:${sectionId}`);
        }
        return;
    }

    if (dragFilesSectionId) {
        event.preventDefault();
        return;
    }

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
    if (dragFilesSectionId) {
        const target = resolveFilesSectionDropTarget(event);
        if (!target || target.sectionId === dragFilesSectionId) {
            dragFilesSectionDropId = null;
            dragFilesSectionDropAfter = false;
            clearFilesSectionDropIndicators();
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
        dragFilesSectionDropId = target.sectionId;
        dragFilesSectionDropAfter = target.placeAfter;
        updateFilesSectionDropIndicator(target.sectionId, { placeAfter: target.placeAfter });
        return;
    }

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
    if (dragFilesSectionId) {
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && el.fileList?.contains(nextTarget)) return;
        dragFilesSectionDropId = null;
        dragFilesSectionDropAfter = false;
        clearFilesSectionDropIndicators();
        return;
    }

    const payload = getDragMovePayload();
    if (!payload.fileIds.length && !payload.folderPaths.length) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget && el.fileList?.contains(nextTarget)) return;
    setFolderDropHover(null);
    setRootDropHover(false);
}

function onFileListDrop(event) {
    if (dragFilesSectionId) {
        event.preventDefault();
        const target = resolveFilesSectionDropTarget(event);
        const targetId = target?.sectionId || dragFilesSectionDropId;
        const placeAfter = target ? target.placeAfter : dragFilesSectionDropAfter;
        if (targetId && targetId !== dragFilesSectionId) {
            moveFilesSection(dragFilesSectionId, targetId, { placeAfter });
        }
        clearFilesSectionDragState();
        return;
    }

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
    if (dragFilesSectionId) {
        clearFilesSectionDragState();
        return;
    }
    clearFileDragState();
}

function onGlobalDragCleanup(event) {
    const target = event?.target;
    if (dragFilesSectionId) {
        if (target instanceof Node && el.fileList?.contains(target)) return;
        clearFilesSectionDragState();
    }
    if (target instanceof Node && el.fileList?.contains(target)) return;
    if (!dragFileId && !dragFolderPath && !dragFolderHoverPath && !dragFileIds.length && !dragFolderPaths.length) return;
    clearFileDragState();
}

function onFileListClick(event) {
    if (event.target.closest("[data-file-rename]") || event.target.closest("[data-folder-rename]")) return;
    if (editingFileId || editingFolderPath) return;
    const trashRow = event.target.closest("[data-trash-id]");
    if (trashRow) {
        void confirmRestoreTrashById(trashRow.dataset.trashId);
        return;
    }
    const trashAction = event.target.closest("[data-trash-action]");
    if (trashAction) {
        const action = trashAction.dataset.trashAction;
        if (action === "empty") {
            emptyTrash();
        }
        return;
    }
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
    const templateSection = event.target instanceof Element ? event.target.closest("#filesGames, #filesApps, #filesLessons") : null;
    if (templateSection) return;
    const folderRow = event.target.closest(FILE_FOLDER_ROW_SELECTOR);
    const row = event.target.closest("[data-file-id]");
    if (editingFileId || editingFolderPath) return;
    event.preventDefault();
    if (folderRow) {
        const folderPath = normalizeFolderPath(folderRow.dataset.folderToggle || "", { allowEmpty: true });
        if (!folderPath) return;
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
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
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
        setSingleSelection(row.dataset.fileId);
        renderFileList();
    }
    openFileRowMenuAt(row.dataset.fileId, event.clientX, event.clientY);
}

function ensureUniqueName(name, excludeId, { ignoreCase = false, preserveExtensionless = false } = {}) {
    const normalized = preserveExtensionless
        ? normalizeLooseFileName(name, FILE_DEFAULT_NAME)
        : collapseDuplicateTerminalExtension(normalizeFileName(name));
    const segments = splitPathSegments(normalized);
    const leaf = segments.pop() || (preserveExtensionless ? "untitled" : FILE_DEFAULT_NAME);
    const parsed = splitLeafExtension(leaf);
    const baseStem = parsed.stem || leaf || "file";
    const extension = parsed.extension || (preserveExtensionless ? "" : getFallbackFileExtension(leaf));
    const prefix = segments.length ? `${buildPathFromSegments(segments)}/` : "";
    let candidate = normalized;
    let i = 2;
    while (files.some((f) => {
        if (f.id === excludeId) return false;
        if (!ignoreCase) return f.name === candidate;
        const fileName = normalizePathSlashes(String(f.name ?? "")).toLowerCase();
        return fileName === candidate.toLowerCase();
    })) {
        candidate = extension
            ? collapseDuplicateTerminalExtension(`${prefix}${baseStem}(${i})${extension}`)
            : collapseDuplicateTerminalExtension(`${prefix}${baseStem}(${i})`);
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
    editingDraft = file ? getFileBaseName(file.name) : "";
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
    const currentLeafName = getFileBaseName(file.name);
    const isPendingNewFileRename = pendingNewFileRenameId === fileId;
    const currentExt = splitLeafExtension(currentLeafName).extension;
    const shouldPreserveExtensionless = isPendingNewFileRename || !currentExt;
    if (reason === "blur" && isPendingNewFileRename && normalizedValue === currentLeafName) {
        editingFileId = fileId;
        editingDraft = currentLeafName;
        editingError = "";
        renderFileList();
        return;
    }
    const valueSegments = splitPathSegments(normalizedValue);
    if (valueSegments.length > 1) {
        editingFileId = fileId;
        editingDraft = value;
        editingError = "Use file name only (folder path is kept).";
        renderFileList();
        return;
    }
    const leafName = valueSegments[0] || normalizedValue;
    let nextLeaf = leafName;
    if (nextLeaf) {
        const parsedNextLeaf = splitLeafExtension(nextLeaf);
        if (!parsedNextLeaf.extension && !shouldPreserveExtensionless) {
            if (currentExt) {
                nextLeaf = `${nextLeaf}${currentExt}`;
            }
        }
    }
    const fileDir = getFileDirectory(file.name);
    const nextPath = fileDir ? `${fileDir}/${nextLeaf}` : nextLeaf;
    const check = validateFileName(nextPath, { currentFile: file });
    if (!check.valid) {
        editingFileId = fileId;
        editingDraft = value;
        editingError = check.message;
        renderFileList();
        return;
    }
    const next = collapseDuplicateTerminalExtension(
        ensureUniqueName(nextPath, fileId, { preserveExtensionless: shouldPreserveExtensionless })
    );
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
    if (el.btnInspect) setDataActive(el.btnInspect, active);
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

function collectSandboxThemeSurface(themeValue = currentTheme) {
    const root = document?.documentElement;
    const styles = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
    const readToken = (name, fallback = "") => {
        if (!styles || !name) return fallback;
        const value = String(styles.getPropertyValue(name) || "").trim();
        return value || fallback;
    };
    const normalizedTheme = String(themeValue || currentTheme || "dark").toLowerCase();
    const isLight = normalizedTheme === "light";
    const panelSurface = readToken("--surface-panel", isLight ? "#ffffff" : "#111520");
    return {
        background: panelSurface || readToken("--bg", isLight ? "#f8fafc" : "#0b0f14"),
        foreground: readToken("--text", isLight ? "#0f172a" : "#e6edf3"),
        panel: panelSurface,
        border: readToken("--border", isLight ? "rgba(148, 163, 184, 0.42)" : "rgba(148, 163, 184, 0.3)"),
        accent: readToken("--accent", isLight ? "#0ea5e9" : "#38bdf8"),
        muted: readToken("--muted", isLight ? "rgba(71, 85, 105, 0.9)" : "rgba(148, 163, 184, 0.9)"),
        colorScheme: isLight ? "light" : "dark",
    };
}

function syncSandboxTheme() {
    sendSandboxCommand("theme_update", {
        theme: currentTheme,
        surface: collectSandboxThemeSurface(currentTheme),
    });
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
        setAriaPressed(el.debugModeToggle, debugMode);
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
        setDataActive(el.btnRunnerFull, active);
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
                iconSources: [...(game.iconSources || [])],
            }));
        },
        loadGame(id, { run = false } = {}) {
            return loadGameById(id, { runAfter: run });
        },
        listApplications() {
            return applications.map((app) => ({
                id: app.id,
                name: app.name,
                folder: app.folder,
                entryFile: app.entryFile,
                files: app.files.map((file) => ({ path: file.path, src: file.src })),
                iconSources: [...(app.iconSources || [])],
            }));
        },
        loadApplication(id, { run = false } = {}) {
            return loadApplicationById(id, { runAfter: run });
        },
        listLessons() {
            return lessons.map((lesson) => ({
                id: lesson.id,
                name: lesson.name,
                folder: lesson.folder,
                entryFile: lesson.entryFile,
                files: lesson.files.map((file) => ({ path: file.path, src: file.src })),
                iconSources: [...(lesson.iconSources || [])],
            }));
        },
        loadLesson(id, { startTyping = true, run = false } = {}) {
            selectedLessonId = String(id || selectedLessonId || "");
            return loadLessonById(selectedLessonId, { startTyping: Boolean(startTyping), runAfter: Boolean(run) });
        },
        startTypingLesson() {
            return startTypingLessonForFile(activeFileId, { announce: true });
        },
        nextLessonStep() {
            return advanceLessonStep({ announce: true });
        },
        stopTypingLesson() {
            return stopTypingLesson({ announce: true });
        },
        typeLessonInput(text = "") {
            return typeLessonInputText(text);
        },
        getLessonState() {
            return getLessonStateSnapshot();
        },
        getLessonProfile() {
            return getLessonProfileSnapshot();
        },
        listThemeShop() {
            return buildThemeShopSnapshot();
        },
        unlockTheme(theme, { spend = true } = {}) {
            const ok = unlockLessonTheme(theme, { spend: Boolean(spend) });
            if (ok) {
                renderHeaderThemeSelectOptions();
                updateLessonShopUi();
                updateLessonHeaderStats({ force: true });
                updateLessonHud();
            }
            return ok;
        },
        listFilesSectionOrder() {
            return getFilesSectionOrder();
        },
        setFilesSectionOrder(order = []) {
            setFilesSectionOrder(order, { persist: true, render: true });
            return getFilesSectionOrder();
        },
        moveFilesSection(sourceId, targetId, { placeAfter = false } = {}) {
            moveFilesSection(sourceId, targetId, { placeAfter });
            return getFilesSectionOrder();
        },
        setCode(code) {
            setEditorValue(String(code ?? ""), { silent: true });
            updateActiveFileCode(editor.get());
        },
        setTheme(theme) {
            applyTheme(theme, { source: "api" });
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
                deletedFolderPath: file.deletedFolderPath || "",
                deletedGroupId: file.deletedGroupId || "",
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
            const fallback = makeFile(FILE_DEFAULT_NAME, DEFAULT_CODE);
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
            if (!["tabSize", "fontSize", "fontFamily", "syntaxTheme", "lineWrapping", "lintEnabled", "errorLensEnabled", "snippetEnabled", "autosaveMs", "formatterMode"].includes(key)) {
                return false;
            }
            editorSettings = sanitizeEditorSettings({ ...editorSettings, [key]: value });
            applyEditorSettings({ persist: true, refreshUI: true });
            return true;
        },
        runTask(taskId) {
            return runTaskRunnerTask(taskId);
        },
        openDevTerminal() {
            return focusDevTerminalInput({ openLog: true });
        },
        startTutorial(tutorialId = DEFAULT_TUTORIAL_ID) {
            const resolvedId = normalizeTutorialId(tutorialId, DEFAULT_TUTORIAL_ID);
            return openBeginnerTutorial({ force: true, tutorialId: resolvedId });
        },
        resetTutorial(tutorialId = DEFAULT_TUTORIAL_ID) {
            const resolvedId = normalizeTutorialId(tutorialId, DEFAULT_TUTORIAL_ID);
            setTutorialSeen(false, resolvedId);
            if (tutorialState.active && tutorialState.tutorialId === resolvedId) {
                closeBeginnerTutorial({ markSeen: false, tutorialId: resolvedId });
            }
            return true;
        },
        getTutorialState() {
            const definition = getTutorialDefinition(tutorialState.tutorialId);
            const steps = Array.isArray(definition.steps) ? definition.steps : [];
            return {
                tutorialId: tutorialState.tutorialId,
                availableTutorials: getTutorialIds(),
                active: tutorialState.active,
                seen: getTutorialSeen(tutorialState.tutorialId),
                stepIndex: tutorialState.index,
                totalSteps: steps.length,
            };
        },
        focusConsoleInput() {
            return focusConsoleInput({ openLog: true });
        },
        evalInConsole(expression = "") {
            return requestConsoleInputEval(expression);
        },
        runDevTerminal(command) {
            return executeDevTerminalCommand(command);
        },
        async freshStart(confirmReset = false) {
            if (!confirmReset) return false;
            await resetAppToFirstLaunchState();
            window.location.reload();
            return true;
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
        getStateBoundaries() {
            return getStateBoundariesSnapshot();
        },
        getStateBoundary(name) {
            return getStateBoundary(name);
        },
        getUiZoom() {
            return uiZoomPercent;
        },
        setUiZoom(percent = UI_ZOOM_DEFAULT) {
            return applyUiZoom(percent, { persist: true, announce: true });
        },
        zoomIn() {
            return adjustUiZoom(UI_ZOOM_STEP, { persist: true, announce: true });
        },
        zoomOut() {
            return adjustUiZoom(-UI_ZOOM_STEP, { persist: true, announce: true });
        },
        resetUiZoom() {
            return resetUiZoom({ persist: true, announce: true });
        },
        getStorageJournalState() {
            return getStorageJournalState();
        },
        getStorageBackendInfo() {
            return getStorageBackendInfo();
        },
        recoverStorageJournal() {
            return recoverStorageJournal();
        },
        getState() {
            const boundaries = getStateBoundariesSnapshot();
            return {
                layout: { ...layoutState },
                activeLayoutPreset: activeLayoutPresetName,
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
                projectState: boundaries.project,
                workspaceState: boundaries.workspace,
                runtimeState: boundaries.runtime,
                uiZoomPercent,
                storageJournalKey: STORAGE_JOURNAL_KEY,
                storageJournal: getStorageJournalState(),
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
                `fazide.setTheme('${THEMES.join("'|'")}') / fazide.getTheme()`,
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
                "fazide.openDevTerminal() / fazide.runDevTerminal('help')",
                "fazide.startTutorial('beginner') / fazide.resetTutorial('beginner') / fazide.getTutorialState()",
                "fazide.registerCommand({ id, label, run, keywords, shortcut }) / fazide.unregisterCommand(id)",
                "fazide.registerSnippet({ trigger, template, scope }) / fazide.unregisterSnippet(trigger, scope?)",
                "fazide.setDebugMode(true) / fazide.addBreakpoint(12) / fazide.addWatch('someVar')",
                "fazide.listGames() / fazide.loadGame('click-counter', { run: true })",
                "fazide.listApplications() / fazide.loadApplication('calculator-app', { run: true })",
                "fazide.listLessons() / fazide.loadLesson('paddle-lesson-1', { startTyping: true })",
                "fazide.startTypingLesson() / fazide.nextLessonStep() / fazide.stopTypingLesson() / fazide.getLessonState() / fazide.getLessonProfile()",
                "fazide.setLogWidth(px) / fazide.setSidebarWidth(px) / fazide.setSandboxWidth(px) / fazide.setToolsWidth(px)",
                "fazide.setSizes({ logWidth, sidebarWidth, sandboxWidth, toolsWidth })",
                "fazide.setPanelGap(px) / fazide.setCornerRadius(px) / fazide.setBottomHeight(px)",
                "fazide.applyPreset('studio'|'focus'|'review'|'wide'|'debug'|'zen'|'sandbox'|'diagnostics')",
                "fazide.resetLayout()",
                "fazide.getStateBoundaries() / fazide.getStateBoundary('project'|'workspace'|'runtime')",
                "fazide.getUiZoom() / fazide.setUiZoom(110) / fazide.zoomIn() / fazide.zoomOut() / fazide.resetUiZoom()",
                "fazide.getStorageJournalState() / fazide.recoverStorageJournal()",
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
            const row = getPanelRow("files");
            const bounds = getEffectiveBounds("files", row, getLayoutBounds().sidebar);
            const next = clamp(Number(px), bounds.min, bounds.max);
            setSidebarWidth(next);
            commitLayoutResize();
            return next;
        },
        setLogWidth(px) {
            const row = getPanelRow("log");
            const bounds = getEffectiveBounds("log", row, getLayoutBounds().logWidth);
            const next = clamp(Number(px), bounds.min, bounds.max);
            setLogWidth(next);
            commitLayoutResize();
            return next;
        },
        setSandboxWidth(px) {
            const row = getPanelRow("sandbox");
            const bounds = getEffectiveBounds("sandbox", row, getLayoutBounds().sandboxWidth);
            const next = clamp(Number(px), bounds.min, bounds.max);
            setSandboxWidth(next);
            commitLayoutResize();
            return next;
        },
        setToolsWidth(px) {
            const row = getPanelRow("tools");
            const bounds = getEffectiveBounds("tools", row, getLayoutBounds().toolsWidth);
            const next = clamp(Number(px), bounds.min, bounds.max);
            setToolsWidth(next);
            commitLayoutResize();
            return next;
        },
        setSizes({ logWidth, sidebarWidth, sandboxWidth, toolsWidth } = {}) {
            let applied = {};
            let didSetAny = false;
            if (Number.isFinite(logWidth)) {
                const row = getPanelRow("log");
                const bounds = getEffectiveBounds("log", row, getLayoutBounds().logWidth);
                const next = clamp(Number(logWidth), bounds.min, bounds.max);
                setLogWidth(next);
                applied.logWidth = next;
                didSetAny = true;
            }
            if (Number.isFinite(sidebarWidth)) {
                const row = getPanelRow("files");
                const bounds = getEffectiveBounds("files", row, getLayoutBounds().sidebar);
                const next = clamp(Number(sidebarWidth), bounds.min, bounds.max);
                setSidebarWidth(next);
                applied.sidebarWidth = next;
                didSetAny = true;
            }
            if (Number.isFinite(sandboxWidth)) {
                const row = getPanelRow("sandbox");
                const bounds = getEffectiveBounds("sandbox", row, getLayoutBounds().sandboxWidth);
                const next = clamp(Number(sandboxWidth), bounds.min, bounds.max);
                setSandboxWidth(next);
                applied.sandboxWidth = next;
                didSetAny = true;
            }
            if (Number.isFinite(toolsWidth)) {
                const row = getPanelRow("tools");
                const bounds = getEffectiveBounds("tools", row, getLayoutBounds().toolsWidth);
                const next = clamp(Number(toolsWidth), bounds.min, bounds.max);
                setToolsWidth(next);
                applied.toolsWidth = next;
                didSetAny = true;
            }
            if (didSetAny) {
                commitLayoutResize();
            }
            return applied;
        },
        setPanelOrder(panel, index) {
            setPanelOrder(panel, index);
            return { ...layoutState.panelRows };
        },
        getPanelLayout() {
            return JSON.parse(JSON.stringify(layoutState.panelLayout || rowsToPanelLayout(layoutState.panelRows)));
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
    const recoveredStorageJournal = recoverStorageJournal();
    wireTutorialIntro();
    loadLessonProfile();
    loadEditorSettings();
    renderEditorSyntaxThemeSelectOptions();
    loadSnippetRegistry();
    loadCodeHistory();
    wireDiagnostics();
    wireProblemsPanel();
    wireToolsTabs();
    wireToolsProblemsDock();
    wireTaskRunner();
    wireConsoleInput();
    wireDevTerminal();
    registerServiceWorker();
    checkStorageHealth();
    setDiagnosticsVerbose(false);
    renderHeaderThemeSelectOptions();
    const storedTheme = load(STORAGE.THEME);
    applyTheme(storedTheme || "dark", { persist: false, source: "boot" });
    loadUiZoom();
    initDocking();
    initSplitters();
    window.addEventListener("beforeunload", () => {
        if (persistenceWritesLocked) return;
        persistLessonProfile({ force: true });
        persistLessonSession({ force: true });
    });
    document.addEventListener("visibilitychange", () => {
        if (persistenceWritesLocked) return;
        if (document.visibilityState === "hidden") {
            persistLessonProfile({ force: true });
            persistLessonSession({ force: true });
        }
    });
    exposeDebug();
    wireQuickOpen();
    wireCommandPalette();
    wireShortcutHelp();
    wireLessonStats();
    wirePromptDialog();
    wireEditorScopeTrail();
    wireEditorSearch();
    wireSymbolPalette();
    wireProjectSearch();
    wireEditorHistory();
    wireEditorSettings();
    wireDebugger();
    wireHorizontalHeaderScroll();
    wireFooterMiddleMouseScroll();
    setLayoutPanelOpen(false);
    setShortcutHelpOpen(false);
    setLessonStatsOpen(false);
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
    layoutState.filesFiltersOpen = false;
    layoutState.filesOpenEditorsOpen = false;
    layoutState.filesListOpen = false;
    layoutState.filesTrashOpen = false;
    gamesSelectorOpen = false;
    applicationsSelectorOpen = false;
    lessonsSelectorOpen = false;
    applyLayout();
    applyUiZoom(uiZoomPercent, { persist: false, announce: false, syncLayout: true });
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
    restoreLessonSessionFromStorage();
    queueEditorSignatureHintSync();
    if (activeFile) {
        recordCodeSnapshot(activeFile.id, activeFile.code, "boot", { force: false });
    }
    renderFileList();
    renderEditorMirror();
    syncGamesUI();
    syncApplicationsUI();
    syncLessonsUI();
    updateLessonHud();
    applyEditorBottomComfortSpacing({ force: true });
    wireEditorBottomComfortObserver();
    persistFiles("boot");
    setSessionState(true);

    // Header line
    // Notes:
    // - Status chip communicates states at a glance.
    // - Log prints a one-time boot banner for context.
    status.set("Ready");
    logger.append("system", [`${APP.NAME} ${APP.VERSION} loaded - built by ${APP.AUTHOR}`]);
    if (recoveredStorageJournal.recovered) {
        setHealth(health.storage, "warn", "Storage: Recovered");
        pushDiag("warn", `Recovered pending storage journal (${recoveredStorageJournal.entryCount} entries).`);
        logger.append("warn", [`Recovered pending storage journal (${recoveredStorageJournal.entryCount} entries).`]);
        status.set("Recovered storage journal");
    }
    if (initial.source === "snapshot-recovery" || initial.source === "snapshot-fallback") {
        logger.append("system", ["Recovered workspace from snapshot backup."]);
        status.set("Recovered snapshot");
    }

    scheduleFrame(() => {
        const shouldForceTutorialStart = safeLocalStorageGet(TUTORIAL_FORCE_START_STORAGE_KEY) === "1";
        if (shouldForceTutorialStart) {
            safeLocalStorageRemove(TUTORIAL_FORCE_START_STORAGE_KEY);
        }
        openBeginnerTutorial({ force: shouldForceTutorialStart });
    });

    // Autosave on edit
    // Notes:
    // - Saves on every input event (typing/paste).
    // - Keeps "lossless" workflow: refresh shouldn't lost code.
    // - Status becomes "Editing" to show unspecific activity.
    editor.onChange(() => {
        if (suppressChange) return;
        if (isLessonSessionActiveForCurrentFile()) {
            stopTypingLesson({ announce: false });
            status.set("Lesson stopped: file changed");
            logger.append("warn", ["Lesson mode stopped because file content changed."]);
        }
        updateActiveFileCode(editor.get());
        if (suppressHtmlTagRenameChange) {
            suppressHtmlTagRenameChange = false;
        } else {
            syncHtmlPairedClosingTagName();
        }
        queueEditorLint("input");
        if (editorSearchOpen) {
            refreshFindResults({ preserveIndex: true, focusSelection: false });
        }
        if (symbolPaletteOpen) {
            refreshSymbolResults(el.symbolSearchInput?.value || "");
        }
        clearSnippetSession();
        if (suppressEditorCompletionOnNextChange) {
            suppressEditorCompletionOnNextChange = false;
        } else {
            updateEditorCompletion();
        }
        status.set("Unsaved");
        renderFileList();
        renderEditorMirror();
        syncEditorStatusBar();
        queueEditorScopeTrailSync();
        queueEditorSignatureHintSync();
        maintainEditorCursorComfort();
    });

    editor.onCursorActivity?.(() => {
        syncEditorStatusBar();
        queueEditorScopeTrailSync();
        queueEditorSignatureHintSync();
        maintainEditorCursorComfort();
        if (!snippetSession) {
            syncEditorCompletionForCursorActivity();
            return;
        }
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
        if (min !== max) {
            closeEditorCompletion();
            return;
        }
        updateEditorCompletion();
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
        if (handleLessonTypingKeyDown(e)) {
            return;
        }

        if (handleEditorCompletionKeyDown(e)) {
            return;
        }

        if (handleEditorHtmlSmartEnter(e)) {
            return;
        }

        if (handleEditorHtmlCloseTagCompletion(e)) {
            return;
        }

        if (handleEditorHtmlAutoCloseTag(e)) {
            return;
        }

        if (handleEditorAutoPairs(e)) {
            return;
        }

        if (handleEditorSmartEnter(e)) {
            return;
        }

        if (isDuplicateLineDownShortcut(e)) {
            if (duplicateEditorSelectedLinesDown()) {
                e.preventDefault();
                return;
            }
        }

        if (isDuplicateLineUpShortcut(e)) {
            if (duplicateEditorSelectedLinesUp()) {
                e.preventDefault();
                return;
            }
        }

        if (isMoveLineDownShortcut(e)) {
            if (moveEditorSelectedLines(1)) {
                e.preventDefault();
                return;
            }
        }

        if (isMoveLineUpShortcut(e)) {
            if (moveEditorSelectedLines(-1)) {
                e.preventDefault();
                return;
            }
        }

        if (isToggleCommentShortcut(e)) {
            if (toggleEditorComments()) {
                e.preventDefault();
                return;
            }
        }

        if (isDeleteLineShortcut(e)) {
            if (deleteEditorSelectedLines()) {
                e.preventDefault();
                return;
            }
        }

        if (isSelectNextOccurrenceShortcut(e)) {
            if (selectEditorNextOccurrence()) {
                e.preventDefault();
                return;
            }
        }

        if (isSelectAllOccurrencesShortcut(e)) {
            if (selectAllEditorOccurrences()) {
                e.preventDefault();
                return;
            }
        }

        if (isZoomInShortcut(e)) {
            e.preventDefault();
            adjustUiZoom(UI_ZOOM_STEP, { persist: true, announce: true });
            return;
        }

        if (isZoomOutShortcut(e)) {
            e.preventDefault();
            adjustUiZoom(-UI_ZOOM_STEP, { persist: true, announce: true });
            return;
        }

        if (isZoomResetShortcut(e)) {
            e.preventDefault();
            resetUiZoom({ persist: true, announce: true });
            return;
        }

        if (handleEditorTabIndent(e, { outdent: true })) {
            return;
        }

        if (isRunShortcut(e)) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.RUN_EXECUTE, () => run());
            return;
        }

        if (isSaveShortcut(e)) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ACTIVE, () => saveActiveFile({ announce: true }));
            return;
        }

        if (isSaveAllShortcut(e)) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ALL, () => saveAllFiles({ announce: true }));
            return;
        }

        if (isNewFileShortcut(e)) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_NEW, () => createFile());
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
            if (handleEditorTabIndent(e, { outdent: false })) {
                return;
            }
        }

        if (e.key === "Escape") {
            if (snippetSession) {
                clearSnippetSession();
            }
            if (editorCompletionOpen) {
                e.preventDefault();
                closeEditorCompletion();
            }
        }
    });

    el.editorCompletionList?.addEventListener("mousedown", (event) => {
        const button = event.target.closest("[data-completion-index]");
        if (!button) return;
        event.preventDefault();
        const index = Number(button.dataset.completionIndex);
        acceptEditorCompletion(index);
        editor.focus();
    });

    document.addEventListener("mousedown", (event) => {
        if (!editorCompletionOpen) return;
        const target = event.target;
        if (el.editorCompletion?.contains(target)) return;
        closeEditorCompletion();
    });

    // Buttons
    // Notes:
    // - Buttons call the same underlying actions as shortcuts where possible.
    el.btnRun.addEventListener("click", () => {
        executeRegisteredCommand(FOUNDATION_COMMAND_IDS.RUN_EXECUTE, () => run());
    });

    el.btnFormat.addEventListener("click", async () => {
        await formatCurrentEditor({ announce: true });
        editor.focus();
    });

    el.btnStop?.addEventListener("click", () => {
        stopSandboxRun();
        status.set("Sandbox stopped");
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
        ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" });
        ensureSandboxOpen("Sandbox opened for inspect.");
        toggleInspect();
    });
    el.btnInspectCopy?.addEventListener("click", async () => {
        ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" });
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
                if (target === "applications") {
                    setFilesAppsOpen(!layoutState.filesAppsOpen);
                }
                if (target === "lessons") {
                    setFilesLessonsOpen(!layoutState.filesLessonsOpen);
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
            if (action === "save-file") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ACTIVE, () => saveActiveFile({ announce: true }));
            if (action === "save-all") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ALL, () => saveAllFiles({ announce: true }));
            if (action === "export-workspace") exportWorkspace();
            if (action === "import-workspace") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.WORKSPACE_IMPORT, () => triggerWorkspaceImportPicker());
            if (action === "undo-action") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.HISTORY_UNDO, () => {
                if (!undoFileHistory()) {
                    undoLastDelete();
                }
            });
            if (action === "redo-action") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.HISTORY_REDO, () => redoFileHistory());
            if (action === "select-all") selectAllVisibleFiles();
            if (action === "clear-selection") clearFileSelection({ keepActive: true });
            if (action === "trash-selected") bulkTrashSelectedFiles();
            if (action === "move-selected") promptMoveSelectedEntries();
            if (action === "duplicate-selected") duplicateSelectedFiles();
            if (action === "pin-selected") bulkSetPinned(true);
            if (action === "unpin-selected") bulkSetPinned(false);
            if (action === "lock-selected") bulkSetLocked(true);
            if (action === "unlock-selected") bulkSetLocked(false);
            if (action === "new") executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_NEW, () => createFile());
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
        el.editorTabs.addEventListener("wheel", onEditorTabsWheel, { passive: false });
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
            const selectedFiles = Array.from(event.target.files || []);
            if (!selectedFiles.length) return;
            const workspaceJsonFiles = selectedFiles.filter((entry) => isWorkspaceJsonFile(entry));

            if (selectedFiles.length === 1 && workspaceJsonFiles.length === 1) {
                await tryImportWorkspaceOrFallback(workspaceJsonFiles[0]);
            } else {
                if (workspaceJsonFiles.length > 0) {
                    logger.append("warn", ["Multiple files selected with JSON; importing all as code files. Use single workspace JSON to replace workspace."]);
                }
                await importCodeFilesFromPicker(selectedFiles);
            }
            event.target.value = "";
        });
    }
    if (el.gamesSelectorToggle) {
        el.gamesSelectorToggle.addEventListener("click", () => {
            gamesSelectorOpen = !gamesSelectorOpen;
            syncGamesUI();
        });
    }
    if (el.gamesList) {
        el.gamesList.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-game-id]") : null;
            if (!target) return;
            const id = String(target.dataset.gameId || "");
            if (!id || id === selectedGameId) return;
            selectedGameId = id;
            syncGamesUI();
        });
        el.gamesList.addEventListener("keydown", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-game-id]") : null;
            if (!target) return;
            const options = Array.from(el.gamesList.querySelectorAll("[data-game-id]"));
            const index = options.indexOf(target);
            if (index === -1) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                const next = options[(index + delta + options.length) % options.length];
                next?.focus();
                return;
            }
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const id = String(target.dataset.gameId || "");
                if (!id || id === selectedGameId) return;
                selectedGameId = id;
                syncGamesUI();
            }
        });
    }
    if (el.appsSelectorToggle) {
        el.appsSelectorToggle.addEventListener("click", () => {
            applicationsSelectorOpen = !applicationsSelectorOpen;
            syncApplicationsUI();
        });
    }
    if (el.lessonsSelectorToggle) {
        el.lessonsSelectorToggle.addEventListener("click", () => {
            lessonsSelectorOpen = !lessonsSelectorOpen;
            syncLessonsUI();
        });
    }
    if (el.applicationsList) {
        el.applicationsList.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-application-id]") : null;
            if (!target) return;
            const id = String(target.dataset.applicationId || "");
            if (!id || id === selectedApplicationId) return;
            selectedApplicationId = id;
            syncApplicationsUI();
        });
        el.applicationsList.addEventListener("keydown", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-application-id]") : null;
            if (!target) return;
            const options = Array.from(el.applicationsList.querySelectorAll("[data-application-id]"));
            const index = options.indexOf(target);
            if (index === -1) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                const next = options[(index + delta + options.length) % options.length];
                next?.focus();
                return;
            }
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const id = String(target.dataset.applicationId || "");
                if (!id || id === selectedApplicationId) return;
                selectedApplicationId = id;
                syncApplicationsUI();
            }
        });
    }
    if (el.lessonsList) {
        el.lessonsList.addEventListener("click", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-lesson-id]") : null;
            if (!target) return;
            const id = String(target.dataset.lessonId || "");
            if (!id || id === selectedLessonId) return;
            selectedLessonId = id;
            syncLessonsUI();
        });
        el.lessonsList.addEventListener("keydown", (event) => {
            const target = event.target instanceof Element ? event.target.closest("[data-lesson-id]") : null;
            if (!target) return;
            const options = Array.from(el.lessonsList.querySelectorAll("[data-lesson-id]"));
            const index = options.indexOf(target);
            if (index === -1) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                const next = options[(index + delta + options.length) % options.length];
                next?.focus();
                return;
            }
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const id = String(target.dataset.lessonId || "");
                if (!id || id === selectedLessonId) return;
                selectedLessonId = id;
                syncLessonsUI();
            }
        });
    }
    if (el.gameLoad) {
        el.gameLoad.addEventListener("click", async () => {
            const id = selectedGameId;
            if (!id) return;
            await loadGameById(id, { runAfter: false });
        });
    }
    if (el.appLoad) {
        el.appLoad.addEventListener("click", async () => {
            const id = selectedApplicationId;
            if (!id) return;
            await loadApplicationById(id, { runAfter: false });
        });
    }
    if (el.lessonLoad) {
        el.lessonLoad.addEventListener("click", async () => {
            const id = selectedLessonId;
            if (!id) return;
            await loadLessonById(id, { startTyping: true, runAfter: false });
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
    if (el.btnToggleHeader) {
        el.btnToggleHeader.addEventListener("click", () => {
            setHeaderOpen(!layoutState.headerOpen);
        });
    }
    if (el.themeSelect) {
        el.themeSelect.addEventListener("change", (event) => {
            applyTheme(event.target.value, { source: "header" });
        });
    }
    el.btnClearDiagnostics.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
        diagnostics.clear();
    });
    el.btnToggleDiagnostics.addEventListener("click", () => {
        ensureToolsOpen("Tools opened for diagnostics.", { tab: "diagnostics" });
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
    if (el.layoutOrderTools) {
        el.layoutOrderTools.addEventListener("change", (event) => {
            setPanelOrder("tools", Number(event.target.value));
        });
    }
    const setPanelRowFromControl = (panel, value) => {
        const targetRow = String(value || "top") === "bottom" ? "bottom" : "top";
        const currentRow = getPanelRow(panel);
        const rows = layoutState.panelRows || { top: [], bottom: [] };
        const currentIndex = (rows[currentRow] || []).indexOf(panel);
        const targetWithoutPanel = (rows[targetRow] || []).filter((name) => name !== panel);
        const targetIndex = targetRow === currentRow
            ? Math.max(0, currentIndex)
            : targetWithoutPanel.length;
        movePanelToRow(panel, targetRow, targetIndex, { animatePanels: true });
    };
    if (el.layoutRowLog) {
        el.layoutRowLog.addEventListener("change", (event) => {
            setPanelRowFromControl("log", event.target.value);
        });
    }
    if (el.layoutRowEditor) {
        el.layoutRowEditor.addEventListener("change", (event) => {
            setPanelRowFromControl("editor", event.target.value);
        });
    }
    if (el.layoutRowFiles) {
        el.layoutRowFiles.addEventListener("change", (event) => {
            setPanelRowFromControl("files", event.target.value);
        });
    }
    if (el.layoutRowSandbox) {
        el.layoutRowSandbox.addEventListener("change", (event) => {
            setPanelRowFromControl("sandbox", event.target.value);
        });
    }
    if (el.layoutRowTools) {
        el.layoutRowTools.addEventListener("change", (event) => {
            setPanelRowFromControl("tools", event.target.value);
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
    if (el.layoutBottomHeight && el.layoutBottomHeightInput) {
        const apply = (value) => {
            const bounds = getLayoutBounds().bottomHeight;
            const next = clamp(Number(value), bounds.min, bounds.max);
            setBottomHeight(next);
            normalizeLayoutWidths();
            el.layoutBottomHeight.value = layoutState.bottomHeight;
            el.layoutBottomHeightInput.value = layoutState.bottomHeight;
            persistLayout();
        };
        el.layoutBottomHeight.addEventListener("input", (event) => apply(event.target.value));
        el.layoutBottomHeightInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutDockMagnet && el.layoutDockMagnetInput) {
        const apply = (value) => {
            const bounds = getLayoutBounds().dockMagnet;
            const next = clamp(Number(value), bounds.min, bounds.max);
            layoutState.dockMagnetDistance = next;
            el.layoutDockMagnet.value = layoutState.dockMagnetDistance;
            el.layoutDockMagnetInput.value = layoutState.dockMagnetDistance;
            persistLayout();
        };
        el.layoutDockMagnet.addEventListener("input", (event) => apply(event.target.value));
        el.layoutDockMagnetInput.addEventListener("change", (event) => apply(event.target.value));
    }
    if (el.layoutPanelAnimation) {
        el.layoutPanelAnimation.addEventListener("change", (event) => {
            layoutState.panelReflowAnimation = Boolean(event.target.checked);
            persistLayout();
        });
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
        if (isZoomInShortcut(e)) {
            e.preventDefault();
            adjustUiZoom(UI_ZOOM_STEP, { persist: true, announce: true });
            return;
        }
        if (isZoomOutShortcut(e)) {
            e.preventDefault();
            adjustUiZoom(-UI_ZOOM_STEP, { persist: true, announce: true });
            return;
        }
        if (isZoomResetShortcut(e)) {
            e.preventDefault();
            resetUiZoom({ persist: true, announce: true });
            return;
        }
        if (promptDialogOpen) {
            if (e.key === "Escape") {
                e.preventDefault();
                cancelPromptDialog();
            }
            return;
        }
        if (tutorialState.active) {
            if (e.key === "Escape") {
                e.preventDefault();
                closeBeginnerTutorial({ markSeen: true, tutorialId: tutorialState.tutorialId });
                status.set("Tutorial skipped");
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
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.SEARCH_COMMAND_PALETTE, () => openCommandPalette());
            return;
        }
        if (isQuickOpenShortcut(e)) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.SEARCH_QUICK_OPEN, () => openQuickOpen());
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
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ALL, () => saveAllFiles({ announce: true }));
            return;
        }
        if (isSaveShortcut(e) && !editorFocused) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_SAVE_ACTIVE, () => saveActiveFile({ announce: true }));
            return;
        }
        if (isNewFileShortcut(e) && !editorFocused) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.FILE_NEW, () => createFile());
            return;
        }
        if (isUndoShortcut(e) && !editorFocused) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.HISTORY_UNDO, () => {
                if (!undoFileHistory()) {
                    undoLastDelete();
                }
            });
            return;
        }
        if (isRedoShortcut(e) && !editorFocused) {
            e.preventDefault();
            executeRegisteredCommand(FOUNDATION_COMMAND_IDS.HISTORY_REDO, () => redoFileHistory());
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
        if (e.key === "Escape" && lessonStatsOpen) {
            e.preventDefault();
            closeLessonStats({ focusEditor: true });
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
        if (tutorialState.active && tutorialState.keepFilesMenuOpen && openFileMenu === "header") return;
        const target = event.target;
        if (target.closest("#filesMenu") || target.closest("#fileRowMenu") || target.closest("#fileFolderMenu")) return;
        if (target.closest("[data-file-menu]") || target.closest("[data-folder-menu]")) return;
        if (target.closest("#filesMenuButton")) return;
        closeFileMenus();
    });

    window.addEventListener("resize", () => {
        queueLayoutResizeSync();
    });
    window.addEventListener("beforeunload", (event) => {
        if (persistenceWritesLocked) return;
        flushEditorAutosave();
        if (hasDirtyFiles()) {
            event.preventDefault();
            event.returnValue = "";
        }
    });
    window.addEventListener("pagehide", () => {
        if (persistenceWritesLocked) return;
        flushEditorAutosave();
        setSessionState(false);
    });

    renderInspectDetails(null);
    queueEditorLint("boot");
    // UX: start with cursor ready
    editor.focus();
}

function resolveRunSource(code = "", activeFile = null, workspaceResolver = null) {
    const entryName = activeFile?.name || FILE_DEFAULT_NAME;
    const activeLanguage = detectLanguageFromFileName(entryName);
    let runnableSource = applyBreakpointsToCode(code);
    let sandboxMode = "javascript";

    if (activeLanguage === "html") {
        const resolver = workspaceResolver || createWorkspaceAssetResolver(files);
        runnableSource = resolver.buildHtmlFromWorkspace(code, entryName);
        sandboxMode = "html";
    } else if (activeLanguage === "css") {
        runnableSource = buildCssPreviewHtml(code);
        sandboxMode = "html";
    }

    return {
        entryName,
        runnableSource,
        sandboxMode,
    };
}

function launchStandardSandboxRun(runnableSource, sandboxMode) {
    runInSandbox(getRunnerFrame(), runnableSource, currentToken, {
        mode: sandboxMode,
        runContext: currentRunContext,
    });
    const tokenAtRun = currentToken;
    sandboxRunReadyTimer = setTimeout(() => {
        if (currentToken !== tokenAtRun) return;
        markSandboxReady();
    }, SANDBOX_READY_FALLBACK_MS);
    ensureSandboxOpen("Sandbox opened for run.");

    if (inspectEnabled) {
        setTimeout(() => sendInspectCommand("inspect_enable"), 0);
    }
    if (debugMode && debugWatches.length) {
        setTimeout(() => requestDebugWatchValues(), 80);
    }

    status.set("Ran");
}

function beginRunSession(sandboxMode) {
    runCount += 1;
    currentRunContext = makeRunContext();
    currentToken = currentRunContext.token;

    ensureLogOpen("Console opened for new run.");
    status.set("Running...");
    setHealth(health.sandbox, "warn", "Sandbox: Running");
    logger.append("system", [`-- Run #${runCount} --`]);
    logger.append("system", [`Run context: ${buildRunContextLabel(currentRunContext)}`]);
    if (debugMode) {
        logger.append("system", [`Debug mode on • ${debugBreakpoints.size} breakpoint(s)`]);
    }
    lastRuntimeJumpTarget = null;
    updateConsoleJumpLastErrorButton();
    pendingConsoleEvalRequestId = 0;
    setConsoleInputBusy(false);
}

function run() {
    // Pull current editor contents and execute inside sandbox iframe.
    const code = editor.get();
    updateActiveFileCode(code);
    const activeFile = getActiveFile();
    const entryName = activeFile?.name || FILE_DEFAULT_NAME;
    const workspaceResolver = createWorkspaceAssetResolver(files);
    const runPayload = resolveRunSource(code, activeFile, workspaceResolver);
    const runnableSource = runPayload.runnableSource;
    const sandboxMode = runPayload.sandboxMode;
    currentRunFileId = activeFileId;
    beginRunSession(sandboxMode);

    try {
        clearSandboxReadyTimer();

        launchStandardSandboxRun(runnableSource, sandboxMode);
    } catch (err) {
        // If writing the iframe fails (rare), surface it in the log.
        clearSandboxReadyTimer();
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
    if (!isSandboxMessageForCurrentRun(data, currentToken)) return;
    if (!isTrustedSandboxMessageEvent(event, {
        runnerWindow: getRunnerWindow(),
        currentOrigin: window.location.origin,
    })) return;

    // Token gate: ignore older runs/noise
    // Notes:
    // - If user runs again quickly, old iframe messages can still arrive.
    // - Token gating keeps the console panel "current run only".
    if (data.type === "bridge_ready") {
        const bridgeContext = normalizeRunContext(data?.runContext || data?.payload?.runContext);
        if (bridgeContext && bridgeContext.token === currentToken) {
            currentRunContext = bridgeContext;
        }
        markSandboxReady();
        return;
    }

    if (data.type === "bridge_error") {
        const message = String(data?.payload?.message || "Unknown bridge error");
        logger.append("warn", [`Sandbox bridge warning: ${message}`]);
        return;
    }

    // Console forwarding
    if (data.type === "console") {
        // payload: { level, args }
        const safeConsole = normalizeSandboxConsolePayload(data.payload, {
            maxArgs: SANDBOX_CONSOLE_MAX_ARGS,
            argMaxChars: SANDBOX_CONSOLE_ARG_MAX_CHARS,
        });
        queueSandboxConsoleLog(safeConsole.level, safeConsole.args);
        return;
    }

    if (data.type === "inspect_update") {
        ensureToolsOpen("Tools opened for inspect.", { tab: "inspect" });
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

    if (data.type === "console_eval_result") {
        applyConsoleEvalResult(data.payload);
        return;
    }

    // Synchronous/runtime errors
    if (data.type === "runtime_error") {
        // payload: { message , filename, lineno, colno }
        const normalized = normalizeRuntimeErrorPayload(data.payload, {
            messageMaxChars: SANDBOX_RUNTIME_MESSAGE_MAX_CHARS,
            filenameMaxChars: 180,
        });
        ensureLogOpen("Console opened for runtime error.");
        logger.append("error", [normalized.formatted]);
        const fileName = getFileById(currentRunFileId)?.name || getActiveFile()?.name || "";
        lastRuntimeJumpTarget = currentRunFileId
            ? {
                fileId: currentRunFileId,
                line: normalized.lineNo > 0 ? normalized.lineNo - 1 : 0,
                ch: normalized.colNo > 0 ? normalized.colNo - 1 : 0,
            }
            : null;
        updateConsoleJumpLastErrorButton();
        pushRuntimeProblem({
            message: normalized.formatted,
            fileId: currentRunFileId,
            fileName,
            line: normalized.lineNo > 0 ? normalized.lineNo - 1 : null,
            ch: normalized.colNo > 0 ? normalized.colNo - 1 : null,
            endCh: normalized.colNo > 0 ? normalized.colNo : null,
            level: "error",
            kind: "runtime",
        });
        clearSandboxReadyTimer();
        status.set("Error");
        return;
    }

    // Async errors (unhandled promise rejection)
    if (data.type === "promise_rejection") {
        const normalized = normalizePromiseRejectionPayload(data.payload, {
            reasonMaxChars: SANDBOX_PROMISE_REASON_MAX_CHARS,
        });
        ensureLogOpen("Console opened for promise rejection.");
        logger.append("error", [normalized.formatted]);
        const fileName = getFileById(currentRunFileId)?.name || getActiveFile()?.name || "";
        lastRuntimeJumpTarget = currentRunFileId
            ? {
                fileId: currentRunFileId,
                line: 0,
                ch: 0,
            }
            : null;
        updateConsoleJumpLastErrorButton();
        pushRuntimeProblem({
            message: normalized.formatted,
            fileId: currentRunFileId,
            fileName,
            level: "error",
            kind: "promise",
        });
        clearSandboxReadyTimer();
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
