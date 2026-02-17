# Feature Map

## Core Flows
- Editor lifecycle: write code, run code, clear/format, save/save-all.
- File lifecycle: create, rename, duplicate, delete, trash, restore, undo/redo.
- Workspace lifecycle: export/import workspace, persistence, reopen continuity, and safety-capped imports (size/count/code limits + local-folder byte caps).
- Layout lifecycle: panel toggle/order/size, presets, theme switching.
- Template lifecycle: load predefined game/application templates from Files panel into workspace and run from active file.

## Advanced Flows
- Search stack: quick open, symbol palette, find/replace, project search.
- Tools stack: diagnostics, task runner, inspect mode, debug watches.
- Console stack: Console/Terminal tabs with safe local terminal commands (no privileged eval path), bounded terminal/task output lengths, capped logger growth, queued sandbox console flushes, and Python worker-run output forwarding.
- Snippet stack: register/list/unregister snippets and editor expansion.
- Extension stack: command registry and palette execution.
- Editor QoL power stack: auto-pair + smart-enter + HTML auto-close tags + HTML smart-enter between tags + close-tag completion + paired-tag rename sync, duplicate line/block (up/down), move line up/down, delete line/block, select-next-occurrence multi-cursor selection, language-aware toggle comments (including Python), completion + signature hints.

## Python Phase 1
- `.py` files run through a sandboxed Python worker path with timeout protection and bounded output forwarding.
- Python runtime supports deterministic test-mode execution via a mock executor hook (`window.__FAZIDE_PYTHON_EXECUTE__`) for offline-safe Playwright coverage.
- Filesystem/editor wiring includes Python icon mapping, language detection, status-bar labeling, editor mode selection, and Python starter/snippet defaults.

## Release Flows
- Sync and verify web artifacts.
- Run QA gates (`test:memory`, `test:integrity`, Playwright).
- Validate desktop packaging and SiteGround package verification.

## UI Polish Candidates
- Reduce visual noise in the top bar and panel actions.
- Improve consistency of button labels and menu wording.
- Tighten spacing and hierarchy in Files/Tools panels.
- Make error states and status messaging more glanceable.

## Roadmap Commitments
- Real-IDE foundation first: IndexedDB-backed virtual filesystem, filesystem undo/redo, trash/restore, stable run lifecycle, project-wide search/replace, diagnostics clarity.
- Teaching differentiator second: ghost-text lesson engine with typing zones, step progression, and behavior checks.
- Game curriculum third: in-IDE engine modules with runtime inspector and debug overlays.
- Adoption accelerators: offline-first behavior, export/import reliability, deterministic run mode, bug bundle generation.
- Optional AI tutor mode: hint-first instruction and undoable patch application.

## Guardrails for New Work
- Keep tools discoverable; reduce clutter through context + command palette, not feature removal.
- Every feature should improve at least one pillar: Safety, Clarity, Reproducibility, Observability, Teachability, Portability.
- Keep workflows keyboard-first and preserve square/grid UI consistency.

## Beginner-Friendly Real-Workspace Standard
- Beginner-friendly means guided, not simplified-away: keep professional workflows available while adding rails (hints, defaults, safe undo paths, clear next actions).
- Prefer reversible operations (trash/undo/journal) over destructive actions; if destructive behavior exists, require clear confirmation and recovery path.
- Every major workflow should have both mouse and keyboard paths, with command-palette discoverability.
- Teaching features should produce real project artifacts/files so users can leave with runnable work they understand.
