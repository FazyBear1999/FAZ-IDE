// assets/js/ui/store.js
// Storage wrapper for FAZ IDE.
// Later you can replace localStorage with indexedDB or file storage.
//
// Notes:
// - Active runtime backend remains localStorage for sync call-site compatibility.
// - This module now exposes backend capability metadata as a safe first step
//   toward the IndexedDB-backed filesystem adapter roadmap item.

const storageBackend = createStorageBackend();

function createStorageBackend() {
    const indexedDbAvailable = typeof indexedDB !== "undefined";
    return {
        kind: "localStorage",
        indexedDbAvailable,
        indexedDbReady: false,
        read(key) {
            return localStorage.getItem(key);
        },
        write(key, value) {
            localStorage.setItem(key, value);
        },
        remove(key) {
            localStorage.removeItem(key);
        },
    };
}

export function getStorageBackendInfo() {
    return {
        kind: storageBackend.kind,
        indexedDbAvailable: Boolean(storageBackend.indexedDbAvailable),
        indexedDbReady: Boolean(storageBackend.indexedDbReady),
    };
}

export function load(key) {
    // Returns a string or null if the key doesn't exist.
    // Callers decide how to handle null (use DEFAULT_CODE, show empty editor, etc.)
    try {
        return storageBackend.read(key);
    } catch (err) {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:storage-error", {
                detail: { op: "read", key, error: String(err) }
            }));
        }
        console.warn("FAZ IDE: localStorage read failed", err);
        return null;
    }
};

const STORAGE_JOURNAL_KEY = "fazide.storage-journal.v1";

function normalizeEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const key = String(entry.key || "").trim();
    if (!key) return null;
    return {
        key,
        value: String(entry.value ?? ""),
    };
}

function readStorageJournalRaw() {
    try {
        return storageBackend.read(STORAGE_JOURNAL_KEY);
    } catch {
        return null;
    }
}

function parseStorageJournal(raw) {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        const id = String(parsed?.id || "").trim();
        const status = String(parsed?.status || "").trim() || "pending";
        const label = String(parsed?.label || "").trim() || "storage-batch";
        const startedAt = Number.isFinite(Number(parsed?.startedAt)) ? Number(parsed.startedAt) : Date.now();
        const entries = Array.isArray(parsed?.entries)
            ? parsed.entries.map((entry) => normalizeEntry(entry)).filter(Boolean)
            : [];
        if (!entries.length) return null;
        return {
            id: id || `${startedAt}-${Math.random().toString(16).slice(2, 8)}`,
            status,
            label,
            startedAt,
            entries,
        };
    } catch {
        return null;
    }
}

function dispatchStorageEvent(type, detail) {
    if (typeof window !== "undefined" && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent(type, { detail }));
    }
}

function writeStorageJournal(journal) {
    try {
        storageBackend.write(STORAGE_JOURNAL_KEY, JSON.stringify(journal));
        return true;
    } catch (err) {
        dispatchStorageEvent("fazide:storage-error", {
            op: "write-journal",
            key: STORAGE_JOURNAL_KEY,
            error: String(err),
        });
        console.warn("FAZ IDE: storage journal write failed", err);
        return false;
    }
}

function clearStorageJournal() {
    try {
        storageBackend.remove(STORAGE_JOURNAL_KEY);
        return true;
    } catch (err) {
        dispatchStorageEvent("fazide:storage-error", {
            op: "clear-journal",
            key: STORAGE_JOURNAL_KEY,
            error: String(err),
        });
        console.warn("FAZ IDE: storage journal clear failed", err);
        return false;
    }
}

export function save(key, value) {
    // Saves a string value under the provided key.
    // Tip: keep keys versioned (see STORAGE.CODE) so you can migrate safely later.
    try {
        storageBackend.write(key, value);
    } catch (err) {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:storage-error", {
                detail: { op: "write", key, error: String(err) }
            }));
        }
        console.warn("FAZ IDE: localStorage write failed", err);
    }
};

export function getStorageJournalState() {
    const parsed = parseStorageJournal(readStorageJournalRaw());
    if (!parsed) return null;
    return {
        id: parsed.id,
        status: parsed.status,
        label: parsed.label,
        startedAt: parsed.startedAt,
        entryCount: parsed.entries.length,
    };
}

export function saveBatchAtomic(entries = [], { label = "storage-batch" } = {}) {
    const normalizedEntries = Array.isArray(entries)
        ? entries.map((entry) => normalizeEntry(entry)).filter(Boolean)
        : [];
    if (!normalizedEntries.length) return false;
    const startedAt = Date.now();
    const journal = {
        id: `${startedAt}-${Math.random().toString(16).slice(2, 8)}`,
        status: "pending",
        label: String(label || "storage-batch"),
        startedAt,
        entries: normalizedEntries,
    };
    if (!writeStorageJournal(journal)) {
        return false;
    }
    try {
        normalizedEntries.forEach((entry) => {
            storageBackend.write(entry.key, entry.value);
        });
        clearStorageJournal();
        dispatchStorageEvent("fazide:storage-journal-commit", {
            id: journal.id,
            label: journal.label,
            entryCount: normalizedEntries.length,
        });
        return true;
    } catch (err) {
        dispatchStorageEvent("fazide:storage-error", {
            op: "write-batch",
            key: STORAGE_JOURNAL_KEY,
            error: String(err),
        });
        console.warn("FAZ IDE: atomic batch write failed", err);
        return false;
    }
}

export function recoverStorageJournal() {
    const raw = readStorageJournalRaw();
    const parsed = parseStorageJournal(raw);
    if (!raw || !parsed) {
        if (raw && !parsed) {
            clearStorageJournal();
        }
        return {
            recovered: false,
            reason: raw && !parsed ? "invalid" : "none",
            entryCount: 0,
        };
    }
    try {
        parsed.entries.forEach((entry) => {
            storageBackend.write(entry.key, entry.value);
        });
        clearStorageJournal();
        dispatchStorageEvent("fazide:storage-journal-recovered", {
            id: parsed.id,
            label: parsed.label,
            entryCount: parsed.entries.length,
        });
        return {
            recovered: true,
            reason: "replayed",
            id: parsed.id,
            label: parsed.label,
            entryCount: parsed.entries.length,
        };
    } catch (err) {
        dispatchStorageEvent("fazide:storage-error", {
            op: "recover-journal",
            key: STORAGE_JOURNAL_KEY,
            error: String(err),
        });
        console.warn("FAZ IDE: storage journal recovery failed", err);
        return {
            recovered: false,
            reason: "error",
            entryCount: parsed.entries.length,
            error: String(err),
        };
    }
}

export { STORAGE_JOURNAL_KEY };
