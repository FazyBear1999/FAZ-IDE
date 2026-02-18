const DEFAULT_FILE_NAME = "main.js";

export function normalizePathSlashes(value = "") {
    return String(value ?? "")
        .replace(/\\/g, "/")
        .replace(/\/{2,}/g, "/");
}

export function splitPathSegments(value = "") {
    return normalizePathSlashes(value)
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
}

export function buildPathFromSegments(segments = []) {
    return (Array.isArray(segments) ? segments : [])
        .map((segment) => String(segment || "").trim())
        .filter(Boolean)
        .join("/");
}

export function splitLeafExtension(leaf = "") {
    const value = String(leaf || "").trim();
    const dot = value.lastIndexOf(".");
    if (dot <= 0 || dot === value.length - 1) {
        return { stem: value, extension: "" };
    }
    return {
        stem: value.slice(0, dot),
        extension: value.slice(dot),
    };
}

export function getFileBaseName(fileName, fallback = DEFAULT_FILE_NAME) {
    const segments = splitPathSegments(fileName);
    return segments.length ? segments[segments.length - 1] : normalizeFileName(fileName, fallback);
}

export function getFileDirectory(fileName = "") {
    const segments = splitPathSegments(fileName);
    if (segments.length <= 1) return "";
    segments.pop();
    return buildPathFromSegments(segments);
}

export function collapseDuplicateTerminalExtension(filePath = "") {
    const segments = splitPathSegments(filePath);
    if (!segments.length) return "";
    let leaf = segments.pop() || "";
    const parsed = splitLeafExtension(leaf);
    const extension = parsed.extension;
    if (!extension) {
        segments.push(leaf);
        return buildPathFromSegments(segments);
    }
    const lowerExt = extension.toLowerCase();
    const repeated = `${lowerExt}${lowerExt}`;
    let lowerLeaf = leaf.toLowerCase();
    while (lowerLeaf.endsWith(repeated)) {
        leaf = leaf.slice(0, -extension.length);
        lowerLeaf = leaf.toLowerCase();
    }
    segments.push(leaf);
    return buildPathFromSegments(segments);
}

export function getFallbackFileExtension(fallback = DEFAULT_FILE_NAME) {
    const fallbackName = String(fallback ?? DEFAULT_FILE_NAME).trim() || DEFAULT_FILE_NAME;
    const fallbackLeaf = getFileBaseName(fallbackName, DEFAULT_FILE_NAME) || DEFAULT_FILE_NAME;
    const parsed = splitLeafExtension(fallbackLeaf);
    return parsed.extension || ".js";
}

export function normalizeFileName(name, fallback = DEFAULT_FILE_NAME) {
    const normalizedFallback = String(fallback ?? DEFAULT_FILE_NAME).trim() || DEFAULT_FILE_NAME;
    const fallbackExt = getFallbackFileExtension(normalizedFallback);
    const raw = String(name ?? "").trim();
    const source = raw || normalizedFallback;
    const segments = splitPathSegments(source);
    if (!segments.length) {
        const fallbackSegments = splitPathSegments(normalizedFallback);
        if (!fallbackSegments.length) {
            return `main${fallbackExt}`;
        }
        const fallbackLeaf = fallbackSegments.pop() || `main${fallbackExt}`;
        const parsedFallback = splitLeafExtension(fallbackLeaf);
        fallbackSegments.push(parsedFallback.extension ? fallbackLeaf : `${fallbackLeaf}${fallbackExt}`);
        return buildPathFromSegments(fallbackSegments);
    }
    let leaf = segments.pop() || DEFAULT_FILE_NAME;
    const parsedLeaf = splitLeafExtension(leaf);
    if (!parsedLeaf.extension) {
        leaf = `${leaf}${fallbackExt}`;
    }
    segments.push(leaf);
    return collapseDuplicateTerminalExtension(buildPathFromSegments(segments));
}

export function normalizeLooseFileName(name, fallback = DEFAULT_FILE_NAME) {
    const fallbackValue = String(fallback ?? DEFAULT_FILE_NAME).trim() || DEFAULT_FILE_NAME;
    const raw = String(name ?? "").trim();
    const source = raw || fallbackValue;
    const segments = splitPathSegments(source);
    if (!segments.length) {
        const fallbackSegments = splitPathSegments(fallbackValue);
        if (!fallbackSegments.length) return "untitled";
        return collapseDuplicateTerminalExtension(buildPathFromSegments(fallbackSegments));
    }
    return collapseDuplicateTerminalExtension(buildPathFromSegments(segments));
}

export function getFolderBaseName(folderPath = "") {
    const segments = splitPathSegments(folderPath);
    return segments.length ? segments[segments.length - 1] : "";
}

export function getFolderParentPath(folderPath = "") {
    const segments = splitPathSegments(folderPath);
    if (segments.length <= 1) return "";
    segments.pop();
    return buildPathFromSegments(segments);
}

export function normalizeFolderPath(value, { allowEmpty = false } = {}) {
    const parts = splitPathSegments(value);
    if (!parts.length) return allowEmpty ? "" : "";
    return buildPathFromSegments(parts);
}
