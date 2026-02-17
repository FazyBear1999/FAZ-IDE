export const THEMES = ["dark", "light", "purple", "retro", "temple", "midnight", "ocean", "forest", "graphite", "sunset"];
export const DEFAULT_THEME = "dark";

export function normalizeTheme(value, allowedThemes = THEMES, fallback = DEFAULT_THEME) {
    const theme = String(value || "").toLowerCase();
    return allowedThemes.includes(theme) ? theme : fallback;
}

export function applyThemeState(theme, {
    themeSelect,
    editor,
    persist = true,
    saveTheme,
    sandboxWindow,
    isSandboxWindowOpen = () => Boolean(sandboxWindow),
    onSandboxThemeError,
} = {}) {
    const nextTheme = normalizeTheme(theme);
    if (document.documentElement) {
        document.documentElement.setAttribute("data-theme", nextTheme);
    }
    if (document.body) {
        document.body.setAttribute("data-theme", nextTheme);
    }
    if (themeSelect) {
        themeSelect.value = nextTheme;
        themeSelect.setAttribute("data-theme", nextTheme);
    }
    if (editor?.setTheme) {
        editor.setTheme(nextTheme === "light" || nextTheme === "temple" ? "default" : "material-darker");
    }
    if (isSandboxWindowOpen()) {
        try {
            sandboxWindow?.postMessage({ source: "fazide-theme", theme: nextTheme }, "*");
        } catch (err) {
            if (typeof onSandboxThemeError === "function") {
                onSandboxThemeError(err);
            }
        }
    }
    if (persist && typeof saveTheme === "function") {
        saveTheme(nextTheme);
    }
    return nextTheme;
}
