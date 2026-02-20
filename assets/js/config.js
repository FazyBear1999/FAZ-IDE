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
    ACCOUNT_PROFILE: "fazide.account-profile.v1",
    LESSON_PROFILE: "fazide.lesson-profile.v1",
    LESSON_SESSION: "fazide.lesson-session.v1",
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

export const LESSONS = [
    {
        id: "quick-output-instant",
        name: "Lesson: Instant Output Test (2 keys)",
        icon: buildThemedIcon("26a1"),
        files: [
            { path: "index.html", src: "./assets/lessons/quick-output-instant/index.html" },
        ],
        entryFile: "index.html",
    },
    {
        id: "paddle-lesson-1",
        name: "Lesson: Paddle Intro (Typing)",
        icon: buildThemedIcon("1f3d3"),
        files: [
            { path: "index.html", src: "./assets/lessons/paddle-lesson-1/index.html" },
            { path: "styles.css", src: "./assets/lessons/paddle-lesson-1/styles.css" },
            { path: "game.js", src: "./assets/lessons/paddle-lesson-1/game.js" },
        ],
        entryFile: "game.js",
    },
    {
        id: "quick-output-4line",
        name: "Lesson: Quick Output Test (1 line)",
        icon: buildThemedIcon("2615"),
        files: [
            { path: "index.html", src: "./assets/lessons/quick-output-4line/index.html" },
        ],
        entryFile: "index.html",
    },
];

// Default editor contents shown on first load (or when storage is empty/reset).
export const DEFAULT_CODE = `/* Welcome to FAZ IDE My first big personal project */
console.log("Hello from FazyBear!");
`;

const DEFAULT_WELCOME_HEADLINE = "WELCOME TO FAZ IDE THIS WEBSITE IS BUILT OFF OF JAVASCRIPT CSS AND HTML";
const DEFAULT_WELCOME_BOOT_MESSAGE = "Typing animation booting…";
const DEFAULT_WELCOME_LOG = "WELCOME TO FAZ IDE! Welcome project animation is running.";

export const DEFAULT_WELCOME_FILES = [
        {
        name: "welcome/index.html",
                code: `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welcome to FAZ IDE</title>
    <link rel="stylesheet" href="styles.css" />
</head>
<body>
    <main class="hero" aria-label="Welcome animation">
        <p class="kicker">WELCOME PROJECT</p>
        <h1 class="title" id="title" aria-live="polite">${DEFAULT_WELCOME_HEADLINE}</h1>
        <p class="subtitle" id="message">${DEFAULT_WELCOME_BOOT_MESSAGE}</p>
        <div class="pulse-wrap" aria-hidden="true">
            <span class="pulse pulse-a"></span>
            <span class="pulse pulse-b"></span>
            <span class="pulse pulse-c"></span>
        </div>
    </main>
    <script src="app.js"></script>
</body>
</html>
`,
        },
        {
            name: "welcome/styles.css",
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
    color: #e6edf3;
    display: grid;
    place-items: center;
    padding: 24px;
    overflow: hidden;
    background:
        radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.22), transparent 46%),
        radial-gradient(circle at 80% 35%, rgba(217, 70, 239, 0.2), transparent 44%),
        radial-gradient(circle at 50% 80%, rgba(14, 165, 233, 0.18), transparent 52%),
        #04060a;
}

.hero {
    width: min(920px, 100%);
    padding: 26px 24px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(10, 14, 20, 0.72);
    box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.12) inset;
    backdrop-filter: blur(8px);
}

.kicker {
    margin: 0 0 10px;
    letter-spacing: 0.2em;
    font-size: 12px;
    color: rgba(148, 163, 184, 0.9);
}

.title {
    margin: 0;
    font-size: clamp(1.15rem, 3.2vw, 2.7rem);
    line-height: 1.15;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #f8fafc;
    text-shadow:
        0 0 20px rgba(56, 189, 248, 0.4),
        0 0 44px rgba(217, 70, 239, 0.32);
    transform-origin: center;
    animation:
        titleGlow 1.8s ease-in-out infinite alternate,
        titleLift 4.6s ease-in-out infinite;
}

.subtitle {
    margin: 14px 0 0;
    font-size: clamp(1rem, 1.8vw, 1.25rem);
    color: rgba(203, 213, 225, 0.95);
    max-width: 60ch;
}

.pulse-wrap {
    position: relative;
    height: 18px;
    margin-top: 18px;
}

.pulse {
    position: absolute;
    left: 0;
    top: 8px;
    height: 2px;
    width: 100%;
    transform-origin: left center;
}

.pulse-a {
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.7), rgba(14, 165, 233, 0.05));
    animation: wave 2.4s ease-in-out infinite;
}

.pulse-b {
    background: linear-gradient(90deg, rgba(217, 70, 239, 0.65), rgba(217, 70, 239, 0.03));
    animation: wave 2.4s ease-in-out 0.5s infinite;
}

.pulse-c {
    background: linear-gradient(90deg, rgba(16, 185, 129, 0.55), rgba(16, 185, 129, 0.03));
    animation: wave 2.4s ease-in-out 1s infinite;
}

@keyframes titleGlow {
    from {
        text-shadow:
            0 0 12px rgba(56, 189, 248, 0.3),
            0 0 28px rgba(217, 70, 239, 0.22);
    }
    to {
        text-shadow:
            0 0 22px rgba(56, 189, 248, 0.62),
            0 0 56px rgba(217, 70, 239, 0.46);
    }
}

@keyframes titleLift {
    0%,
    100% {
        transform: translateY(0px) scale(1);
    }
    50% {
        transform: translateY(-3px) scale(1.01);
    }
}

@keyframes wave {
    0% {
        transform: scaleX(0.08);
        opacity: 0.22;
    }
    45% {
        transform: scaleX(1);
        opacity: 1;
    }
    100% {
        transform: scaleX(0.08);
        opacity: 0.22;
    }
}
`,
        },
        {
                name: "welcome/app.js",
                code: `const title = document.getElementById("title");
const message = document.getElementById("message");

if (title) {
    const text = ${JSON.stringify(DEFAULT_WELCOME_HEADLINE)};
    let index = 0;
    title.textContent = "";
    const timer = setInterval(() => {
        index += 1;
        title.textContent = text.slice(0, index);
        if (index >= text.length) {
            clearInterval(timer);
        }
    }, 55);
}

if (message) {
    setTimeout(() => {
        message.textContent = ${JSON.stringify(DEFAULT_WELCOME_HEADLINE)};
    }, 1400);
}

console.log(${JSON.stringify(DEFAULT_WELCOME_LOG)});
`,
        },
];
