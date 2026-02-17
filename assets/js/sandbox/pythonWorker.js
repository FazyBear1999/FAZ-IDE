// assets/js/sandbox/pythonWorker.js
// Lightweight Python runtime worker for FAZ IDE Phase 1.
// Loads Pyodide lazily, executes code, and streams stdout/stderr back.

const PYODIDE_VERSION = "0.27.2";
const PYODIDE_PRIMARY_CDN_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_FALLBACK_CDN_INDEX_URL = `https://unpkg.com/pyodide@${PYODIDE_VERSION}/`;

const MAX_CONSOLE_MESSAGE_CHARS = 1400;
const MAX_RESULT_CHARS = 4000;
const MAX_SOURCE_CHARS = 120_000;
const MAX_SOURCE_LINES = 4_000;
const BLOCKED_IMPORT_ROOTS = new Set([
    "ctypes",
    "js",
    "micropip",
    "multiprocessing",
    "pyodide",
    "socket",
    "subprocess",
]);

let pyodidePromise = null;
let pyodideInstance = null;
let pyodideRuntimeSource = null;
let pyodideRuntimeSourceAnnounced = false;

function buildPyodideRuntimeCandidates() {
    const localIndexURL = (() => {
        try {
            return new URL(`../../vendor/pyodide/v${PYODIDE_VERSION}/full/`, self.location.href).href;
        } catch {
            return "";
        }
    })();

    const candidates = [
        {
            label: "local-bundle",
            indexURL: localIndexURL,
        },
        {
            label: "cdn-jsdelivr",
            indexURL: PYODIDE_PRIMARY_CDN_INDEX_URL,
        },
        {
            label: "cdn-unpkg",
            indexURL: PYODIDE_FALLBACK_CDN_INDEX_URL,
        },
    ];

    return candidates
        .map((entry) => {
            const indexURL = String(entry?.indexURL || "").trim();
            if (!indexURL) return null;
            return {
                label: String(entry?.label || "source"),
                indexURL,
                bootURL: `${indexURL.replace(/\/+$/, "")}/pyodide.js`,
            };
        })
        .filter(Boolean);
}

async function probePyodideBootReachability(bootURL, timeoutMs = 6000) {
    if (typeof fetch !== "function" || typeof AbortController !== "function") {
        return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 6000));
    try {
        const response = await fetch(String(bootURL || ""), {
            method: "GET",
            mode: "cors",
            cache: "no-store",
            signal: controller.signal,
        });
        if (!response.ok) {
            throw new Error(`Pyodide runtime probe failed: HTTP ${response.status}`);
        }
    } catch (err) {
        throw new Error(`Python runtime probe failed (${formatError(err)})`);
    } finally {
        clearTimeout(timer);
    }
}

function truncateText(value = "", maxChars = 0) {
    const source = String(value ?? "");
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || source.length <= limit) return source;
    return `${source.slice(0, limit)}...`;
}

function emit(payload = {}) {
    self.postMessage(payload);
}

function formatError(err) {
    if (!err) return "Python runtime error";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.stack || err.message || String(err);
    return String(err);
}

function describePythonRuntimeError(err) {
    const raw = formatError(err);
    const lower = String(raw || "").toLowerCase();
    if (
        lower.includes("pyodide failed to load")
        || lower.includes("importscripts")
        || lower.includes("cdn.jsdelivr.net")
        || lower.includes("unpkg.com")
        || lower.includes("vendor/pyodide")
    ) {
        return "Python runtime failed to load from local bundle/CDN sources. Network policy or missing local Pyodide bundle may be blocking startup.";
    }
    return raw;
}

async function loadPyodideFromCandidate(candidate) {
    if (!candidate || !candidate.indexURL || !candidate.bootURL) {
        throw new Error("Invalid Pyodide runtime source.");
    }

    if (typeof self.loadPyodide !== "function") {
        await probePyodideBootReachability(candidate.bootURL);
        importScripts(candidate.bootURL);
    }
    if (typeof self.loadPyodide !== "function") {
        throw new Error(`Pyodide loader unavailable after boot script (${candidate.label}).`);
    }

    const pyodide = await self.loadPyodide({
        indexURL: candidate.indexURL,
    });
    pyodideRuntimeSource = candidate;
    return pyodide;
}

function normalizeImportRoot(value = "") {
    const moduleName = String(value || "").trim();
    if (!moduleName) return "";
    const withoutAlias = moduleName.split(/\s+as\s+/i)[0] || "";
    const root = withoutAlias.split(".")[0] || "";
    return root.trim();
}

function assertSafePythonSource(source = "") {
    const text = String(source ?? "");
    if (text.length > MAX_SOURCE_CHARS) {
        throw new Error(`Python source exceeds safety limit (${MAX_SOURCE_CHARS} characters).`);
    }

    const lines = text.split(/\r?\n/);
    if (lines.length > MAX_SOURCE_LINES) {
        throw new Error(`Python source exceeds safety limit (${MAX_SOURCE_LINES} lines).`);
    }

    for (const rawLine of lines) {
        const line = String(rawLine || "").trim();
        if (!line || line.startsWith("#")) continue;

        const fromMatch = line.match(/^from\s+([A-Za-z_][\w.]*)\s+import\b/);
        if (fromMatch) {
            const root = normalizeImportRoot(fromMatch[1]);
            if (root && BLOCKED_IMPORT_ROOTS.has(root)) {
                throw new Error(`Blocked Python import in sandbox: ${root}`);
            }
            continue;
        }

        const importMatch = line.match(/^import\s+(.+)$/);
        if (!importMatch) continue;
        const modules = importMatch[1].split(",");
        for (const moduleName of modules) {
            const root = normalizeImportRoot(moduleName);
            if (root && BLOCKED_IMPORT_ROOTS.has(root)) {
                throw new Error(`Blocked Python import in sandbox: ${root}`);
            }
        }
    }
}

async function ensurePyodide() {
    if (pyodideInstance) return pyodideInstance;
    if (pyodidePromise) return pyodidePromise;

    pyodidePromise = (async () => {
        const runtimeCandidates = buildPyodideRuntimeCandidates();
        if (!runtimeCandidates.length) {
            throw new Error("No Python runtime sources configured.");
        }

        const failures = [];
        for (let i = 0; i < runtimeCandidates.length; i += 1) {
            const candidate = runtimeCandidates[i];
            try {
                const pyodide = await loadPyodideFromCandidate(candidate);
                pyodideInstance = pyodide;
                return pyodide;
            } catch (err) {
                failures.push(`${candidate.label}: ${formatError(err)}`);
            }
        }

        throw new Error(`Pyodide failed to load from all sources (${failures.join(" | ")})`);
    })();

    try {
        return await pyodidePromise;
    } catch (err) {
        pyodidePromise = null;
        pyodideInstance = null;
        throw err;
    }
}

async function runPythonJob(id, code) {
    const source = String(code ?? "");
    assertSafePythonSource(source);
    emit({ type: "console", id, level: "info", args: ["Python runtime: loading environment..."] });
    emit({ type: "console", id, level: "info", args: ["Python runtime: initializing core..."] });
    const pyodide = await ensurePyodide();
    if (!pyodideRuntimeSourceAnnounced) {
        pyodideRuntimeSourceAnnounced = true;
        const sourceLabel = String(pyodideRuntimeSource?.label || "unknown-source");
        emit({ type: "console", id, level: "info", args: [`Python runtime source: ${sourceLabel}`] });
    }
    emit({ type: "console", id, level: "info", args: ["Python runtime: core ready."] });

    pyodide.setStdout({
        batched(message) {
            const text = truncateText(message, MAX_CONSOLE_MESSAGE_CHARS);
            if (!text.trim()) return;
            emit({ type: "console", id, level: "info", args: [text] });
        },
    });

    pyodide.setStderr({
        batched(message) {
            const text = truncateText(message, MAX_CONSOLE_MESSAGE_CHARS);
            if (!text.trim()) return;
            emit({ type: "console", id, level: "warn", args: [text] });
        },
    });

    let globals = null;
    let value = null;
    try {
        emit({ type: "console", id, level: "info", args: ["Python runtime: executing code..."] });
        globals = typeof pyodide.toPy === "function" ? pyodide.toPy({}) : null;
        value = globals
            ? await pyodide.runPythonAsync(source, { globals })
            : await pyodide.runPythonAsync(source);
        const textResult = value == null ? "" : truncateText(String(value), MAX_RESULT_CHARS);
        emit({ type: "console", id, level: "info", args: ["Python runtime: execution complete."] });
        emit({ type: "result", id, result: textResult });
    } finally {
        if (value && typeof value.destroy === "function") {
            try {
                value.destroy();
            } catch {
                // no-op
            }
        }
        if (globals && typeof globals.destroy === "function") {
            try {
                globals.destroy();
            } catch {
                // no-op
            }
        }
    }
}

self.onmessage = async (event) => {
    const data = event?.data || {};
    const type = String(data?.type || "");
    if (type !== "run") return;

    const id = Number(data?.id);
    if (!Number.isFinite(id)) return;

    try {
        await runPythonJob(id, data?.code || "");
    } catch (err) {
        emit({
            type: "runtime_error",
            id,
            message: truncateText(describePythonRuntimeError(err), MAX_CONSOLE_MESSAGE_CHARS),
        });
    }
};
