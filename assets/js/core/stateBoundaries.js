// assets/js/core/stateBoundaries.js
// Boundary snapshots for project/workspace/runtime state.

function toObject(value) {
    if (!value || typeof value !== "object") return {};
    return value;
}

function cloneSnapshot(value) {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
            // Fall through to JSON strategy
        }
    }
    try {
        return JSON.parse(JSON.stringify(value));
    } catch {
        return value;
    }
}

function safeRead(getter) {
    if (typeof getter !== "function") return {};
    try {
        return toObject(getter());
    } catch {
        return {};
    }
}

export function createStateBoundaries({ getProject, getWorkspace, getRuntime } = {}) {
    const readers = {
        project: () => safeRead(getProject),
        workspace: () => safeRead(getWorkspace),
        runtime: () => safeRead(getRuntime),
    };

    function snapshot() {
        return {
            at: Date.now(),
            project: cloneSnapshot(readers.project()),
            workspace: cloneSnapshot(readers.workspace()),
            runtime: cloneSnapshot(readers.runtime()),
        };
    }

    function snapshotBoundary(name) {
        const key = String(name || "").trim().toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(readers, key)) return null;
        return cloneSnapshot(readers[key]());
    }

    return {
        snapshot,
        snapshotBoundary,
        listBoundaries() {
            return Object.keys(readers);
        },
    };
}
