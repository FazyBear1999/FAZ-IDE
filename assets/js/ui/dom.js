// assets/js/ui/dom.js
// Tiny DOM helper. Keep it simple and predictable.
//
// Notes:
// - This is intentionally minimal: on selector, one element.
// - Returns the FIRST match or null (same behavior as querySelector).
// - The `root` param lets you scope queries to a container (panel, modal, etc.)
// which helps avoid accidental cross-page selections and improves performance.


export function $(sel, root = document) {
    // `sel` is any valid CSS selector (".class", "#id", "[data-x]", etc.)
    // `root` is the element/document we search within (defaults to the whole page).
    return root.querySelector(sel);
}