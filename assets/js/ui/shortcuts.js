// assets/js/ui/shortcuts.js
// Keyboard shortcuts used in FAZ IDE.
//
// Notes:
// - These helpers only DETECT shortcuts; they don't call preventDefault().
//   The caller should decide when to prevent default browser behavior.
// - `metaKey` is Cmd on macOS. Using ctrlKey || metaKey keeps shortcuts cross-platform.
// - `e.key` is used (not keyCode) for modern, readable keyboard handling.
// - We handle both lowercase/uppercase because Shift can change key output in some cases.

export function isModKey(e) {
    // "Modifier" means Ctrl (Windows/Linux) or Command (macOS).
    return e.ctrlKey || e.metaKey; // Ctrl (Win/Linux) or Cmd (macOS)
};

export function isRunShortcut(e) {
    // Run code: Ctrl/Cmd + Enter
    return isModKey(e) && e.key === "Enter"; // Ctrl/Cmd + Enter
};

export function isSaveShortcut(e) {
    // Save: Ctrl/Cmd + S
    // Note: Browsers also use this for "Save page" - callers usually preventDefault().
    return isModKey(e) && (e.key === "s" || e.key === "S"); // Ctrl/Cmd + S
};

export function isClearLogShortcut(e) {
    // Clear output/log: Ctrl/Cmd + L
    // Note: Browsers often use Ctrl+L for address bar focus - callers typically preventDefault()
    // only when FAZ IDE has focus (e.g., editor/panel active) to avoid hijacking the browser.
    return isModKey(e) && (e.key === "l" || e.key === "L"); // Ctrl/Cmd + L
};

export function isSaveAllShortcut(e) {
    return isModKey(e) && e.shiftKey && (e.key === "s" || e.key === "S");
};

export function isNewFileShortcut(e) {
    return isModKey(e) && !e.shiftKey && (e.key === "n" || e.key === "N");
};

export function isUndoShortcut(e) {
    return isModKey(e) && !e.shiftKey && (e.key === "z" || e.key === "Z");
};

export function isRedoShortcut(e) {
    const modY = isModKey(e) && !e.shiftKey && (e.key === "y" || e.key === "Y");
    const modShiftZ = isModKey(e) && e.shiftKey && (e.key === "z" || e.key === "Z");
    return modY || modShiftZ;
};

export function isQuickOpenShortcut(e) {
    return isModKey(e) && !e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P");
};

export function isCommandPaletteShortcut(e) {
    return isModKey(e) && e.shiftKey && !e.altKey && (e.key === "p" || e.key === "P");
};

export function isFindShortcut(e) {
    return isModKey(e) && !e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F");
};

export function isReplaceShortcut(e) {
    return isModKey(e) && !e.shiftKey && !e.altKey && (e.key === "h" || e.key === "H");
};

export function isGoToLineShortcut(e) {
    return isModKey(e) && !e.shiftKey && !e.altKey && (e.key === "g" || e.key === "G");
};

export function isSymbolShortcut(e) {
    return isModKey(e) && e.shiftKey && !e.altKey && (e.key === "o" || e.key === "O");
};

export function isProjectSearchShortcut(e) {
    return isModKey(e) && e.shiftKey && !e.altKey && (e.key === "f" || e.key === "F");
};

export function isAddCursorDownShortcut(e) {
    return isModKey(e) && e.altKey && !e.shiftKey && e.key === "ArrowDown";
};

export function isAddCursorUpShortcut(e) {
    return isModKey(e) && e.altKey && !e.shiftKey && e.key === "ArrowUp";
};

export function isToggleCommentShortcut(e) {
    const key = String(e.key || "");
    return isModKey(e) && !e.shiftKey && !e.altKey && (key === "/" || key === "?");
};

export function isMoveLineDownShortcut(e) {
    return !isModKey(e) && e.altKey && !e.shiftKey && e.key === "ArrowDown";
};

export function isMoveLineUpShortcut(e) {
    return !isModKey(e) && e.altKey && !e.shiftKey && e.key === "ArrowUp";
};

export function isDuplicateLineDownShortcut(e) {
    return !isModKey(e) && e.altKey && e.shiftKey && e.key === "ArrowDown";
};

export function isDuplicateLineUpShortcut(e) {
    return !isModKey(e) && e.altKey && e.shiftKey && e.key === "ArrowUp";
};

export function isDeleteLineShortcut(e) {
    return isModKey(e) && e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K");
};

export function isSelectNextOccurrenceShortcut(e) {
    return isModKey(e) && !e.shiftKey && !e.altKey && (e.key === "d" || e.key === "D");
};
