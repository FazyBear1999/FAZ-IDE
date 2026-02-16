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

export const GAMES = [
    {
        id: "balloon-pop",
        name: "Balloon Pop",
        icon: buildIconifyGameIcon("mdi", "balloon"),
        src: "./assets/games/balloon-pop.js",
    },
    {
        id: "click-counter",
        name: "Click Counter",
        icon: buildIconifyGameIcon("mdi", "cursor-default-click-outline"),
        src: "./assets/games/click-counter.js",
    },
    {
        id: "coin-flip",
        name: "Coin Flip",
        icon: buildIconifyGameIcon("mdi", "coin"),
        src: "./assets/games/coin-flip.js",
    },
    {
        id: "dice-race",
        name: "Dice Race",
        icon: buildIconifyGameIcon("mdi", "dice-multiple"),
        src: "./assets/games/dice-race.js",
    },
    {
        id: "guess-number",
        name: "Guess Number",
        icon: buildIconifyGameIcon("mdi", "numeric"),
        src: "./assets/games/guess-number.js",
    },
    {
        id: "high-low",
        name: "High Low",
        icon: buildIconifyGameIcon("mdi", "chart-line-variant"),
        src: "./assets/games/high-low.js",
    },
    {
        id: "quick-math",
        name: "Quick Math",
        icon: buildIconifyGameIcon("mdi", "calculator-variant-outline"),
        src: "./assets/games/quick-math.js",
    },
    {
        id: "reaction-timer",
        name: "Reaction Timer",
        icon: buildIconifyGameIcon("mdi", "timer-outline"),
        src: "./assets/games/reaction-timer.js",
    },
    {
        id: "rock-paper-scissors",
        name: "Rock Paper Scissors",
        icon: buildIconifyGameIcon("mdi", "hand-back-right-outline"),
        src: "./assets/games/rock-paper-scissors.js",
    },
    {
        id: "target-tap",
        name: "Target Tap",
        icon: buildIconifyGameIcon("mdi", "target"),
        src: "./assets/games/target-tap.js",
    },
    {
        id: "neon-drift-arena",
        name: "Neon Drift Arena",
        icon: buildIconifyGameIcon("mdi", "rocket-launch-outline"),
        files: [
            { path: "index.html", src: "./assets/games/neon-drift-arena/index.html" },
            { path: "styles.css", src: "./assets/games/neon-drift-arena/styles.css" },
            { path: "game.js", src: "./assets/games/neon-drift-arena/game.js" },
        ],
        entryFile: "game.js",
    },
];

// Optional local applications library for multi-file templates
// that showcase HTML + CSS + JavaScript working together.
export const APPLICATIONS = [
    {
        id: "calculator-app",
        name: "Calculator",
        icon: buildDiceBearGameIcon("calculator-app"),
        files: [
            { path: "index.html", src: "./assets/apps/calculator/index.html" },
            { path: "styles.css", src: "./assets/apps/calculator/styles.css" },
            { path: "app.js", src: "./assets/apps/calculator/app.js" },
        ],
        entryFile: "app.js",
    },
    {
        id: "unit-converter-app",
        name: "Unit Converter",
        icon: buildDiceBearGameIcon("unit-converter-app"),
        files: [
            { path: "index.html", src: "./assets/apps/unit-converter/index.html" },
            { path: "styles.css", src: "./assets/apps/unit-converter/styles.css" },
            { path: "app.js", src: "./assets/apps/unit-converter/app.js" },
        ],
        entryFile: "app.js",
    },
    {
        id: "geometry-lab-app",
        name: "Geometry Lab",
        icon: buildDiceBearGameIcon("geometry-lab-app"),
        files: [
            { path: "index.html", src: "./assets/apps/geometry-lab/index.html" },
            { path: "styles.css", src: "./assets/apps/geometry-lab/styles.css" },
            { path: "app.js", src: "./assets/apps/geometry-lab/app.js" },
        ],
        entryFile: "app.js",
    },
];

// Default editor contents shown on first load (or when storage is empty/reset).
export const DEFAULT_CODE = `/* Welcome to FAZ IDE My first big personal project */
console.log("Hello from FazyBear!");
`;
