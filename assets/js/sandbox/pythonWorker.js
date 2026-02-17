// assets/js/sandbox/pythonWorker.js
// Lightweight Python runtime worker for FAZ IDE Phase 1.
// Loads Pyodide lazily, executes code, and streams stdout/stderr back.

const PYODIDE_VERSION = "0.27.2";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PYODIDE_BOOT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

const MAX_CONSOLE_MESSAGE_CHARS = 1400;
const MAX_RESULT_CHARS = 4000;

let pyodidePromise = null;
let pyodideInstance = null;

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

async function ensurePyodide() {
    if (pyodideInstance) return pyodideInstance;
    if (pyodidePromise) return pyodidePromise;

    pyodidePromise = (async () => {
        if (typeof self.loadPyodide !== "function") {
            importScripts(PYODIDE_BOOT_URL);
        }
        if (typeof self.loadPyodide !== "function") {
            throw new Error("Pyodide failed to load from CDN.");
        }
        const pyodide = await self.loadPyodide({
            indexURL: PYODIDE_INDEX_URL,
        });
        pyodideInstance = pyodide;
        return pyodide;
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
    const pyodide = await ensurePyodide();

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

    const value = await pyodide.runPythonAsync(source);
    const textResult = value == null ? "" : truncateText(String(value), MAX_RESULT_CHARS);
    emit({ type: "result", id, result: textResult });
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
            message: truncateText(formatError(err), MAX_CONSOLE_MESSAGE_CHARS),
        });
    }
};
