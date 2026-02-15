/* eslint-disable no-restricted-globals */
// Lightweight lint worker for FAZ IDE.
// - Keeps diagnostics off the main thread.
// - Uses syntax parsing + lightweight heuristics.

function clampLine(line, totalLines) {
    const max = Math.max(0, totalLines - 1);
    return Math.max(0, Math.min(max, Number.isFinite(line) ? line : 0));
}

function clampCh(ch) {
    return Math.max(0, Number.isFinite(ch) ? ch : 0);
}

function parseErrorPosition(error) {
    const message = String(error?.message || "");
    const stack = String(error?.stack || "");
    const pairs = [
        /<anonymous>:(\d+):(\d+)/,
        /anonymous:(\d+):(\d+)/,
        /line\s+(\d+)\s*[:,]\s*column\s+(\d+)/i,
        /line\s+(\d+)/i,
    ];
    for (const pattern of pairs) {
        const match = stack.match(pattern) || message.match(pattern);
        if (!match) continue;
        const line = Number(match[1] || 1) - 1;
        const ch = Number(match[2] || 1) - 1;
        return { line: Math.max(0, line), ch: Math.max(0, ch) };
    }
    return { line: 0, ch: 0 };
}

function addSyntaxDiagnostic(code, diagnostics) {
    try {
        // Parse-only: this compiles but does not execute.
        // Wrapping in strict function gives cleaner parser errors.
        // eslint-disable-next-line no-new-func
        new Function(`"use strict";\n${code}`);
    } catch (error) {
        const pos = parseErrorPosition(error);
        diagnostics.push({
            level: "error",
            line: pos.line,
            ch: pos.ch,
            endCh: pos.ch + 1,
            message: String(error?.message || "Syntax error"),
            source: "parser",
        });
    }
}

function addBracketDiagnostics(code, diagnostics) {
    const pairs = {
        "(": ")",
        "[": "]",
        "{": "}",
    };
    const openerSet = new Set(Object.keys(pairs));
    const closerSet = new Set(Object.values(pairs));
    const stack = [];
    const lines = code.split("\n");
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        inLineComment = false;
        for (let ch = 0; ch < line.length; ch += 1) {
            const char = line[ch];
            const next = line[ch + 1];

            if (!inSingle && !inDouble && !inTemplate && !inBlockComment && char === "/" && next === "/") {
                inLineComment = true;
            }
            if (inLineComment) break;

            if (!inSingle && !inDouble && !inTemplate && !inBlockComment && char === "/" && next === "*") {
                inBlockComment = true;
                ch += 1;
                continue;
            }
            if (inBlockComment && char === "*" && next === "/") {
                inBlockComment = false;
                ch += 1;
                continue;
            }
            if (inBlockComment) continue;

            if (!inDouble && !inTemplate && char === "'" && line[ch - 1] !== "\\") {
                inSingle = !inSingle;
                continue;
            }
            if (!inSingle && !inTemplate && char === '"' && line[ch - 1] !== "\\") {
                inDouble = !inDouble;
                continue;
            }
            if (!inSingle && !inDouble && char === "`" && line[ch - 1] !== "\\") {
                inTemplate = !inTemplate;
                continue;
            }

            if (inSingle || inDouble || inTemplate) continue;

            if (openerSet.has(char)) {
                stack.push({ char, line: lineIndex, ch });
                continue;
            }
            if (closerSet.has(char)) {
                const expectedOpen = Object.entries(pairs).find(([, close]) => close === char)?.[0];
                const last = stack[stack.length - 1];
                if (!last || last.char !== expectedOpen) {
                    diagnostics.push({
                        level: "warn",
                        line: lineIndex,
                        ch,
                        endCh: ch + 1,
                        message: `Unexpected '${char}'`,
                        source: "brackets",
                    });
                } else {
                    stack.pop();
                }
            }
        }
    }

    for (const open of stack.slice(-12)) {
        diagnostics.push({
            level: "warn",
            line: open.line,
            ch: open.ch,
            endCh: open.ch + 1,
            message: `Unclosed '${open.char}'`,
            source: "brackets",
        });
    }
}

function addWhitespaceDiagnostics(lines, diagnostics) {
    lines.forEach((line, index) => {
        const match = line.match(/(\s+)$/);
        if (!match || !match[1] || !line.trim()) return;
        const start = line.length - match[1].length;
        diagnostics.push({
            level: "info",
            line: index,
            ch: start,
            endCh: line.length,
            message: "Trailing whitespace",
            source: "style",
        });
    });
}

function addLongLineDiagnostics(lines, diagnostics, maxLength = 140) {
    lines.forEach((line, index) => {
        if (line.length <= maxLength) return;
        diagnostics.push({
            level: "info",
            line: index,
            ch: maxLength,
            endCh: line.length,
            message: `Long line (${line.length} chars)`,
            source: "style",
        });
    });
}

function lintCode(code, options = {}) {
    const text = String(code ?? "");
    const lines = text.split("\n");
    const diagnostics = [];
    addSyntaxDiagnostic(text, diagnostics);
    addBracketDiagnostics(text, diagnostics);
    if (options?.trimWarnings !== false) {
        addWhitespaceDiagnostics(lines, diagnostics);
    }
    if (options?.longLineWarnings !== false) {
        addLongLineDiagnostics(lines, diagnostics, options.maxLineLength || 140);
    }

    return diagnostics
        .map((entry) => ({
            level: entry.level || "info",
            line: clampLine(entry.line, lines.length),
            ch: clampCh(entry.ch),
            endCh: Math.max(clampCh(entry.endCh), clampCh(entry.ch) + 1),
            message: String(entry.message || "Diagnostic"),
            source: entry.source || "lint",
        }))
        .slice(0, 120);
}

self.addEventListener("message", (event) => {
    const data = event.data || {};
    const id = data.id ?? null;
    const code = String(data.code ?? "");
    const options = data.options && typeof data.options === "object" ? data.options : {};
    const diagnostics = lintCode(code, options);
    self.postMessage({ id, diagnostics });
});
