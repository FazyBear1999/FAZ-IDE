// assets/js/core/commandRegistry.js
// Lightweight command registry for command-palette and extension hooks.

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeId(input, fallback = "cmd-custom") {
    const raw = normalizeText(input);
    if (raw) return raw;
    return `${fallback}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
}

function normalizeKeywords(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeText(item)).filter(Boolean).join(" ");
    }
    return normalizeText(value);
}

function normalizeCommand(input = {}) {
    const run = typeof input.run === "function" ? input.run : null;
    if (!run) return null;
    const id = normalizeId(input.id);
    const label = normalizeText(input.label || id);
    if (!label) return null;
    const order = Number.isFinite(input.order) ? Number(input.order) : 1000;
    return {
        id,
        label,
        keywords: normalizeKeywords(input.keywords),
        shortcut: normalizeText(input.shortcut),
        enabled: typeof input.enabled === "function" ? input.enabled : Boolean(input.enabled ?? true),
        order,
        source: normalizeText(input.source || "custom"),
        run,
    };
}

export function createCommandRegistry({ onChange } = {}) {
    const store = new Map();

    function notify() {
        if (typeof onChange === "function") {
            onChange(list());
        }
    }

    function register(command, { replace = true } = {}) {
        const normalized = normalizeCommand(command);
        if (!normalized) return null;
        if (!replace && store.has(normalized.id)) return null;
        store.set(normalized.id, normalized);
        notify();
        return normalized.id;
    }

    function unregister(id) {
        const key = normalizeText(id);
        if (!key) return false;
        const removed = store.delete(key);
        if (removed) notify();
        return removed;
    }

    function get(id) {
        const key = normalizeText(id);
        if (!key) return null;
        return store.get(key) || null;
    }

    function list() {
        return [...store.values()]
            .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
            .map((entry) => ({ ...entry }));
    }

    function clear() {
        if (!store.size) return;
        store.clear();
        notify();
    }

    return {
        register,
        unregister,
        get,
        list,
        clear,
    };
}
