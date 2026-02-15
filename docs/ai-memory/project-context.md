# Project Context

## Product Goal
- FAZ IDE is a local-first browser IDE for JavaScript experiments.

## AI Identity
- Primary AI assistant name: Frankleen
- Preferred success banner phrase: `ALL GOOD FAZYBEAR - FRANKLEEN ONLINE`

## Current Priorities
- Stability of file workflows (create/rename/move/delete/trash/undo).
- Reliable workspace import/export and persistence.
- Strong release gating (`npm run test:all`).

## Architecture Notes
- Web app entry: `assets/js/app.js`
- End-to-end tests: `tests/ide.spec.js`, `tests/release.spec.js`
- Release packaging scripts: `scripts/`

## Constraints
- Keep web runtime behavior stable.
- Prefer minimal, targeted changes.
- Preserve existing keyboard workflows.
