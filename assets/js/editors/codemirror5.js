const DIAGNOSTIC_GUTTER = "cm-diagnostic-gutter";
const BREAKPOINT_GUTTER = "cm-breakpoint-gutter";

function normalizePos(pos, fallback = { line: 0, ch: 0 }) {
    if (!pos || !Number.isFinite(pos.line)) return { line: fallback.line, ch: fallback.ch };
    return {
        line: Math.max(0, Math.floor(pos.line)),
        ch: Math.max(0, Math.floor(Number.isFinite(pos.ch) ? pos.ch : 0)),
    };
}

function normalizeSelections(list = [], fallback = { line: 0, ch: 0 }) {
    return (Array.isArray(list) ? list : [])
        .map((entry) => {
            const anchor = normalizePos(entry?.anchor, fallback);
            const head = normalizePos(entry?.head, anchor);
            return { anchor, head };
        })
        .filter(Boolean);
}

export function makeCodeMirrorEditor(textareaEl) {
    if (!textareaEl || typeof window === "undefined" || !window.CodeMirror) {
        return null;
    }

    const cm = window.CodeMirror.fromTextArea(textareaEl, {
        mode: "javascript",
        theme: "material-darker",
        lineNumbers: true,
        tabSize: 2,
        indentUnit: 2,
        lineWrapping: true,
        gutters: ["CodeMirror-linenumbers", BREAKPOINT_GUTTER, DIAGNOSTIC_GUTTER],
    });

    const inputField = cm.getInputField?.() || cm.getWrapperElement?.()?.querySelector("textarea");
    if (inputField) {
        if (!inputField.id) inputField.id = "editor-cm-input";
        if (!inputField.name) inputField.name = "editor-cm-input";
    }

    const markBuckets = new Map();
    const widgetBuckets = new Map();

    function trackMark(kind, mark) {
        if (!kind || !mark) return;
        const bucket = markBuckets.get(kind) || [];
        bucket.push(mark);
        markBuckets.set(kind, bucket);
    }

    function clearMarks(kind) {
        if (!kind) {
            for (const bucket of markBuckets.values()) {
                for (const mark of bucket) mark.clear();
            }
            markBuckets.clear();
            return;
        }
        const bucket = markBuckets.get(kind) || [];
        for (const mark of bucket) mark.clear();
        markBuckets.delete(kind);
    }

    function trackWidget(kind, widget) {
        if (!kind || !widget) return;
        const bucket = widgetBuckets.get(kind) || [];
        bucket.push(widget);
        widgetBuckets.set(kind, bucket);
    }

    function clearLineWidgets(kind) {
        if (!kind) {
            for (const bucket of widgetBuckets.values()) {
                for (const widget of bucket) widget.clear?.();
            }
            widgetBuckets.clear();
            return;
        }
        const bucket = widgetBuckets.get(kind) || [];
        for (const widget of bucket) widget.clear?.();
        widgetBuckets.delete(kind);
    }

    function toSelection(sel, fallback) {
        return {
            anchor: normalizePos(sel?.anchor, fallback),
            head: normalizePos(sel?.head, fallback),
        };
    }

    function clampLine(line) {
        const max = Math.max(0, cm.lineCount() - 1);
        return Math.max(0, Math.min(max, Number.isFinite(line) ? Math.floor(line) : 0));
    }

    return {
        type: "codemirror",
        raw: cm,
        supportsMultiCursor: true,
        get() {
            return cm.getValue();
        },
        set(v) {
            cm.setValue(String(v ?? ""));
        },
        clear() {
            cm.setValue("");
        },
        focus() {
            cm.focus();
        },
        refresh() {
            cm.refresh();
        },
        onChange(fn) {
            cm.on("change", fn);
        },
        onKeyDown(fn) {
            cm.on("keydown", (_cm, e) => fn(e));
        },
        onCursorActivity(fn) {
            cm.on("cursorActivity", () => fn?.());
        },
        onMouseDown(fn) {
            cm.on("mousedown", (_cm, e) => fn?.(e));
        },
        setTheme(name) {
            cm.setOption("theme", name || "default");
        },
        setOptions(options = {}) {
            if (options && typeof options === "object") {
                Object.entries(options).forEach(([key, value]) => {
                    if (value === undefined) return;
                    cm.setOption(key, value);
                });
            }
        },
        setFontSize(px) {
            const wrap = cm.getWrapperElement();
            if (!wrap) return;
            const next = Math.max(10, Number(px) || 13);
            wrap.style.fontSize = `${next}px`;
            cm.refresh();
        },
        setFontFamily(fontFamily) {
            const wrap = cm.getWrapperElement();
            if (!wrap) return;
            const next = String(fontFamily || "").trim() || "monospace";
            wrap.style.fontFamily = next;
            cm.refresh();
        },
        getCursor() {
            const cur = cm.getCursor();
            return { line: cur.line, ch: cur.ch };
        },
        setCursor(posOrLine, ch = 0) {
            const pos = typeof posOrLine === "number"
                ? { line: posOrLine, ch }
                : posOrLine;
            cm.setCursor(normalizePos(pos, cm.getCursor()));
            cm.scrollIntoView(cm.getCursor(), 80);
        },
        getSelections() {
            return cm.getDoc().listSelections().map((sel) => ({
                anchor: { line: sel.anchor.line, ch: sel.anchor.ch },
                head: { line: sel.head.line, ch: sel.head.ch },
            }));
        },
        setSelections(list = []) {
            const doc = cm.getDoc();
            const fallback = cm.getCursor();
            const normalized = normalizeSelections(list, fallback);
            if (!normalized.length) return;
            doc.setSelections(normalized.map((sel) => toSelection(sel, fallback)));
            cm.scrollIntoView(doc.getCursor(), 80);
        },
        collapseSelectionsToPrimary() {
            const doc = cm.getDoc();
            const current = doc.listSelections();
            if (!current.length) return;
            const primary = current[0];
            doc.setSelection(primary.head, primary.head);
        },
        getSelection() {
            return cm.getSelection();
        },
        replaceSelection(text) {
            cm.replaceSelection(String(text ?? ""), "around");
        },
        replaceRange(text, from, to = from) {
            cm.replaceRange(String(text ?? ""), normalizePos(from), normalizePos(to, from));
        },
        getRange(from, to) {
            return cm.getRange(normalizePos(from), normalizePos(to, from));
        },
        lineCount() {
            return cm.lineCount();
        },
        getLine(line) {
            return cm.getLine(clampLine(line)) || "";
        },
        indexFromPos(pos) {
            return cm.indexFromPos(normalizePos(pos));
        },
        posFromIndex(index) {
            return cm.posFromIndex(Math.max(0, Number(index) || 0));
        },
        scrollIntoView(pos, margin = 80) {
            cm.scrollIntoView(pos ? normalizePos(pos) : null, margin);
        },
        operation(fn) {
            return cm.operation(() => fn?.());
        },
        markRange(from, to, { className = "", title = "", kind = "generic", clearOnEnter = false } = {}) {
            const mark = cm.markText(normalizePos(from), normalizePos(to, from), {
                className,
                title,
                clearOnEnter,
            });
            trackMark(kind, mark);
            return mark;
        },
        clearMarks(kind) {
            clearMarks(kind);
        },
        addLineWidget(line, node, options = {}) {
            if (!node) return null;
            const kind = options?.kind || "generic";
            const safeLine = clampLine(line);
            const widget = cm.addLineWidget(safeLine, node, {
                above: Boolean(options?.above),
                noHScroll: options?.noHScroll !== false,
                coverGutter: Boolean(options?.coverGutter),
                handleMouseEvents: options?.handleMouseEvents !== false,
            });
            trackWidget(kind, widget);
            return widget;
        },
        clearLineWidgets(kind) {
            clearLineWidgets(kind);
        },
        setGutterDiagnostics(items = []) {
            cm.clearGutter(DIAGNOSTIC_GUTTER);
            (Array.isArray(items) ? items : []).forEach((item) => {
                const line = clampLine(item?.line ?? 0);
                const marker = document.createElement("span");
                marker.className = "cm-diagnostic-marker";
                marker.dataset.level = item?.level || "info";
                if (item?.message) marker.title = item.message;
                cm.setGutterMarker(line, DIAGNOSTIC_GUTTER, marker);
            });
        },
        setBreakpoints(lines = []) {
            cm.clearGutter(BREAKPOINT_GUTTER);
            const list = Array.isArray(lines) ? lines : [];
            list.forEach((lineValue) => {
                const line = clampLine(lineValue);
                const marker = document.createElement("span");
                marker.className = "cm-breakpoint-marker";
                marker.title = `Breakpoint at line ${line + 1}`;
                cm.setGutterMarker(line, BREAKPOINT_GUTTER, marker);
            });
        },
        onGutterClick(fn) {
            if (typeof fn !== "function") return;
            cm.on("gutterClick", (_cm, line, gutter, event) => fn({ line, gutter, event }));
        },
        coordsChar(coords) {
            return cm.coordsChar(coords, "window");
        },
        getWordAt(pos = null) {
            const cursor = normalizePos(pos || cm.getCursor(), cm.getCursor());
            const line = cm.getLine(cursor.line) || "";
            const left = line.slice(0, cursor.ch);
            const right = line.slice(cursor.ch);
            const leftMatch = left.match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
            const rightMatch = right.match(/^[A-Za-z0-9_$]*/);
            const prefix = leftMatch ? leftMatch[0] : "";
            const suffix = rightMatch ? rightMatch[0] : "";
            const word = `${prefix}${suffix}`;
            const from = { line: cursor.line, ch: cursor.ch - prefix.length };
            const to = { line: cursor.line, ch: cursor.ch + suffix.length };
            return { word, from, to, line: cursor.line };
        },
    };
}
