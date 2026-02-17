// assets/js/sandbox/pythonRunner.js
// Phase 1 Python runner for FAZ IDE.
// Uses a dedicated worker (Pyodide) with safe timeout + token-aware callbacks.

const DEFAULT_TIMEOUT_MS = 8000;
const PYTHON_COLD_START_TIMEOUT_MS = 60_000;
const MIN_TIMEOUT_MS = 250;

let pythonWorker = null;
let nextRequestId = 1;
const pending = new Map();
let pythonRuntimeWarm = false;

function getMockPythonExecutor() {
    if (typeof window === "undefined") return null;
    const fn = window.__FAZIDE_PYTHON_EXECUTE__;
    return typeof fn === "function" ? fn : null;
}

function clearPendingEntry(id) {
    const entry = pending.get(id);
    if (!entry) return null;
    pending.delete(id);
    clearTimeout(entry.timeoutHandle);
    return entry;
}

function rejectAllPending(error) {
    const items = Array.from(pending.values());
    pending.clear();
    items.forEach((entry) => {
        clearTimeout(entry.timeoutHandle);
        entry.reject(error);
    });
}

function resetPythonWorker(reason = "Python worker restarted") {
    if (pythonWorker) {
        try {
            pythonWorker.terminate();
        } catch {
            // no-op
        }
        pythonWorker = null;
    }
    pythonRuntimeWarm = false;
    rejectAllPending(new Error(reason));
}

function ensurePythonWorker() {
    if (pythonWorker) return pythonWorker;

    const workerUrl = new URL("./pythonWorker.js", import.meta.url);
    pythonWorker = new Worker(workerUrl);

    pythonWorker.addEventListener("message", (event) => {
        const data = event?.data || {};
        const id = Number(data?.id);
        if (!Number.isFinite(id)) return;
        const entry = pending.get(id);
        if (!entry) return;

        const type = String(data?.type || "");
        if (type === "console") {
            pythonRuntimeWarm = true;
            const level = String(data?.level || "info");
            const args = Array.isArray(data?.args) ? data.args : [data?.args];
            entry.onConsole(level, args);
            return;
        }

        if (type === "runtime_error") {
            pythonRuntimeWarm = true;
            clearPendingEntry(id);
            entry.reject(new Error(String(data?.message || "Python runtime error")));
            return;
        }

        if (type === "result") {
            pythonRuntimeWarm = true;
            clearPendingEntry(id);
            entry.resolve({
                result: String(data?.result || ""),
            });
        }
    });

    pythonWorker.addEventListener("error", (event) => {
        const message = String(event?.message || "Python worker failed.");
        resetPythonWorker(message);
    });

    return pythonWorker;
}

async function runWithMockExecutor({ code = "", runContext = null, onConsole = () => {} } = {}) {
    const executor = getMockPythonExecutor();
    if (!executor) return null;

    const response = await executor({
        code: String(code ?? ""),
        runContext,
    });

    const stdout = Array.isArray(response?.stdout) ? response.stdout : [];
    const stderr = Array.isArray(response?.stderr) ? response.stderr : [];
    stdout.forEach((line) => onConsole("info", [String(line ?? "")]));
    stderr.forEach((line) => onConsole("warn", [String(line ?? "")]));

    if (response?.error) {
        throw new Error(String(response.error));
    }

    return {
        result: String(response?.result || ""),
    };
}

function runWithTimeout(taskPromise, timeoutMs = DEFAULT_TIMEOUT_MS, message = "Python execution timed out.") {
    const timeout = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            reject(new Error(message.replace("{timeout}", String(timeout))));
        }, timeout);

        Promise.resolve(taskPromise)
            .then((value) => {
                clearTimeout(timeoutHandle);
                resolve(value);
            })
            .catch((err) => {
                clearTimeout(timeoutHandle);
                reject(err);
            });
    });
}

export async function runPythonInSandbox({
    code = "",
    runContext = null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    onConsole = () => {},
} = {}) {
    const timeout = Math.max(MIN_TIMEOUT_MS, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);

    const mocked = await runWithTimeout(
        runWithMockExecutor({ code, runContext, onConsole }),
        timeout,
        "Python execution timed out after {timeout}ms."
    );
    if (mocked) return mocked;

    const worker = ensurePythonWorker();
    const requestId = nextRequestId;
    nextRequestId += 1;

    const effectiveTimeout = pythonRuntimeWarm
        ? timeout
        : Math.max(timeout, PYTHON_COLD_START_TIMEOUT_MS);

    return new Promise((resolve, reject) => {
        const timeoutHandle = setTimeout(() => {
            clearPendingEntry(requestId);
            const startupTimedOut = !pythonRuntimeWarm;
            const timeoutMessage = startupTimedOut
                ? `Python execution timed out after ${effectiveTimeout}ms (startup blocked or offline Pyodide CDN).`
                : `Python execution timed out after ${effectiveTimeout}ms.`;
            resetPythonWorker(timeoutMessage);
            reject(new Error(timeoutMessage));
        }, effectiveTimeout);

        pending.set(requestId, {
            resolve,
            reject,
            timeoutHandle,
            onConsole: typeof onConsole === "function" ? onConsole : () => {},
        });

        worker.postMessage({
            type: "run",
            id: requestId,
            code: String(code ?? ""),
            runContext,
        });
    });
}

export function cancelPythonSandboxRuns(reason = "Python run canceled.") {
    resetPythonWorker(String(reason || "Python run canceled."));
}

export function disposePythonSandboxRunner() {
    resetPythonWorker("Python runner disposed.");
}
