# Project Context

## Product Goal
- FAZ IDE is a local-first browser IDE for JavaScript experiments.

## Product Direction (Master)
- Build a grid-perfect, tool-heavy, file-first teaching IDE.
- Teach coding by building real projects, with special focus on games.
- Keep product open source and free (no ads/subscriptions).
- Near-term differentiator: ghost-text follow-along game lessons.
- Editor architecture target: CodeMirror 6.

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
- Preserve square/grid visual language in all UI changes.

## Quality Pillars
- Safety
- Clarity
- Reproducibility
- Observability
- Teachability
- Portability
