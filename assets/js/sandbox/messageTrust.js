export function isTrustedSandboxMessageEvent(event, { runnerWindow, currentOrigin } = {}) {
    const source = event?.source;
    if (!(source && runnerWindow && source === runnerWindow)) {
        return false;
    }
    const origin = String(event?.origin || "").trim();
    if (!origin) return false;
    if (origin === "null") return true;
    return origin === String(currentOrigin || "");
}

export function isSandboxMessageForCurrentRun(data, currentToken) {
    if (!data || data.source !== "fazide") return false;
    if (!data.token || data.token !== currentToken) return false;
    return true;
}
