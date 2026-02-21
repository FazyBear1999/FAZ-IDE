const SUPABASE_CLIENT_CDN = "https://esm.sh/@supabase/supabase-js@2.49.8";

function clampString(value, maxLength) {
    return String(value || "").trim().slice(0, Math.max(0, Number(maxLength) || 0));
}

function clampNonNegativeInteger(value, fallback = 0, min = 0) {
    const parsed = Math.floor(Number(value));
    if (!Number.isFinite(parsed)) return Math.max(min, Math.floor(Number(fallback) || 0));
    return Math.max(min, parsed);
}

function normalizeLessonStats(source = null) {
    const input = source && typeof source === "object" ? source : {};
    return {
        lesson_level: clampNonNegativeInteger(input.lesson_level, 1, 1),
        lesson_xp: clampNonNegativeInteger(input.lesson_xp, 0),
        lesson_bytes: clampNonNegativeInteger(input.lesson_bytes, 0),
        lessons_completed: clampNonNegativeInteger(input.lessons_completed, 0),
        lesson_best_streak: clampNonNegativeInteger(input.lesson_best_streak, 0),
        lesson_daily_streak: clampNonNegativeInteger(input.lesson_daily_streak, 0),
        lesson_total_typed_chars: clampNonNegativeInteger(input.lesson_total_typed_chars, 0),
        lesson_last_active_day: clampString(input.lesson_last_active_day, 16),
    };
}

function normalizeProfileRow(row = null) {
    const source = row && typeof row === "object" ? row : {};
    const lessonStats = normalizeLessonStats(source);
    return {
        display_name: clampString(source.display_name, 48),
        account_type: ["test", "sandbox"].includes(String(source.account_type || "").toLowerCase())
            ? String(source.account_type || "").toLowerCase()
            : "test",
        lesson_level: lessonStats.lesson_level,
        lesson_xp: lessonStats.lesson_xp,
        lesson_bytes: lessonStats.lesson_bytes,
        lessons_completed: lessonStats.lessons_completed,
        lesson_best_streak: lessonStats.lesson_best_streak,
        lesson_daily_streak: lessonStats.lesson_daily_streak,
        lesson_total_typed_chars: lessonStats.lesson_total_typed_chars,
        lesson_last_active_day: lessonStats.lesson_last_active_day,
        last_cloud_sync_at: source.last_cloud_sync_at || null,
        updated_at: source.updated_at || null,
    };
}

function normalizeStateRow(row = null) {
    const source = row && typeof row === "object" ? row : {};
    const payload = source.storage_payload && typeof source.storage_payload === "object"
        ? source.storage_payload
        : {};
    return {
        storage_payload: payload,
        updated_at: source.updated_at || null,
    };
}

export function createSupabaseAccountClient({
    supabaseUrl = "",
    supabaseAnonKey = "",
    redirectPath = "/",
    profileTable = "account_profiles",
    stateTable = "account_workspace_state",
    storageKey = "fazide.account-profile.v1",
} = {}) {
    const normalizedUrl = String(supabaseUrl || "").trim();
    const normalizedAnonKey = String(supabaseAnonKey || "").trim();
    const normalizedProfileTable = String(profileTable || "account_profiles").trim() || "account_profiles";
    const normalizedStateTable = String(stateTable || "account_workspace_state").trim() || "account_workspace_state";
    const enabled = Boolean(normalizedUrl && normalizedAnonKey);

    let supabase = null;
    let initialized = false;
    let disabledReason = "";

    function getRedirectUrl() {
        if (typeof window === "undefined") return "";
        const origin = String(window.location.origin || "").trim();
        const path = String(redirectPath || "/").trim() || "/";
        return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
    }

    async function init() {
        if (initialized || !enabled) {
            initialized = true;
            return { ok: enabled, reason: enabled ? "ready" : "missing-config" };
        }
        try {
            const mod = await import(SUPABASE_CLIENT_CDN);
            const createClient = mod?.createClient;
            if (typeof createClient !== "function") {
                disabledReason = "supabase-client-unavailable";
                return { ok: false, reason: disabledReason };
            }
            supabase = createClient(normalizedUrl, normalizedAnonKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storageKey,
                    flowType: "pkce",
                },
            });
            initialized = true;
            return { ok: true, reason: "ready" };
        } catch {
            disabledReason = "supabase-import-failed";
            initialized = true;
            return { ok: false, reason: disabledReason };
        }
    }

    async function getSession() {
        if (!supabase) return null;
        try {
            const { data } = await supabase.auth.getSession();
            return data?.session || null;
        } catch {
            return null;
        }
    }

    async function getCurrentUser() {
        const session = await getSession();
        return session?.user || null;
    }

    async function signInWithGoogle() {
        if (!supabase) return { ok: false, error: "not-ready" };
        const redirectTo = getRedirectUrl();
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: "google",
                options: {
                    redirectTo,
                    queryParams: {
                        access_type: "offline",
                        prompt: "consent",
                    },
                },
            });
            if (error) {
                return { ok: false, error: error.message || "oauth-start-failed" };
            }
            return { ok: true };
        } catch {
            return { ok: false, error: "oauth-start-failed" };
        }
    }

    async function signOut() {
        if (!supabase) return { ok: false, error: "not-ready" };
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                return { ok: false, error: error.message || "signout-failed" };
            }
            return { ok: true };
        } catch {
            return { ok: false, error: "signout-failed" };
        }
    }

    async function loadRemoteProfile(userId = "") {
        if (!supabase || !userId) return null;
        try {
            const { data, error } = await supabase
                .from(normalizedProfileTable)
                .select("display_name, account_type, lesson_level, lesson_xp, lesson_bytes, lessons_completed, lesson_best_streak, lesson_daily_streak, lesson_total_typed_chars, lesson_last_active_day, last_cloud_sync_at, updated_at")
                .eq("id", String(userId))
                .maybeSingle();
            if (error) return null;
            return normalizeProfileRow(data);
        } catch {
            return null;
        }
    }

    async function upsertRemoteProfile({ userId = "", displayName = "", accountType = "test", lessonStats = null } = {}) {
        if (!supabase || !userId) return { ok: false, error: "missing-user" };
        const normalizedName = clampString(displayName, 48);
        const normalizedType = ["test", "sandbox"].includes(String(accountType || "").toLowerCase())
            ? String(accountType || "").toLowerCase()
            : "test";
        const basePayload = {
            id: String(userId),
            display_name: normalizedName,
            account_type: normalizedType,
            updated_at: new Date().toISOString(),
        };
        const extendedPayload = lessonStats && typeof lessonStats === "object"
            ? {
                ...basePayload,
                ...normalizeLessonStats(lessonStats),
                last_cloud_sync_at: new Date().toISOString(),
            }
            : basePayload;
        try {
            let { error } = await supabase.from(normalizedProfileTable).upsert(extendedPayload);
            if (error && extendedPayload !== basePayload) {
                const fallback = await supabase.from(normalizedProfileTable).upsert(basePayload);
                error = fallback?.error || null;
            }
            if (error) {
                return { ok: false, error: error.message || "profile-upsert-failed" };
            }
            return { ok: true };
        } catch {
            return { ok: false, error: "profile-upsert-failed" };
        }
    }

    async function loadRemoteState(userId = "") {
        if (!supabase || !userId) return null;
        try {
            const { data, error } = await supabase
                .from(normalizedStateTable)
                .select("storage_payload, updated_at")
                .eq("id", String(userId))
                .maybeSingle();
            if (error) return null;
            return normalizeStateRow(data);
        } catch {
            return null;
        }
    }

    async function upsertRemoteState({ userId = "", storagePayload = {} } = {}) {
        if (!supabase || !userId) return { ok: false, error: "missing-user" };
        const payload = storagePayload && typeof storagePayload === "object" ? storagePayload : {};
        try {
            const { error } = await supabase.from(normalizedStateTable).upsert({
                id: String(userId),
                storage_payload: payload,
                updated_at: new Date().toISOString(),
            });
            if (error) {
                return { ok: false, error: error.message || "state-upsert-failed" };
            }
            return { ok: true };
        } catch {
            return { ok: false, error: "state-upsert-failed" };
        }
    }

    function onAuthStateChange(handler) {
        if (!supabase || typeof handler !== "function") {
            return () => {};
        }
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            handler(session?.user || null, session || null);
        });
        return () => {
            try {
                data?.subscription?.unsubscribe?.();
            } catch {
            }
        };
    }

    return {
        enabled,
        provider: "supabase",
        init,
        getCurrentUser,
        signInWithGoogle,
        signOut,
        loadRemoteProfile,
        upsertRemoteProfile,
        loadRemoteState,
        upsertRemoteState,
        onAuthStateChange,
        get disabledReason() {
            return disabledReason;
        },
    };
}
