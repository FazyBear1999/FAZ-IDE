# Agent Operations Manual

Purpose: give any AI agent a deterministic, low-risk operating contract for FAZ IDE.

## 1) System Identity and Mission
- Product: FAZ IDE (local-first browser IDE + optional desktop wrapper).
- Delivery posture: safety-first, observable, reversible, test-gated.
- Prime rule: prefer minimal root-cause fixes over broad rewrites.

## 2) Core Architecture Map
- Web orchestrator: `assets/js/app.js` (UI glue, run orchestration, state wiring).
- Sandbox execution: `assets/js/sandbox/*` (runner, bridge, Python worker/runner, run-context).
- Styling system: `assets/css/*` (token-driven contracts for component/layout layers).
- Test surface: `tests/*.spec.js` (Playwright E2E + contract-style checks).
- Release scripts: `scripts/*` + package scripts in `package.json`.

## 3) Franklin and Release Gate Mental Model
- Franklin orchestrator: `scripts/franklin.js`.
- Full release gate (`frank:full`) runs 13 ordered stages:
  1. `test:all:contract`
  2. `sync:dist-site`
  3. `test:sync:dist-site`
  4. `test:memory`
  5. `test:frank:safety`
  6. `test:integrity`
  7. `test` (Playwright)
  8. `test:desktop:icon`
  9. `test:desktop:pack`
  10. `test:desktop:dist`
  11. `deploy:siteground`
  12. `verify:siteground`
  13. `test:privacy`
- Treat stage order as contract, not suggestion.

## 4) AI Memory Contract (What Must Stay Accurate)
- `project-context.md`: product identity + constraints.
- `feature-map.md`: what exists and intended behaviors.
- `decisions.md`: architecture/behavior choices with rationale.
- `known-issues.md` + `error-catalog.md`: reproducible faults and deterministic fixes.
- `test-gaps.md`: highest-risk missing coverage.
- `release-notes.md`: deploy-impacting timeline.
- `handoff-checklist.md`: session start/end operational checklist.

## 5) Safe Change Protocol (Default)
1. Read: `project-context.md`, `feature-map.md`, latest `decisions.md`, relevant tests.
2. Localize the change surface (touch as few files as possible).
3. Add/adjust targeted tests for changed behavior.
4. Run focused tests first, broader gate second.
5. Update memory docs only for behavior/architecture/test-policy deltas.

## 6) High-Risk Zones (Use Extra Caution)
- `run()` flow and sandbox token gating in `assets/js/app.js`.
- Python startup/timeout/lifecycle messaging across `app.js` + `pythonRunner.js` + `pythonWorker.js`.
- Workspace persistence/snapshot/trash flows (`persistFiles`, snapshot restore, import/export paths).
- Franklin gate contracts and script ordering.

## 7) Definition of “Careful” for This Repository
- Preserve existing UX semantics unless user explicitly requests behavior change.
- Keep new logic observable (clear status/log diagnostics).
- Keep operations reversible when possible (trash/undo/reset confirmation).
- Never bypass integrity/memory/privacy constraints to make tests pass.

## 8) Optimization Doctrine
- Optimize for maintainability first (decompose long functions, isolate responsibilities).
- Optimize performance only with measurable reason and bounded blast radius.
- Optimization is incomplete without regression coverage.

## 9) Session Exit Requirements
- Required minimum before handoff:
  - `npm run test:memory`
  - relevant focused tests for touched behavior
- For major batches and release-adjacent work, run `npm run frank:full`.
