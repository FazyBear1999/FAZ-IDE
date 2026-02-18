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
    UI_ZOOM: "fazide.ui-zoom.v1",
    EDITOR_SETTINGS: "fazide.editor-settings.v1",
    EDITOR_HISTORY: "fazide.editor-history.v1",
    SNIPPETS: "fazide.snippets.v1",
    DEV_TERMINAL_SECRET_HASH: "fazide.dev-terminal-secret-hash.v1",
};

// Optional local games library that can be loaded into the IDE.
// Templates can be one or many files.
const TWEMOJI_CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg";

function buildThemedIcon(codepoint) {
    return `${TWEMOJI_CDN}/${codepoint}.svg`;
}

export const GAMES = [
    {
        id: "balloon-pop",
        name: "Balloon Pop",
        icon: buildThemedIcon("1f388"),
        src: "./assets/games/balloon-pop.js",
    },
    {
        id: "click-counter",
        name: "Click Counter",
        icon: buildThemedIcon("1f5b1"),
        src: "./assets/games/click-counter.js",
    },
    {
        id: "coin-flip",
        name: "Coin Flip",
        icon: buildThemedIcon("1fa99"),
        src: "./assets/games/coin-flip.js",
    },
    {
        id: "dice-race",
        name: "Dice Race",
        icon: buildThemedIcon("1f3b2"),
        src: "./assets/games/dice-race.js",
    },
    {
        id: "guess-number",
        name: "Guess Number",
        icon: buildThemedIcon("1f522"),
        src: "./assets/games/guess-number.js",
    },
    {
        id: "high-low",
        name: "High Low",
        icon: buildThemedIcon("1f4c8"),
        src: "./assets/games/high-low.js",
    },
    {
        id: "quick-math",
        name: "Quick Math",
        icon: buildThemedIcon("1f9ee"),
        src: "./assets/games/quick-math.js",
    },
    {
        id: "reaction-timer",
        name: "Reaction Timer",
        icon: buildThemedIcon("23f1"),
        src: "./assets/games/reaction-timer.js",
    },
    {
        id: "rock-paper-scissors",
        name: "Rock Paper Scissors",
        icon: buildThemedIcon("270a"),
        src: "./assets/games/rock-paper-scissors.js",
    },
    {
        id: "target-tap",
        name: "Target Tap",
        icon: buildThemedIcon("1f3af"),
        src: "./assets/games/target-tap.js",
    },
    {
        id: "neon-drift-arena",
        name: "Neon Drift Arena",
        icon: buildThemedIcon("1f680"),
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
        id: "runtime-full-matrix-app",
        name: "Runtime Full Matrix Report",
        icon: buildThemedIcon("1f9ea"),
        files: [
            { path: "index.html", src: "./assets/apps/runtime-full-matrix/index.html" },
            { path: "styles.css", src: "./assets/apps/runtime-full-matrix/styles.css" },
            { path: "app.js", src: "./assets/apps/runtime-full-matrix/app.js" },
            { path: "matrix.css", src: "./assets/apps/runtime-full-matrix/matrix.css" },
            { path: "README.md", src: "./assets/apps/runtime-full-matrix/README.md" },
        ],
        entryFile: "index.html",
    },
    {
        id: "runtime-js-check-app",
        name: "Runtime JS Check",
        icon: buildThemedIcon("2699"),
        files: [
            { path: "index.html", src: "./assets/apps/runtime-js-check/index.html" },
            { path: "styles.css", src: "./assets/apps/runtime-js-check/styles.css" },
            { path: "app.js", src: "./assets/apps/runtime-js-check/app.js" },
        ],
        entryFile: "app.js",
    },
    {
        id: "runtime-html-check-app",
        name: "Runtime HTML Check",
        icon: buildThemedIcon("1f4c4"),
        files: [
            { path: "index.html", src: "./assets/apps/runtime-html-check/index.html" },
            { path: "styles.css", src: "./assets/apps/runtime-html-check/styles.css" },
            { path: "app.js", src: "./assets/apps/runtime-html-check/app.js" },
        ],
        entryFile: "index.html",
    },
    {
        id: "runtime-css-check-app",
        name: "Runtime CSS Check",
        icon: buildThemedIcon("1f3a8"),
        files: [
            { path: "styles.css", src: "./assets/apps/runtime-css-check/styles.css" },
        ],
        entryFile: "styles.css",
    },
    {
        id: "roofing-tools-app",
        name: "Roofing Tools",
        icon: buildThemedIcon("1f6e0"),
        files: [
            { path: "index.html", src: "./assets/apps/roofing-tools/index.html" },
            { path: "styles.css", src: "./assets/apps/roofing-tools/styles.css" },
            { path: "app.js", src: "./assets/apps/roofing-tools/app.js" },
        ],
        entryFile: "app.js",
    },
    {
        id: "calculator-app",
        name: "Calculator",
        icon: buildThemedIcon("1f9ee"),
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
        icon: buildThemedIcon("1f4d0"),
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
        icon: buildThemedIcon("1f4cf"),
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

export const DEFAULT_WELCOME_FILES = [
        {
                name: "Welcome/index.html",
                code: `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welcome to FAZ IDE</title>
    <link rel="stylesheet" href="styles.css" />
</head>
<body>
    <main class="welcome-card">
        <h1>Welcome to FAZ IDE</h1>
        <p id="message">Your free coding workspace is ready.</p>
        <ul>
            <li>100% free program</li>
            <li>No ads</li>
            <li>Never charging for anything in FAZ IDE</li>
        </ul>
        <button id="showPolicy" type="button">Show Promise</button>
    </main>
    <script src="app.js"></script>
</body>
</html>
`,
        },
        {
                name: "Welcome/styles.css",
                code: `:root {
    color-scheme: dark;
}

html,
body {
    margin: 0;
    min-height: 100%;
}

body {
    font-family: "Space Grotesk", "Segoe UI", system-ui, -apple-system, sans-serif;
    background: #0b0f14;
    color: #e6edf3;
    display: grid;
    place-items: center;
    padding: 24px;
}

.welcome-card {
    width: min(760px, 100%);
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: #111520;
    padding: 20px;
}

h1 {
    margin: 0 0 10px;
}

p,
li {
    color: rgba(148, 163, 184, 0.95);
}

button {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid #38bdf8;
    background: transparent;
    color: #e6edf3;
    cursor: pointer;
}
`,
        },
        {
                name: "Welcome/app.js",
                code: `const message = document.getElementById("message");
const button = document.getElementById("showPolicy");

if (button && message) {
    button.addEventListener("click", () => {
        message.textContent = "FAZ IDE is free forever. No ads. No charges. Build anything you want.";
    });
}

console.log("Welcome to FAZ IDE: free forever, no ads, never charging for anything.");
`,
        },
];
