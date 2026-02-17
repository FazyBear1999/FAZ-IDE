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

## 2026-02-17T00:00:00Z - Master roadmap adoption

- Date (UTC):
- 2026-02-17T00:00:00Z
- Area:
- Product strategy, teaching architecture, and execution sequencing
- Decision:
- Adopted a master roadmap with fixed constraints: square/grid UI language, tool-heavy file-first IDE behavior, game-building teaching mission, open-source/no-subscription model, and near-term ghost-text lesson delivery.
- Sequenced delivery into five phases: Real IDE foundation → Ghost lessons → In-IDE game engine curriculum → adoption accelerators (offline/export/deterministic/bug bundles) → optional BYOK tutor AI.
- Why:
- Gives stable prioritization for large changes while preserving current safety/release discipline and avoids feature-sprawl execution.
- Follow-up:
- Execute immediate queue from `docs/MASTER_ROADMAP.md` beginning with filesystem and deterministic run foundations, then track progress/tests in memory docs per phase.

## 2026-02-17T00:20:00Z - Deterministic run-context foundation

- Date (UTC):
- 2026-02-17T00:20:00Z
- Area:
- Sandbox runtime reproducibility/observability
- Decision:
- Added a normalized run-context object (`id`, `runNumber`, `token`, `seed`, optional fixed timestep) and wired it through app run lifecycle, sandbox runner, and iframe bridge messages.
- Kept existing token-gating behavior unchanged while exposing reproducibility metadata for future deterministic replay and bug-bundle features.
- Why:
- Establishes Phase-4 reproducibility primitives now without destabilizing current run UX.
- Follow-up:
- Thread run-context into future deterministic mode toggles, bug bundle payload capture, and lesson behavior-check execution traces.

## 2026-02-17T00:35:00Z - Beginner-safe workspace guardrails + run-context regression

- Date (UTC):
- 2026-02-17T00:35:00Z
- Area:
- Quality guardrails, test safety coverage, beginner-friendly workspace standard
- Decision:
- Added a targeted sandbox regression that asserts run-context coherence (`bridge_ready` + `console` token consistency, seed/run-number presence, run-context logging) in `tests/ide.spec.js`.
- Expanded memory guardrails to explicitly enforce "guided power" (beginner-friendly without removing pro tools), reversible operations, and observability-first UX behavior.
- Why:
- Prevents silent drift away from safe/professional workspace behavior while keeping the product approachable for new coders.
- Follow-up:
- Continue adding one focused safety regression per high-impact runtime/storage feature and keep memory guardrails updated when product principles are clarified.

## 2026-02-17T00:50:00Z - Editor HTML auto-close tags (power + beginner rails)

- Date (UTC):
- 2026-02-17T00:50:00Z
- Area:
- Editor typing ergonomics (HTML authoring)
- Decision:
- Added HTML auto-close behavior on `>` for opening tags (example: `<html>` yields `<html></html>` with cursor placed between tags).
- Added safety guardrails so auto-close does not trigger for closing/declaration/self-closing/void tags (e.g., `<input>` does not produce `</input>`).
- Why:
- Increases real-IDE authoring speed while remaining beginner-friendly by reducing repetitive syntax and avoiding invalid-tag noise.
- Follow-up:
- Extend HTML typing ergonomics with optional rename-paired-tag and close-tag completion behaviors during CM6 migration.

## 2026-02-17T01:10:00Z - Editor QoL power bundle (duplicate/move/comment)

- Date (UTC):
- 2026-02-17T01:10:00Z
- Area:
- Editor productivity and beginner-safe power defaults
- Decision:
- Added keyboard-first editing actions: duplicate line/block (`Alt+Shift+ArrowDown`), move line up/down (`Alt+ArrowUp/Down`), and toggle comment (`Ctrl/Cmd+/`) with language-aware behavior (line comments for code-like languages, wrapper comments for HTML/Markdown).
- Updated shortcut discoverability text and shortcut help list without adding UI clutter.
- Why:
- These are high-value professional editor actions that improve speed and confidence while staying reversible and predictable for beginners.
- Follow-up:
- Add paired-tag rename, close-tag completion hints, and expand comment-style precision as part of CM6 migration phase.

## 2026-02-17T01:25:00Z - HTML serious authoring ergonomics (paired rename + close completion)

- Date (UTC):
- 2026-02-17T01:25:00Z
- Area:
- Editor HTML workflow power and typing safety
- Decision:
- Added close-tag completion on `</` typing context in HTML (typing `/` after `<` completes nearest unclosed tag safely).
- Added paired-tag rename sync so editing an opening HTML tag name updates the structural paired closing tag automatically.
- Included safety fallback to avoid duplicate close-tag insertion when a matching close tag already exists immediately after cursor.
- Why:
- Delivers professional HTML editing speed while keeping behavior predictable and beginner-safe.
- Follow-up:
- Integrate these behaviors into CM6 extension architecture and add optional close-tag suggestion list UI if it remains visually quiet.

## 2026-02-17T01:40:00Z - HTML smart-enter between tags + rename-sync performance guard

- Date (UTC):
- 2026-02-17T01:40:00Z
- Area:
- Editor HTML typing ergonomics and runtime safety
- Decision:
- Added HTML smart-enter behavior: pressing `Enter` between `><` of matching tag pairs expands to an indented middle line and places cursor inside.
- Added fast cursor-context guards before paired-tag rename token parsing to reduce unnecessary full-document parsing on unrelated edits.
- Why:
- Matches professional HTML editor feel and improves nested authoring speed while keeping behavior deterministic and efficient.
- Follow-up:
- Add malformed-markup and multi-cursor edge tests, and carry same behavior into CM6 extension state transactions.

## 2026-02-17T13:20:00Z - Python Phase 1 worker runtime

- Date (UTC):
- 2026-02-17T13:20:00Z
- Area:
- Runtime execution model, editor language wiring, and deterministic testability
- Decision:
- Added a dedicated Python runtime path using a sandboxed worker (`assets/js/sandbox/pythonRunner.js` + `pythonWorker.js`) with lazy Pyodide loading, per-run timeout protection, and console forwarding into existing log pipeline.
- Integrated `.py` language behavior across editor status/mode/snippets/starter templates without changing existing JS/HTML/CSS run flow.
- Added deterministic test hook support (`window.__FAZIDE_PYTHON_EXECUTE__`) so Playwright can validate Python integration without CDN/network dependency.
- Why:
- Enables Python game/output onboarding while preserving safety and keeping regression tests deterministic in CI.
- Follow-up:
- Add Python package/import policy controls, persistent Python execution state options, and canvas-safe API bridge for beginner game graphics in Phase 2.

## 2026-02-17T13:45:00Z - Python runtime resilience + local syntax mode

- Date (UTC):
- 2026-02-17T13:45:00Z
- Area:
- Python editor/runtime stability and offline-safe syntax rendering
- Decision:
- Added local CodeMirror Python mode asset (`assets/vendor/codemirror/mode/python/python.min.js`) and loaded it via `index.html` so Python highlighting uses existing theme token colors with no external mode fetch.
- Added explicit Python run cancellation on superseded runs and applied timeout enforcement across both worker and mock execution paths.
- Why:
- Keeps Python functionality predictable under rapid reruns/timeouts and ensures syntax-coloring quality remains available offline.
- Follow-up:
- Add regression for stale timeout responses and broaden token-class coverage assertions for Python comments/strings/keywords.

## 2026-02-17T06:30:00Z - Editor power bundle II (duplicate-up/delete/select-next)

- Date (UTC):
- 2026-02-17T06:30:00Z
- Area:
- Editor productivity shortcuts and deterministic multi-cursor behavior
- Decision:
- Added duplicate-line/block upward shortcut (`Alt+Shift+ArrowUp`) while preserving existing duplicate-down behavior.
- Added delete line/block shortcut (`Ctrl/Cmd+Shift+K`) as a reversible editor-local transform with deterministic cursor landing.
- Added select-next-occurrence shortcut (`Ctrl/Cmd+D`) with safe behavior: first press on a collapsed caret selects current word, subsequent presses add the next non-overlapping match, and unsupported editors no-op safely.
- Why:
- Increases professional editing throughput without adding visual clutter, while maintaining predictable behavior and fallback safety.
- Follow-up:
- Add malformed-selection and textarea fallback parity tests for delete/duplicate behavior; carry the same semantics into CM6 command transactions.