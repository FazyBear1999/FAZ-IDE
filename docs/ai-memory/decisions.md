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
