export const DEFAULT_LAYOUT_STATE = {
    panelRows: {
        top: ["files", "editor", "sandbox", "tools"],
        bottom: ["log"],
    },
    logOpen: true,
    editorOpen: true,
    filesOpen: true,
    sandboxOpen: true,
    toolsOpen: false,
    logWidth: 320,
    sidebarWidth: 200,
    sandboxWidth: 360,
    toolsWidth: 320,
    bottomHeight: 240,
    panelGap: 0,
    panelRadius: 0,
    headerOpen: true,
    footerOpen: true,
    filesFiltersOpen: false,
    filesGamesOpen: true,
    filesAppsOpen: true,
    filesOpenEditorsOpen: true,
    filesListOpen: true,
    filesTrashOpen: false,
    filesSectionOrder: ["open-editors", "files", "games", "applications"],
};

export const LAYOUT_PRESETS = {
    studio: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 340,
        sidebarWidth: 220,
        sandboxWidth: 380,
        toolsWidth: 320,
        bottomHeight: 250,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    focus: {
        panelRows: { top: ["editor", "files", "sandbox", "tools"], bottom: ["log"] },
        logOpen: false,
        editorOpen: true,
        filesOpen: false,
        sandboxOpen: false,
        toolsOpen: false,
        logWidth: 300,
        sidebarWidth: 220,
        sandboxWidth: 400,
        toolsWidth: 300,
        bottomHeight: 210,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: false,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    review: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: false,
        toolsOpen: false,
        logWidth: 420,
        sidebarWidth: 240,
        sandboxWidth: 420,
        toolsWidth: 320,
        bottomHeight: 300,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    wide: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 380,
        sidebarWidth: 260,
        sandboxWidth: 500,
        toolsWidth: 360,
        bottomHeight: 230,
        panelGap: 2,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    debug: {
        panelRows: { top: ["files", "editor", "tools", "sandbox"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: true,
        logWidth: 420,
        sidebarWidth: 220,
        sandboxWidth: 340,
        toolsWidth: 420,
        bottomHeight: 320,
        panelGap: 2,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    zen: {
        panelRows: { top: ["editor", "sandbox", "files", "tools"], bottom: ["log"] },
        logOpen: false,
        editorOpen: true,
        filesOpen: false,
        sandboxOpen: false,
        toolsOpen: false,
        logWidth: 300,
        sidebarWidth: 200,
        sandboxWidth: 420,
        toolsWidth: 320,
        bottomHeight: 200,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: false,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    sandbox: {
        panelRows: { top: ["editor", "sandbox", "files", "tools"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 340,
        sidebarWidth: 200,
        sandboxWidth: 560,
        toolsWidth: 320,
        bottomHeight: 240,
        panelGap: 1,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
    diagnostics: {
        panelRows: { top: ["files", "editor", "tools", "sandbox"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: false,
        toolsOpen: true,
        logWidth: 460,
        sidebarWidth: 220,
        sandboxWidth: 360,
        toolsWidth: 460,
        bottomHeight: 340,
        panelGap: 2,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesAppsOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
        filesSectionOrder: ["open-editors", "files", "games", "applications"],
    },
};

const ALL_PANELS = ["files", "editor", "sandbox", "log", "tools"];
const ALL_FILES_SECTIONS = ["games", "applications", "open-editors", "files"];

export function normalizePanelRows(rows) {
    const top = Array.isArray(rows?.top) ? rows.top : [];
    const bottom = Array.isArray(rows?.bottom) ? rows.bottom : [];
    const seen = new Set();
    const cleanTop = [];
    const cleanBottom = [];
    const pushUnique = (list, target) => {
        list.forEach((name) => {
            if (!ALL_PANELS.includes(name)) return;
            if (seen.has(name)) return;
            seen.add(name);
            target.push(name);
        });
    };
    pushUnique(top, cleanTop);
    pushUnique(bottom, cleanBottom);
    ALL_PANELS.forEach((name) => {
        if (!seen.has(name)) cleanTop.push(name);
    });
    return { top: cleanTop, bottom: cleanBottom };
}

export function normalizeFilesSectionOrder(order) {
    const source = Array.isArray(order) ? order : [];
    const seen = new Set();
    const normalized = [];
    source.forEach((entry) => {
        if (!ALL_FILES_SECTIONS.includes(entry)) return;
        if (seen.has(entry)) return;
        seen.add(entry);
        normalized.push(entry);
    });
    ALL_FILES_SECTIONS.forEach((entry) => {
        if (!seen.has(entry)) normalized.push(entry);
    });
    return normalized;
}

export function cloneLayoutState(state = DEFAULT_LAYOUT_STATE) {
    return {
        ...state,
        panelRows: normalizePanelRows(state.panelRows),
        filesSectionOrder: normalizeFilesSectionOrder(state.filesSectionOrder),
    };
}
