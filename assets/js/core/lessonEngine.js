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

function hasTypeableCodeContent(expected = "") {
    const source = String(expected || "");
    if (!source) return false;
    let index = 0;
    while (index < source.length) {
        const lineEnd = source.indexOf("\n", index);
        const end = lineEnd === -1 ? source.length : lineEnd;
        const line = source.slice(index, end);
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("//") && !trimmed.startsWith("/*") && !trimmed.startsWith("<!--") && !trimmed.endsWith("*/") && !trimmed.endsWith("-->")) {
            return true;
        }
        if (lineEnd === -1) break;
        index = lineEnd + 1;
    }
    return false;
}

export function lintLessonAuthoring(source = "") {
    const text = String(source || "").replace(/\r\n?/g, "\n");
    const lines = text.split("\n");
    const issues = [];
    const openLegacy = new Set();

    lines.forEach((line, lineIndex) => {
        const lineNumber = lineIndex + 1;
        const hasLessonToken = line.includes("[LESSON:");
        const hasStepToken = line.includes("[STEP:");
        const lessonMatch = hasLessonToken ? line.match(LESSON_MARKER) : null;
        const stepMatch = hasStepToken ? line.match(LEGACY_STEP_MARKER) : null;

        if (hasLessonToken && !lessonMatch) {
            issues.push({
                code: "malformed-lesson-marker",
                severity: "error",
                line: lineNumber,
                message: "Malformed [LESSON:id] marker.",
            });
        }

        if (hasStepToken && !stepMatch) {
            issues.push({
                code: "malformed-step-marker",
                severity: "error",
                line: lineNumber,
                message: "Malformed [STEP:id:START|END] marker.",
            });
        }

        if (stepMatch) {
            const markerId = String(stepMatch[1] || "").trim();
            const kind = String(stepMatch[2] || "").trim().toUpperCase();
            if (kind === "START") {
                openLegacy.add(markerId);
            } else if (kind === "END") {
                if (!openLegacy.has(markerId)) {
                    issues.push({
                        code: "orphan-step-end",
                        severity: "error",
                        line: lineNumber,
                        message: `Found [STEP:${markerId}:END] without a matching START.`,
                    });
                } else {
                    openLegacy.delete(markerId);
                }
            }
        }
    });

    openLegacy.forEach((markerId) => {
        issues.push({
            code: "unclosed-step-start",
            severity: "error",
            line: 0,
            message: `Found [STEP:${markerId}:START] without a matching END.`,
        });
    });

    const steps = parseLessonSteps(text);
    if ((text.includes("[LESSON:") || text.includes("[STEP:")) && !steps.length) {
        issues.push({
            code: "unreachable-objective",
            severity: "warn",
            line: 0,
            message: "Markers were found but no reachable lesson objective could be parsed.",
        });
    }

    steps.forEach((step) => {
        if (!hasTypeableCodeContent(step.expected || "")) {
            issues.push({
                code: "empty-code-objective",
                severity: "warn",
                line: Number(step.startLine) || 0,
                message: `Objective \"${String(step.id || "lesson")}\" has no typeable code content.`,
            });
        }
    });

    return {
        issueCount: issues.length,
        errorCount: issues.filter((entry) => entry.severity === "error").length,
        warningCount: issues.filter((entry) => entry.severity === "warn").length,
        issues,
    };
}
