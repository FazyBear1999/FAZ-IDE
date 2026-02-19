# Agent Operations

## Mission
- Keep FAZ IDE stable, organized, and easy to extend.
- Prefer small, reversible changes with deterministic validation.

## Non-Negotiables
- Do not broaden product scope without a recorded decision entry.
- Do not merge behavior changes without focused validation.
- Do not leave memory docs out of sync with runtime behavior.
- Do not trade safety gates for speed.
- During optimization lockdown, prioritize organization/reliability work over net-new feature scope.
- Do not add low-signal tests; every test must protect a concrete behavior contract.

## Architecture Anchors
- Main orchestrator: `assets/js/app.js`
- Sandbox runtime: `assets/js/sandbox/runner.js`
- Preview/inlining helpers: `assets/js/sandbox/workspacePreview.js`
- Runtime validation templates: `assets/apps/`

## Safe Change Protocol
1. Audit target surface before edits.
2. Apply smallest possible patch set.
3. Run decision selection using `decision-framework.md` for behavior/safety changes.
4. Update focused tests for changed behavior.
5. Update memory docs (`decisions`, `feature-map`, `release-notes`, `test-gaps`).
6. If roadmap work is involved, update `roadmap-decision-map.md` checkpoint state.
7. Run focused checks, then broad gate when batch is complete.

## Risk Tiers
- **Low risk**: text-only docs and isolated tests; run focused checks + `test:memory`.
- **Medium risk**: runtime/config behavior changes; run focused checks + `test:integrity` + relevant Playwright specs.
- **High risk**: orchestration/release/safety flow edits; run full `frank:full` before handoff.

## Validation Discipline
- Use focused tests first.
- Use `test:memory` after memory updates.
- For large file-organization work, run full gate after every 3 major changes.
- Run `frank:full` immediately for any high-risk release/orchestration touch or unresolved focused-test failure.
- Capture exact failing stage/log path before attempting fixes.

## Test Quality Contract
- New tests must be falsifiable and regression-sensitive.
- Favor behavior/invariant assertions over existence-only assertions.
- Each new optimization slice should include tests that would fail if the slice regresses.

## Session Exit Requirements
- Working tree clearly reflects intended scope.
- Docs and tests align with implementation.
- Remaining risks and next actions are explicit.
- Decision and recovery notes are updated when behavior or failure modes changed.
- Roadmap checkpoints touched in-session include decision ref + validation evidence.
