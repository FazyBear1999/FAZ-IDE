# FAZ IDE Master Roadmap

## North Star

Build a grid-perfect, tool-heavy, file-first teaching IDE where learners create real projects through ghost-text + behavior-checked lessons, supported by filesystem undo/trash, stable sandbox runs, runtime inspection/debug overlays, offline/export, deterministic replayable bug bundles, and optional BYOK tutor AI that teaches rather than replaces learning.

## Fixed Product Constraints

- Square/grid-perfect UI language is non-negotiable.
- Tool-heavy + file-system-heavy UX (real IDE feel, not playground feel).
- Primary mission: teach coding by building, especially games.
- Open source, no ads, no subscriptions.
- Near-term teaching mode: ghost-text follow-along game projects.
- Editor direction: migrate to CodeMirror 6.

## Strategic Quality Pillars

Every feature must strengthen at least one pillar:

- Safety: users can recover from mistakes and crashes.
- Clarity: users always know what to do next.
- Reproducibility: issues are replayable and shareable.
- Observability: state/errors/performance are visible.
- Teachability: product behavior doubles as curriculum.
- Portability: offline/export/import are dependable.

## Delivery Phases

## Phase 0 — Architecture Spine (Start First)

- Single command registry for all UI actions (menu/buttons/shortcuts/palette use the same action IDs).
- Explicit state boundaries:
  - Project state (files/folders/tabs/trash/history).
  - Workspace state (layout/panels/theme/tool visibility).
  - Runtime state (run token/process lifecycle/console/diagnostics).
- Global undo transaction model spanning file ops and structured patches.
- Atomic file writes with recovery journal replay on boot.
- Worker-backed indexing/parsing for search/replace/diagnostics to keep UI thread responsive.
- List virtualization for heavy file trees/search results.
- Ring-buffer logging for console/runtime events with deterministic truncation.
- Canonical panel layout engine (columns + stacks) with deterministic solver and hover-only minimal sash visuals.

Exit criteria before broad lesson rollout:

- All primary editor/files/runtime actions resolve through the command registry.
- Undo/redo safely replays or rejects with explicit diagnostics (no silent state drift).
- Crash/reload restores last consistent workspace with journal-backed recovery.
- Large project interactions remain responsive under worker/indexing load.

## Phase 1 — Real IDE Foundation

- Virtual project filesystem backed by IndexedDB.
- Filesystem trash + restore + durable autosave/session restore.
- Filesystem action undo/redo (create/rename/move/delete/duplicate).
- Command palette as universal action surface.
- Project search + replace with preview and scoped actions.
- Tabs/recents/pin/lock polish.
- Stable run lifecycle: run/stop/restart with isolation + timeout handling.
- Usable console: filtering, levels, copy/clear, file:line links.
- Structured diagnostics panel with actionable fix affordances.
- Workspace layout presets + predictable docking/resizing.

UI rule: keep tools available; reduce clutter through contextual actions and command palette, not by stripping capabilities.

## Phase 2 — Ghost-Text Lesson Engine (Differentiator)

- Lesson projects are real folder/file templates in-repo.
- Step engine with objective/progress/checkpoint panel.
- Typing zones constrained to intended edit regions.
- Validation modes:
  - Exact snippet validation.
  - Tolerant token-based validation.
  - Behavior checks via sandbox test hooks.
- Assist ladder: hint → reveal line → reveal block → paste step (tracked as assisted).
- Frequent runnable checkpoints (2–5 minute progress feedback).

## Phase 3 — In-IDE Game Engine Curriculum

- Canvas engine sequence: loop/time → input → math → entities/components → render → collision → scenes → audio → UI/debug → save/load.
- Runtime inspector panel (read-only default).
- Debug overlay toggles (hitboxes/vectors/camera/collision/IDs).
- Capstone game built on same file/project architecture.

## Phase 4 — Open-Source Adoption Accelerators

- Export/import: ZIP, runnable single-HTML bundle, project-bundle import.
- Offline-first runtime after first load.
- Deterministic run mode (seeded RNG + optional fixed timestep).
- Bug bundle generator (snapshot + logs/errors + lesson-step metadata).

## Phase 5 — AI Tutor Mode (Optional)

- Explain errors/selection.
- Hint-not-answer workflow.
- Solution review and coaching tone.
- Patch/diff preview before apply.
- Every apply is undoable.
- Delivery model: BYOK first, optional local model support later.

## CodeMirror 6 Ghost System Blueprint

- Decorations: ghost text + step highlight regions.
- StateField: stores expected text, editable ranges, and progress.
- Transaction filters: block out-of-zone edits while allowing navigation.
- ViewPlugin: computes live progress and updates overlays.
- Step anchors in lesson starter files:
  - `// [STEP:<id>:START]`
  - `// [STEP:<id>:END]`

## Maturity Additions (Required for Master-Grade)

- Accessibility-first keyboard/focus/ARIA/high-contrast coverage.
- Crash-safe recovery journal and unsaved-buffer restore.
- Operation log panel tied to filesystem undo history.
- Test harness panel for lesson checks + simple unit tests.
- Security hardening for sandbox boundaries and secret-safe logs.
- Contributor lesson validator/previewer to keep tutorial PRs stable.

## Immediate Build Queue (Start Here)

1. Build command registry baseline and migrate run/files/editor actions to shared command IDs.
2. Define and enforce project/workspace/runtime state boundaries in orchestration layer.
3. Add atomic write + recovery journal service and boot-time replay checks.
4. Create IndexedDB-backed filesystem adapter behind current file store API.
5. Add filesystem action journal service (undo/redo + operation log).
6. Add trash metadata model + timed/explicit restore flows.
7. Add deterministic run context object (seed/timestep/run id) in sandbox pipeline.
8. Stand up lesson manifest format + marker parser for STEP anchors.
9. Add CM6 migration spike branch plan and compatibility checklist.
10. Execute panel engine blueprint slices (A-E) for VS Code-style column/stack layout reliability (`docs/PANEL_ENGINE_BLUEPRINT.md`) — Slice A+B+C complete, continue with Slice D next.

## Definition of Roadmap Success

- Beginners can complete game lessons with visible progress checkpoints.
- Power users can treat projects as real file trees with safe recovery.
- Bugs can be reproduced from deterministic bundles.
- Core flows remain fast, keyboard-first, and square/grid-consistent.
