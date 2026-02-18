# Release Notes Memory

Use this file to keep a compact running timeline of meaningful release-impacting changes.
Entries should make it easy to understand what changed and why validation gates were updated.

## Template

- Version:
- Date (UTC):
- Summary:
- Notable safety/infra updates:
- Validation status:
- Follow-up actions:

## Entries

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Hardened panel resizing behavior with a row-aware 3-column bounds model.
- Notable safety/infra updates: Width clamping now stays consistent across splitters, layout controls, and public API setters; improved max-width flexibility while preserving minimum width safeguards.
- Validation status: Focused panel/layout regressions passed, including min-clamp checks and width-control max-bound contract checks.
- Follow-up actions: Consider explicit UI span controls (1/3, 2/3, full) if users request manual column-span selection.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Standardized runtime scope and validation stack to JavaScript, HTML, and CSS.
- Notable safety/infra updates: Removed legacy fourth-language runtime execution branches, template assets, and related scripts/tests; kept sandbox and console paths stable for web-language flows.
- Validation status: Focused runtime contracts and app-level diagnostics updated for JS/HTML/CSS-only behavior.
- Follow-up actions: Keep all new runtime features inside JS/HTML/CSS scope and maintain marker-based validation templates.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Continued optimization of orchestration boundaries in `app.js`.
- Notable safety/infra updates: Runtime preview + workspace asset resolver logic extracted to `assets/js/sandbox/workspacePreview.js` with contract tests.
- Validation status: Focused tests pass for preview sanitization and local asset inlining contracts.
- Follow-up actions: Continue bounded helper extraction from `app.js` without changing public behavior.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Metadata legitimacy pass completed.
- Notable safety/infra updates: Attribution and licensing files (`AUTHORS`, `LICENSE`, `NOTICE`) and README references aligned.
- Validation status: Metadata and docs consistency verified during cleanup pass.
- Follow-up actions: Keep attribution metadata synchronized with project ownership and release flow.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Docking behavior optimization and center drop contract hardening.
- Notable safety/infra updates: Docking move/order handlers now short-circuit no-op operations; center dock-zone now performs center repositioning instead of preset reset behavior.
- Validation status: Added drag-to-center regression plus row-cap docking regression; focused docking/layout/ui/workflow suites passed.
- Follow-up actions: Keep center-dock no-reset behavior and row-cap constraints as non-regression requirements in future docking changes.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Closed docking/resizing consistency flaws across edge drag and responsive layout.
- Notable safety/infra updates: Workspace edge-resize now uses row-aware effective bounds for dual-panel drags; splitter pointer-capture cleanup made exception-safe; narrow viewport now hides tools splitter with other splitters.
- Validation status: CSS lint passed; new edge-resize cap regression passed; new narrow-viewport splitter visibility regression passed; broader UI/workflow/layout/IDE contracts passed.
- Follow-up actions: Preserve parity of bounds logic across splitter, edge drag, controls, and public API setters.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Docking HUD visual guidance overhaul for clearer drop affordances.
- Notable safety/infra updates: Dock overlay now shows contextual drag hint text, richer zone surfaces, stronger active-zone emphasis, and explicit panel/zone metadata hooks for deterministic styling.
- Validation status: CSS lint passed; new dock HUD visibility regression passed; focused docking regressions and broader UI/workflow/layout/IDE suites passed.
- Follow-up actions: Keep HUD metadata-driven styling and avoid reverting to transparent low-signal dock zones.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Docking/resizing safe-route stabilization with minimal splitter UX.
- Notable safety/infra updates: Re-centered splitter visuals on clean line-only cues (no arrows), added guaranteed docking overlay teardown fallback listeners, restored missing runtime constants causing boot failures, and bumped service-worker cache version to force fresh assets.
- Validation status: CSS lint passed; focused docking/HUD and splitter typography contracts passed; UI/accessibility/layout/workflow contract sweep passed.
- Follow-up actions: Keep splitters minimal and treat boot-failed status defaults or stale-cache regressions as blockers.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Completed full CSS optimization audit with safe rendering tune and theme/syntax hardening.
- Notable safety/infra updates: Verified full CSS toolchain (lint, import audit, purge/minify); reduced idle compositing by enabling docking `will-change` hints only while overlay is active; added all-theme syntax keyword visibility regression.
- Validation status: CSS lint/import audit/optimize passed; CSS token + theme-readability + typography-sizing + IDE suites passed.
- Follow-up actions: Preserve active-only compositing hints and keep theme+syntax regressions mandatory for CSS changes.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Smoothed AI memory decision workflow for faster and safer session continuity.
- Notable safety/infra updates: Added a standardized decision-loop + session-close sync guidance in memory docs to reduce drift between `decisions.md`, `release-notes.md`, and recovery/status files.
- Validation status: Memory governance contract verified via `npm run test:memory`.
- Follow-up actions: Keep memory updates concise and evidence-backed; escalate if cross-file drift reappears.
