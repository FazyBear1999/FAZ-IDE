# Agent Operations

## Mission
- Keep FAZ IDE stable, organized, and easy to extend.
- Prefer small, reversible changes with deterministic validation.

## Non-Negotiables
- Do not broaden product scope without a recorded decision entry.
- Do not merge behavior changes without focused validation.
- Do not leave memory docs out of sync with runtime behavior.
- Do not trade safety gates for speed.

## Architecture Anchors
- Main orchestrator: `assets/js/app.js`
- Sandbox runtime: `assets/js/sandbox/runner.js`
- Preview/inlining helpers: `assets/js/sandbox/workspacePreview.js`
- Runtime validation templates: `assets/apps/`

## Safe Change Protocol
1. Audit target surface before edits.
2. Apply smallest possible patch set.
3. Update focused tests for changed behavior.
4. Update memory docs (`decisions`, `feature-map`, `release-notes`, `test-gaps`).
5. Run focused checks, then broad gate when batch is complete.

## Risk Tiers
- **Low risk**: text-only docs and isolated tests; run focused checks + `test:memory`.
- **Medium risk**: runtime/config behavior changes; run focused checks + `test:integrity` + relevant Playwright specs.
- **High risk**: orchestration/release/safety flow edits; run full `frank:full` before handoff.

## Validation Discipline
- Use focused tests first.
- Use `test:memory` after memory updates.
- Run `frank:full` for full-system confirmation after major batches.
- Capture exact failing stage/log path before attempting fixes.

## Session Exit Requirements
- Working tree clearly reflects intended scope.
- Docs and tests align with implementation.
- Remaining risks and next actions are explicit.
- Decision and recovery notes are updated when behavior or failure modes changed.
