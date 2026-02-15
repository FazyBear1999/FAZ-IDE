export function createDebouncedTask(fn, waitMs = 120) {
    let timer = null;
    let lastArgs = [];

    const invoke = () => {
        timer = null;
        fn(...lastArgs);
    };

    return {
        schedule(...args) {
            lastArgs = args;
            if (timer != null) {
                clearTimeout(timer);
            }
            timer = setTimeout(invoke, Math.max(0, Number(waitMs) || 0));
        },
        flush(...args) {
            if (args.length) {
                lastArgs = args;
            }
            if (timer != null) {
                clearTimeout(timer);
            } else if (!args.length) {
                return false;
            }
            invoke();
            return true;
        },
        cancel() {
            if (timer == null) return false;
            clearTimeout(timer);
            timer = null;
            return true;
        },
        pending() {
            return timer != null;
        },
    };
}