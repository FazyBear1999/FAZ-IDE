# Decisions Log

Track implementation choices that affect architecture, release flow, safety, or UX behavior.
Keep entries short, dated, and explicit about why the change was made.

## Template

- Date (UTC):
- Area:
- Decision:
- Why:
- Follow-up:

## Decision Quality Bar

- Include blast radius (what surfaces are affected).
- Include validation evidence (focused tests and/or gate commands).
- Include rollback direction for risky changes.
- Keep wording implementation-specific and falsifiable.
- Never overwrite historical context; append new decisions.

## 2026-02-17T23:59:00Z - AI memory hardening contract

- Date (UTC):
- 2026-02-17T23:59:00Z
- Area:
- AI memory governance and release reliability
- Decision:
- Strengthened AI memory operating contract with explicit quality bar, freshness rules, stricter handoff checks, and deterministic recovery guidance.
- Why:
- Strong memory discipline reduces drift, improves multi-session continuity, and prevents release regressions caused by stale documentation.
- Follow-up:
- Keep decision entries tied to validation evidence and update recovery notes when new failure modes appear.

## 2026-02-17T23:59:30Z - Panel resizing model hardening (3-column caps)

- Date (UTC):
- 2026-02-17T23:59:30Z
- Area:
- Layout resizing safety and panel usability
- Decision:
- Unified splitter, layout-control, and API width clamping under a row-aware effective bounds model.
- Added 3-column sizing caps so panel widths can scale generously (up to 2/3 in editor rows, near-full in non-editor rows, full width when solo) while preserving minimum safety limits.
- Why:
- Previous mixed bound logic could feel restrictive or inconsistent across drag vs controls vs API calls.
- Follow-up:
- If users want explicit 1/2/3 column span controls in UI, add a dedicated span selector while keeping current bounds contract.

## 2026-02-17T23:40:00Z - Runtime scope standardization (JS/HTML/CSS only)

- Date (UTC):
- 2026-02-17T23:40:00Z
- Area:
- Product runtime scope and long-term maintainability
- Decision:
- Standardized the project runtime and validation scope to JavaScript, HTML, and CSS only.
- Removed legacy fourth-language runtime paths, related app templates, and language-specific editor wiring.
- Why:
- Tight runtime scope reduces complexity, removes high-risk branches, and keeps the IDE focused on its core web stack.
- Follow-up:
- Keep future feature proposals aligned to JS/HTML/CSS runtime boundaries.

## 2026-02-17T23:20:00Z - app.js runtime-preview extraction + contract tests

- Date (UTC):
- 2026-02-17T23:20:00Z
- Area:
- Runtime orchestration organization and safe optimization cadence
- Decision:
- Extracted runtime preview and workspace HTML asset resolver logic into `assets/js/sandbox/workspacePreview.js`.
- Added focused regression coverage in `tests/workspace-preview-contract.spec.js` for style sanitization and local asset inlining behavior.
- Why:
- `app.js` remains orchestration glue and should not accumulate isolated transformation logic.
- Follow-up:
- Continue bounded helper extraction from `app.js` while preserving run semantics.

## 2026-02-17T23:55:00Z - Runtime validation app simplification

- Date (UTC):
- 2026-02-17T23:55:00Z
- Area:
- Validation UX clarity and deterministic diagnostics
- Decision:
- Kept runtime test applications intentionally simple with explicit pass/fail markers and clear status text.
- Updated matrix/test copy to align with JS/HTML/CSS-only validation flow.
- Why:
- Fast, deterministic diagnostics reduce triage time and make validation easier for future updates.
- Follow-up:
- Keep runtime validation templates minimal and marker-driven.

## 2026-02-17T23:58:00Z - Metadata legitimacy pass

- Date (UTC):
- 2026-02-17T23:58:00Z
- Area:
- Repository professionalism and attribution hygiene
- Decision:
- Standardized project attribution around `AUTHORS`, `LICENSE`, and `NOTICE` with matching README references.
- Why:
- Clear author/license metadata strengthens project clarity for contributors and distribution.
- Follow-up:
- Keep attribution files in sync when ownership or licensing details change.

## 2026-02-17T23:59:55Z - Docking optimization and center-drop contract hardening

- Date (UTC):
- 2026-02-17T23:59:55Z
- Area:
- Panel docking behavior, row-cap safety, and release stability
- Decision:
- Optimized docking internals to skip no-op row/order operations and avoid unnecessary layout/persist passes.
- Locked center dock-zone behavior to true center repositioning (no preset reset side effects).
- Why:
- Reduces avoidable UI reflow work during repeated docking input and keeps center docking aligned with user intent.
- Follow-up:
- Keep drag-to-center regression coverage active and treat any center-zone preset reset behavior as a release blocker.

## 2026-02-18T01:55:00Z - Docking/resizing flaw closure (edge-resize + responsive splitters)

- Date (UTC):
- 2026-02-18T01:55:00Z
- Area:
- Docking/resizing consistency and responsive layout safety
- Decision:
- Unified workspace edge-resize clamping with row-aware effective bounds (same cap model as splitter/controls/API paths) to prevent cap bypass in dual-panel edge drags.
- Hardened pointer-capture release in splitter cleanup paths to prevent rare teardown exceptions during cancel/up sequences.
- Fixed narrow-layout CSS splitter hide list to include tools splitter.
- Why:
- A single edge-resize path was using base bounds, allowing behavior drift from the intended 3-column/effective-cap contract; responsive splitter visibility was also incomplete.
- Follow-up:
- Keep edge-resize cap regression and narrow-viewport splitter visibility regression in CI; treat any cap bypass between resize surfaces as a blocker.

## 2026-02-18T02:12:00Z - Docking HUD clarity upgrade (visual guidance contract)

- Date (UTC):
- 2026-02-18T02:12:00Z
- Area:
- Docking UX discoverability and visual affordance quality
- Decision:
- Upgraded dock overlay visuals from minimal transparent hints to explicit guidance surfaces: stronger zone panels, clearer labels, active-zone emphasis, and contextual drag hint text based on active panel.
- Added overlay metadata wiring (`data-panel-label`, `data-active-zone`) so visual guidance remains deterministic and testable.
- Why:
- User feedback indicated docking felt unchanged because HUD cues were too subtle; stronger guidance improves perceived control without changing core docking semantics.
- Follow-up:
- Keep dock HUD visibility regression in CI and treat transparent/low-affordance HUD regressions as UX blockers.

## 2026-02-18T02:35:00Z - Safe-route docking/resizing baseline (VS Code-style minimal splitters)

- Date (UTC):
- 2026-02-18T02:35:00Z
- Area:
- Docking/resizing UX reliability, interaction safety, and cache consistency
- Decision:
- Reverted splitter visuals to a minimal line-based model (no arrow glyph chips) to match VS Code-like resizing affordances.
- Hardened docking drag teardown with guaranteed cleanup and window-level pointer/blur fallbacks to prevent stuck overlay states.
- Restored missing runtime constants (`PROBLEM_ENTRY_LIMIT`, `RUNTIME_PROBLEM_LIMIT`, `DEV_TERMINAL_OUTPUT_LIMIT`) that caused boot failures.
- Bumped service-worker cache version to force fresh JS/CSS delivery after docking/resizing fixes.
- Why:
- User-reported broken interactions and “can’t press anything” were traced to runtime boot failures plus stale-cached assets; visual complexity also reduced clarity.
- Follow-up:
- Keep minimal splitter contract and boot-health checks in CI; treat any boot-failed default state as release-blocking.

## 2026-02-18T02:44:00Z - Full CSS optimization audit + theme/syntax stability contract

- Date (UTC):
- 2026-02-18T02:44:00Z
- Area:
- CSS rendering performance, theme reliability, and syntax color consistency
- Decision:
- Completed full source CSS audit across base/layout/components/themes with lint, token-contract, import-audit, and optimization pipeline verification.
- Applied safe rendering optimization by moving docking `will-change` hints from always-on state to active overlay-only state.
- Added regression coverage ensuring all supported UI themes preserve visible syntax keyword colors.
- Why:
- Reduces avoidable compositing overhead in idle state while preserving behavior; locks theme+syntax reliability as a non-regression contract.
- Follow-up:
- Keep optimization changes low-risk/token-based and require theme/syntax regressions to pass before release.

## 2026-02-18T03:05:00Z - AI memory decision-loop smoothing (faster, stricter session flow)

- Date (UTC):
- 2026-02-18T03:05:00Z
- Area:
- AI memory operations, handoff consistency, and recovery documentation hygiene
- Decision:
- Added a standardized fast decision loop in memory docs: classify change type once, log one concise decision entry, attach command evidence, and run explicit session-close sync checks for cross-file consistency.
- Why:
- Repeated optimization/recovery cycles increased update overhead and drift risk; a tighter operator workflow keeps entries fast while preserving strict traceability.
- Follow-up:
- Keep this flow lightweight; if memory updates become repetitive again, add a compact command-driven checklist without weakening required-file and heading contracts.

## 2026-02-17T22:20:00Z - Safe file-organization governance + 3-change full-gate cadence

- Date (UTC):
- 2026-02-17T22:20:00Z
- Area:
- Franklin/AI memory operations and repository organization safety
- Decision:
- Added a dedicated file-organization playbook and formalized batch validation policy: focused checks per major organization change, full gate after every 3 major changes, and immediate full gate when high-risk release/orchestration surfaces are touched.
- Why:
- Large restructuring requires strong rollback and validation discipline to avoid path drift and accidental release regressions while still moving quickly.
- Follow-up:
- Execute upcoming repository organization as numbered major changes and checkpoint full-gate runs at each 3-change boundary.

## 2026-02-17T23:20:00Z - Decision framework + roadmap checkpoint governance

- Date (UTC):
- 2026-02-17T23:20:00Z
- Area:
- AI memory decision quality and roadmap execution discipline
- Decision:
- Added `decision-framework.md` (option scoring, assumptions, go/no-go, rollback triggers) and `roadmap-decision-map.md` (checkpoint contract linking roadmap tasks to decisions + validation evidence).
- Updated intake/handoff/operations docs to require explicit option selection and checkpoint completion.
- Why:
- Existing memory flow recorded outcomes well but did not consistently enforce decision quality inputs (alternatives, assumptions, rejection criteria), causing avoidable ambiguity during multi-session optimization work.
- Follow-up:
- Use checkpoint IDs in future roadmap batches and include command evidence + assumption status before handoff.

## 2026-02-17T23:35:00Z - Memory brain-loop closure (checkpoint-linked gaps/issues/errors)

- Date (UTC):
- 2026-02-17T23:35:00Z
- Area:
- AI memory execution loop quality (planning -> risk -> validation)
- Decision:
- Enforced checkpoint-linked tracking across `test-gaps.md`, `known-issues.md`, and `error-catalog.md`, with explicit rules for validation command evidence.
- Why:
- Prior docs captured decisions and roadmap checkpoints, but risk and testing artifacts were not guaranteed to reference the same checkpoint IDs, weakening traceability.
- Follow-up:
- Require checkpoint ID review during session-close sync and reject unlinked new gap/issue entries.

## 2026-02-17T23:50:00Z - Session Command Center runbook

- Date (UTC):
- 2026-02-17T23:50:00Z
- Area:
- AI session execution consistency and operator clarity
- Decision:
- Added `session-command-center.md` as a one-page runbook covering start sequence, decision gate, risk-based validation, memory sync, and exit contract.
- Wired references from `README.md` and `handoff-checklist.md`.
- Why:
- Teams need a deterministic “what to do first/next/last” brain for every session, not just scattered policy docs.
- Follow-up:
- Keep command center concise and update it whenever gate policy or checkpoint rules change.

## 2026-02-17T23:58:00Z - Safe AI command-center CLI

- Date (UTC):
- 2026-02-17T23:58:00Z
- Area:
- AI operations ergonomics and decision safety
- Decision:
- Added `scripts/ai-command-center.js` and npm aliases (`ai:command-center`, `ai:brain`) to generate risk-aware, checkpoint-linked session guidance in read-only mode by default.
- Included JSON output and optional session-brief write mode behind explicit flag.
- Why:
- Operators needed a fast, consistent “brain boot” command that turns working-tree context into decision and validation guidance without accidental side effects.
- Follow-up:
- Keep read-only default; expand checkpoint inference only when additional roadmap checkpoints are introduced.

## 2026-02-18T00:20:00Z - app.js file-icon subsystem extraction (organization wave)

- Date (UTC):
- 2026-02-18T00:20:00Z
- Area:
- App orchestration organization (`optimization-map` A1)
- Decision:
- Extracted file icon constants/helpers from `assets/js/app.js` into new module `assets/js/ui/fileIcons.js` and rewired imports/call sites without changing runtime behavior.
- Why:
- Reduces monolith pressure in `app.js`, improves discoverability of file-tree icon logic, and creates a reusable boundary for future file-surface cleanup.
- Follow-up:
- Continue extracting cohesive helper clusters from `app.js` in small reversible slices; keep focused icon/docking regressions green per slice.

## 2026-02-18T03:40:00Z - Sandbox runner/bridge hardening + fallback contract wave

- Date (UTC):
- 2026-02-18T03:40:00Z
- Area:
- Sandbox execution safety, fallback reliability, and contract-test depth
- Decision:
- Hardened `assets/js/sandbox/runner.js` and `assets/js/sandbox/bridge.js` with strict theme-token normalization, surface-value sanitization, safe mode normalization, and bounded theme-lock script caching.
- Added stability contracts in `tests/stability-contract.spec.js` covering malformed theme tokens, JS/HTML security injection invariants, legacy iframe fallback write-path correctness, explicit fallback error messaging, and parent `theme_update` sanitization.
- Why:
- This is the highest-risk runtime surface (cross-window messaging + generated iframe documents). Strong invariants reduce silent regressions and keep fallback paths release-safe.
- Follow-up:
- Keep these contracts as required gates for sandbox edits; rollback path is to remove the new sanitizers/cache path while retaining fallback/error tests to diagnose behavior drift.

## 2026-02-18T04:05:00Z - Sandbox micro-performance + debug-eval safety optimization wave

- Date (UTC):
- 2026-02-18T04:05:00Z
- Area:
- Sandbox runtime performance and debug-path resilience
- Decision:
- Added a fast-path in `runner.js` `sanitizeUserCode` to skip regex replacement when no `</script>` marker exists.
- Hardened and optimized `bridge.js` debug evaluation path with bounded expression count/length and robust stringification via existing bridge-safe serializers.
- Why:
- Reduces avoidable per-run string work in common paths and prevents expensive/fragile debug serialization from destabilizing sandbox watch diagnostics.
- Follow-up:
- Keep debug-eval bounds explicit and maintain targeted sandbox contracts as release blockers for this surface.

## 2026-02-18T04:20:00Z - app.js safe decomposition wave (sandbox console payload helpers)

- Date (UTC):
- 2026-02-18T04:20:00Z
- Area:
- App orchestration organization and sandbox console reliability
- Decision:
- Extracted sandbox console payload normalization/truncation helpers from `assets/js/app.js` into new `assets/js/sandbox/consolePayload.js` and rewired `app.js` to import them.
- Preserved behavior by passing existing app constants (`SANDBOX_CONSOLE_MAX_ARGS`, `SANDBOX_CONSOLE_ARG_MAX_CHARS`) into the new helper.
- Why:
- Reduces monolith surface in `app.js` while keeping sandbox console behavior deterministic and testable as a bounded module.
- Follow-up:
- Continue decomposition in pure helper clusters only; require sandbox payload/truncation contracts to pass on every extraction slice.

## 2026-02-18T04:32:00Z - app.js safe decomposition wave (sandbox message trust helpers)

- Date (UTC):
- 2026-02-18T04:32:00Z
- Area:
- Sandbox message security and orchestration separation
- Decision:
- Extracted sandbox postMessage trust/token gating helpers from `assets/js/app.js` into new `assets/js/sandbox/messageTrust.js`.
- `app.js` now imports `isTrustedSandboxMessageEvent` and `isSandboxMessageForCurrentRun` for centralized trust checks.
- Why:
- Keeps message-security logic in a dedicated sandbox boundary and reduces security-critical duplication inside the monolith.
- Follow-up:
- Keep spoofed-message and run-context regressions mandatory for any edits to sandbox message trust logic.

## 2026-02-18T04:45:00Z - app.js safe decomposition wave (runtime diagnostics helpers)

- Date (UTC):
- 2026-02-18T04:45:00Z
- Area:
- Sandbox runtime error handling and monolith risk reduction
- Decision:
- Extracted runtime error and promise rejection normalization from `assets/js/app.js` into new `assets/js/sandbox/runtimeDiagnostics.js`.
- Rewired `onSandboxMessage` runtime/promise branches to consume normalized outputs from the helper module while keeping existing character-limit constants and status/problem flows unchanged.
- Why:
- Isolates error-message formatting rules into a pure sandbox helper, improving maintainability and reducing orchestration-file churn in a high-frequency message path.
- Follow-up:
- Keep runtime/promise formatting regressions in targeted sandbox test runs for each future extraction slice.

## 2026-02-18T04:52:00Z - Codex operations workflow (scan/checkpoint/rollback)

- Date (UTC):
- 2026-02-18T04:52:00Z
- Area:
- AI ergonomics, issue triage speed, and rollback safety
- Decision:
- Added `scripts/codex-ops.js` plus npm aliases (`codex:scan`, `codex:checkpoint`, `codex:checkpoint:list`, `codex:rollback`) to standardize issue discovery, pre-change checkpoints, and guarded rollback.
- Updated `README.md` with a clear Codex safe workflow section and command sequence.
- Why:
- User goal requires a simple and repeatable Codex operating loop: find issues quickly, add features safely, and revert confidently when needed.
- Follow-up:
- Keep rollback default as dry-run, preserve metadata warnings for untracked files, and treat command output clarity as a maintenance requirement.

## 2026-02-18T04:56:00Z - Codex-ops v2 usability upgrade (JSON + latest rollback + savepoint alias)

- Date (UTC):
- 2026-02-18T04:56:00Z
- Area:
- Codex ergonomics and recovery workflow clarity
- Decision:
- Upgraded `scripts/codex-ops.js` with structured `--json` output modes, status buckets in scan output, `--latest` rollback targeting, list limiting (`--limit`), and clearer rollback failure remediation guidance.
- Added npm convenience aliases (`codex:status`, `codex:savepoint`, `codex:rollback:latest`, `codex:rollback:latest:apply`) and updated README workflow docs.
- Why:
- Faster operator loops and more automation-friendly output reduce friction for Codex-driven feature work while making rollback handling explicit and safer.
- Follow-up:
- Keep command outputs stable for scripts/automation and keep dry-run default for rollback commands.
