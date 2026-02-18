function truncateText(value = "", maxChars = 0, { suffix = " ... [truncated]" } = {}) {
    const source = String(value ?? "");
    const limit = Math.max(0, Number(maxChars) || 0);
    if (!limit || source.length <= limit) return source;
    const ending = String(suffix || "");
    const bodyLimit = Math.max(0, limit - ending.length);
    if (bodyLimit <= 0) return source.slice(0, limit);
    return `${source.slice(0, bodyLimit)}${ending}`;
}

export function normalizeProblemLevel(level) {
    if (level === "error" || level === "warn") return level;
    return "info";
}

function formatSandboxLogPart(value, maxChars = 1000) {
    if (typeof value === "string") return truncateText(value, maxChars);
    if (value instanceof Error) return truncateText(value.stack || value.message || String(value), maxChars);
    if (typeof value === "function") return value.name ? `[Function ${value.name}]` : "[Function]";
    if (
        value == null
        || typeof value === "number"
        || typeof value === "boolean"
        || typeof value === "bigint"
        || typeof value === "symbol"
    ) {
        return truncateText(String(value), maxChars);
    }
    try {
        return truncateText(JSON.stringify(value, null, 2), maxChars);
    } catch {
        return truncateText(String(value), maxChars);
    }
}

export function normalizeSandboxConsolePayload(payload = {}, options = {}) {
    const maxArgs = Math.max(1, Number(options.maxArgs) || 24);
    const argMaxChars = Math.max(40, Number(options.argMaxChars) || 1000);
    const level = normalizeProblemLevel(payload?.level);
    const args = Array.isArray(payload?.args) ? payload.args : [payload?.args];
    const limited = args
        .slice(0, maxArgs)
        .map((part) => formatSandboxLogPart(part, argMaxChars));
    if (args.length > maxArgs) {
        limited.push(`... [${args.length - maxArgs} more argument(s) truncated]`);
    }
    return { level, args: limited };
}
