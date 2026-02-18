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

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Introduced safe repository file-organization playbook with explicit batching checkpoints.
- Notable safety/infra updates: Added `file-organization-playbook.md` and updated AI operations/optimization guidance to enforce focused checks per major change and full gate cadence after each 3 major changes.
- Validation status: Memory governance contract verified via `npm run test:memory`.
- Follow-up actions: Track organization progress as major changes and run full gate at each 3-change checkpoint or earlier for high-risk touches.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Hardened AI memory decision model and roadmap checkpoint governance.
- Notable safety/infra updates: Added `decision-framework.md` and `roadmap-decision-map.md`; updated intake and handoff contracts so options, assumptions, validation level, and rollback triggers are explicit before implementation handoff.
- Validation status: Memory governance alignment validated via `test:memory` (pending/required after this doc update batch).
- Follow-up actions: Use checkpoint IDs and assumption status tags in future optimization waves to keep decisions auditable.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Closed AI memory traceability loop by checkpoint-linking gaps, issues, and error records.
- Notable safety/infra updates: Updated `test-gaps.md`, `known-issues.md`, and `error-catalog.md` templates/rules to require checkpoint IDs and validation command context where applicable.
- Validation status: Memory governance contract validated via `npm run test:memory`.
- Follow-up actions: Enforce “no unlinked gap/issue entry” during session-close sync.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added a one-page Session Command Center to drive deterministic AI execution flow.
- Notable safety/infra updates: Introduced `session-command-center.md` and linked it into startup/handoff docs so each session follows the same prime -> decide -> execute -> validate -> sync -> exit loop.
- Validation status: Memory governance contract validated via `npm run test:memory`.
- Follow-up actions: Keep command center aligned with gate policy and checkpoint governance updates.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added safe AI command-center CLI for decision-first session startup.
- Notable safety/infra updates: New `ai:command-center`/`ai:brain` command infers checkpoints from changed files, recommends validation path by risk tier, and stays read-only unless `--write-session-brief` is explicitly provided.
- Validation status: `npm run ai:command-center`, `npm run ai:command-center -- --json`, and `npm run test:memory` passed.
- Follow-up actions: Keep inference rules synchronized with `roadmap-decision-map.md` checkpoint set.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Completed sandbox hardening + fallback reliability contract expansion (BIG WAVE, safe route).
- Notable safety/infra updates: `runner.js` now enforces safe mode/theme/surface normalization with bounded theme-lock cache; `bridge.js` now sanitizes parent theme updates; added deep stability contracts for JS+HTML document assembly invariants, malformed-theme fallback, legacy `document.write` fallback, and fallback error path messaging.
- Validation status: `tests/stability-contract.spec.js` (7/7), targeted sandbox/security tests in `tests/ide.spec.js` (3/3), `npm run test:integrity`, and `npm run test:memory` passed.
- Follow-up actions: Keep sandbox contract suite mandatory for any bridge/runner edits; if fallback compatibility changes, update tests before behavior changes ship.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Applied safe sandbox micro-optimization wave for runner and debug bridge paths.
- Notable safety/infra updates: Added `sanitizeUserCode` fast-path in `runner.js`; bounded `debug_eval` expression count/length and switched to robust bridge-safe serialization in `bridge.js` to avoid costly/fragile JSON stringification paths.
- Validation status: `tests/stability-contract.spec.js` (7/7), `tests/workspace-preview-contract.spec.js` (4/4), targeted sandbox suites in `tests/ide.spec.js` (3/3), plus `test:integrity` and `test:memory` passed.
- Follow-up actions: Keep debug-eval bounds and serialization behavior stable; treat regressions in sandbox diagnostics as blocker-level issues.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Executed safe app.js decomposition wave for sandbox console payload helpers.
- Notable safety/infra updates: Moved sandbox console payload normalization/truncation from `app.js` to `assets/js/sandbox/consolePayload.js`; app now imports helper and injects existing truncation limits through constants to preserve behavior.
- Validation status: `tests/stability-contract.spec.js` (7/7) and targeted sandbox payload/security/runtime regressions in `tests/ide.spec.js` (4/4) passed, followed by `test:integrity` and `test:memory`.
- Follow-up actions: Keep extracting only pure helper clusters from `app.js`, and require sandbox console contract checks for each slice.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Executed safe app.js decomposition wave for sandbox message trust gating.
- Notable safety/infra updates: Moved sandbox message origin/source/token trust checks from `app.js` to `assets/js/sandbox/messageTrust.js`, then rewired `onSandboxMessage` to use imported trust helpers.
- Validation status: `tests/ide.spec.js` targeted sandbox message/security/runtime regressions (4/4) and `tests/stability-contract.spec.js` (7/7) passed, followed by `test:integrity` and `test:memory`.
- Follow-up actions: Keep spoofed-message and bridge run-context tests mandatory whenever message trust logic changes.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Executed safe app.js decomposition wave for runtime diagnostics normalization.
- Notable safety/infra updates: Moved runtime error and promise rejection message normalization from `app.js` into `assets/js/sandbox/runtimeDiagnostics.js`; app now uses normalized outputs while preserving existing truncation limits and runtime-problem status flow.
- Validation status: targeted sandbox regressions in `tests/ide.spec.js` (3/3) and `tests/stability-contract.spec.js` (7/7) passed, followed by `test:integrity` and `test:memory`.
- Follow-up actions: Keep runtime and promise diagnostic-format contracts in targeted runs for each subsequent sandbox extraction wave.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Added Codex-first operations workflow for fast issue scan, safe checkpoints, and guarded rollback.
- Notable safety/infra updates: Introduced `scripts/codex-ops.js` with `scan`, `checkpoint`, `list`, and `rollback` commands; wired npm aliases and documented usage in README.
- Validation status: `codex:scan`, `codex:checkpoint`, `codex:checkpoint:list`, and rollback dry-run executed successfully; `test:memory` and `test:integrity` passed.
- Follow-up actions: Keep rollback dry-run as default and maintain untracked-file warning in checkpoint metadata.

- Version: 0.2.0
- Date (UTC): 2026-02-18
- Summary: Upgraded codex-ops for automation-friendly output and simpler savepoint/rollback ergonomics.
- Notable safety/infra updates: Added `--json` output modes, `--latest` rollback target support, status buckets in scan output, list limiting (`--limit`), and new npm aliases (`codex:status`, `codex:savepoint`, `codex:rollback:latest`, `codex:rollback:latest:apply`).
- Validation status: `codex:scan -- --json`, `codex:checkpoint:list -- --limit=1 --json`, `codex:savepoint`, and `codex:rollback:latest` executed successfully; `test:memory` and `test:integrity` passed.
- Follow-up actions: Keep CLI output contracts backward-compatible so Codex automation scripts remain stable.
