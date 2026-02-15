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
};

// Optional local games library that can be loaded into the IDE.
// Templates can be one or many files. This project currently keeps it simple:
// single-file JavaScript starter games.
export const GAMES = [
    {
        id: "click-counter",
        name: "Click Counter",
        folder: "",
        entryFile: "click-counter.js",
        files: [
            { path: "click-counter.js", src: "./assets/games/click-counter.js" },
        ],
    },
    {
        id: "reaction-timer",
        name: "Reaction Timer",
        folder: "",
        entryFile: "reaction-timer.js",
        files: [
            { path: "reaction-timer.js", src: "./assets/games/reaction-timer.js" },
        ],
    },
    {
        id: "guess-number",
        name: "Number Guess",
        folder: "",
        entryFile: "guess-number.js",
        files: [
            { path: "guess-number.js", src: "./assets/games/guess-number.js" },
        ],
    },
    {
        id: "balloon-pop",
        name: "Balloon Pop",
        folder: "",
        entryFile: "balloon-pop.js",
        files: [
            { path: "balloon-pop.js", src: "./assets/games/balloon-pop.js" },
        ],
    },
    {
        id: "rock-paper-scissors",
        name: "Rock Paper Scissors",
        folder: "",
        entryFile: "rock-paper-scissors.js",
        files: [
            { path: "rock-paper-scissors.js", src: "./assets/games/rock-paper-scissors.js" },
        ],
    },
    {
        id: "coin-flip",
        name: "Coin Flip Guess",
        folder: "",
        entryFile: "coin-flip.js",
        files: [
            { path: "coin-flip.js", src: "./assets/games/coin-flip.js" },
        ],
    },
    {
        id: "dice-race",
        name: "Dice Race",
        folder: "",
        entryFile: "dice-race.js",
        files: [
            { path: "dice-race.js", src: "./assets/games/dice-race.js" },
        ],
    },
    {
        id: "target-tap",
        name: "Target Tap",
        folder: "",
        entryFile: "target-tap.js",
        files: [
            { path: "target-tap.js", src: "./assets/games/target-tap.js" },
        ],
    },
    {
        id: "high-low",
        name: "High Low",
        folder: "",
        entryFile: "high-low.js",
        files: [
            { path: "high-low.js", src: "./assets/games/high-low.js" },
        ],
    },
    {
        id: "quick-math",
        name: "Quick Math",
        folder: "",
        entryFile: "quick-math.js",
        files: [
            { path: "quick-math.js", src: "./assets/games/quick-math.js" },
        ],
    },
];

// Default editor contents shown on first load (or when storage is empty/reset).
// Notes:
// - This is a template literal so we can inject APP metadata into the header.
// - The backticks allow multi-line content exactly as it should appear into the header.
// - Keep the sample small and focused: quick log, optional error, optional async.
export const DEFAULT_CODE = `// ${APP.NAME} (${APP.VERSION})
// Built by ${APP.AUTHOR} 
// 
// Notes:
// - console.* is captured into the Output panel
// - runtime errors + unhandled promise rejections are captured

console.log("hello from FAZ IDE sandbox");

// Try an error:
// throw new Error("boom");
 
// Try async:
// Promise.reject("nope");
`;
