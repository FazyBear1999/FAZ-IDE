export function buildExportWorkspaceData({
    appVersion,
    workspacePayload,
    layoutState,
    theme,
} = {}) {
    return {
        format: "fazide-workspace",
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion,
        data: {
            ...workspacePayload,
            layout: { ...layoutState },
            theme,
        },
    };
}

export function buildWorkspaceExportFilename(isoString = null) {
    const source = typeof isoString === "string" && isoString
        ? isoString
        : new Date().toISOString();
    const stamp = source.replace(/[:.]/g, "-");
    return `fazide-workspace-${stamp}.json`;
}

export function triggerWorkspaceExportDownload({ payload, fileName } = {}) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = String(fileName || buildWorkspaceExportFilename());
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return link.download;
}

export function parseWorkspaceImportText(text, { normalizeImportedWorkspace, maxInputChars = 0 } = {}) {
    if (typeof text !== "string") {
        return { ok: false, error: "invalid-text" };
    }
    if (typeof normalizeImportedWorkspace !== "function") {
        return { ok: false, error: "missing-normalizer" };
    }
    const limit = Math.max(0, Number(maxInputChars) || 0);
    if (limit > 0 && text.length > limit) {
        return {
            ok: false,
            error: "input-too-large",
            message: `Workspace import is too large (${text.length} chars). Max ${limit}.`,
        };
    }

    let parsed = null;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        return {
            ok: false,
            error: "invalid-json",
            message: String(err?.message || err),
        };
    }

    const normalized = normalizeImportedWorkspace(parsed);
    if (!normalized) {
        return { ok: false, error: "unsupported-payload" };
    }

    return { ok: true, normalized };
}

export function buildImportWorkspaceConfirmMessage({ fileCount = 0, trashCount = 0 } = {}) {
    const files = Math.max(0, Number(fileCount) || 0);
    const trash = Math.max(0, Number(trashCount) || 0);
    return (
        `Import workspace with ${files} file(s) and ${trash} trash item(s)?\n` +
        "This will replace your current workspace."
    );
}

export function normalizeImportedWorkspacePayload(input, {
    normalizeFile,
    normalizeTrashEntry,
    normalizeFolderList,
    makeFile,
    defaultFileName,
    defaultCode,
    normalizeTheme,
    sanitizeLayoutState,
    currentLayoutState,
} = {}) {
    if (!input || typeof input !== "object") return null;
    if (
        typeof normalizeFile !== "function" ||
        typeof normalizeTrashEntry !== "function" ||
        typeof normalizeFolderList !== "function" ||
        typeof makeFile !== "function" ||
        typeof normalizeTheme !== "function" ||
        typeof sanitizeLayoutState !== "function"
    ) {
        return null;
    }

    const isWrappedWorkspace = input.format === "fazide-workspace" && input.data && typeof input.data === "object";
    const source = isWrappedWorkspace ? input.data : input;

    const workspaceShapeKeys = ["files", "trash", "folders", "activeId", "openIds", "theme", "layout"];
    const hasWorkspaceShape = workspaceShapeKeys.some((key) => Object.prototype.hasOwnProperty.call(source, key));
    if (!isWrappedWorkspace && !hasWorkspaceShape) {
        return null;
    }

    const filesValue = Array.isArray(source.files)
        ? source.files.map(normalizeFile).filter(Boolean)
        : [];
    const trashValue = Array.isArray(source.trash)
        ? source.trash.map(normalizeTrashEntry).filter(Boolean)
        : [];
    const foldersValue = normalizeFolderList(source.folders);
    const fallback = makeFile(defaultFileName, defaultCode);
    const normalizedFiles = filesValue.length ? filesValue : [fallback];
    const nextActiveId = normalizedFiles.some((file) => file.id === source.activeId)
        ? source.activeId
        : normalizedFiles[0].id;
    const openIds = Array.isArray(source.openIds)
        ? source.openIds.filter((id) => normalizedFiles.some((file) => file.id === id))
        : [];
    const normalizedOpenIds = openIds.length ? openIds : [nextActiveId];
    if (!normalizedOpenIds.includes(nextActiveId)) normalizedOpenIds.unshift(nextActiveId);

    return {
        files: normalizedFiles,
        folders: foldersValue,
        trash: trashValue,
        activeId: nextActiveId,
        openIds: normalizedOpenIds,
        theme: source.theme ? normalizeTheme(source.theme) : null,
        layout: source.layout && typeof source.layout === "object"
            ? sanitizeLayoutState({ ...currentLayoutState, ...source.layout })
            : null,
    };
}
