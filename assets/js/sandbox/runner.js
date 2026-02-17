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
    return String(code ?? "").replace(/<\/script>/gi, "<\\/script>");
}

const SANDBOX_THEME_SURFACE = {
    dark: { background: "#0b0f14", foreground: "#e6edf3", colorScheme: "dark" },
    light: { background: "#f8fafc", foreground: "#0f172a", colorScheme: "light" },
    purple: { background: "#140b24", foreground: "#f3e8ff", colorScheme: "dark" },
    retro: { background: "#10150f", foreground: "#e6f1d1", colorScheme: "dark" },
    temple: { background: "#0f3fc6", foreground: "#fef7e6", colorScheme: "dark" },
};

function getSandboxTheme() {
    const rawTheme = document?.documentElement?.getAttribute("data-theme");
    const theme = String(rawTheme || "dark").toLowerCase();
    return SANDBOX_THEME_SURFACE[theme] ? theme : "dark";
}

function getSandboxThemeSurface(theme) {
    return SANDBOX_THEME_SURFACE[theme] || SANDBOX_THEME_SURFACE.dark;
}

function buildThemeLockScript(surface, theme) {
    const backgroundColor = JSON.stringify(surface.background);
    const foregroundColor = JSON.stringify(surface.foreground);
    const colorScheme = JSON.stringify(surface.colorScheme);
    const themeName = JSON.stringify(theme || "dark");
    return (
        `<script>(function __fazLockSandboxBg(){` +
        `const bg=${backgroundColor};` +
        `const fg=${foregroundColor};` +
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
}

function buildStorageShimScript() {
    return (
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
        `})();<\/script>`
    );
}

function buildSandboxJsDocument(userCode, token, surface, theme, runContext) {
    const safeCode = sanitizeUserCode(userCode);
    const shellStyle =
        `<style>` +
        `html{color-scheme:${surface.colorScheme};}` +
        `html,body{margin:0;min-height:100%;background:transparent !important;background-image:linear-gradient(${surface.background},${surface.background});color:${surface.foreground};}` +
        `</style>`;
    const storageShimScript = buildStorageShimScript();
    const backgroundLockScript = buildThemeLockScript(surface, theme);
    return (
        `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8" />${shellStyle}</head><body>` +
        storageShimScript +
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

    const shellStyle = doc.createElement("style");
    shellStyle.setAttribute("data-fazide-shell", "true");
    shellStyle.textContent =
        `html{color-scheme:${surface.colorScheme};}` +
        `html,body{margin:0;min-height:100%;background:transparent !important;background-image:linear-gradient(${surface.background},${surface.background});color:${surface.foreground};}`;
    head.appendChild(shellStyle);

    head.insertAdjacentHTML("afterbegin", buildStorageShimScript());
    body.insertAdjacentHTML("afterbegin", `${bridgeScript(token, runContext)}${buildThemeLockScript(surface, theme)}`);

    const html = "<!doctype html>\n" + htmlEl.outerHTML;
    if (!/^<!doctype html>/i.test(html.trim())) {
        return "<!doctype html>\n" + html;
    }
    return html;
}

export function runInSandbox(iframeEl, sourceCode, token, options = {}) {
    if (!iframeEl) throw new Error("FAZ IDE: runner iframe missing");
    const mode = String(options?.mode || "javascript").toLowerCase();
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
