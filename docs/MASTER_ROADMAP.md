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

## Active Execution Override — Optimization + Organization Lockdown (Now)

Until this lockdown is complete, optimization/organization/reliability work takes priority over net-new features.

### Lockdown Goals

- Preserve behavior while reducing complexity, coupling, and drift.
- Increase confidence through meaningful tests and deterministic validation evidence.
- Keep all existing systems integrated and stable while improving maintainability.

### Lockdown Exit Criteria

- Full gate is consistently green over multiple optimization waves (`npm run test:all`).
- Core surfaces remain stable: files, editor, runtime/sandbox, layout, command paths, lessons, release packaging.
- `app.js` and other high-churn areas are decomposed into clearer boundaries without behavior drift.
- Tests prove behavior contracts (not just coverage volume) and fail when contracts are broken.

### Lockdown Rules (Non-Negotiable)

- No broad new feature scope until current-surface optimization milestones are complete.
- Every optimization slice must be reversible (Codex checkpoint before edits).
- No ambiguous test additions: each new test must validate a real user/system contract.
- If focused validation is unclear, escalate immediately to full gate before continuing.

## Optimization Program — Detailed Roadmap

### Wave O0 — Baseline + Guardrails

1. Confirm clean baseline and run full validation.
2. Define slice boundaries and rollback triggers for each target system.
3. Require checkpoint + focused tests + integrity + memory checks per slice.

### Wave O1 — Orchestrator Decomposition (Behavior-Preserving)

Target: reduce coupling and size pressure in `assets/js/app.js`.

1. Extract pure helper functions (formatting/label/select-option shaping).
2. Extract modal state wrappers (`data-open`, `aria-hidden`, focus routing).
3. Extract files-menu sync/toggle render helpers.
4. Extract command-palette list/render helpers while preserving command IDs.
5. Keep event wiring and side effects unchanged until helper boundaries are stable.

Validation per slice:

- Focused relevant specs + `npm run test:integrity` + `npm run test:memory`.
- End of wave: `npm run test:all`.

### Wave O2 — Filesystem + Persistence Reliability

Target: make file operations safer and easier to reason about.

1. Audit create/rename/move/delete/duplicate/trash flows for shared invariants.
2. Normalize operation journaling boundaries and undo/redo semantics.
3. Harden import/export edge handling and persistence error paths.
4. Remove duplicated mutation paths that can drift.

Validation:

- File workflow focused contracts.
- Persistence/import/export focused contracts.
- End of wave: full gate.

### Wave O3 — Runtime/Sandbox Stability + Observability

Target: keep run lifecycle deterministic and diagnostics actionable.

1. Consolidate run-token and message-trust pathways.
2. Normalize console/runtime diagnostic formatting at shared boundaries.
3. Harden fallback and timeout/isolation behavior contracts.
4. Keep security-noise suppression scoped and test-backed.

Validation:

- Sandbox security/runtime focused tests.
- Stability contracts and runtime integration checks.
- End of wave: full gate.

### Wave O4 — Layout + Panel Engine Consistency

Target: deterministic layout behavior under all panel operations.

1. Continue panel blueprint slices with strict no-regression route checks.
2. Unify splitter/edge/control/API bounds semantics.
3. Keep docking HUD and resize affordances stable and token-driven.
4. Reduce layout code duplication without changing UX behavior.

Validation:

- Layout micro tests + docking contracts.
- End of wave: full gate.

### Wave O5 — Lesson Engine + Editor Integrity

Target: preserve strict lesson correctness while improving maintainability.

1. Consolidate lesson progress/state mutation pathways.
2. Harden marker parsing/validation/reporting boundaries.
3. Keep typing-zone, cursor, and mutation guard contracts deterministic.
4. Preserve teachability UX while removing duplicated logic branches.

Validation:

- Lesson/editor focused contracts.
- End of wave: full gate.

### Wave O6 — Repository Organization + Documentation Sync

Target: reduce structural drift and improve contributor predictability.

1. Organize modules by responsibility with minimal path churn per batch.
2. Keep memory docs and roadmap checkpoint status synchronized per change batch.
3. Preserve script/release path reliability during file movement.

Validation:

- Focused checks per major organization batch.
- Full gate after each 3 major changes (or earlier for high-risk surfaces).

## Test Quality Standard (Must Be Meaningful)

Every new test must satisfy all of the following:

1. Contract-first: validates a user-visible or system-critical invariant.
2. Falsifiable: would fail if the protected behavior regresses.
3. Specific assertions: avoids trivial/pass-through checks.
4. Scope alignment: tied to the exact surface being changed.
5. Deterministic: avoids flaky timing-dependent logic where possible.
6. Evidence-linked: references the optimization slice/checkpoint it protects.

Disallowed test patterns:

- “Existence-only” assertions with no behavior verification.
- Redundant tests that do not increase contract coverage.
- Assertions that always pass regardless of implementation state.

## System-by-System Optimization Checklist

- Command registry routing completeness and consistency.
- State boundaries (`project`/`workspace`/`runtime`) enforcement clarity.
- File operation reversibility and persistence guarantees.
- Run lifecycle token isolation and sandbox message trust.
- Diagnostics/console/actionability consistency.
- Panel/layout/docking deterministic behavior.
- Lesson marker/progress/input integrity.
- Release/package/deploy script reliability.
- AI memory + roadmap + checkpoint synchronization.

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
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
