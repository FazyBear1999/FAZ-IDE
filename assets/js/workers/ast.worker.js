/* eslint-disable no-restricted-globals */
import * as acorn from "../../vendor/acorn/acorn.js";

function safeCode(input) {
    return String(input ?? "");
}

function normalizeName(name) {
    return String(name ?? "").trim();
}

function locToLineCh(loc = null) {
    if (!loc) return { line: 0, ch: 0 };
    return {
        line: Math.max(0, Number(loc.line || 1) - 1),
        ch: Math.max(0, Number(loc.column || 0)),
    };
}

function buildDiagnosticFromError(error) {
    if (!error) {
        return [{
            level: "error",
            line: 0,
            ch: 0,
            endCh: 1,
            message: "Unknown parse error",
            source: "ast",
        }];
    }
    const pos = locToLineCh(error.loc);
    return [{
        level: "error",
        line: pos.line,
        ch: pos.ch,
        endCh: pos.ch + 1,
        message: String(error.message || "Syntax error"),
        source: "ast",
    }];
}

function walkNode(node, visitors, parent = null) {
    if (!node || typeof node !== "object") return;
    const visitor = visitors[node.type];
    if (typeof visitor === "function") {
        visitor(node, parent);
    }

    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const value = node[key];
        if (!value) continue;
        if (Array.isArray(value)) {
            for (const child of value) {
                if (child && typeof child.type === "string") {
                    walkNode(child, visitors, node);
                }
            }
            continue;
        }
        if (value && typeof value.type === "string") {
            walkNode(value, visitors, node);
        }
    }
}

function getParamNames(params = []) {
    const names = [];
    const pushPattern = (pattern) => {
        if (!pattern) return;
        if (pattern.type === "Identifier") {
            names.push(pattern.name);
            return;
        }
        if (pattern.type === "AssignmentPattern") {
            pushPattern(pattern.left);
            return;
        }
        if (pattern.type === "RestElement") {
            pushPattern(pattern.argument);
            return;
        }
        if (pattern.type === "ObjectPattern") {
            pattern.properties?.forEach((prop) => {
                if (prop.type === "Property") pushPattern(prop.value);
                if (prop.type === "RestElement") pushPattern(prop.argument);
            });
            return;
        }
        if (pattern.type === "ArrayPattern") {
            pattern.elements?.forEach((entry) => pushPattern(entry));
        }
    };
    params.forEach((entry) => pushPattern(entry));
    return names;
}

function parseCode(code) {
    return acorn.parse(code, {
        ecmaVersion: "latest",
        sourceType: "module",
        allowHashBang: true,
        locations: true,
        ranges: true,
    });
}

function analyzeCode(code) {
    const source = safeCode(code);
    let ast = null;
    try {
        ast = parseCode(source);
    } catch (error) {
        return {
            ok: false,
            symbols: [],
            references: [],
            diagnostics: buildDiagnosticFromError(error),
        };
    }

    const symbols = [];
    const references = [];
    const addSymbol = (type, name, node, detail = "") => {
        if (!name || !node) return;
        symbols.push({
            id: `${type}-${name}-${node.start}`,
            kind: type,
            name,
            detail: detail || name,
            line: Math.max(0, (node.loc?.start?.line || 1) - 1),
            ch: Math.max(0, node.loc?.start?.column || 0),
            start: node.start,
            end: node.end,
        });
    };

    walkNode(ast, {
        FunctionDeclaration(node) {
            if (!node.id?.name) return;
            const params = getParamNames(node.params).join(", ");
            addSymbol("function", node.id.name, node.id, `${node.id.name}(${params})`);
        },
        ClassDeclaration(node) {
            if (!node.id?.name) return;
            addSymbol("class", node.id.name, node.id, node.id.name);
        },
        VariableDeclarator(node) {
            if (node.id?.type !== "Identifier") return;
            if (!node.id.name) return;
            const initType = node.init?.type || "value";
            let kind = "variable";
            if (initType === "ArrowFunctionExpression") kind = "arrow";
            if (initType === "FunctionExpression") kind = "function";
            addSymbol(kind, node.id.name, node.id, node.id.name);
        },
        MethodDefinition(node) {
            if (node.key?.type !== "Identifier") return;
            const name = node.key.name;
            const params = getParamNames(node.value?.params || []).join(", ");
            addSymbol("method", name, node.key, `${name}(${params})`);
        },
        PropertyDefinition(node) {
            if (node.key?.type !== "Identifier") return;
            addSymbol("field", node.key.name, node.key, node.key.name);
        },
        Identifier(node, parent) {
            if (!node.name) return;
            const line = Math.max(0, (node.loc?.start?.line || 1) - 1);
            const ch = Math.max(0, node.loc?.start?.column || 0);
            const role = (() => {
                if (!parent) return "reference";
                if (
                    parent.type === "FunctionDeclaration" && parent.id === node ||
                    parent.type === "ClassDeclaration" && parent.id === node ||
                    parent.type === "VariableDeclarator" && parent.id === node
                ) {
                    return "declaration";
                }
                if (
                    parent.type === "MemberExpression" &&
                    parent.property === node &&
                    !parent.computed
                ) {
                    return "property";
                }
                if (
                    parent.type === "Property" &&
                    parent.key === node &&
                    !parent.computed
                ) {
                    return "property-key";
                }
                return "reference";
            })();
            references.push({
                name: node.name,
                line,
                ch,
                start: node.start,
                end: node.end,
                role,
            });
        },
    });

    return {
        ok: true,
        symbols: symbols.sort((a, b) => a.start - b.start),
        references: references.sort((a, b) => a.start - b.start),
        diagnostics: [],
    };
}

function getReferencesForName(analysis, name) {
    const target = normalizeName(name);
    if (!target) return [];
    return analysis.references.filter((entry) => entry.name === target);
}

function buildRenameEdits(analysis, oldName, nextName) {
    const from = normalizeName(oldName);
    const to = normalizeName(nextName);
    if (!from || !to || from === to) return [];
    return getReferencesForName(analysis, from).map((entry) => ({
        start: entry.start,
        end: entry.end,
        oldText: from,
        newText: to,
        line: entry.line,
        ch: entry.ch,
    }));
}

function applyRenameEdits(code, edits) {
    const source = safeCode(code);
    const ordered = [...(Array.isArray(edits) ? edits : [])].sort((a, b) => b.start - a.start);
    let next = source;
    for (const edit of ordered) {
        const start = Math.max(0, Number(edit.start) || 0);
        const end = Math.max(start, Number(edit.end) || start);
        next = `${next.slice(0, start)}${edit.newText}${next.slice(end)}`;
    }
    return next;
}

self.addEventListener("message", (event) => {
    const payload = event.data || {};
    const id = payload.id ?? null;
    const action = String(payload.action || "analyze");
    const code = safeCode(payload.code);
    const analysis = analyzeCode(code);

    if (!analysis.ok) {
        self.postMessage({
            id,
            action,
            ok: false,
            symbols: [],
            references: [],
            diagnostics: analysis.diagnostics,
            edits: [],
            nextCode: code,
        });
        return;
    }

    if (action === "symbols") {
        self.postMessage({ id, action, ok: true, symbols: analysis.symbols, diagnostics: [] });
        return;
    }

    if (action === "references") {
        const name = normalizeName(payload.name);
        self.postMessage({
            id,
            action,
            ok: true,
            references: getReferencesForName(analysis, name),
            diagnostics: [],
        });
        return;
    }

    if (action === "rename") {
        const oldName = normalizeName(payload.oldName || payload.name);
        const newName = normalizeName(payload.newName || payload.nextName);
        const edits = buildRenameEdits(analysis, oldName, newName);
        self.postMessage({
            id,
            action,
            ok: true,
            edits,
            nextCode: applyRenameEdits(code, edits),
            diagnostics: [],
        });
        return;
    }

    self.postMessage({
        id,
        action: "analyze",
        ok: true,
        symbols: analysis.symbols,
        references: analysis.references,
        diagnostics: [],
    });
});
