// assets/js/editors/textarea.js
// Editor adapter (textarea v0).
// app.js uses this adapter so the editor can be swapped later.
//
// Notes:
// - This provides a tiny, consistent interface (get/set/clear/focus/events).
// - Keeping app.js talking to an "editor" abstraction means you can later swap
//   textarea for CodeMirror/Monaco without rewriting app logic.
// - All methods are thin pass-throughs to the underlying textarea element.

export function makeTextareaEditor(textareaEl) {
    const markerBuckets = new Map();

    function clampIndex(value) {
        const next = Math.max(0, Number(value) || 0);
        return Math.min(next, textareaEl.value.length);
    }

    function lineChToIndex(pos = { line: 0, ch: 0 }) {
        const line = Math.max(0, Number(pos.line) || 0);
        const ch = Math.max(0, Number(pos.ch) || 0);
        const lines = textareaEl.value.split("\n");
        let index = 0;
        for (let i = 0; i < line && i < lines.length; i += 1) {
            index += lines[i].length + 1;
        }
        return clampIndex(index + ch);
    }

    function indexToLineCh(index = 0) {
        const target = clampIndex(index);
        const lines = textareaEl.value.split("\n");
        let cursor = 0;
        for (let line = 0; line < lines.length; line += 1) {
            const next = cursor + lines[line].length;
            if (target <= next) {
                return { line, ch: target - cursor };
            }
            cursor = next + 1;
        }
        return { line: Math.max(0, lines.length - 1), ch: 0 };
    }

    // `textareaEl` should be a real <textarea> DOM element.
    // The returned object is the editor "driver" used by the rest of the app.
    return {
        type: "textarea",
        raw: textareaEl,
        supportsMultiCursor: false,
        get() {
            // Read current editor content.
            return textareaEl.value;
        },

        set(v) {
            // Replace editor content.
            // (Caller is responsible for passing a string.)
            textareaEl.value = v;
        },

        clear() {
            // Convenience: wipe editor content.
            textareaEl.value = "";
        },

        focus() {
            // Focus editor so the user can type immediately.
            textareaEl.focus();
        },

        onChange(fn) {
            // Fires whenever the user changes text (typing, paste, etc.).
            // Use this to mark "dirty", autosave, enable run button, etc.
            textareaEl.addEventListener("input", fn);
        },

        onKeyDown(fn) {
            // Keydown is used for shortcuts (Run/Save/Clear Log) or custom behaviors.
            textareaEl.addEventListener("keydown", fn);
        },
        onCursorActivity(fn) {
            textareaEl.addEventListener("click", fn);
            textareaEl.addEventListener("keyup", fn);
        },
        onMouseDown(fn) {
            textareaEl.addEventListener("mousedown", fn);
        },
        setTheme(_name) {},
        refresh() {},
        setOptions(_options = {}) {},
        setFontSize(px) {
            const next = Math.max(10, Number(px) || 13);
            textareaEl.style.fontSize = `${next}px`;
        },
        setFontFamily(fontFamily) {
            const next = String(fontFamily || "").trim() || "monospace";
            textareaEl.style.fontFamily = next;
        },
        getCursor() {
            return indexToLineCh(textareaEl.selectionStart || 0);
        },
        setCursor(posOrLine, ch = 0) {
            const pos = typeof posOrLine === "number"
                ? { line: posOrLine, ch }
                : (posOrLine || { line: 0, ch: 0 });
            const idx = lineChToIndex(pos);
            textareaEl.setSelectionRange(idx, idx);
        },
        getSelections() {
            return [{
                anchor: indexToLineCh(textareaEl.selectionStart || 0),
                head: indexToLineCh(textareaEl.selectionEnd || 0),
            }];
        },
        setSelections(list = []) {
            const first = Array.isArray(list) && list.length ? list[0] : null;
            if (!first) return;
            const start = lineChToIndex(first.anchor);
            const end = lineChToIndex(first.head);
            textareaEl.setSelectionRange(start, end);
        },
        collapseSelectionsToPrimary() {
            const end = textareaEl.selectionEnd || 0;
            textareaEl.setSelectionRange(end, end);
        },
        getSelection() {
            const start = textareaEl.selectionStart || 0;
            const end = textareaEl.selectionEnd || 0;
            return textareaEl.value.slice(start, end);
        },
        replaceSelection(text) {
            const start = textareaEl.selectionStart || 0;
            const end = textareaEl.selectionEnd || 0;
            const next = String(text ?? "");
            textareaEl.value = `${textareaEl.value.slice(0, start)}${next}${textareaEl.value.slice(end)}`;
            textareaEl.setSelectionRange(start + next.length, start + next.length);
            textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
        },
        replaceRange(text, from, to = from) {
            const start = lineChToIndex(from);
            const end = lineChToIndex(to);
            const next = String(text ?? "");
            textareaEl.value = `${textareaEl.value.slice(0, start)}${next}${textareaEl.value.slice(end)}`;
            textareaEl.setSelectionRange(start + next.length, start + next.length);
            textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
        },
        getRange(from, to) {
            const start = lineChToIndex(from);
            const end = lineChToIndex(to);
            return textareaEl.value.slice(start, end);
        },
        lineCount() {
            return textareaEl.value.split("\n").length;
        },
        getLine(line) {
            return textareaEl.value.split("\n")[Math.max(0, Number(line) || 0)] || "";
        },
        indexFromPos(pos) {
            return lineChToIndex(pos);
        },
        posFromIndex(index) {
            return indexToLineCh(index);
        },
        scrollIntoView() {},
        operation(fn) {
            return fn?.();
        },
        markRange(from, to, { kind = "generic" } = {}) {
            const mark = { from, to, kind, clear() {} };
            const bucket = markerBuckets.get(kind) || [];
            bucket.push(mark);
            markerBuckets.set(kind, bucket);
            return mark;
        },
        clearMarks(kind) {
            if (!kind) {
                markerBuckets.clear();
                return;
            }
            markerBuckets.delete(kind);
        },
        addLineWidget(_line, _node, _options = {}) {
            return null;
        },
        clearLineWidgets(_kind) {},
        setGutterDiagnostics(_items = []) {},
        setBreakpoints(_lines = []) {},
        onGutterClick(_fn) {},
        coordsChar() {
            return this.getCursor();
        },
        getWordAt(pos = null) {
            const cursor = pos || this.getCursor();
            const lines = textareaEl.value.split("\n");
            const lineText = lines[cursor.line] || "";
            const left = lineText.slice(0, cursor.ch);
            const right = lineText.slice(cursor.ch);
            const leftMatch = left.match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
            const rightMatch = right.match(/^[A-Za-z0-9_$]*/);
            const prefix = leftMatch ? leftMatch[0] : "";
            const suffix = rightMatch ? rightMatch[0] : "";
            return {
                word: `${prefix}${suffix}`,
                from: { line: cursor.line, ch: cursor.ch - prefix.length },
                to: { line: cursor.line, ch: cursor.ch + suffix.length },
                line: cursor.line,
            };
        },
    };
}
