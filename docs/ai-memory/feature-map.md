# Feature Map

## Core Flows

## Core Surface

- File-first IDE shell with Editor, Files, Sandbox, Console, and Tools panels.
- Run pipeline supports JavaScript, HTML, and CSS execution/preview paths.
- Workspace import/export + persistence + layout memory + panel controls.

## Advanced Flows

## Runtime

- `assets/js/app.js` orchestrates run/session flow.
- `assets/js/sandbox/runner.js` hosts sandbox iframe execution.
- `assets/js/sandbox/workspacePreview.js` handles CSS preview shell generation and HTML linked-asset inlining.

## Validation Apps

- Runtime templates live in `assets/apps/` and cover:
  - Runtime JS Check
  - Runtime HTML Check
  - Runtime CSS Check
  - Runtime Full Matrix (JS/HTML/CSS)
- Diagnostics are marker-driven and intended for deterministic triage.

## Editor + Files

- Multi-file operations: create/rename/duplicate/move/trash/restore.
- Search/sort/filter flows in Files panel.
- Snippet manager + editor power shortcuts + formatting/lint flows.
- File-tree icon mapping/fallback helper boundary: `assets/js/ui/fileIcons.js`.
- Lesson typing system includes a dedicated `Lessons` modal in the header with `Overview` + `Shop` views, live profile/session metrics, momentum insights, and next-level progress.
- Lesson input feedback path includes throttled HUD pulse/haptic pacing for rapid bursts, plus active-session-only modal elapsed polling to keep runtime smooth.
- Lesson progression baseline now includes local-only Bytes awarded by deterministic milestones (step/lesson/streak), visible in HUD and Lessons modal.

## Franklin + Memory

- Franklin gate orchestration in `scripts/franklin.js`.
- Memory source of truth in `docs/ai-memory/`.
- Test and release contracts enforced by `test:all` and `frank:full`.

## UI Polish Candidates

- Keep runtime validation copy concise and marker-driven.
- Keep panel labels and status text deterministic and easy to scan.
- Keep Files/Applications controls visually consistent and minimal.
- Keep Lessons modal UX memorable but privacy-safe: local-only copy, token-aligned visuals, and viewport-safe modal behavior.
- Keep theme unlock/shop flow behind explicit spend/rollback contracts before enabling strict Bytes sinks for all users.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
