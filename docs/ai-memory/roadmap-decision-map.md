# Roadmap Decision Map

This map binds roadmap execution to explicit decision checkpoints.

## Why this exists

- Optimization waves are easy to start but hard to govern without decision gates.
- This file makes each roadmap step require a decision record + validation evidence.

## Decision Checkpoint Contract

For each roadmap step:

- Checkpoint ID
- Scope boundary (in/out)
- Decision reference (`decisions.md` entry)
- Validation minimum (focused + required gate)
- Rollback trigger

No checkpoint is complete without all five fields.

## Active Checkpoints

### C1 — App orchestration decomposition (`optimization-map` A1)
- Scope boundary: helper extraction only, no runtime behavior drift.
- Decision reference: required before first move.
- Validation minimum: focused contract tests + `test:integrity`.
- Rollback trigger: any run-token/sandbox message mismatch.
- Status note: initial extraction slice completed (`ui/fileIcons.js` boundary from `app.js`).

### C2 — Runtime validation simplification (`optimization-map` A2)
- Scope boundary: marker/copy simplification only; no new runtime branches.
- Decision reference: required before template edits.
- Validation minimum: focused runtime app checks + marker assertions.
- Rollback trigger: ambiguous pass/fail markers or nondeterministic status text.

### C3 — Filesystem hardening (`optimization-map` A3)
- Scope boundary: reversible file operations only.
- Decision reference: required before rename/move/trash flow edits.
- Validation minimum: focused file workflow tests + `test:integrity`.
- Rollback trigger: any data-loss risk or restore path inconsistency.

### C4 — Repo organization program (`optimization-map` A4)
- Scope boundary: structure/path updates only unless explicitly approved.
- Decision reference: one entry per major change batch.
- Validation minimum: focused checks per major change + full gate at 3-change checkpoint.
- Rollback trigger: unresolved path drift or release-script breakage.
- Status note: Wave 1 major changes 2–3 executed as docs/script-governance updates (`script-family-inventory.md` + path normalization); focused checks passed and Checkpoint A full gate is now green (`frank:full` 14/14).

### C5 — Architecture spine execution (Master Roadmap Phase 0)
- Scope boundary: command registry, state-boundary enforcement, journal/recovery foundations; no teaching-flow UX rewrite in this checkpoint.
- Decision reference: required before each foundation slice (command routing, state model, journal, worker indexing).
- Validation minimum: focused filesystem/runtime/command tests + `test:integrity` + `test:memory`.
- Rollback trigger: command action mismatch, undo/journal inconsistency, or boot recovery drift.
- Status note: initial command-routing slice completed for shared run/save/new/search/workspace/history actions across shortcuts, buttons, file-menu, and command-palette entries.
- Status note: state-boundary snapshot baseline added (`project`/`workspace`/`runtime`) and exposed through API for safe incremental migration of orchestration logic.
- Status note: atomic batch persistence + storage recovery journal scaffolding added for layout/workspace writes with boot-time replay and API diagnostics.

### C6 — CM6 ghost lesson engine foundation (Master Roadmap Phase 2 bridge)
- Scope boundary: decorations/statefield/transaction filters/viewplugin + step-marker parsing; no AI tutor auto-write behavior.
- Decision reference: required before enabling lesson editing constraints in default editor flow.
- Validation minimum: focused lesson-editor contracts + typing-zone behavior tests + `test:integrity`.
- Rollback trigger: blocked normal editing outside lesson mode, non-deterministic step progress, or marker-range corruption.
- Status note: progression baseline extended with local-only lesson coins (step/lesson/streak milestones) and HUD/stats surfacing, with focused lesson contract tests passing.
- Status note: strict global theme-unlock policy now enforced (default-theme baseline + locked-theme gating), with focused fresh-profile lock + buy/apply contracts passing in `tests/ide.spec.js`.

### C7 — Layout customization + docking stability hardening (Master Roadmap Phase 1 safety lane)
- Scope boundary: layout token wiring, docking behavior invariants, and test reliability adjustments only; no new runtime products/surfaces.
- Decision reference: required before each layout behavior or stress-contract adjustment.
- Validation minimum: `tests/layout-micro.spec.js`, focused docking contracts in `tests/ide.spec.js`, and full `npm run test:all` for release gating.
- Rollback trigger: any preset-reset regression during docking moves, radius-control drift from UI tokens, or failing full deployment gate.
- Status note: radius setting now propagates through shared radius tokens and key shell surfaces; docking center pass-through no longer resets layout behavior settings; deterministic docking-route contract replaces flaky pointer-heavy matrix in ide suite.
- Status note: CSS selector dedupe follow-up completed in `assets/css/layout.css` (grouped scrollbar/footer status selectors) with focused contracts and full `npm run test:all` passing as deployment proof.

### C8 — Optimization lockdown + test quality enforcement (Master Roadmap active override)
- Scope boundary: optimization/organization/reliability hardening of existing systems only; no broad new feature scope.
- Decision reference: required before each optimization wave and per-wave full-gate checkpoint.
- Validation minimum: focused contracts per touched system + `npm run test:integrity` + `npm run test:memory`; full `npm run test:all` at wave boundaries.
- Rollback trigger: any behavior drift in core surfaces (files/editor/runtime/layout/lessons/commands), or low-signal tests that do not fail on regression.
- Status note: active roadmap override added in `docs/MASTER_ROADMAP.md` with wave-by-wave optimization plan and explicit test-quality standard.
- Status note: repository organization lockdown Wave 1 docs-governance pass completed (script inventory + command/path normalization) with focused validation and full-gate checkpoint evidence complete.

## Exit Rule

- Before handoff, each touched checkpoint must include:
  - decision link,
  - command evidence,
  - open risk note or explicit “none observed.”

## Cross-File Sync Rule

- `test-gaps.md`: every open gap must include a checkpoint ID.
- `known-issues.md`: every open issue tied to roadmap work must include checkpoint + validation command.
- `error-catalog.md`: new significant failures should carry checkpoint ID when applicable.
