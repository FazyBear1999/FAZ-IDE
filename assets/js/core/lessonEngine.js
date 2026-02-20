const STEP_MARKER = /\[STEP:([A-Za-z0-9._-]+):(START|END)\]/;

function getLineOffsets(source = "") {
    const text = String(source || "");
    const offsets = [0];
    for (let i = 0; i < text.length; i += 1) {
        if (text[i] === "\n") {
            offsets.push(i + 1);
        }
    }
    return offsets;
}

export function parseLessonSteps(source = "") {
    const text = String(source || "").replace(/\r\n?/g, "\n");
    if (!text || text.indexOf("[STEP:") === -1) return [];
    const lines = text.split("\n");
    const offsets = getLineOffsets(text);
    const openById = new Map();
    let nextOrder = 0;
    const parsed = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = String(lines[lineIndex] || "");
        if (line.indexOf("[STEP:") === -1) continue;
        const match = line.match(STEP_MARKER);
        if (!match) continue;
        const id = String(match[1] || "").trim();
        const kind = String(match[2] || "").trim().toUpperCase();
        if (!id) continue;

        if (kind === "START") {
            if (openById.has(id)) continue;
            openById.set(id, {
                startLine: lineIndex + 1,
                order: nextOrder,
            });
            nextOrder += 1;
            continue;
        }

        if (kind === "END") {
            const open = openById.get(id);
            if (!open || !Number.isFinite(open.startLine)) continue;
            const startIndex = offsets[open.startLine] ?? text.length;
            const endIndex = Math.max(startIndex, offsets[lineIndex] ?? text.length);
            const expected = text.slice(startIndex, endIndex);
            if (expected.length > 0) {
                parsed.push({
                    id,
                    startIndex,
                    endIndex,
                    expected,
                    startLine: open.startLine,
                    endLine: lineIndex,
                    order: open.order,
                });
            }
            openById.delete(id);
        }
    }

    return parsed
        .sort((a, b) => {
            const byOrder = a.order - b.order;
            if (byOrder !== 0) return byOrder;
            return a.startIndex - b.startIndex;
        })
        .map(({ order, ...step }) => step);
}

export function normalizeLessonInputChar(value = "") {
    const key = String(value || "");
    if (!key) return "";
    if (key === "Enter") return "\n";
    if (key === "Tab") return "\t";
    return key.length === 1 ? key : "";
}
