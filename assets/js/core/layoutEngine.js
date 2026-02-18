const ROW_NAMES = ["top", "bottom"];

function oppositeRow(rowName) {
    return rowName === "top" ? "bottom" : "top";
}

function getOpenPanels(rowPanels = [], isPanelOpen = () => true) {
    return rowPanels.filter((panel) => isPanelOpen(panel));
}

function countOpenPanels(rows, rowName, isPanelOpen) {
    return getOpenPanels(rows?.[rowName] || [], isPanelOpen).length;
}

function pickOverflowPanel(rowPanels = [], isPanelOpen, preservePanel = null) {
    const reversed = [...rowPanels].reverse();
    const preferred = reversed.find((panel) => isPanelOpen(panel) && panel !== "editor" && panel !== preservePanel);
    if (preferred) return preferred;
    const fallback = reversed.find((panel) => isPanelOpen(panel) && panel !== preservePanel);
    if (fallback) return fallback;
    return reversed.find((panel) => isPanelOpen(panel)) || null;
}

function movePanel(rows, sourceRow, targetRow, panel) {
    rows[sourceRow] = (rows[sourceRow] || []).filter((name) => name !== panel);
    const targetOrder = (rows[targetRow] || []).filter((name) => name !== panel);
    const insertionIndex = targetRow === "bottom" ? targetOrder.length : 0;
    targetOrder.splice(insertionIndex, 0, panel);
    rows[targetRow] = targetOrder;
}

function enforceRowCaps(rows, {
    isPanelOpen,
    maxOpenPerRow,
    preferredRow = null,
    preservePanel = null,
    maxPasses = 12,
}) {
    const nextRows = rows;
    for (let pass = 0; pass < maxPasses; pass += 1) {
        const topOpen = countOpenPanels(nextRows, "top", isPanelOpen);
        const bottomOpen = countOpenPanels(nextRows, "bottom", isPanelOpen);
        if (topOpen <= maxOpenPerRow && bottomOpen <= maxOpenPerRow) break;

        const rowName = topOpen > maxOpenPerRow ? "top" : "bottom";
        const targetRow = oppositeRow(rowName);
        const preserve = rowName === preferredRow ? preservePanel : null;
        const overflowPanel = pickOverflowPanel(nextRows[rowName] || [], isPanelOpen, preserve);
        if (!overflowPanel) break;
        movePanel(nextRows, rowName, targetRow, overflowPanel);
    }
    return nextRows;
}

function enforceRowWidthFit(rows, {
    isPanelOpen,
    rowWidthByName,
    panelGap,
    getPanelMinWidth,
    maxPasses = 16,
}) {
    const getRowMinRequired = (nextRows, rowName) => {
        const rowPanels = nextRows[rowName] || [];
        const openPanels = getOpenPanels(rowPanels, isPanelOpen);
        if (!openPanels.length) return 0;
        const gapCount = Math.max(0, openPanels.length - 1) * 2;
        const gapTotal = gapCount * (panelGap || 0);
        return openPanels.reduce(
            (sum, panel) => sum + Math.max(0, Number(getPanelMinWidth(panel)) || 0),
            gapTotal
        );
    };

    const getRowOverflow = (nextRows, rowName) => {
        const rowWidth = Number(rowWidthByName?.[rowName] || 0);
        if (!Number.isFinite(rowWidth) || rowWidth <= 0) return 0;
        return Math.max(0, getRowMinRequired(nextRows, rowName) - rowWidth);
    };

    const getTotalOverflow = (nextRows) => {
        const top = getRowOverflow(nextRows, "top");
        const bottom = getRowOverflow(nextRows, "bottom");
        return top + bottom;
    };

    const nextRows = rows;
    for (let pass = 0; pass < maxPasses; pass += 1) {
        const topOverflow = getRowOverflow(nextRows, "top");
        const bottomOverflow = getRowOverflow(nextRows, "bottom");
        if (topOverflow <= 0.5 && bottomOverflow <= 0.5) break;

        const sourceRow = topOverflow >= bottomOverflow ? "top" : "bottom";
        const targetRow = oppositeRow(sourceRow);
        const sourceOpenPanels = getOpenPanels(nextRows[sourceRow] || [], isPanelOpen);
        if (sourceOpenPanels.length <= 1) break;

        const preserve = sourceOpenPanels.includes("editor") ? "editor" : null;
        const overflowPanel = pickOverflowPanel(nextRows[sourceRow] || [], isPanelOpen, preserve);
        if (!overflowPanel) break;

        const beforeOverflow = getTotalOverflow(nextRows);
        const simulatedRows = {
            top: [...(nextRows.top || [])],
            bottom: [...(nextRows.bottom || [])],
        };
        movePanel(simulatedRows, sourceRow, targetRow, overflowPanel);
        const afterOverflow = getTotalOverflow(simulatedRows);

        if (afterOverflow + 0.5 >= beforeOverflow) {
            break;
        }

        movePanel(nextRows, sourceRow, targetRow, overflowPanel);
    }
    return nextRows;
}

export function solvePanelRows({
    rows,
    normalizeRows,
    isPanelOpen,
    rowWidthByName,
    panelGap = 0,
    getPanelMinWidth = () => 0,
    maxOpenPerRow = 3,
    preferredRow = null,
    preservePanel = null,
    widthFit = true,
}) {
    const normalize = typeof normalizeRows === "function"
        ? normalizeRows
        : (value) => ({ top: Array.isArray(value?.top) ? [...value.top] : [], bottom: Array.isArray(value?.bottom) ? [...value.bottom] : [] });
    const openCheck = typeof isPanelOpen === "function" ? isPanelOpen : () => true;

    const nextRows = normalize(rows);

    enforceRowCaps(nextRows, {
        isPanelOpen: openCheck,
        maxOpenPerRow,
        preferredRow,
        preservePanel,
    });

    if (widthFit) {
        enforceRowWidthFit(nextRows, {
            isPanelOpen: openCheck,
            rowWidthByName,
            panelGap,
            getPanelMinWidth,
        });
        enforceRowCaps(nextRows, {
            isPanelOpen: openCheck,
            maxOpenPerRow,
            preferredRow,
            preservePanel,
        });
    }

    return nextRows;
}
