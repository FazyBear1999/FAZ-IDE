function normalizePathSlashes(value = "") {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");
}

function toPathKey(value = "") {
    return normalizePathSlashes(value).toLowerCase();
}

function toPathTrimmedKey(value = "") {
    return normalizePathSlashes(value).trim().toLowerCase();
}

function splitPathSegments(value = "") {
    return normalizePathSlashes(value)
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
}

function buildPathFromSegments(segments = []) {
    return (Array.isArray(segments) ? segments : [])
        .map((segment) => String(segment || "").trim())
        .filter(Boolean)
        .join("/");
}

function getFileBaseName(fileName = "") {
    const segments = splitPathSegments(fileName);
    return segments.length ? segments[segments.length - 1] : String(fileName || "").trim();
}

function getFileDirectory(fileName = "") {
    const segments = splitPathSegments(fileName);
    if (segments.length <= 1) return "";
    segments.pop();
    return buildPathFromSegments(segments);
}

function detectLanguageFromFileName(fileName = "") {
    const lower = String(fileName || "").toLowerCase();
    if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".jsx")) return "javascript";
    if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
    if (lower.endsWith(".json")) return "json";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    if (lower.endsWith(".css")) return "css";
    if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
    return "text";
}

export function sanitizeStyleForHtml(value = "") {
    return String(value ?? "").replace(/<\/style>/gi, "<\\/style>");
}

export function buildCssPreviewHtml(cssCode) {
    const safeCss = sanitizeStyleForHtml(cssCode);
    const shellCss =
        `:root{` +
        `--preview-bg:var(--fazide-sandbox-bg,#0b0f14);` +
        `--preview-fg:var(--fazide-sandbox-fg,#e6edf3);` +
        `--preview-panel:var(--fazide-sandbox-panel,#111520);` +
        `--preview-border:var(--fazide-sandbox-border,rgba(148,163,184,.3));` +
        `--preview-accent:var(--fazide-sandbox-accent,#38bdf8);` +
        `--preview-muted:var(--fazide-sandbox-muted,rgba(148,163,184,.9));` +
        `}` +
        `html,body{margin:0;min-height:100%;}` +
        `body{padding:20px;background:var(--preview-bg);color:var(--preview-fg);font-family:"Space Grotesk","Segoe UI",system-ui,sans-serif;}` +
        `.fazide-css-preview{max-width:760px;margin:0 auto;padding:16px;border:1px solid var(--preview-border);background:var(--preview-panel);}` +
        `.fazide-css-preview h1{margin:0 0 8px;color:var(--preview-fg);font-size:20px;}` +
        `.fazide-css-preview p{margin:0 0 12px;color:var(--preview-muted);}` +
        `.fazide-css-preview button{padding:8px 12px;border:1px solid var(--preview-accent);background:transparent;color:var(--preview-fg);}`;
    return (
        `<!doctype html><html><head><meta charset="utf-8" />` +
        `<style>${shellCss}</style>` +
        `<style>${safeCss}</style>` +
        `</head><body>` +
        `<main class="fazide-css-preview">` +
        `<h1>CSS Preview</h1>` +
        `<p>Edit your stylesheet and click Run to refresh this preview.</p>` +
        `<button type="button">Preview Button</button>` +
        `</main></body></html>`
    );
}


export function createWorkspaceAssetResolver(workspaceFiles = []) {
    let workspaceFileMap = null;
    let fromDirSegmentsCache = null;
    let resolvedAssetFileCache = null;
    let sourceLanguageCache = null;

    const ensureState = () => {
        if (workspaceFileMap && fromDirSegmentsCache && resolvedAssetFileCache && sourceLanguageCache) return;
        workspaceFileMap = new Map(
            workspaceFiles.map((file) => [
                toPathKey(String(file.name || "")),
                file,
            ])
        );
        fromDirSegmentsCache = new Map();
        resolvedAssetFileCache = new Map();
        sourceLanguageCache = new Map();
    };

    const resolveWorkspaceFile = (filePath = "") => {
        ensureState();
        const normalized = toPathKey(String(filePath || ""));
        if (!normalized) return null;
        return workspaceFileMap.get(normalized) || null;
    };

    const getSourceLanguage = (fileName = "") => {
        ensureState();
        const key = String(fileName || "").trim().toLowerCase();
        if (!key) return "";
        if (sourceLanguageCache.has(key)) return sourceLanguageCache.get(key);
        const language = detectLanguageFromFileName(key);
        sourceLanguageCache.set(key, language);
        return language;
    };

    const isExternalAssetRef = (value = "") => {
        const normalized = String(value || "").trim().toLowerCase();
        if (!normalized || normalized.startsWith("#") || normalized.startsWith("//")) return true;
        return /^[a-z][a-z0-9+.-]*:/.test(normalized);
    };

    const stripAssetDecorators = (value = "") => String(value || "").split("#")[0].split("?")[0];

    const resolveWorkspacePath = (baseSegments = [], refValue = "") => {
        const segments = Array.isArray(baseSegments) ? [...baseSegments] : [];
        splitPathSegments(refValue).forEach((segment) => {
            if (segment === ".") return;
            if (segment === "..") {
                if (segments.length) segments.pop();
                return;
            }
            segments.push(segment);
        });
        return buildPathFromSegments(segments);
    };

    const dedupeWorkspacePaths = (values = []) => {
        const seen = new Set();
        return (Array.isArray(values) ? values : [])
            .map((value) => normalizePathSlashes(String(value || "")).replace(/^\/+/, ""))
            .filter((value) => {
                const normalized = value.trim();
                if (!normalized) return false;
                const key = normalized.toLowerCase();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    };

    const resolveWorkspaceAssetPaths = (fromFileName, assetRef) => {
        ensureState();
        if (isExternalAssetRef(assetRef)) return [];
        const clean = normalizePathSlashes(stripAssetDecorators(assetRef));
        if (!clean) return [];
        const rootRelative = clean.startsWith("/");
        const refValue = rootRelative ? clean.slice(1) : clean;
        const fromKey = toPathKey(String(fromFileName || ""));
        const fromDirSegments = fromDirSegmentsCache.has(fromKey)
            ? fromDirSegmentsCache.get(fromKey)
            : splitPathSegments(getFileDirectory(fromKey));
        if (!fromDirSegmentsCache.has(fromKey)) {
            fromDirSegmentsCache.set(fromKey, fromDirSegments);
        }
        const directPath = resolveWorkspacePath(rootRelative ? [] : fromDirSegments, refValue);
        if (rootRelative) return dedupeWorkspacePaths([directPath]);

        const rootFallbackPath = resolveWorkspacePath([], refValue);
        const looksRootAnchored =
            refValue.startsWith("./") ||
            refValue.startsWith("../") ||
            refValue.startsWith("assets/") ||
            refValue.startsWith("apps/") ||
            refValue.startsWith("games/");
        return dedupeWorkspacePaths(
            looksRootAnchored || directPath !== rootFallbackPath
                ? [directPath, rootFallbackPath]
                : [directPath]
        );
    };

    const resolveWorkspaceAssetFile = (fromFileName, assetRef) => {
        ensureState();
        const cacheKey = `${toPathKey(String(fromFileName || ""))}::${toPathTrimmedKey(String(assetRef || ""))}`;
        if (resolvedAssetFileCache.has(cacheKey)) {
            return resolvedAssetFileCache.get(cacheKey);
        }
        const candidates = resolveWorkspaceAssetPaths(fromFileName, assetRef);
        let resolved = null;
        for (let i = 0; i < candidates.length; i += 1) {
            const sourceFile = resolveWorkspaceFile(candidates[i]);
            if (sourceFile) {
                resolved = sourceFile;
                break;
            }
        }
        resolvedAssetFileCache.set(cacheKey, resolved);
        return resolved;
    };

    const buildHtmlFromWorkspace = (htmlSource, fromFileName) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(String(htmlSource ?? ""), "text/html");

        Array.from(doc.querySelectorAll("link[href]")).forEach((link) => {
            const rel = String(link.getAttribute("rel") || "").toLowerCase();
            if (rel && !rel.split(/\s+/).includes("stylesheet")) return;
            const href = link.getAttribute("href") || "";
            const sourceFile = resolveWorkspaceAssetFile(fromFileName, href);
            if (!sourceFile || getSourceLanguage(sourceFile.name) !== "css") return;
            const style = doc.createElement("style");
            style.setAttribute("data-fazide-source", sourceFile.name);
            style.textContent = sanitizeStyleForHtml(sourceFile.code);
            link.replaceWith(style);
        });

        Array.from(doc.querySelectorAll("script[src]")).forEach((script) => {
            const src = script.getAttribute("src") || "";
            const sourceFile = resolveWorkspaceAssetFile(fromFileName, src);
            if (!sourceFile || getSourceLanguage(sourceFile.name) !== "javascript") return;
            const inline = doc.createElement("script");
            Array.from(script.attributes).forEach((attr) => {
                if (String(attr.name || "").toLowerCase() === "src") return;
                inline.setAttribute(attr.name, attr.value);
            });
            inline.setAttribute("data-fazide-source", sourceFile.name);
            inline.textContent = String(sourceFile.code ?? "");
            script.replaceWith(inline);
        });

        const root = doc.documentElement;
        return `<!doctype html>\n${root ? root.outerHTML : String(htmlSource ?? "")}`;
    };

    return {
        buildHtmlFromWorkspace,
    };
}