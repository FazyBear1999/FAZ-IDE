// assets/js/config.js
// FAZ IDE (v0) configuration.
// Keep ALL keys + defaults here.
//
// Notes:
// - This file is intentionally "dumb": only constants + defaults.
// - Import these values elsewhere; do not mutate them at runtime.
// - Update VERSION + STORAGE keys together when you make breaking changes.


export const APP = {
    // Display name used across the UI (titlebar, header, etc.)
    NAME: "FAZ IDE",

    // Shown in About/footer, and injected into DEFAULT_CODE header
    AUTHOR: "Faz (FazyBear)",

    // Human-readable version label (keep in sync with STORAGE namespace)
    VERSION: "v0.2.0",

};

export const STORAGE = {
    // LocalStorage key where the editor's current code is saved.
    // Use a versioned key so you can migrate/replace saved content safely later.
    CODE: "fazide.code.v0",
    FILES: "fazide.files.v1",
    WORKSPACE_SNAPSHOT: "fazide.workspace-snapshot.v1",
    SESSION: "fazide.session.v1",
    LAYOUT: "fazide.layout.v1",
    THEME: "fazide.theme.v1",
    EDITOR_SETTINGS: "fazide.editor-settings.v1",
    EDITOR_HISTORY: "fazide.editor-history.v1",
    SNIPPETS: "fazide.snippets.v1",
    DEV_TERMINAL_SECRET_HASH: "fazide.dev-terminal-secret-hash.v1",
};

// Optional local games library that can be loaded into the IDE.
// Templates can be one or many files.
const GAME_ICON_COLOR = "%2388f9d0";
const GAME_ICON_SIZE = "16";

function buildIconifyGameIcon(prefix, name) {
    return `https://api.iconify.design/${prefix}/${name}.svg?width=${GAME_ICON_SIZE}&height=${GAME_ICON_SIZE}&color=${GAME_ICON_COLOR}`;
}

function buildDiceBearGameIcon(seed) {
    return `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(seed)}&size=64&backgroundColor=0b1220,111827`;
}

export const GAMES = [];

// Optional local applications library for multi-file templates
// that showcase HTML + CSS + JavaScript working together.
export const APPLICATIONS = [];

// Default editor contents shown on first load (or when storage is empty/reset).
export const DEFAULT_CODE = `/* Welcome to FAZ IDE My first big personal project */
console.log("Hello from FazyBear!");
`;
