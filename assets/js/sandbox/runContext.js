// assets/js/sandbox/runContext.js
// Run-context helpers for reproducible sandbox execution metadata.

const MAX_UINT32 = 0xffffffff;

function clampToUint32(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return (Math.abs(Math.trunc(num)) >>> 0);
}

function hashToSeed(text) {
    const input = String(text || "");
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 1;
}

function makeToken(timestamp) {
    return `${timestamp}-${Math.random().toString(16).slice(2)}`;
}

export function createRunContext(runCount = 0, options = {}) {
    const at = Number.isFinite(Number(options?.at)) ? Number(options.at) : Date.now();
    const runNumber = Math.max(1, Number.parseInt(String(runCount || 1), 10) || 1);
    const token = makeToken(at);
    const seedOverride = options?.seed;
    const seed = seedOverride === undefined || seedOverride === null
        ? hashToSeed(token)
        : clampToUint32(seedOverride) || hashToSeed(token);
    const fixedTimestepMs = options?.fixedTimestepMs;
    const fixedTimestep = Number.isFinite(Number(fixedTimestepMs))
        ? Math.max(1, Math.trunc(Number(fixedTimestepMs)))
        : null;

    return {
        id: `run-${at}-${runNumber}`,
        runNumber,
        at,
        token,
        seed,
        fixedTimestepMs: fixedTimestep,
    };
}

export function normalizeRunContext(value) {
    if (!value || typeof value !== "object") return null;
    const token = String(value.token || "").trim();
    if (!token) return null;
    const runNumber = Math.max(1, Number.parseInt(String(value.runNumber || 1), 10) || 1);
    const at = Number.isFinite(Number(value.at)) ? Number(value.at) : Date.now();
    const seed = clampToUint32(value.seed);
    const fixedTimestepMs = Number.isFinite(Number(value.fixedTimestepMs))
        ? Math.max(1, Math.trunc(Number(value.fixedTimestepMs)))
        : null;
    const idRaw = String(value.id || "").trim();
    const id = idRaw || `run-${at}-${runNumber}`;

    return {
        id,
        runNumber,
        at,
        token,
        seed: seed || hashToSeed(token),
        fixedTimestepMs,
    };
}

export function buildRunContextLabel(context) {
    const normalized = normalizeRunContext(context);
    if (!normalized) return "run-context unavailable";
    const fixedPart = normalized.fixedTimestepMs ? `, dt=${normalized.fixedTimestepMs}ms` : "";
    return `seed=${normalized.seed}${fixedPart}`;
}

export { MAX_UINT32 };
