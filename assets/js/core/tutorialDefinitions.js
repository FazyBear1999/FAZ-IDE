export const DEFAULT_TUTORIAL_ID = "beginner";
export const TUTORIAL_FORCE_START_STORAGE_KEY = "fazide.tutorial.force-start-once.v1";

function validateTutorialStep(step = {}, { tutorialId = DEFAULT_TUTORIAL_ID, index = 0 } = {}) {
    const id = String(step?.id || "").trim();
    const title = String(step?.title || "").trim();
    const body = String(step?.body || "").trim();
    const target = String(step?.target || "").trim();
    if (!id || !title || !body || !target) {
        throw new Error(`Invalid tutorial step at ${tutorialId}[${index}]`);
    }

    const reveal = step?.reveal && typeof step.reveal === "object"
        ? { ...step.reveal }
        : undefined;

    const actionKeys = Array.isArray(step?.actionKeys)
        ? step.actionKeys.map((entry) => String(entry || "").trim()).filter(Boolean)
        : [];

    return {
        id,
        title,
        body,
        target,
        reveal,
        actionKeys,
    };
}

function materializeSteps(rawSteps = [], actionMap = {}, tutorialId = DEFAULT_TUTORIAL_ID) {
    const safeActionMap = actionMap && typeof actionMap === "object" ? actionMap : {};
    return Object.freeze(
        rawSteps.map((rawStep, index) => {
            const normalized = validateTutorialStep(rawStep, { tutorialId, index });
            const onEnter = normalized.actionKeys.length
                ? () => {
                    normalized.actionKeys.forEach((actionKey) => {
                        const handler = safeActionMap[actionKey];
                        if (typeof handler === "function") {
                            handler();
                        }
                    });
                }
                : undefined;
            return Object.freeze({
                id: normalized.id,
                title: normalized.title,
                body: normalized.body,
                target: normalized.target,
                reveal: normalized.reveal,
                onEnter,
            });
        })
    );
}

function buildBeginnerSteps() {
    return [
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
            actionKeys: ["panel.files.open", "files.section.main.open", "welcome.focus"],
        },
        {
            id: "file-actions-menu",
            title: "Files Actions",
            body: "This opens the View section where you can enable or disable file-system tabs and tools you need (or hide what you do not).",
            target: "#filesMenu [aria-label=\"View actions\"] .files-menu-grid",
            reveal: { filesMenuView: true },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "files-tab-open-editors",
            title: "Files Tab: Open Editors",
            body: "Open Editors lists files currently open in the editor for quick switching.",
            target: "#fileList [data-file-section=\"open-editors\"]",
            reveal: { filesTabFocus: "open-editors" },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "files-tab-files",
            title: "Files Tab: Files",
            body: "Files is your main workspace tree. Next, we continue to the Editor where you'll write and run code.",
            target: "#fileList [data-file-section=\"files\"]",
            reveal: { filesTabFocus: "files" },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "files-tab-games",
            title: "Files Tab: Games",
            body: "This Games tab in the file system opens the game library section.",
            target: "#filesGames",
            reveal: { filesTabFocus: "games" },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "files-tab-apps",
            title: "Files Tab: Applications",
            body: "This Applications tab opens built-in app templates and runtime examples.",
            target: "#filesApps",
            reveal: { filesTabFocus: "applications" },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "files-tab-lessons",
            title: "Files Tab: Lessons",
            body: "This Lessons tab opens guided coding lessons with progress tracking.",
            target: "#filesLessons",
            reveal: { filesTabFocus: "lessons" },
            actionKeys: ["panel.files.open"],
        },
        {
            id: "editor",
            title: "Editor",
            body: "Write and edit code here. Use shortcuts like Ctrl/Cmd+S to save and Ctrl/Cmd+Enter to run.",
            target: "#editorPanel",
            actionKeys: ["panel.editor.open", "welcome.focus"],
        },
        {
            id: "editor-tabs",
            title: "Open File Tabs",
            body: "Tabs show your currently open files, so you can move between files quickly.",
            target: "#editorTabs",
            actionKeys: ["panel.editor.open"],
        },
        {
            id: "run",
            title: "Run",
            body: "Press Run to execute your active file in the sandbox safely.",
            target: "#run",
            actionKeys: ["panel.sandbox.open"],
        },
        {
            id: "format",
            title: "Format",
            body: "Format keeps your active file clean and consistent before running or saving.",
            target: "#format",
            actionKeys: ["panel.editor.open"],
        },
        {
            id: "editor-tools",
            title: "Editor Tools",
            body: "These buttons open Find, Symbols, Project Search, Split view, History, and Settings workflows.",
            target: ".editor-pro-buttons",
            actionKeys: ["panel.editor.open"],
        },
        {
            id: "sandbox",
            title: "Sandbox Preview",
            body: "Now the Welcome project runs in the sandbox so you can see your first live output in FAZ IDE.",
            target: "#runnerShell",
            actionKeys: ["panel.sandbox.open", "welcome.run"],
        },
        {
            id: "sandbox-actions",
            title: "Sandbox Actions",
            body: "Pop out for a separate window or expand for a larger local preview.",
            target: "#popoutSandbox",
            reveal: { sandboxActions: true },
            actionKeys: ["panel.sandbox.open"],
        },
        {
            id: "console",
            title: "Console",
            body: "Console shows logs, warnings, and errors from your runs.",
            target: "#logPanel",
            actionKeys: ["panel.log.open"],
        },
        {
            id: "console-actions",
            title: "Console Actions",
            body: "Use Copy and Clear to manage output while debugging run-by-run.",
            target: "#copyLog",
            actionKeys: ["panel.log.open"],
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
            actionKeys: ["search.demo.start"],
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
            id: "lessons-button",
            title: "Lessons Button",
            body: "Use Lessons to open progress, streak, and theme unlock stats right from the top header.",
            target: "#lessonStatsBtn",
            actionKeys: ["header.open"],
        },
        {
            id: "status",
            title: "Status",
            body: "Status shows what the IDE is doing. Use it as a quick health signal while working.",
            target: "#statusText",
            actionKeys: ["footer.open"],
        },
        {
            id: "footer-runtime",
            title: "Footer Runtime Signals",
            body: "Footer runtime indicators summarize editor, sandbox, problems, storage, and zoom at a glance.",
            target: "#footerRuntimeStatus",
            actionKeys: ["footer.open"],
        },
        {
            id: "footer-editor",
            title: "Footer Editor Signals",
            body: "Editor footer stats track file name, cursor position, selection, and save state while coding.",
            target: "#footerEditorStatus",
            actionKeys: ["footer.open"],
        },
    ];
}

export function buildTutorialDefinitions({ actionMap = {} } = {}) {
    return Object.freeze({
        beginner: Object.freeze({
            id: "beginner",
            label: "Beginner Tutorial",
            seenKey: "fazide.tutorial.beginner.seen.v1",
            completeMessage: "Beginner tutorial complete. Use 'tutorial start beginner' in Dev Terminal to view it again.",
            steps: materializeSteps(buildBeginnerSteps(), actionMap, "beginner"),
        }),
    });
}

export function getTutorialIdsFromDefinitions(definitions = {}) {
    return Object.keys(definitions || {});
}

export function normalizeTutorialIdFromDefinitions(definitions = {}, value = "", fallback = DEFAULT_TUTORIAL_ID) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw && definitions?.[raw]) return raw;
    return fallback;
}

export function getTutorialDefinitionFromDefinitions(definitions = {}, tutorialId = DEFAULT_TUTORIAL_ID, fallback = DEFAULT_TUTORIAL_ID) {
    const resolvedId = normalizeTutorialIdFromDefinitions(definitions, tutorialId, fallback);
    return definitions?.[resolvedId] || definitions?.[fallback] || null;
}
