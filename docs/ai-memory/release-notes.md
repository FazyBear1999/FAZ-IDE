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
- Summary: Hardened Python Phase 1 runtime reliability and completed local syntax-token integration.
- Notable safety/infra updates: Added explicit Python run cancellation on superseded runs, timeout enforcement for mock/runtime paths, and local CodeMirror Python mode asset wiring so `.py` uses existing syntax token color system without remote mode dependency.
- Validation status: Focused Python tests passed (`3/3`) including timeout/recovery + tokenized syntax assertions; suite passed (`194/194`).
- Follow-up actions: Add stale post-timeout worker message regression and package-import allowlist controls.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Initiated Python Phase 1 runtime with safe worker execution and filesystem/editor integration.
- Notable safety/infra updates: Added sandboxed Python worker runtime (`pythonRunner` + `pythonWorker`) with timeout reset behavior, bounded console forwarding, and deterministic mock runtime hook for tests; wired `.py` language detection, editor mode/labels, snippet scope, starter template, and run dispatch into existing pipeline.
- Validation status: Focused Python integration test passed (`1/1`) and full test suite passed (`267/267`).
- Follow-up actions: Add Python package policy controls and optional graphics bridge for beginner game workflows in Phase 2.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Expanded editor power shortcuts with duplicate-up, delete-line/block, and deterministic select-next-occurrence behavior.
- Notable safety/infra updates: Added `Alt+Shift+ArrowUp` duplicate-up and `Ctrl/Cmd+Shift+K` delete line/block transforms with stable selection landing; added `Ctrl/Cmd+D` next-occurrence selection with guarded multi-cursor support and safe no-op fallback where unsupported.
- Validation status: `tests/editor-pro-editing-micro.spec.js` passed (`32/32`) and shortcut-help contract in `tests/ide.spec.js` passed (`1/1`).
- Follow-up actions: Add textarea fallback parity coverage and multi-cursor edge tests for overlapping/partial selections.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added HTML smart-enter between paired tags and optimized paired-tag rename synchronization path.
- Notable safety/infra updates: Pressing `Enter` between matching HTML tags now creates an indented middle line; paired-tag rename sync now applies fast cursor-context guards before full token parsing to reduce editor overhead.
- Validation status: Focused new HTML tests passed (`4/4`) and full `tests/editor-pro-editing-micro.spec.js` passed (`28/28`).
- Follow-up actions: Add malformed HTML + multi-cursor edge tests and migrate behavior to CM6 extension model.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added serious HTML editing ergonomics with close-tag completion and paired tag rename synchronization.
- Notable safety/infra updates: Typing `/` after `<` now completes nearest unclosed HTML tag safely; opening-tag renames now synchronize paired structural closing tags; duplicate close-tag insertion edge case is guarded when matching close tag already exists.
- Validation status: New focused HTML editor tests passed (`3/3`), full `tests/editor-pro-editing-micro.spec.js` passed (`26/26`), and shortcut-help contract check passed (`1/1`).
- Follow-up actions: Migrate these behaviors to CM6 extension primitives and add deeper malformed-markup edge tests.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added core professional editor QoL actions while keeping beginner-safe behavior and clean UI.
- Notable safety/infra updates: Introduced keyboard editor actions for duplicate line/block (`Alt+Shift+ArrowDown`), move line up/down (`Alt+ArrowUp/Down`), and language-aware toggle comments (`Ctrl/Cmd+/`); updated shortcut affordance copy/help without adding persistent UI chrome.
- Validation status: New focused editor tests passed (`5/5`) and full `tests/editor-pro-editing-micro.spec.js` passed (`23/23`).
- Follow-up actions: Continue with paired-tag rename and close-tag completion hints as next editor-power phase.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Improved HTML editing power with safe auto-close tag generation on `>`.
- Notable safety/infra updates: Editor now auto-inserts matching close tags for HTML opening tags (`<html>` -> `<html></html>`) and keeps cursor between tags; excludes void/declaration/closing/self-closing contexts to avoid invalid insertions.
- Validation status: Focused editor tests passed (`2/2`) for positive + void-tag cases, and full `tests/editor-pro-editing-micro.spec.js` passed (`18/18`).
- Follow-up actions: Add paired-tag rename ergonomics and close-tag completion during CM6 editor migration phase.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Reinforced beginner-safe workspace guardrails and added deterministic run-context regression coverage.
- Notable safety/infra updates: Added `tests/ide.spec.js` regression (`sandbox bridge emits coherent run-context metadata for active runs`) validating token/run-context coherence and logged run-context visibility; expanded memory guardrails in `feature-map.md` and anti-patterns in `common-mistakes.md` to enforce guided-power UX and reversible operations.
- Validation status: Focused new test passed (`1/1`) and full `tests/ide.spec.js` passed (`52/52`).
- Follow-up actions: Apply the same safety-test pattern to upcoming filesystem adapter and action-journal work.

- Version: 0.2.0
- Date (UTC): 2026-02-17
- Summary: Added deterministic run-context metadata plumbing across app sandbox execution as a foundation for replayable runs and bug bundles.
- Notable safety/infra updates: Introduced `assets/js/sandbox/runContext.js` for run-context creation/normalization (`id`, `token`, `seed`, optional fixed timestep); wired run context through `app.js` run launch, `sandbox/runner.js` document generation, and `sandbox/bridge.js` postMessage payloads while preserving current token-gate behavior.
- Validation status: `npm run test:smoke` passed (`7/7`), then `npm run test:quick` passed (including all contracts, memory/integrity checks, and Playwright `169/169`).
- Follow-up actions: Connect run-context seed/fixed timestep controls to user-facing deterministic mode and include run-context metadata in future bug-bundle export payloads.

- Version: 0.2.0
- Date (UTC): 2026-02-16
- Summary: Sharpened completion suggestion rows to match the clean Files-panel style and upgraded semantic kind badges to real SVG pictogram icons.
- Notable safety/infra updates: Completion rows use lightweight row-highlight behavior (not button-like blocks) and attach kind metadata/icons from the existing symbol pipeline cache (AST results when available, fallback parser otherwise); symbol badges now render actual inline SVG icons for function/method/arrow/class/variable/keyword/snippet kinds.
- Validation status: Targeted Playwright completion tests passed (`4/4`) in `tests/editor-pro-editing-micro.spec.js`, including SVG icon-presence regression and completion accept/escape flows.
- Follow-up actions: Continue with editor-only major upgrades and keep full-suite/Frankleen deferred until the 5-big-change milestone.

- Version: 0.2.0
- Date (UTC): 2026-02-16
- Summary: Added low-clutter inline parameter hints and expanded Editor Settings for deep completion/signature fine-tuning.
- Notable safety/infra updates: Implemented cursor-adjacent signature hint chip that tracks active argument index while typing; added settings for `Inline parameter hints` toggle, `Completion max items` (4-16), and `Completion transparency` (20-100%); completion and signature overlays now share a lightweight glass-style transparency model and preserve compact footprint.
- Validation status: Targeted Playwright tests passed (`4/4`) in `tests/editor-pro-editing-micro.spec.js` covering compact completion anchoring, completion accept flow, parameter-hint active-argument tracking, and settings-driven completion tuning.
- Follow-up actions: Continue major editor upgrades and defer full suite + `frank:full` until the 5-change milestone per active workflow.

- Version: 0.2.0
- Date (UTC): 2026-02-16
- Summary: Refined editor autocomplete into a compact, cursor-anchored suggestion list to keep pro typing powerful without UI clutter.
- Notable safety/infra updates: Replaced wide bottom completion panel behavior with bounded VS Code-like popup sizing, dynamic placement near cursor (with above/below fallback), and a regression test that enforces compact dimensions and anchor proximity.
- Validation status: Targeted Playwright completion tests passed (`4/4`) in `tests/editor-pro-editing-micro.spec.js`; full-suite/frank gates intentionally deferred per active 5-big-change cadence.
- Follow-up actions: Continue stacking major editor upgrades and run full suite + `frank:full` after the 5th big change.

- Version: 0.2.0
- Date (UTC): 2026-02-16
- Summary: Focused cleanup + organization pass completed with no gate regressions.
- Notable safety/infra updates: Added `desktop:artifacts:clean` for safe run-folder cleanup across desktop artifact directories and `frank:cleanup:all` for one-pass Frankleen + desktop artifact cleanup; removed redundant unreferenced `tests/sync-assets.test.js` in favor of centralized `verify-dist-site-sync.js` contract checks.
- Validation status: `npm run frank:status` and `npm run frank:check` passed after cleanup and test-organization changes.
- Follow-up actions: Re-run `npm run frank:cleanup:all` after desktop processes are closed to reclaim locked run directories.

- Version: 0.2.0
- Date (UTC): 2026-02-16
- Summary: Closed remaining sandbox hardening coverage gaps and completed a full-system release preflight toward all-green Franklin gates.
- Notable safety/infra updates: Added Playwright regression for spoofed parent-window sandbox messages (including replay with a captured valid run token) and added regression for sandbox console payload truncation (argument-count + message-length safeguards).
- Validation status: New targeted Playwright tests passed (`2/2`); `npm run test:quick`, `npm run frank:full` (12/12 stages), and `npm run test:all` all passed in this session.
- Follow-up actions: Keep expanding Franklin safety coverage for snapshot disk-full and partial-payload rollback simulation.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Hardened Dev Terminal to safe utility mode, removed privileged eval/secret command paths, and aligned terminal behavior with Console tab UX.
- Notable safety/infra updates: Removed `dev-js`, `dev-help`, `set-code`, `unlock`, `lock`, and `remove-code` command execution paths from terminal command handling; terminal status now reports `Safe Mode`; updated terminal command palette keywords and help text.
- Validation status: `npm run test` passed with updated Playwright coverage for safe-terminal behavior.
- Follow-up actions: Run full Franklin release gate (`npm run frank:full`) and verify SiteGround package outputs for launch.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Fixed Franklin safety-flow regression that could leave `assets/*` incomplete before Playwright stage and cause launch-gate instability.
- Notable safety/infra updates: Updated snapshot copy to clean partial payload targets on recoverable copy errors; updated snapshot restore to honor metadata `included/skipped` targets; added workspace asset backup/restore guard in `verify-franklin-safety` so safety checks cannot mutate source assets.
- Validation status: `npm run test:frank:safety`, `npm run test`, and `npm run frank:full` all passed after patch.
- Follow-up actions: Add dedicated regression test that simulates partial snapshot payloads and verifies rollback does not delete existing targets.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Added workspace safety limits and lightweight UI-output caps to reduce freeze risk from oversized imports and noisy logs.
- Notable safety/infra updates: Capped workspace import payload size, file/trash/folder/open-tab counts, and per-file/total code size; added local-folder import read budget caps; truncated task-runner and terminal message payloads to bounded lengths.
- Validation status: Added Playwright coverage for import limit behavior; `npm run test` and `npm run frank:full` passed.
- Follow-up actions: Add targeted tests for oversized file-based import rejection path (`input-too-large`) and local-folder cap warnings.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Added safe runtime hardening + render-load optimizations for console and files-panel behavior.
- Notable safety/infra updates: Sandbox postMessage handler now accepts only trusted active-runner sources and normalizes/truncates console/runtime payloads; logger now enforces bounded line and entry size caps; files-panel gutter sync and resize layout sync are frame-coalesced.
- Validation status: Added logger-cap Playwright coverage; `npm run test` and `npm run frank:full` passed.
- Follow-up actions: Add a sandbox-message security regression test that verifies foreign-window messages are ignored.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Tightened all-around runtime safety and reduced UI pressure during high-volume logging/import scenarios.
- Notable safety/infra updates: Added sandbox console flush queue with bounded backlog; added local-folder import byte caps (per-file and total) before reading file contents; reduced repeated file-list scroll and resize/gutter work via coalesced frame scheduling.
- Validation status: `npm run test` and `npm run frank:full` passed after changes.
- Follow-up actions: Add a test that simulates high-volume sandbox console spam and asserts backlog truncation behavior.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Reduced render churn in Files + Editor tabs by skipping unchanged DOM writes.
- Notable safety/infra updates: Added cached-markup guards for `renderFileList` and `renderEditorTabs`; removed duplicate `renderEditorTabs` call in `closeTab` to avoid extra work under rapid tab changes.
- Validation status: `npm run test` and `npm run frank:full` passed after optimization patch.
- Follow-up actions: Add a focused render-regression test that stress-toggles sections/tabs and asserts no stale state with cached markup.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Performed low-risk cleanup to reduce repeated scheduling logic and documentation duplication.
- Notable safety/infra updates: Added shared `scheduleFrame(...)` helper and switched file-gutter/layout/problems/sandbox-console queue schedulers to use it; removed duplicate workspace-lifecycle bullet in feature map.
- Validation status: `npm run test`, `npm run test:memory`, and `npm run frank:full` passed after cleanup.
- Follow-up actions: Keep future animation-frame queue additions on `scheduleFrame(...)` for consistency.

- Version: 0.2.0
- Date (UTC): 2026-02-15
- Summary: Normalized UI color semantics across base/layout/components and aligned light/purple themes to a shared token model.
- Notable safety/infra updates: Added semantic surface/border/focus/control/menu/console/diagnostics tokens in `base.css`; wired layout + key component blocks to token usage; mirrored token values per theme in `themes.css`; removed duplicate `.files-menu-btn` selector override.
- Validation status: `npm run test`, `npm run test:memory`, and `npm run frank:full` passed after CSS/theme cleanup.
- Follow-up actions: Migrate remaining one-off hardcoded color literals to tokens incrementally during future UI polish passes.


## 2026-02-17T02:51:02.051Z - AI Verify (standard)

- Status:
  - PASS
- Steps:
  - test:integrity: PASS (260ms)
  - test:memory: PASS (261ms)
  - test:changed: PASS (22540ms)
  - test:smoke: PASS (4183ms)
- Follow-up:
  - No action required.


## 2026-02-17T06:02:17.996Z - AI Verify (full)

- Status:
  - FAIL
- Steps:
  - test:integrity: PASS (264ms)
  - test:memory: PASS (268ms)
  - test:changed: PASS (26004ms)
  - test:smoke: PASS (4118ms)
  - test:quick: FAIL (code 1) (30444ms)
- Follow-up:
  - Inspect failing step and rerun ai:verify after fix.


## 2026-02-17T06:05:28.506Z - AI Verify (full)

- Status:
  - PASS
- Steps:
  - test:integrity: PASS (270ms)
  - test:memory: PASS (263ms)
  - test:changed: PASS (26477ms)
  - test:smoke: PASS (4211ms)
  - test:quick: PASS (31535ms)
- Follow-up:
  - No action required.
