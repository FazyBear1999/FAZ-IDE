// assets/js/core/formatting.js
// Formatter adapter: tries Prettier first, falls back to app formatter.

function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
}

export function createFormatter({ fallbackFormat } = {}) {
    let prettier = null;
    let prettierBabel = null;
    let prettierEstree = null;
    let loading = null;

    async function ensurePrettier() {
        if (prettier && prettierBabel && prettierEstree) {
            return true;
        }
        if (loading) {
            await loading;
            return Boolean(prettier && prettierBabel && prettierEstree);
        }
        loading = (async () => {
            try {
                const [standalone, babelPlugin, estreePlugin] = await Promise.all([
                    import("../../vendor/prettier/standalone.js"),
                    import("../../vendor/prettier/babel.js"),
                    import("../../vendor/prettier/estree.js"),
                ]);
                prettier = standalone;
                prettierBabel = babelPlugin;
                prettierEstree = estreePlugin;
            } catch {
                prettier = null;
                prettierBabel = null;
                prettierEstree = null;
            }
        })();
        await loading;
        loading = null;
        return Boolean(prettier && prettierBabel && prettierEstree);
    }

    async function formatJavaScript(code, options = {}) {
        const source = String(code ?? "");
        const mode = String(options.mode || "auto");
        const hasPrettier = await ensurePrettier();
        const tabWidth = clamp(options.tabWidth ?? options.tabSize ?? 2, 2, 8);
        const printWidth = clamp(options.printWidth ?? 100, 40, 220);
        const useTabs = Boolean(options.useTabs);
        const semi = options.semi !== false;
        const singleQuote = Boolean(options.singleQuote);
        const allowPrettier = mode === "auto" || mode === "prettier";
        const allowFallback = mode === "auto" || mode === "basic";
        if (allowPrettier && hasPrettier) {
            try {
                const formatted = await prettier.format(source, {
                    parser: "babel",
                    plugins: [prettierBabel, prettierEstree],
                    tabWidth,
                    printWidth,
                    useTabs,
                    semi,
                    singleQuote,
                    trailingComma: "es5",
                    bracketSpacing: true,
                    arrowParens: "always",
                });
                return {
                    ok: true,
                    method: "prettier",
                    code: String(formatted ?? source),
                };
            } catch (err) {
                // fall through to fallback
                if (typeof fallbackFormat !== "function") {
                    return {
                        ok: false,
                        method: "prettier",
                        code: source,
                        error: String(err?.message || err),
                    };
                }
            }
        }
        if (allowFallback && typeof fallbackFormat === "function") {
            try {
                const next = fallbackFormat(source);
                return {
                    ok: true,
                    method: "basic",
                    code: String(next ?? source),
                };
            } catch (err) {
                return {
                    ok: false,
                    method: "basic",
                    code: source,
                    error: String(err?.message || err),
                };
            }
        }
        return {
            ok: false,
            method: mode === "prettier" ? "prettier" : "none",
            code: source,
            error: mode === "prettier" ? "Prettier unavailable" : "No formatter available",
        };
    }

    async function isPrettierReady() {
        return ensurePrettier();
    }

    return {
        formatJavaScript,
        isPrettierReady,
    };
}
