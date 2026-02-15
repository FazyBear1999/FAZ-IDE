// assets/js/ui/status.js
// Status chip controller.
//
// Notes:
// - This is a tiny, focused wrapper around a single DOM node.
// - Centralizing status updates avoids scattered `textContent = ...` calls.
// - Keep status text short (fits in the chip) and user-facing ("Ready", "Saved", etc.)

export function makeStatus(statusTextEl) {
    // `statusTextEl` should be the element that displays the status label text.
    // Example: <span id="statusText">Ready</span>
    return {
        set(text) {
            // Updates the chip text immediately (no formatting, no HTML).
            // If you ever need richer statuses later, keep this API the same and
            // change internals (icons, colors, timeouts) in one place.
            statusTextEl.textContent = text;
        },
    };
};

