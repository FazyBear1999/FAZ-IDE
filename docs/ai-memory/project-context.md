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
- Production-safe web deployment with domain-aware packaging (`SITE_URL` for canonical/OG/sitemap output).
- Optimization-first execution: complete organization/performance/reliability hardening on current surfaces before introducing new feature scope.
- Zero-regression quality bar: all core controls, panels, commands, and lesson/runtime flows must remain fully integrated and validated together.
- Lockdown mode active: optimization + organization roadmap is the primary track until stabilization exit criteria are met.
- Test quality requirement: new tests must prove real behavior contracts and fail on regression, not just assert surface existence.

## Architecture Notes
- Web app entry: `assets/js/app.js`
- Runtime preview + workspace HTML inlining helpers: `assets/js/sandbox/workspacePreview.js`
- End-to-end tests: `tests/ide.spec.js`, `tests/release.spec.js`
- Preview contract tests: `tests/workspace-preview-contract.spec.js`
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

## AI Operations References
- `agent-operations.md` defines the cross-agent safe operating contract.
- `optimization-map.md` lists prioritized optimization targets with risk levels.
