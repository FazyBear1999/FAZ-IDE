const CACHE_VERSION = "fazide-shell-v6";
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./assets/css/base.css",
    "./assets/css/layout.css",
    "./assets/css/components.css",
    "./assets/css/themes.css",
    "./assets/vendor/codemirror/codemirror.min.css",
    "./assets/vendor/codemirror/theme/material-darker.min.css",
    "./assets/vendor/codemirror/codemirror.min.js",
    "./assets/vendor/codemirror/mode/javascript/javascript.min.js",
    "./assets/vendor/acorn/acorn.js",
    "./assets/vendor/prettier/standalone.js",
    "./assets/vendor/prettier/babel.js",
    "./assets/vendor/prettier/estree.js",
    "./assets/js/app.js",
    "./assets/js/config.js",
    "./assets/js/core/astClient.js",
    "./assets/js/core/commandRegistry.js",
    "./assets/js/core/debounce.js",
    "./assets/js/core/formatting.js",
    "./assets/js/editors/codemirror5.js",
    "./assets/js/editors/textarea.js",
    "./assets/js/sandbox/runner.js",
    "./assets/js/ui/diagnostics.js",
    "./assets/js/ui/dom.js",
    "./assets/js/ui/elements.js",
    "./assets/js/ui/layoutState.js",
    "./assets/js/ui/logger.js",
    "./assets/js/ui/shortcuts.js",
    "./assets/js/ui/status.js",
    "./assets/js/ui/store.js",
    "./assets/js/ui/theme.js",
    "./assets/js/ui/workspaceTransfer.js",
    "./assets/js/workers/ast.worker.js",
    "./assets/js/workers/editorLint.worker.js",
    "./assets/icons/faz-192.svg",
    "./assets/icons/faz-512.svg",
];
// sw.js lives at ./assets/js/sw.js, so ../../ points to the app root.
const APP_BASE_URL = new URL("../../", self.location.href);
const resolveAssetUrl = (assetPath) => new URL(assetPath, APP_BASE_URL).toString();
const CORE_ASSET_URLS = CORE_ASSETS.map(resolveAssetUrl);
const APP_SHELL_URL = resolveAssetUrl("./index.html");

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSET_URLS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_VERSION)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const isDocument = request.mode === "navigate" || request.destination === "document";
    if (isDocument) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(APP_SHELL_URL, copy)).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_VERSION);
                    return cache.match(APP_SHELL_URL) || Response.error();
                })
        );
        return;
    }

    // Keep app shell assets fresh in development and production updates.
    // We still cache successful responses, but prefer network first.
    const isAppAsset = (
        url.pathname.startsWith("/assets/") ||
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "worker" ||
        request.destination === "sharedworker"
    );
    if (isAppAsset) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_VERSION);
                    return cache.match(request) || Response.error();
                })
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
                    return response;
                })
                .catch(() => cached || Response.error());
        })
    );
});
