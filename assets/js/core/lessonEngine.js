const LEGACY_STEP_MARKER = /\[STEP:([A-Za-z0-9._-]+):(START|END)\]/;
const LESSON_MARKER = /\[LESSON:([A-Za-z0-9._-]+)\]/;

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

function buildNextBlankLineLookup(lines = []) {
    const list = Array.isArray(lines) ? lines : [];
    const lookup = new Array(list.length + 1).fill(list.length);
    let nextBlank = list.length;
    for (let index = list.length - 1; index >= 0; index -= 1) {
        const raw = String(list[index] || "");
        if (!raw.trim()) {
            nextBlank = index;
        }
        lookup[index] = nextBlank;
    }
    return lookup;
}

function collapseLessonStepsToSingleCompletion(steps = [], text = "") {
    const list = Array.isArray(steps) ? steps : [];
    if (list.length <= 1) return list;

    const sorted = [...list].sort((a, b) => {
        const byStart = (Number(a?.startIndex) || 0) - (Number(b?.startIndex) || 0);
        if (byStart !== 0) return byStart;
        return (Number(a?.endIndex) || 0) - (Number(b?.endIndex) || 0);
    });

    const first = sorted[0] || null;
    const last = sorted[sorted.length - 1] || null;
    if (!first || !last) return list;

    const startIndex = Math.max(0, Number(first.startIndex) || 0);
    const endIndex = Math.max(startIndex, Number(last.endIndex) || startIndex);
    const expected = String(text || "").slice(startIndex, endIndex);
    if (!expected.length) return list;

    return [{
        id: String(first.id || "lesson-combined").trim() || "lesson-combined",
        startIndex,
        endIndex,
        expected,
        startLine: Number(first.startLine) || 1,
        endLine: Number(last.endLine) || Number(first.startLine) || 1,
    }];
}

export function parseLessonSteps(source = "") {
    const text = String(source || "").replace(/\r\n?/g, "\n");
    if (!text || (text.indexOf("[STEP:") === -1 && text.indexOf("[LESSON:") === -1)) return [];
    const lines = text.split("\n");
    const nextBlankLineLookup = buildNextBlankLineLookup(lines);
    const offsets = getLineOffsets(text);
    const openById = new Map();
    let nextOrder = 0;
    const parsed = [];
    const lessonMarkers = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = String(lines[lineIndex] || "");
        if (line.indexOf("[LESSON:") !== -1) {
            const lessonMatch = line.match(LESSON_MARKER);
            if (lessonMatch) {
                const id = String(lessonMatch[1] || "").trim();
                if (id) {
                    lessonMarkers.push({
                        id,
                        lineIndex,
                        order: nextOrder,
                    });
                    nextOrder += 1;
                }
            }
        }

        if (line.indexOf("[STEP:") === -1) continue;
        const match = line.match(LEGACY_STEP_MARKER);
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

    if (lessonMarkers.length > 0) {
        for (let index = 0; index < lessonMarkers.length; index += 1) {
            const marker = lessonMarkers[index];
            const nextMarker = lessonMarkers[index + 1] || null;
            const startLine = marker.lineIndex + 1;
            const maxEndLine = nextMarker ? nextMarker.lineIndex : lines.length;
            const firstBlankLine = nextBlankLineLookup[startLine] ?? lines.length;
            const nextLine = firstBlankLine < maxEndLine ? firstBlankLine : maxEndLine;
            const startIndex = offsets[startLine] ?? text.length;
            const endIndex = Math.max(startIndex, offsets[nextLine] ?? text.length);
            const expected = text.slice(startIndex, endIndex);
            if (!expected.length) continue;
            parsed.push({
                id: marker.id,
                startIndex,
                endIndex,
                expected,
                startLine: startLine + 1,
                endLine: nextLine,
                order: marker.order,
            });
        }
    }

    const ordered = parsed
        .sort((a, b) => {
            const byOrder = a.order - b.order;
            if (byOrder !== 0) return byOrder;
            return a.startIndex - b.startIndex;
        })
        .map(({ order, ...step }) => step);

    return collapseLessonStepsToSingleCompletion(ordered, text);
}

export function normalizeLessonInputChar(value = "") {
    const key = String(value || "");
    if (!key) return "";
    if (key === "Enter") return "\n";
    if (key === "Tab") return "\t";
    return key.length === 1 ? key : "";
}
