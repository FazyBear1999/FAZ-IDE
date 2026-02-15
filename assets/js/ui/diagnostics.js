// assets/js/ui/diagnostics.js
// Diagnostics panel helper.
//
// Notes:
// - Keeps a small rolling list of warnings/errors.
// - Defaults to a calm "All systems normal" message.
// - Only used for user-visible app health (storage/clipboard/sandbox).

export function makeDiagnostics(listEl, { maxItems = 6 } = {}) {
    if (!listEl) {
        return {
            push() {},
            clear() {},
            setEmpty() {},
        };
    }

    function setEmpty() {
        listEl.dataset.empty = "true";
        listEl.innerHTML = `<li class="diagnostics-empty">All systems normal.</li>`;
    }

    function clear() {
        setEmpty();
    }

    function push(level, message) {
        if (!message) return;
        if (listEl.dataset.empty === "true") {
            listEl.dataset.empty = "false";
            listEl.innerHTML = "";
        }

        const item = document.createElement("li");
        const time = new Date().toLocaleTimeString();
        item.className = "diagnostics-item";
        item.dataset.level = level || "info";
        item.textContent = `[${time}] ${message}`;
        listEl.prepend(item);

        const items = listEl.querySelectorAll(".diagnostics-item");
        if (items.length > maxItems) {
            for (let i = maxItems; i < items.length; i += 1) {
                items[i].remove();
            }
        }
    }

    setEmpty();
    return { push, clear, setEmpty };
}
