const LAYOUT_VERSION = 1;

function normalizeRatio(value, fallback = 1) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
    return numeric;
}

function normalizePanelId(value) {
    return String(value || "").trim();
}

function normalizePanelList(values = []) {
    const list = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];
    list.forEach((entry) => {
        const id = normalizePanelId(entry);
        if (!id || seen.has(id)) return;
        seen.add(id);
        normalized.push(id);
    });
    return normalized;
}

function normalizeStack(stack, fallbackId = "stack") {
    const id = normalizePanelId(stack?.id) || fallbackId;
    const panels = normalizePanelList(stack?.panels);
    const activePanelId = panels.includes(stack?.activePanelId)
        ? stack.activePanelId
        : (panels[0] || null);
    return {
        id,
        heightRatio: normalizeRatio(stack?.heightRatio, 1),
        panels,
        activePanelId,
    };
}

function normalizeColumn(column, fallbackId = "column") {
    const id = normalizePanelId(column?.id) || fallbackId;
    const stacks = Array.isArray(column?.stacks)
        ? column.stacks.map((stack, idx) => normalizeStack(stack, `${id}-stack-${idx + 1}`)).filter((stack) => stack.panels.length)
        : [];
    return {
        id,
        widthRatio: normalizeRatio(column?.widthRatio, 1),
        stacks,
    };
}

export function rowsToPanelLayout(rows) {
    const top = normalizePanelList(rows?.top);
    const bottom = normalizePanelList(rows?.bottom);
    return {
        version: LAYOUT_VERSION,
        columns: [
            {
                id: "main",
                widthRatio: 1,
                stacks: [
                    {
                        id: "main-top",
                        heightRatio: 1,
                        panels: top,
                        activePanelId: top[0] || null,
                    },
                    {
                        id: "main-bottom",
                        heightRatio: 0.35,
                        panels: bottom,
                        activePanelId: bottom[0] || null,
                    },
                ],
            },
        ],
    };
}

export function panelLayoutToRows(layout) {
    const normalized = normalizePanelLayout(layout);
    const main = normalized.columns[0] || { stacks: [] };
    const topStack = main.stacks[0] || { panels: [] };
    const bottomStack = main.stacks[1] || { panels: [] };
    return {
        top: normalizePanelList(topStack.panels),
        bottom: normalizePanelList(bottomStack.panels),
    };
}

export function normalizePanelLayout(layout, { fallbackRows = null } = {}) {
    const fallback = rowsToPanelLayout(fallbackRows || { top: [], bottom: [] });
    const sourceColumns = Array.isArray(layout?.columns) ? layout.columns : fallback.columns;
    const columns = sourceColumns
        .map((column, index) => normalizeColumn(column, `column-${index + 1}`))
        .filter((column) => column.stacks.length);

    if (!columns.length) {
        return fallback;
    }

    return {
        version: Number.isFinite(Number(layout?.version)) ? Number(layout.version) : LAYOUT_VERSION,
        columns,
    };
}
