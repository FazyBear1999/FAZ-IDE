# Optimization Map (Safe-First)

## Tier A: High Value + Medium Risk

### A1. `app.js` orchestration decomposition
- Why: high churn area with broad blast radius.
- Safe tactic:
  - Extract helper boundaries only.
  - Keep run semantics and token gates unchanged.
  - Pair each extraction with focused contract tests.

### A2. Runtime validation simplification
- Why: deterministic diagnostics reduce triage time.
- Safe tactic:
  - Keep runtime template output marker-based.
  - Keep copy concise and explicit.
  - Avoid adding extra runtime branches.

### A3. Filesystem operation hardening
- Why: file operations are core UX and error-prone.
- Safe tactic:
  - Preserve reversible operations.
  - Add focused tests for move/rename/trash edge paths.
  - Keep state transitions explicit.

### A4. Repository file organization program
- Why: folder structure drift increases maintenance cost and path mistakes.
- Safe tactic:
  - Execute in major-change batches with explicit blast radius.
  - Run focused validations per major change.
  - Run full gate after every 3 major changes, or immediately if release/safety scripts are touched.
  - Keep rollback scoped to the last major change when failures appear.

## Tier B: Medium Value + Low Risk

### B1. Memory doc consistency
- Keep AI memory docs aligned with current architecture.
- Remove stale references quickly after scope shifts.

### B2. Command/help clarity
- Keep command outputs deterministic and concise.
- Keep help text aligned with actual supported behavior.

## Readiness Checklist
- Is behavior covered before refactor?
- Is change split into small reversible steps?
- Is rollback straightforward?
- Are memory docs updated immediately after changes?
- Was option selection scored using `decision-framework.md`?
- Is checkpoint state updated in `roadmap-decision-map.md` for roadmap work?

## Wave 1 — Safe Decomposition Plan (No Behavior Drift)

Execution mode: stabilize and optimize current surfaces before introducing new feature scope.

### Slice W1-S0 (Guardrail setup)
- Create Codex savepoint before each slice.
- Validation: focused target suite + `npm run test:integrity` + `npm run test:memory`.
- Escalation: if any focused failure is ambiguous, run `npm run test:all` before proceeding.

### Slice W1-S1 (Pure UI text/option helpers)
- Extract pure formatting/label helpers from `assets/js/app.js` into `assets/js/ui/*` helper modules.
- No event wiring changes, no side-effect changes.
- Validation focus: `tests/editor-contract.spec.js`, `tests/file-contract.spec.js`, and related `tests/ide.spec.js` UI contract cases.

### Slice W1-S2 (Modal open/close state wrappers)
- Consolidate repeated modal open/close state mutations into shared helper wrappers.
- Preserve existing IDs, attributes (`data-open`, `aria-hidden`), focus routing, and button semantics.
- Validation focus: modal/shortcut/history/settings/project-search related `tests/ide.spec.js` contracts.

### Slice W1-S3 (Files menu state + toggle sync)
- Extract files-menu toggle/sync logic only (no operation behavior changes).
- Preserve menu close/open triggers and keyboard behavior.
- Validation focus: files menu + list interaction contracts in `tests/ide.spec.js` and `tests/file-contract.spec.js`.

### Slice W1-S4 (Command palette list/render isolation)
- Extract command-palette list shaping/render helpers while keeping command execution routing untouched.
- Preserve command IDs and registry call paths.
- Validation focus: command palette + shortcuts contracts in `tests/ide.spec.js`; run command smoke checks.

### Slice W1-S5 (Run full gate checkpoint)
- Run `npm run test:all`.
- Record evidence in `decisions.md` and `release-notes.md`.
- Stop before next wave unless full gate is green.

## System Audit Matrix (Optimization Lockdown)

Audit each system in this order and complete one full pass before broadening scope:

1. Orchestration boundaries (`app.js` decomposition progress)
2. Command registry coverage and consistency
3. Filesystem mutation/journal/undo guarantees
4. Runtime token/message-trust/diagnostic pipelines
5. Layout/docking/splitter deterministic behavior
6. Lesson marker/progress/input correctness
7. Release packaging/deploy verification scripts
8. Documentation/memory/checkpoint sync integrity

For each system:
- identify duplication/coupling hotspots,
- apply smallest reversible optimization slice,
- run focused validation,
- run `test:integrity` + `test:memory`,
- checkpoint evidence before moving to next slice.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
