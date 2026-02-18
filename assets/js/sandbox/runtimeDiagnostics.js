function truncateText(value = "", maxChars = 0, { suffix = " ... [truncated]" } = {}) {
    const source = String(value ?? "");
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || source.length <= limit) return source;
    const ending = String(suffix || "");
    const bodyLimit = Math.max(0, limit - ending.length);
    if (bodyLimit <= 0) return source.slice(0, limit);
    return `${source.slice(0, bodyLimit)}${ending}`;
}

function normalizeFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeRuntimeErrorPayload(payload = {}, options = {}) {
    const messageMaxChars = Math.max(64, Number(options.messageMaxChars) || 1400);
    const filenameMaxChars = Math.max(32, Number(options.filenameMaxChars) || 180);
    const message = truncateText(String(payload?.message || "Runtime error"), messageMaxChars);
    const fileNameLabel = truncateText(String(payload?.filename || "unknown"), filenameMaxChars, { suffix: "..." });
    const lineNo = normalizeFiniteNumber(payload?.lineno);
    const colNo = normalizeFiniteNumber(payload?.colno);
    return {
        message,
        fileNameLabel,
        lineNo,
        colNo,
        formatted: `${message} (${fileNameLabel}:${lineNo}:${colNo})`,
    };
}

export function normalizePromiseRejectionPayload(payload = {}, options = {}) {
    const reasonMaxChars = Math.max(64, Number(options.reasonMaxChars) || 1400);
    const reason = truncateText(String(payload?.reason || "Unknown rejection"), reasonMaxChars);
    return {
        reason,
        formatted: `Unhandled promise rejection: ${reason}`,
    };
}
