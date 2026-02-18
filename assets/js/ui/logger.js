// assets/js/ui/logger.js
// FAZ IDE logger:
// - append messages with timestamps
// - clear log
// - copy log to clipboard
//
// Notes:
// - This logger is UI-first: it writes to a provided DOM element (logEl).
// - It keeps formatting predictable (single-line entries, timestamp + TYPE).
// logEl should be a scrollable element (e.g., <pre>, <div>) with overflow enabled.

const LOG_MAX_LINES = 1200;
const LOG_TRIM_TO_LINES = 1000;
const LOG_MAX_ENTRY_CHARS = 4000;

function truncateLogText(value, maxChars = LOG_MAX_ENTRY_CHARS) {
    const source = String(value ?? "");
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || source.length <= limit) return source;
    return `${source.slice(0, Math.max(0, limit - 15))} ... [truncated]`;
}

function formatPart(p) {
    // console.* can receive anything (strings, numbers, objects, Errors, etc.)
    // We normalize each "part" into a readable string.
    if (typeof p === "string") return p;
    if (p instanceof Error) return p.stack || p.message || String(p);
    if (typeof p === "function") return p.name ? `[Function ${p.name}]` : "[Function]";

    // Prefer JSON for objects so output is inspectable.
    // JSON.stringify can fail on circular structures, so we fall back to String().
    try {
        return JSON.stringify(p, null, 2);
    } catch {
        return String(p);
    }
};

function emit(event, detail) {
    if (typeof window === "undefined" || !window.dispatchEvent) return;
    window.dispatchEvent(new CustomEvent(event, { detail }));
}

export function makeLogger(logEl) {
    // Factory returns a tiny API bound a specific UI element.
    // Keeping state inside closure makes it easy to create multiple logs later.
    let entries = [];
    let lineCount = 0;
    let activeFilter = {
        text: "",
        levels: {
            system: true,
            info: true,
            warn: true,
            error: true,
            log: true,
        },
    };

    const normalizeLevel = (value) => {
        const raw = String(value || "system").trim().toLowerCase();
        if (raw === "warning") return "warn";
        if (raw === "err") return "error";
        if (raw === "debug") return "info";
        return raw || "system";
    };

    function levelEnabled(level = "system") {
        const key = normalizeLevel(level);
        return activeFilter.levels[key] !== false;
    }

    function lineMatchesText(line = "") {
        const query = String(activeFilter.text || "").trim().toLowerCase();
        if (!query) return true;
        return String(line || "").toLowerCase().includes(query);
    }

    function getVisibleEntries() {
        return entries.filter((entry) => levelEnabled(entry.level) && lineMatchesText(entry.line));
    }

    function render() {
        const visible = getVisibleEntries();
        logEl.textContent = visible.map((entry) => entry.line).join("\n");
        logEl.scrollTop = logEl.scrollHeight;
    }

    function trimLogIfNeeded() {
        if (lineCount <= LOG_MAX_LINES) return;
        if (!entries.length) {
            lineCount = 0;
            return;
        }
        entries = entries.slice(-LOG_TRIM_TO_LINES);
        lineCount = entries.length;
        render();
    }

    function formatLine(type, parts) {
        // Timestamp: local time for quick debugging during a session.
        const ts = new Date().toLocaleTimeString();

        // Convert arbitrary console arguments into one message string.
        const safeParts = Array.isArray(parts) ? parts : [parts];
        const msg = truncateLogText(safeParts.map(formatPart).join(" "));
        const level = String(type || "system").toUpperCase();
        return `[${ts}] ${level}: ${msg}`;
    }

    function appendLine(level, line) {
        const text = String(line || "");
        if (!text) return;
        entries.push({
            level: normalizeLevel(level),
            line: text,
        });
        lineCount = entries.length;
        trimLogIfNeeded();
        render();
    }

    function append(type, parts) {
        appendLine(type, formatLine(type, parts));
    }

    function appendMany(entries = []) {
        const list = Array.isArray(entries) ? entries : [entries];
        const lines = list
            .map((entry) => formatLine(entry?.type, entry?.parts))
            .filter(Boolean);
        if (!lines.length) return;
        list.forEach((entry, index) => {
            appendLine(entry?.type, lines[index]);
        });
        trimLogIfNeeded();
    }

    function clear() {
        // Clear the visible log.
        entries = [];
        lineCount = 0;
        render();
    }

    async function copy () {
        // Copy current log to clipboard.
        // Clipboard API requires a secure context (https) and user gesture in many browsers.
        const text = logEl.textContent.trim();

        // If there's nothing meaningful to copy, log a system message instead of failing silently.
        if (!text) return append("system", ["Nothing to copy."]);

        if (!navigator.clipboard || !navigator.clipboard.writeText) {
            emit("fazide:clipboard-error", { reason: "Clipboard API unavailable" });
            append("system", ["Clipboard unavailable."]);
            return;
        }

        try {
            // Best UX: use async clipboard write.
            await navigator.clipboard.writeText(text);
            append("system", ["Copied log."]);
        } catch {
            // Common failure cases: permission denied, insecure origin, blocked by browser settings.
            emit("fazide:clipboard-error", { reason: "Clipboard blocked" });
            append("system", ["Clipboard blocked."]);
        }
    }

    function setFilter(filter = {}) {
        const nextText = String(filter?.text ?? activeFilter.text ?? "").trim();
        const sourceLevels = filter?.levels && typeof filter.levels === "object"
            ? filter.levels
            : activeFilter.levels;
        activeFilter = {
            text: nextText,
            levels: {
                system: sourceLevels.system !== false,
                info: sourceLevels.info !== false,
                warn: sourceLevels.warn !== false,
                error: sourceLevels.error !== false,
                log: sourceLevels.log !== false,
            },
        };
        render();
    }

    function getFilter() {
        return {
            text: activeFilter.text,
            levels: { ...activeFilter.levels },
        };
    }

    // Expose only what the rest of the app needs.
    // This keeps the module stable even if internals change later.
    return { append, appendMany, clear, copy, setFilter, getFilter };
};
