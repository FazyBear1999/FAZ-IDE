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
