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
