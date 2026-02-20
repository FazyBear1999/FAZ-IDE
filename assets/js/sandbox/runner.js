// assets/js/sandbox/runner.js
// Runs user code in a sandboxed iframe.
// Bridge loads first, then user code runs.
//
// Notes:
// - We generate a full HTML document string and write it into the iframe.
// - The bridge script is injected BEFORE user code so it can capture console/errors.
// - userCode is inserted as plain text inside a <script> tag (not executed via eval).
// - The iframe element itself should be created with proper sandbox attributes
//   on the HTML side (e.g., sandbox="allow-scripts") to limit capabilities.

import { bridgeScript } from "./bridge.js";
import { normalizeRunContext } from "./runContext.js";

function sanitizeUserCode(code) {
    // Prevent accidental </script> from terminating our wrapper script tag.
    const source = String(code ?? "");
    if (!source || !source.toLowerCase().includes("</script>")) return source;
    return source.replace(/<\/script>/gi, "<\\/script>");
}

const SANDBOX_FALLBACK_SURFACE = Object.freeze({
    dark: {
        background: "#0b0f14",
        foreground: "#e6edf3",
        panel: "#111520",
        border: "rgba(148, 163, 184, 0.3)",
        accent: "#38bdf8",
        muted: "rgba(148, 163, 184, 0.9)",
        colorScheme: "dark",
    },
    light: {
        background: "#f8fafc",
        foreground: "#0f172a",
        panel: "#ffffff",
        border: "rgba(148, 163, 184, 0.42)",
        accent: "#0ea5e9",
        muted: "rgba(71, 85, 105, 0.9)",
        colorScheme: "light",
    },
});

Object.freeze(SANDBOX_FALLBACK_SURFACE.dark);
Object.freeze(SANDBOX_FALLBACK_SURFACE.light);

const SAFE_THEME_TOKEN = /^[a-z0-9_-]{1,32}$/;
const SAFE_SANDBOX_MODES = new Set(["javascript", "html"]);
const MAX_THEME_TOKEN_CHARS = 256;
const themeLockScriptCache = new Map();

function sanitizeThemeToken(value) {
    const token = String(value || "").trim().toLowerCase();
    if (!token || !SAFE_THEME_TOKEN.test(token)) return "dark";
    return token;
}

function normalizeSandboxMode(mode) {
    const normalized = String(mode || "javascript").trim().toLowerCase();
    return SAFE_SANDBOX_MODES.has(normalized) ? normalized : "javascript";
}

function sanitizeThemeStyleValue(value, fallbackValue = "") {
    const raw = String(value || "").trim();
    if (!raw || raw.length > MAX_THEME_TOKEN_CHARS) return String(fallbackValue || "");
    if (raw.includes("<") || raw.includes(">")) return String(fallbackValue || "");
    return raw;
}

function getSandboxTheme() {
    const rawTheme = document?.documentElement?.getAttribute("data-theme");
    return sanitizeThemeToken(rawTheme || "dark");
}

function readThemeToken(styles, tokenName, fallbackValue = "") {
    if (!styles || !tokenName) return fallbackValue;
    return sanitizeThemeStyleValue(styles.getPropertyValue(tokenName), fallbackValue);
}

function getSandboxThemeSurface(theme) {
    const fallback = theme === "light" ? SANDBOX_FALLBACK_SURFACE.light : SANDBOX_FALLBACK_SURFACE.dark;
    const root = document?.documentElement || null;
    const styles = root && typeof getComputedStyle === "function" ? getComputedStyle(root) : null;
    const panelSurface = readThemeToken(styles, "--surface-panel", fallback.panel);
    return {
        background: panelSurface || readThemeToken(styles, "--bg", fallback.background),
        foreground: readThemeToken(styles, "--text", fallback.foreground),
        panel: panelSurface,
        border: readThemeToken(styles, "--border", fallback.border),
        accent: readThemeToken(styles, "--accent", fallback.accent),
        muted: readThemeToken(styles, "--muted", fallback.muted),
        colorScheme: theme === "light" ? "light" : "dark",
    };
}

function buildThemeLockScript(surface, theme) {
    const cacheKey = `${theme}|${surface.background}|${surface.foreground}|${surface.panel || ""}|${surface.border || ""}|${surface.accent || ""}|${surface.muted || ""}|${surface.colorScheme || ""}`;
    if (themeLockScriptCache.has(cacheKey)) {
        return themeLockScriptCache.get(cacheKey);
    }
    const backgroundColor = JSON.stringify(surface.background);
    const foregroundColor = JSON.stringify(surface.foreground);
    const panelColor = JSON.stringify(surface.panel || surface.background);
    const borderColor = JSON.stringify(surface.border || "rgba(148, 163, 184, 0.3)");
    const accentColor = JSON.stringify(surface.accent || "#38bdf8");
    const mutedColor = JSON.stringify(surface.muted || "rgba(148, 163, 184, 0.9)");
    const colorScheme = JSON.stringify(surface.colorScheme);
    const themeName = JSON.stringify(theme || "dark");
    const script = (
        `<script>(function __fazLockSandboxBg(){` +
        `const bg=${backgroundColor};` +
        `const fg=${foregroundColor};` +
        `const panel=${panelColor};` +
        `const border=${borderColor};` +
        `const accent=${accentColor};` +
        `const muted=${mutedColor};` +
        `const scheme=${colorScheme};` +
        `const theme=${themeName};` +
        `const apply=function(){` +
        `const root=document.documentElement;` +
        `const body=document.body;` +
        `if(root){` +
        `root.setAttribute("data-theme",theme);` +
        `root.style.setProperty("color-scheme",scheme);` +
        `root.style.setProperty("background",bg,"important");` +
        `root.style.setProperty("background-color",bg,"important");` +
        `root.style.setProperty("--fazide-sandbox-bg",bg);` +
        `root.style.setProperty("--fazide-sandbox-fg",fg);` +
        `root.style.setProperty("--fazide-sandbox-panel",panel);` +
        `root.style.setProperty("--fazide-sandbox-border",border);` +
        `root.style.setProperty("--fazide-sandbox-accent",accent);` +
        `root.style.setProperty("--fazide-sandbox-muted",muted);` +
        `}` +
        `if(body){` +
        `body.setAttribute("data-theme",theme);` +
        `body.style.setProperty("margin","0","important");` +
        `body.style.setProperty("min-height","100%","important");` +
        `body.style.setProperty("background",bg,"important");` +
        `body.style.setProperty("background-color",bg,"important");` +
        `body.style.setProperty("color",fg);` +
        `}` +
        `};` +
        `apply();` +
        `setTimeout(apply,0);` +
        `if(typeof requestAnimationFrame==="function"){requestAnimationFrame(apply);}` +
        `})();<\/script>`
    );
    if (themeLockScriptCache.size > 31) {
        const firstKey = themeLockScriptCache.keys().next().value;
        if (firstKey) themeLockScriptCache.delete(firstKey);
    }
    themeLockScriptCache.set(cacheKey, script);
    return script;
}

const SANDBOX_CSP_META_TAG = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; navigate-to 'none'">`;

const SANDBOX_SECURITY_LOCK_SCRIPT =
    `<script>(function __fazSecurityLock(){` +
    `const messageBase="blocked by FAZ IDE sandbox policy";` +
    `const warn=function(api,detail){` +
    `try{` +
    `if(typeof console!="undefined"&&console&&typeof console.warn==="function"){` +
    `const suffix=detail?": "+String(detail):"";` +
    `console.warn("Sandbox security: blocked API "+String(api||"unknown")+suffix);` +
    `}` +
    `}catch(_err){}` +
    `};` +
    `const defineBlocked=function(host,key,impl){` +
    `if(!host)return;` +
    `try{Object.defineProperty(host,key,{configurable:true,writable:true,value:impl});return;}catch(_err){}` +
    `try{host[key]=impl;}catch(_err2){}` +
    `};` +
    `const blockedError=function(api){return new Error(String(api||"API")+" "+messageBase);};` +
    `defineBlocked(window,"alert",function(){warn("alert");return undefined;});` +
    `defineBlocked(window,"confirm",function(){warn("confirm");return false;});` +
    `defineBlocked(window,"prompt",function(){warn("prompt");return null;});` +
    `defineBlocked(window,"print",function(){warn("print");return undefined;});` +
    `defineBlocked(window,"open",function(url){warn("window.open",url);return null;});` +
    `defineBlocked(window,"fetch",function(){warn("fetch");return Promise.reject(blockedError("fetch"));});` +
    `defineBlocked(window,"XMLHttpRequest",function(){warn("XMLHttpRequest");throw blockedError("XMLHttpRequest");});` +
    `defineBlocked(window,"WebSocket",function(){warn("WebSocket");throw blockedError("WebSocket");});` +
    `defineBlocked(window,"EventSource",function(){warn("EventSource");throw blockedError("EventSource");});` +
    `defineBlocked(window,"Worker",function(){warn("Worker");throw blockedError("Worker");});` +
    `defineBlocked(window,"SharedWorker",function(){warn("SharedWorker");throw blockedError("SharedWorker");});` +
    `if(typeof navigator!=="undefined"&&navigator){` +
    `try{defineBlocked(navigator,"sendBeacon",function(){warn("navigator.sendBeacon");return false;});}catch(_err){}` +
    `try{if(navigator.serviceWorker){` +
    `defineBlocked(navigator.serviceWorker,"register",function(){warn("serviceWorker.register");return Promise.reject(blockedError("serviceWorker.register"));});` +
    `defineBlocked(navigator.serviceWorker,"getRegistrations",function(){warn("serviceWorker.getRegistrations");return Promise.resolve([]);});` +
    `}}catch(_err2){}` +
    `try{if(window.Notification&&typeof window.Notification==="function"){` +
    `defineBlocked(window.Notification,"requestPermission",function(){warn("Notification.requestPermission");return Promise.resolve("denied");});` +
    `}}catch(_err3){}` +
    `try{if(navigator.geolocation){` +
    `defineBlocked(navigator.geolocation,"getCurrentPosition",function(_success,error){warn("geolocation.getCurrentPosition");if(typeof error==="function"){error({code:1,message:messageBase});}});` +
    `defineBlocked(navigator.geolocation,"watchPosition",function(_success,error){warn("geolocation.watchPosition");if(typeof error==="function"){error({code:1,message:messageBase});}return -1;});` +
    `defineBlocked(navigator.geolocation,"clearWatch",function(){return undefined;});` +
    `}}catch(_err4){}` +
    `}` +
    `})();<\/script>`;

const SANDBOX_STORAGE_SHIM_SCRIPT =
    `<script>(function __fazStorageShim(){` +
    `const makeStore=function(){` +
    `const map=new Map();` +
    `return {` +
    `get length(){return map.size;},` +
    `clear:function(){map.clear();},` +
    `getItem:function(key){const k=String(key);return map.has(k)?map.get(k):null;},` +
    `key:function(index){const keys=Array.from(map.keys());const i=Number(index)||0;return Number.isInteger(i)&&i>=0&&i<keys.length?keys[i]:null;},` +
    `removeItem:function(key){map.delete(String(key));},` +
    `setItem:function(key,value){map.set(String(key),String(value));}` +
    `};` +
    `};` +
    `const install=function(prop){` +
    `let existing;` +
    `try{existing=window[prop];if(existing&&typeof existing.getItem==="function"){return;}}catch(_err){}` +
    `const shim=makeStore();` +
    `try{Object.defineProperty(window,prop,{configurable:true,enumerable:true,get:function(){return shim;}});}` +
    `catch(_err){try{window[prop]=shim;}catch(_err2){}}` +
    `};` +
    `install("localStorage");` +
    `install("sessionStorage");` +
    `})();<\/script>`;

function buildSandboxCspMetaTag() {
    return SANDBOX_CSP_META_TAG;
}

function buildSecurityLockScript() {
    return SANDBOX_SECURITY_LOCK_SCRIPT;
}

function buildStorageShimScript() {
    return SANDBOX_STORAGE_SHIM_SCRIPT;
}

function buildSandboxTokenNormalizeStyle(surface) {
    const panel = surface.panel || surface.background;
    const border = surface.border || "rgba(148, 163, 184, 0.3)";
    const accent = surface.accent || "#38bdf8";
    const muted = surface.muted || "rgba(148, 163, 184, 0.9)";
    return (
        `<style data-fazide-theme-normalize="true">` +
        `:root{--fazide-token-bg:${surface.background};--fazide-token-fg:${surface.foreground};--fazide-token-panel:${panel};--fazide-token-border:${border};--fazide-token-accent:${accent};--fazide-token-muted:${muted};}` +
        `*,:before,:after{box-sizing:border-box;}` +
        `html,body{background:var(--fazide-token-bg) !important;color:var(--fazide-token-fg) !important;}` +
        `body{font-family:var(--font,\"Space Grotesk\",\"Segoe UI\",system-ui,-apple-system,sans-serif) !important;}` +
        `body{line-height:1.45;}` +
        `:where(main,section,article,.panel,.card,.app-shell,.game-shell,.converter,.scene){width:min(100%,960px);margin-inline:auto;}` +
        `:where(main,section,article,.panel,.card,.app-shell,.game-shell,.converter,.scene){padding:clamp(12px,2vw,20px);}` +
        `:where(h1,h2,h3){margin:0 0 8px;line-height:1.2;}` +
        `:where(p,small,label,.note,.hint,.sub,.subtitle){margin:0 0 8px;}` +
        `:where(.top-row,.row,.controls,.actions,.toolbar){display:flex;align-items:center;gap:8px;flex-wrap:wrap;}` +
        `:where(input,select,button,textarea){min-height:34px;padding:6px 10px;}` +
        `:where(main,section,article,aside,.panel,.card,.app-shell,.converter,.game-shell,.shell,.scene,.result,.report,.arena){border-radius:0 !important;border-color:var(--fazide-token-border) !important;}` +
        `:where(button,input,select,textarea){border-radius:0 !important;border:1px solid var(--fazide-token-border) !important;background:var(--fazide-token-panel) !important;color:var(--fazide-token-fg) !important;}` +
        `:where(button,[role=\"button\"]){cursor:pointer;}` +
        `:where(button:hover,button:focus-visible){border-color:var(--fazide-token-accent) !important;outline:none;}` +
        `:where(p,small,label,.note,.hint,.sub,.subtitle){color:var(--fazide-token-muted);}` +
        `</style>`
    );
}

function buildSandboxJsDocument(userCode, token, surface, theme, runContext) {
    const safeCode = sanitizeUserCode(userCode);
    const shellStyle =
        `<style>` +
        `html{color-scheme:${surface.colorScheme};}` +
        `html,body{margin:0;min-height:100%;background:transparent !important;background-image:linear-gradient(${surface.background},${surface.background});color:${surface.foreground};}` +
        `</style>`;
    const normalizeThemeStyle = buildSandboxTokenNormalizeStyle(surface);
    const cspTag = buildSandboxCspMetaTag();
    const storageShimScript = buildStorageShimScript();
    const securityLockScript = buildSecurityLockScript();
    const backgroundLockScript = buildThemeLockScript(surface, theme);
    return (
        `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8" />${cspTag}${shellStyle}${normalizeThemeStyle}</head><body>` +
        storageShimScript +
        securityLockScript +
        bridgeScript(token, runContext) +
        `<script>\n${safeCode}\n<\/script>` +
        backgroundLockScript +
        `</body></html>`
    );
}

function buildSandboxHtmlDocument(userHtml, token, surface, theme, runContext) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(userHtml ?? ""), "text/html");
    const htmlEl = doc.documentElement || doc.appendChild(doc.createElement("html"));
    htmlEl.setAttribute("data-theme", theme || "dark");
    const head = doc.head || htmlEl.insertBefore(doc.createElement("head"), htmlEl.firstChild);
    const body = doc.body || htmlEl.appendChild(doc.createElement("body"));

    if (!head.querySelector("meta[charset]")) {
        const meta = doc.createElement("meta");
        meta.setAttribute("charset", "utf-8");
        head.prepend(meta);
    }

    if (!head.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
        head.insertAdjacentHTML("afterbegin", buildSandboxCspMetaTag());
    }

    const shellStyle = doc.createElement("style");
    shellStyle.setAttribute("data-fazide-shell", "true");
    shellStyle.textContent =
        `html{color-scheme:${surface.colorScheme};}` +
        `html,body{margin:0;min-height:100%;background:transparent !important;background-image:linear-gradient(${surface.background},${surface.background});color:${surface.foreground};}`;
    head.appendChild(shellStyle);

    head.insertAdjacentHTML("beforeend", buildSandboxTokenNormalizeStyle(surface));

    head.insertAdjacentHTML("afterbegin", buildStorageShimScript());
    body.insertAdjacentHTML("afterbegin", `${buildSecurityLockScript()}${bridgeScript(token, runContext)}${buildThemeLockScript(surface, theme)}`);

    const html = "<!doctype html>\n" + htmlEl.outerHTML;
    if (!/^<!doctype html>/i.test(html.trim())) {
        return "<!doctype html>\n" + html;
    }
    return html;
}

export function runInSandbox(iframeEl, sourceCode, token, options = {}) {
    if (!iframeEl) throw new Error("FAZ IDE: runner iframe missing");
    const mode = normalizeSandboxMode(options?.mode);
    const theme = getSandboxTheme();
    const surface = getSandboxThemeSurface(theme);
    const runContext = normalizeRunContext(options?.runContext);

    const html = mode === "html"
        ? buildSandboxHtmlDocument(sourceCode, token, surface, theme, runContext)
        : buildSandboxJsDocument(sourceCode, token, surface, theme, runContext);

    // Prefer srcdoc so sandbox can stay same-origin locked.
    if ("srcdoc" in iframeEl) {
        iframeEl.srcdoc = html;
        return;
    }

    // Fallback for older browsers (should be rare for this IDE).
    const doc = iframeEl.contentWindow && iframeEl.contentWindow.document;
    if (!doc) throw new Error("FAZ IDE: Cannot access sandbox document");
    doc.open();
    doc.write(html);
    doc.close();
}
