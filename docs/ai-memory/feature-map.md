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
- Console stack: Console/Terminal tabs with safe local terminal commands (no privileged eval path), bounded terminal/task output lengths, capped logger growth, and queued sandbox console flushes.
- Snippet stack: register/list/unregister snippets and editor expansion.
- Extension stack: command registry and palette execution.

## Release Flows
- Sync and verify web artifacts.
- Run QA gates (`test:memory`, `test:integrity`, Playwright).
- Validate desktop packaging and SiteGround package verification.

## UI Polish Candidates
- Reduce visual noise in the top bar and panel actions.
- Improve consistency of button labels and menu wording.
- Tighten spacing and hierarchy in Files/Tools panels.
- Make error states and status messaging more glanceable.
