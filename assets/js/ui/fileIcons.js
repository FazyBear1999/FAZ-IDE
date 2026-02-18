import { getFileBaseName, splitLeafExtension } from "../core/pathing.js";

const FILE_ICON_BASE_PATH = "assets/icons/file-types";

const FILE_ICON_PATHS = Object.freeze({
    defaultFile: `${FILE_ICON_BASE_PATH}/file-default.svg`,
    folderClosed: `${FILE_ICON_BASE_PATH}/folder-closed.svg`,
    folderOpen: `${FILE_ICON_BASE_PATH}/folder-open.svg`,
    js: `${FILE_ICON_BASE_PATH}/js.svg`,
    ts: `${FILE_ICON_BASE_PATH}/ts.svg`,
    jsx: `${FILE_ICON_BASE_PATH}/jsx.svg`,
    tsx: `${FILE_ICON_BASE_PATH}/tsx.svg`,
    html: `${FILE_ICON_BASE_PATH}/html.svg`,
    css: `${FILE_ICON_BASE_PATH}/css.svg`,
    json: `${FILE_ICON_BASE_PATH}/json.svg`,
    markdown: `${FILE_ICON_BASE_PATH}/markdown.svg`,
    yaml: `${FILE_ICON_BASE_PATH}/yaml.svg`,
    xml: `${FILE_ICON_BASE_PATH}/xml.svg`,
    image: `${FILE_ICON_BASE_PATH}/image.svg`,
    shell: `${FILE_ICON_BASE_PATH}/shell.svg`,
    java: `${FILE_ICON_BASE_PATH}/java.svg`,
    node: `${FILE_ICON_BASE_PATH}/node.svg`,
    sql: `${FILE_ICON_BASE_PATH}/sql.svg`,
    git: `${FILE_ICON_BASE_PATH}/git.svg`,
    docker: `${FILE_ICON_BASE_PATH}/docker.svg`,
    rust: `${FILE_ICON_BASE_PATH}/rust.svg`,
    go: `${FILE_ICON_BASE_PATH}/go.svg`,
    php: `${FILE_ICON_BASE_PATH}/php.svg`,
    cpp: `${FILE_ICON_BASE_PATH}/cpp.svg`,
    csharp: `${FILE_ICON_BASE_PATH}/csharp.svg`,
});

const FILE_EXTENSION_ICON_MAP = Object.freeze({
    js: FILE_ICON_PATHS.js,
    mjs: FILE_ICON_PATHS.js,
    cjs: FILE_ICON_PATHS.js,
    ts: FILE_ICON_PATHS.ts,
    mts: FILE_ICON_PATHS.ts,
    cts: FILE_ICON_PATHS.ts,
    jsx: FILE_ICON_PATHS.jsx,
    tsx: FILE_ICON_PATHS.tsx,
    html: FILE_ICON_PATHS.html,
    htm: FILE_ICON_PATHS.html,
    xhtml: FILE_ICON_PATHS.html,
    css: FILE_ICON_PATHS.css,
    scss: FILE_ICON_PATHS.css,
    sass: FILE_ICON_PATHS.css,
    less: FILE_ICON_PATHS.css,
    styl: FILE_ICON_PATHS.css,
    json: FILE_ICON_PATHS.json,
    json5: FILE_ICON_PATHS.json,
    jsonc: FILE_ICON_PATHS.json,
    md: FILE_ICON_PATHS.markdown,
    markdown: FILE_ICON_PATHS.markdown,
    mdx: FILE_ICON_PATHS.markdown,
    yaml: FILE_ICON_PATHS.yaml,
    yml: FILE_ICON_PATHS.yaml,
    xml: FILE_ICON_PATHS.xml,
    sh: FILE_ICON_PATHS.shell,
    bash: FILE_ICON_PATHS.shell,
    zsh: FILE_ICON_PATHS.shell,
    fish: FILE_ICON_PATHS.shell,
    ps1: FILE_ICON_PATHS.shell,
    bat: FILE_ICON_PATHS.shell,
    cmd: FILE_ICON_PATHS.shell,
    java: FILE_ICON_PATHS.java,
    sql: FILE_ICON_PATHS.sql,
    rs: FILE_ICON_PATHS.rust,
    go: FILE_ICON_PATHS.go,
    php: FILE_ICON_PATHS.php,
    phtml: FILE_ICON_PATHS.php,
    c: FILE_ICON_PATHS.cpp,
    cc: FILE_ICON_PATHS.cpp,
    cpp: FILE_ICON_PATHS.cpp,
    cxx: FILE_ICON_PATHS.cpp,
    h: FILE_ICON_PATHS.cpp,
    hh: FILE_ICON_PATHS.cpp,
    hpp: FILE_ICON_PATHS.cpp,
    hxx: FILE_ICON_PATHS.cpp,
    cs: FILE_ICON_PATHS.csharp,
});

const IMAGE_FILE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "bmp",
    "ico",
    "svg",
    "tif",
    "tiff",
]);

function getSpecialFileIconPath(fileName = "") {
    const leaf = getFileBaseName(fileName).toLowerCase();
    if (!leaf) return null;
    if (leaf === "dockerfile" || leaf.startsWith("dockerfile.")) return FILE_ICON_PATHS.docker;
    if (leaf === ".gitignore" || leaf === ".gitattributes" || leaf === ".gitmodules") return FILE_ICON_PATHS.git;
    if (leaf === "package.json" || leaf === "package-lock.json" || leaf === "npm-shrinkwrap.json") return FILE_ICON_PATHS.node;
    if (leaf === "yarn.lock" || leaf === "pnpm-lock.yaml") return FILE_ICON_PATHS.node;
    if (leaf.endsWith(".env") || leaf.startsWith(".env.")) return FILE_ICON_PATHS.node;
    return null;
}

export function getFileIconPath(fileName = "") {
    const special = getSpecialFileIconPath(fileName);
    if (special) return special;
    const leaf = getFileBaseName(fileName);
    const extension = splitLeafExtension(leaf).extension.toLowerCase().replace(/^\./, "");
    if (!extension) return FILE_ICON_PATHS.defaultFile;
    if (IMAGE_FILE_EXTENSIONS.has(extension)) return FILE_ICON_PATHS.image;
    return FILE_EXTENSION_ICON_MAP[extension] || FILE_ICON_PATHS.defaultFile;
}

export function getFolderIconPath(expanded = false) {
    return expanded ? FILE_ICON_PATHS.folderOpen : FILE_ICON_PATHS.folderClosed;
}

export function bindFileListIconFallbacks(root) {
    if (!root) return;
    const bindFallback = (selector, fallbackSrc) => {
        root.querySelectorAll(selector).forEach((node) => {
            if (!(node instanceof HTMLImageElement)) return;
            if (node.dataset.iconFallbackBound === "true") return;
            node.dataset.iconFallbackBound = "true";
            node.addEventListener("error", () => {
                if (!fallbackSrc) return;
                if (node.getAttribute("src") === fallbackSrc) return;
                node.setAttribute("src", fallbackSrc);
            });
        });
    };

    bindFallback(".file-row-icon", FILE_ICON_PATHS.defaultFile);
    bindFallback(".file-folder-icon", FILE_ICON_PATHS.folderClosed);
}
