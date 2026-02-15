// assets/js/ui/store.js
// Storage wrapper for FAZ IDE.
// Later you can replace localStorage with indexedDB or file storage.
//
// Notes:
// - localStorage stores ONLY strings. If you want objects, JSON.stringify/parse.
// - localStorage can throw (privacy mode, quota exceeded, disabled storage).
// - Keep this API tiny so swapping backends later doesn't touch the rest of the app.
export function load(key) {
    // Returns a string or null if the key doesn't exist.
    // Callers decide how to handle null (use DEFAULT_CODE, show empty editor, etc.)
    try {
        return localStorage.getItem(key);
    } catch (err) {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:storage-error", {
                detail: { op: "read", key, error: String(err) }
            }));
        }
        console.warn("FAZ IDE: localStorage read failed", err);
        return null;
    }
};

export function save(key, value) {
    // Saves a string value under the provided key.
    // Tip: keep keys versioned (see STORAGE.CODE) so you can migrate safely later.
    try {
        localStorage.setItem(key, value);
    } catch (err) {
        if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("fazide:storage-error", {
                detail: { op: "write", key, error: String(err) }
            }));
        }
        console.warn("FAZ IDE: localStorage write failed", err);
    }
};
