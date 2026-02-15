// assets/js/core/astClient.js
// Client wrapper around AST worker (symbols/references/rename/diagnostics).

function safeText(value) {
    return String(value ?? "");
}

export function createAstClient() {
    let worker = null;
    let requestId = 0;
    const pending = new Map();
    let bootError = null;

    function ensureWorker() {
        if (worker) return worker;
        if (bootError) return null;
        if (typeof Worker === "undefined") {
            bootError = new Error("Worker API unavailable");
            return null;
        }
        try {
            worker = new Worker(new URL("../workers/ast.worker.js", import.meta.url), { type: "module" });
            worker.addEventListener("message", (event) => {
                const data = event.data || {};
                const id = data.id;
                if (!pending.has(id)) return;
                const resolver = pending.get(id);
                pending.delete(id);
                resolver.resolve(data);
            });
            worker.addEventListener("error", (event) => {
                bootError = event?.error || new Error("AST worker failed");
                for (const [, resolver] of pending) {
                    resolver.reject(bootError);
                }
                pending.clear();
                worker?.terminate?.();
                worker = null;
            });
        } catch (err) {
            bootError = err;
            worker = null;
        }
        return worker;
    }

    function request(action, payload = {}) {
        const target = ensureWorker();
        if (!target) {
            return Promise.resolve({ ok: false, action, diagnostics: [], error: bootError ? String(bootError.message || bootError) : "AST worker unavailable" });
        }
        requestId += 1;
        const id = requestId;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            try {
                target.postMessage({
                    id,
                    action,
                    ...payload,
                });
            } catch (err) {
                pending.delete(id);
                reject(err);
            }
        });
    }

    async function analyze(code) {
        const response = await request("analyze", { code: safeText(code) });
        return response;
    }

    async function symbols(code) {
        const response = await request("symbols", { code: safeText(code) });
        return Array.isArray(response.symbols) ? response.symbols : [];
    }

    async function references(code, name) {
        const response = await request("references", {
            code: safeText(code),
            name: safeText(name),
        });
        return Array.isArray(response.references) ? response.references : [];
    }

    async function rename(code, oldName, newName) {
        const response = await request("rename", {
            code: safeText(code),
            oldName: safeText(oldName),
            newName: safeText(newName),
        });
        return {
            ok: Boolean(response?.ok),
            edits: Array.isArray(response?.edits) ? response.edits : [],
            nextCode: safeText(response?.nextCode ?? code),
            diagnostics: Array.isArray(response?.diagnostics) ? response.diagnostics : [],
        };
    }

    async function diagnostics(code) {
        const response = await request("analyze", { code: safeText(code) });
        return Array.isArray(response.diagnostics) ? response.diagnostics : [];
    }

    function available() {
        return !bootError;
    }

    function dispose() {
        worker?.terminate?.();
        worker = null;
        pending.clear();
    }

    return {
        analyze,
        symbols,
        references,
        rename,
        diagnostics,
        available,
        dispose,
    };
}
