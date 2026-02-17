# Decisions Log

Track implementation choices that affect architecture, release flow, safety, or UX behavior.
Keep entries short, dated, and explicit about why the change was made.

## Template

- Date (UTC):
- Area:
- Decision:
- Why:
- Follow-up:

## 2026-02-16T23:30:00Z - Editor completion UX + test cadence

- Date (UTC):

- 2026-02-16T23:30:00Z

- Area:

- Editor autocomplete UX and validation workflow

- Decision:

- Shifted completion UI from a wide bottom panel to a compact cursor-anchored popup with tighter rows and bounded dimensions.
- Adopted session cadence of targeted regression tests per big change, deferring full-suite and `frank:full` until 5 major editor changes are accumulated.
- Why:
- Preserve a powerful editor feel without visual clutter while maintaining fast iteration feedback loops.
- Follow-up:
- Keep adding targeted tests for each major editor upgrade and trigger full gate runs at the 5-change milestone.

## 2026-02-16T23:55:00Z - Editor settings fine-tune expansion

- Date (UTC):
- 2026-02-16T23:55:00Z
- Area:
- Editor settings and low-clutter power UX
- Decision:
- Added editor-level controls for completion/transparency/volume and inline signature hints: `Inline parameter hints`, `Completion max items`, and `Completion transparency`.
- Kept defaults aligned to minimal-but-powerful behavior and wired setting changes to apply immediately without requiring full reload.
- Why:
- User direction prioritized power without clutter and requested fine-grained control over all key editing ergonomics.
- Follow-up:
- Continue exposing high-impact editor ergonomics behind settings-first controls before introducing additional always-on UI.

## 2026-02-17T00:12:00Z - Completion row sharpness + semantic icons

- Date (UTC):
- 2026-02-17T00:12:00Z
- Area:
- Editor completion visual language and symbol context
- Decision:
- Restyled completion suggestions to use sharp row-style highlights aligned with Files panel behavior instead of button-like blocks.
- Added per-suggestion kind icons derived from symbol metadata using cached AST/fallback symbol sources, then upgraded icon rendering from letter badges to real inline SVG pictogram icons.
- Why:
- Keep completion UI clean and minimal while still increasing information density and scan speed.
- Follow-up:
- Keep icon language stable and minimal; add richer symbol badges only if they remain visually quiet.

## 2026-02-16T22:20:00Z - Cleanup and test hygiene

- Date (UTC):
- 2026-02-16T22:20:00Z
- Area:
- Artifacts cleanup + test organization
- Decision:
- Added a safe multi-target desktop artifact cleanup script (`desktop:artifacts:clean`) and a combined Franklin cleanup flow (`frank:cleanup:all`).
- Removed `tests/sync-assets.test.js` because it duplicated sync checks already enforced by `scripts/verify-dist-site-sync.js` and was not referenced by any gate.
- Why:
- Keep cleanup operations deterministic and reduce manual lock-error handling.
- Remove duplicate/unreferenced test scripts to keep the test surface focused and lower maintenance noise.
- Follow-up:
- Keep sync validation centralized in `verify-dist-site-sync.js` and avoid adding standalone duplicate check scripts.

## 2026-02-15T21:45:00Z - Dev Terminal hardening