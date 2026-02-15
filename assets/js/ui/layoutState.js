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
    filesOpenEditorsOpen: true,
    filesListOpen: true,
    filesTrashOpen: false,
};

export const LAYOUT_PRESETS = {
    studio: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
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
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
    },
    focus: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
        logOpen: false,
        editorOpen: true,
        filesOpen: false,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 280,
        sidebarWidth: 220,
        sandboxWidth: 360,
        toolsWidth: 300,
        bottomHeight: 220,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: false,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
    },
    review: {
        panelRows: { top: ["files", "editor", "log", "sandbox"], bottom: [] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 360,
        sidebarWidth: 240,
        sandboxWidth: 400,
        toolsWidth: 320,
        bottomHeight: 260,
        panelGap: 0,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
    },
    wide: {
        panelRows: { top: ["files", "editor", "sandbox", "tools"], bottom: ["log"] },
        logOpen: true,
        editorOpen: true,
        filesOpen: true,
        sandboxOpen: true,
        toolsOpen: false,
        logWidth: 360,
        sidebarWidth: 280,
        sandboxWidth: 460,
        toolsWidth: 360,
        bottomHeight: 240,
        panelGap: 2,
        panelRadius: 0,
        headerOpen: true,
        footerOpen: true,
        filesFiltersOpen: false,
        filesGamesOpen: true,
        filesOpenEditorsOpen: true,
        filesListOpen: true,
        filesTrashOpen: false,
    },
};

const ALL_PANELS = ["files", "editor", "sandbox", "log", "tools"];

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

export function cloneLayoutState(state = DEFAULT_LAYOUT_STATE) {
    return {
        ...state,
        panelRows: normalizePanelRows(state.panelRows),
    };
}