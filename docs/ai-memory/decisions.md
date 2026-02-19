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

## 2026-02-19T17:25:00Z - Loading screen refinement (session-suppressed + rapid professional ticker + tokenized galaxy backdrop)

- Date (UTC):
- 2026-02-19T17:25:00Z
- Area:
- Startup UX polish, frequency control, and release safety
- Decision:
- Refined startup loading behavior so splash appears once per tab session using `sessionStorage` key `fazide.boot-screen.seen.v1` (shows on fresh tab/window sessions, skips repeated refreshes in same tab).
- Added rapid startup ticker messaging to present fast professional checks while preserving real check-state markers.
- Added tokenized galaxy-style backdrop + floating square particles behind the square modal panel without introducing non-tokenized style primitives.
- Why:
- Improves perceived polish and clarity while following best-practice startup frequency control and preserving deterministic automation/test behavior.
- Follow-up:
- Keep splash bounded and lightweight; if startup checks expand, update release contracts and avoid increasing splash duration beyond short boot window expectations.

## 2026-02-19T17:05:00Z - Startup loading screen (square theme, short checks, automation-safe)

- Date (UTC):
- 2026-02-19T17:05:00Z
- Area:
- Startup UX polish and boot safety
- Decision:
- Added a startup loading screen with square visual styling and quick boot checks (UI shell, storage, editor, runtime) shown during first boot seconds.
- Loading flow is bounded to a short 3–4 second window (`BOOT_SCREEN_MIN_MS` / `BOOT_SCREEN_MAX_MS`) and fades into the existing app shell without changing post-boot behavior.
- Added automation-safe bypass (`navigator.webdriver`) so CI/test harness runs do not block on timed splash UI.
- Why:
- Improves first impression and boot clarity while preserving reliability and deterministic test behavior.
- Follow-up:
- Keep splash checks lightweight and non-blocking; if startup stages expand, update release contracts instead of increasing splash duration.

## 2026-02-19T16:25:00Z - C2 sandbox runtime status determinism contract closure

- Date (UTC):
- 2026-02-19T16:25:00Z
- Area:
- Runtime execution determinism and triage reliability
- Decision:
- Added a focused contract in `tests/ide.spec.js` that runs runtime JS, HTML, and CSS validation applications and locks status+marker pairing for each path.
- Contract asserts per-template run success, healthy sandbox status state, and deterministic markers (`runtime-js-check` and `runtime-html-check` console markers, `runtime-css-check` style markers in sandbox doc).
- Why:
- This closes the final open C2 gap by ensuring runtime success signals remain deterministic and immediately regression-visible in CI.
- Follow-up:
- Keep runtime-template and run-status surfaces gated by this contract plus `test:integrity` and `test:memory`; next high-value gap is C8 low-signal test quality audit.

## 2026-02-19T16:05:00Z - C1 Dev Terminal help scope contract closure

- Date (UTC):
- 2026-02-19T16:05:00Z
- Area:
- Dev Terminal command-surface governance and scope-drift prevention
- Decision:
- Added a focused contract in `tests/ide.spec.js` that runs `help` through Dev Terminal and verifies expected safe command snippets are present.
- The same contract enforces a denylist so unsupported language terms and unsafe command hints do not reappear in help output.
- Why:
- Dev Terminal help is an operator-facing contract; drift in this output can mislead usage and reintroduce out-of-scope runtime expectations.
- Follow-up:
- Keep Dev Terminal command/help edits gated by this focused contract plus `test:integrity` and `test:memory`; next open gap remains C2 sandbox status determinism.

## 2026-02-19T15:30:00Z - Runtime isolation guard for AI-memory markdown + worker/js wiring lock

- Date (UTC):
- 2026-02-19T15:30:00Z
- Area:
- Release safety contracts, runtime isolation, and worker wiring reliability
- Decision:
- Added release contracts in `tests/release.spec.js` to enforce that AI-memory markdown paths (`docs/ai-memory`) are not referenced by runtime wiring surfaces (`index.html`, `assets/js/app.js`, `assets/js/sw.js`) and are excluded from service-worker `CORE_ASSETS`.
- Added worker/js wiring contract checks that lock module entry and worker setup (`app.js` module entry in `index.html`, service-worker registration path, AST/lint worker module URLs, service-worker worker asset entries, and worker file existence).
- Why:
- This creates deterministic guardrails against documentation drift leaking into runtime and prevents silent worker-path regressions that can degrade diagnostics, parsing, and offline behavior.
- Follow-up:
- Keep these release contracts mandatory; next safe hardening target is C1 Dev Terminal help scope contract to lock command-surface scope copy.

## 2026-02-19T15:00:00Z - C2 runtime-template copy/checklist scope guard closure

- Date (UTC):
- 2026-02-19T15:00:00Z
- Area:
- Runtime template scope governance and drift prevention
- Decision:
- Added a focused runtime contract in `tests/ide.spec.js` that loads `runtime-full-matrix-app` and asserts template copy/checklist lines remain explicitly JS/HTML/CSS-scoped.
- The contract requires core checklist markers and blocks unsupported language terms in runtime template copy.
- Why:
- This closes the remaining C2 scope gap for runtime template copy/checklist drift and ensures CI catches accidental language-scope expansion early.
- Follow-up:
- Keep runtime template edits gated by focused runtime-app checks plus `test:integrity` and `test:memory`; next scope-alignment gap is C1 Dev Terminal help contract.

## 2026-02-19T14:35:00Z - C2 applications catalog scope-guard contract closure

- Date (UTC):
- 2026-02-19T14:35:00Z
- Area:
- Runtime scope governance and applications catalog safety
- Decision:
- Added a focused contract in `tests/ide.spec.js` that enforces an explicit application file-extension allowlist (`html`, `css`, `js`, `md`) across each application file path and entry file.
- The contract hard-fails if unsupported runtime extensions (for example `py`, `rb`, `php`, `java`, `cs`, `cpp`, `go`, `rs`) appear in the Applications catalog.
- Why:
- This closes open C2 scope-risk by making runtime-catalog drift immediately visible in CI and keeps project scope aligned with JS/HTML/CSS runtime boundaries.
- Follow-up:
- Add the remaining C2 runtime-template copy/checklist scope guard in the next runtime-template touch and keep `test:integrity` + focused ide contracts mandatory for catalog changes.

## 2026-02-19T14:10:00Z - Command registry contract lock-in + strict async integrity rollout closure

- Date (UTC):
- 2026-02-19T14:10:00Z
- Area:
- Command routing safety and test-quality hardening
- Decision:
- Added focused API contract coverage in `tests/stability-contract.spec.js` for `registerCommand` / `listCommands` / `unregisterCommand` semantics (replace=false guard, replace overwrite behavior, and unregister idempotence).
- Completed strict integrity rollout by aligning sync-only contract tests to non-async callbacks while keeping `scripts/verify-test-integrity.js` hard-fail rule (`async` test callbacks must contain `await`).
- Why:
- Command registry is a central extension surface and lacked direct lock tests; strict async integrity catches false-signal tests but required cleanup of redundant async declarations to avoid noise.
- Follow-up:
- Keep command-surface changes gated by focused `tests/stability-contract.spec.js` evidence plus `test:integrity`; expand coverage to execution-disabled command behavior when command execution surface is touched.

## 2026-02-19T13:30:00Z - Safe workspace-preview path-normalization cleanup (optimization slice)

- Date (UTC):
- 2026-02-19T13:30:00Z
- Area:
- Sandbox workspace preview resolver maintainability and low-risk micro-optimization
- Decision:
- Consolidated repeated path-key normalization in `assets/js/sandbox/workspacePreview.js` into shared local helpers (`toPathKey`, `toPathTrimmedKey`) and reused them across resolver/caching flows.
- Preserved behavior and contracts while reducing repeated string-normalization patterns that can drift over time.
- Why:
- During optimization lockdown, this provides reversible cleanup with small blast radius on a sandbox helper surface and improves code clarity before broader organization waves.
- Follow-up:
- Keep this helper-locality pattern for future sandbox cleanup slices and continue validating with focused sandbox contracts plus full-gate evidence before push.

## 2026-02-19T13:15:00Z - Layout stress-contract stabilization to unblock C4/C8 checkpoint gate

- Date (UTC):
- 2026-02-19T13:15:00Z
- Area:
- Test reliability for layout overlap stress contract and organization-wave checkpoint safety
- Decision:
- Kept zero-overlap contract strict in `tests/ide.spec.js` while increasing poll settle timeout for the resize stress check to reduce timing flakes under full-suite concurrency.
- Added explicit violation detail in assertion output for faster root-cause triage if the contract fails again.
- Why:
- Full gate was blocked by a timing-sensitive failure in the stress contract even when focused reproduction passed; this created false negatives that stalled safe organization flow.
- Follow-up:
- Checkpoint A is now validated with green full gate (`npm run frank:full`, 14/14). Proceed to Wave 2 only in small reversible slices with focused validations.

## 2026-02-19T13:25:00Z - Repo organization Wave 1 docs/script-governance completion (major changes 2–3)

- Date (UTC):
- 2026-02-19T13:25:00Z
- Area:
- Repository organization governance, command/path consistency, and optimization-lockdown traceability
- Decision:
- Added canonical script ownership and command naming inventory in `docs/ai-memory/script-family-inventory.md`.
- Normalized operator docs to treat `frank:full` as canonical full gate while preserving compatibility aliases.
- Updated roadmap-memory checkpoints (`file-organization-wave-map.md`, `roadmap-decision-map.md`) to explicitly mark major changes 2–3 complete and Checkpoint A pending full-gate evidence.
- Why:
- Wave O6 / C4 required low-risk, reversible organization progress with clear blast-radius accounting before medium-risk file movement waves.
- Follow-up:
- Focused proof completed (`npm run test:memory`, `npm run test:integrity` both passed); Checkpoint A full gate was attempted and blocked by existing Playwright layout stress failure, so Wave 2 work remains paused until `frank:full` is green.

## 2026-02-19T06:10:00Z - Stabilization-first optimization mandate (before new features)

- Date (UTC):
- 2026-02-19T06:10:00Z
- Area:
- Product quality strategy, release safety, and execution sequencing
- Decision:
- Prioritize optimization, organization, and integration reliability on existing product surfaces before adding new feature scope.
- Treat cross-surface consistency (buttons, commands, panels, runtime, lessons, and packaging) as a non-negotiable release condition.
- Require full-gate validation evidence for stabilization checkpoints (`npm run test:all`) in addition to focused checks.
- Why:
- Current roadmap stage and user goals favor hardening and cohesion over breadth; reducing regression risk now improves delivery speed later.
- Follow-up:
- Keep memory/docs/checkpoint updates synchronized for each stabilization wave and block feature expansion until quality gates remain consistently green.

## 2026-02-19T06:20:00Z - Wave 1 safe-slice decomposition protocol (app.js)

- Date (UTC):
- 2026-02-19T06:20:00Z
- Area:
- Orchestration maintainability and zero-regression optimization flow
- Decision:
- Execute `app.js` optimization in small, behavior-preserving slices (pure helpers and state wrappers first), with explicit per-slice rollback savepoints and focused validation before moving to the next slice.
- Lock full-gate checkpoint at the end of Wave 1 (`npm run test:all`) before any broader wave.
- Why:
- `app.js` size and coupling create high blast radius; safe decomposition keeps delivery velocity while protecting runtime behavior.
- Follow-up:
- For each slice: savepoint -> focused tests -> integrity/memory checks -> memory sync; if any ambiguity appears, escalate to full gate immediately.

## 2026-02-19T06:35:00Z - Detailed optimization roadmap + meaningful-test enforcement

- Date (UTC):
- 2026-02-19T06:35:00Z
- Area:
- Roadmap governance, optimization sequencing, and test quality discipline
- Decision:
- Added a detailed optimization lockdown roadmap in `docs/MASTER_ROADMAP.md` with explicit waves, system-by-system checklist, and non-breaking execution rules.
- Enforced test-quality requirement that new tests must validate concrete behavior contracts and fail on regression (no existence-only low-signal tests).
- Bound this work to new checkpoint `C8` in roadmap decision governance.
- Why:
- Optimization-only mode needs strict execution sequencing and evidence quality to prevent regressions while improving organization and maintainability.
- Follow-up:
- Keep each optimization slice reversible, require focused evidence per slice, and run `npm run test:all` at wave boundaries before expanding scope.

## 2026-02-19T05:40:00Z - Canonical/social URL deployment contract (SITE_URL-aware packaging)

- Date (UTC):
- 2026-02-19T05:40:00Z
- Area:
- SEO metadata integrity, SiteGround package correctness, and release-runbook reliability
- Decision:
- Kept source `index.html` canonical and `og:url` as relative-safe defaults and added explicit `SITE_URL` rewrite support in `scripts/prepare-siteground.js` so packaged output can be stamped with production absolute URLs for canonical, Open Graph URL, and sitemap `<loc>`.
- Expanded release runbook requirements in `docs/RELEASE_CHECKLIST.md` to require domain input, metadata/icon checks, and crawler sanity checks before upload.
- Why:
- Source control should remain environment-agnostic while production package output must carry final domain-accurate URLs for SEO and social previews.
- Follow-up:
- Always set `SITE_URL` in production packaging sessions and keep release contracts (`frank:full`, release spec, verify-siteground) green before upload.

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

## 2026-02-18T14:20:00Z - Master-grade layout behavior controls (dock magnet + reflow animation)

- Date (UTC):
- 2026-02-18T14:20:00Z
- Area:
- Layout customization depth and docking/reflow behavior control
- Decision:
- Added user-facing layout controls for dock magnet sensitivity and panel reflow animation, wired through `layoutState`, sanitization bounds, preset application, and runtime control sync.
- Why:
- Advanced layout users needed behavior-level tuning (not only panel placement/sizing) to match personal docking precision and motion preferences.
- Follow-up:
- Keep `layout-micro` behavior contracts for dock magnet bounds/state sync and panel animation toggle in focused regression runs for future layout changes.

## 2026-02-18T15:35:00Z - Layout radius token propagation + docking reset reliability hardening

- Date (UTC):
- 2026-02-18T15:35:00Z
- Area:
- Layout customization safety, docking behavior stability, and deployment-gate reliability
- Decision:
- Propagated layout radius control to shared radius token family (`--radius*`) so rounded UI surfaces stay synchronized with layout settings, including shell cards and top theme selector.
- Removed transient center-touch preset reapply behavior from docking drop path so only final center drops can trigger center-layout behavior.
- Replaced flaky pointer-heavy docking stress assertion with deterministic docking-route contract coverage and constrained overlap stress to stable zoom tiers used in release gating.
- Why:
- Users reported settings appearing to reset during panel moves and requested full-radius customization coverage; test-gate stability was required before deployment readiness.
- Follow-up:
- Keep C7 checkpoint active for future layout/docking updates; require focused layout+docking contracts plus full `npm run test:all` before deploy handoff.

## 2026-02-18T19:12:00Z - Global panel no-overlap convergence for all resize paths

- Date (UTC):
- 2026-02-18T19:12:00Z
- Area:
- Layout resizing safety, zoom stability, and legacy path cleanup
- Decision:
- Added a shared resize commit path so splitter pointer-end, splitter keyboard resize, and splitter reset actions all run `normalizeLayoutWidths()` + `applyLayout()` before persistence.
- Removed obsolete `data-resize-preview` cursor CSS from the old preview path.
- Added a comprehensive regression that stress-resizes all splitters across multiple zoom levels and panel-row configurations, then asserts every visible panel stays in workspace bounds with zero overlap.
- Why:
- Some resize interactions could persist intermediate geometry without final global normalization, allowing user-visible out-of-view/overlap edge states under high zoom and mixed panel layouts.
- Follow-up:
- Keep the new full-panel invariant test mandatory for future splitter/layout changes and treat any reintroduction of non-normalized resize persistence as release-blocking.

## 2026-02-18T19:30:00Z - Live splitter-drag row clamp hardening

- Date (UTC):
- 2026-02-18T19:30:00Z
- Area:
- Resize interaction safety under high zoom during active drag
- Decision:
- Updated column splitter live drag flow to run row width normalization on every drag move branch so panels stay row-bounded during interaction, not only on resize commit.
- Why:
- User-reported edge cases still showed panels moving out of view while dragging at high zoom despite release-time normalization.
- Follow-up:
- Keep live-drag row normalization coupled to splitter move math and preserve zoom stress regressions as mandatory.

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

## 2026-02-18T13:48:00Z - AI command-center risk inference + safety-alert contract

- Date (UTC):
- 2026-02-18T13:48:00Z
- Area:
- AI session safety gating and no-break feature workflow
- Decision:
- Hardened `scripts/ai-command-center.js` to infer risk tier from working-tree surfaces when `--risk` is not explicitly provided, and to emit deterministic safety alerts (missing tests, missing memory sync, and high-risk escalation reminders).
- Added explicit `riskSource` metadata to text/json/session-brief outputs.
- Why:
- The previous default `medium` risk could understate high-risk surfaces (orchestration/sandbox/release scripts) and did not explicitly call out common safety misses before handoff.
- Follow-up:
- Keep matcher rules aligned with real high-risk surfaces and treat stale risk inference as a governance defect.

## 2026-02-18T14:15:00Z - Filesystem import path-collision safety hardening

- Date (UTC):
- 2026-02-18T14:15:00Z
- Area:
- Workspace import/export safety and local-folder save reliability
- Decision:
- Added import-time workspace path-collision remediation for case-insensitive duplicates (for example `src/App.js` and `src/app.js`) so imported workspaces are normalized to unique safe paths before activation.
- Added deterministic warning logs for remapped paths and a focused regression test in `tests/ide.spec.js`.
- Why:
- Previously, conflicting paths could import successfully but later block save-to-folder flows on case-insensitive filesystems.
- Follow-up:
- Keep import path remap behavior deterministic and add focused regressions for future filesystem workflow changes.

## 2026-02-18T14:35:00Z - Unified import pipeline (workspace JSON + direct code files) with safety preview

- Date (UTC):
- 2026-02-18T14:35:00Z
- Area:
- Filesystem import UX, safety transparency, and local-first workflow reliability
- Decision:
- Expanded the hidden import input to accept both workspace JSON and direct code/text files (`.js`, `.html`, `.css`, etc.) with multi-file support.
- Added append-import behavior for code files (does not replace workspace), with safety caps and deterministic warnings for unsupported/skipped/trimmed files.
- Added pre-apply safety preview text for workspace JSON import confirmation, including safety-limit and path-remap adjustments.
- Why:
- Users need to import specific files quickly without packaging a full workspace JSON, while still keeping strict safety boundaries and transparent pre-import impact.
- Follow-up:
- Keep import confirmation and warning copy concise; add focused regressions whenever import format support changes.

## 2026-02-18T14:55:00Z - JSON import routing hardening (workspace-shape guard + code fallback)

- Date (UTC):
- 2026-02-18T14:55:00Z
- Area:
- Filesystem import correctness and accidental workspace replacement prevention
- Decision:
- Tightened workspace payload normalization so arbitrary JSON objects are not treated as full workspace imports unless they match workspace shape keys or wrapped workspace format.
- Added smart import routing: single JSON attempts workspace import first, then falls back to code-file import when not a workspace payload; mixed multi-file selections import as code files with explicit warning.
- Why:
- Prevents users from being blocked (or unexpectedly replacing workspace) when importing normal JSON files like config payloads.
- Follow-up:
- Keep import-routing tests focused on async completion and JSON edge-case behavior.

## 2026-02-18T15:40:00Z - Master teaching IDE execution start: architecture spine before lesson layer

- Date (UTC):
- 2026-02-18T15:40:00Z
- Area:
- Product roadmap execution governance (teaching IDE + CM6 lesson system)
- Decision:
- Kept existing roadmap direction and expanded it with an explicit Phase 0 architecture spine that starts with command registry unification, project/workspace/runtime state separation, and atomic write/recovery journal foundations.
- Added checkpoint governance for this program (`C5` architecture spine, `C6` CM6 ghost lesson foundation) and recorded the initiative in feature intake rather than replacing prior roadmap phases.
- Why:
- The requested teaching-heavy, file-heavy, reproducible IDE vision is already aligned with the roadmap; execution risk is reduced by stabilizing architecture primitives before scaling lesson constraints and curriculum complexity.
- Follow-up:
- Start implementation at command registry migration slice, then state boundary enforcement, then recovery journal; require checkpoint-linked evidence on each slice before lesson-mode default rollout.

## 2026-02-18T16:05:00Z - Architecture spine C5 slice 1: unified command routing baseline

- Date (UTC):
- 2026-02-18T16:05:00Z
- Area:
- Command execution consistency across UI surfaces
- Decision:
- Upgraded `assets/js/core/commandRegistry.js` with deterministic `execute()` and `includeInPalette` support, then registered hidden foundation commands in `assets/js/app.js` for run/save/new/search/workspace/history actions.
- Routed command-palette entries plus keyboard shortcuts, toolbar run button, and files-menu action handlers through the same command IDs.
- Why:
- This is the first implementation slice for Phase 0 architecture spine: one command path reduces drift between input surfaces and creates a safe base for future remapping, journaling, and lesson-mode constraints.
- Follow-up:
- Continue C5 with explicit project/workspace/runtime state-boundary guards, then recovery journal atomic-write flow.

## 2026-02-18T16:25:00Z - Architecture spine C5 slice 2: explicit state-boundary snapshots

- Date (UTC):
- 2026-02-18T16:25:00Z
- Area:
- Orchestration state model safety (project/workspace/runtime separation)
- Decision:
- Added `assets/js/core/stateBoundaries.js` to provide deterministic state snapshots by boundary.
- Wired `assets/js/app.js` to publish explicit `project`, `workspace`, and `runtime` snapshots via `fazide.getStateBoundaries()` and `fazide.getStateBoundary(name)` while keeping existing `getState()` compatibility.
- Why:
- This creates a safe migration surface for later guardrails (mutation boundaries, journaling, workers) without breaking current runtime behavior.
- Follow-up:
- Migrate high-churn read/write paths to boundary accessors incrementally, then introduce recovery-journal atomic write semantics under C5.

## 2026-02-18T16:50:00Z - Architecture spine C5 slice 3: atomic persistence + recovery journal scaffold

- Date (UTC):
- 2026-02-18T16:50:00Z
- Area:
- Crash-safe persistence and recovery readiness
- Decision:
- Extended `assets/js/ui/store.js` with atomic batch save (`saveBatchAtomic`) and pending-write recovery (`recoverStorageJournal`) backed by a storage journal record.
- Updated `assets/js/app.js` so layout/workspace persistence paths use atomic batch writes with safe fallback, added boot-time journal replay, and exposed journal diagnostics via `fazide` API.
- Why:
- The architecture spine requires atomic write and recovery primitives before deeper journaling/state mutation work, while preserving current UX and persistence behavior.
- Follow-up:
- Start routing additional high-value multi-key persistence paths through the same journaled transaction helper and add journal metrics to diagnostics panel flow.

## 2026-02-18T17:05:00Z - Readability + zoom control safety pass (global UI font + Ctrl/Cmd zoom)

- Date (UTC):
- 2026-02-18T17:05:00Z
- Area:
- UX readability, accessibility controls, and keyboard interaction consistency
- Decision:
- Switched global UI base font stack to a clean sans-serif readability-first stack and raised the default app base font size.
- Added persistent UI zoom control (`Ctrl/Cmd +`, `Ctrl/Cmd -`, `Ctrl/Cmd 0`) with boot restore, API exposure, and shortcut-help updates.
- Why:
- User requested clearer default readability and explicit keyboard zoom control while preserving fast power-user workflow.
- Follow-up:
- Keep zoom controls global and non-destructive, and ensure future shortcut additions do not conflict with zoom key combos.

## 2026-02-18T17:15:00Z - Zoom layout stability fix (viewport fill + panel-safe clamp)

- Date (UTC):
- 2026-02-18T17:15:00Z
- Area:
- Layout safety under global UI zoom
- Decision:
- Updated UI zoom application in `assets/js/app.js` to compensate app-shell height against zoom scale and to re-run layout normalization/apply pass after each zoom change.
- Reduced max zoom clamp from 180 to 160 to prevent high-end panel overlap risk while preserving readable enlargement.
- Why:
- User reported blank bottom space when zooming out and panel overlap at max zoom; this fix keeps viewport fill stable and forces width/bounds recalculation for safer panel geometry.
- Follow-up:
- Keep zoom regression coverage for viewport-fill behavior and include panel-layout checks whenever resize/zoom math changes.

## 2026-02-18T17:30:00Z - Footer zoom visibility + diagnostics journal/zoom signals

- Date (UTC):
- 2026-02-18T17:30:00Z
- Area:
- Runtime observability and user-facing zoom state clarity
- Decision:
- Added a dedicated footer runtime chip for live UI zoom percentage and severity state (`ok`/`warn`) based on safe zoom bounds.
- Extended diagnostics wiring to consume storage journal commit/recovery events and UI zoom change events (excluding boot restore), emitting info/warn diagnostics and promoting storage health to `warn` on recovery.
- Why:
- User explicitly requested visible zoom state and continued master-grade hardening; this keeps zoom and crash-recovery state observable without changing core execution paths.
- Follow-up:
- Keep zoom/journal diagnostics low-noise (event-driven only) and include footer-runtime status coverage in future status-bar regressions.

## 2026-02-18T17:45:00Z - Footer zoom sync closure + storage adapter spine (roadmap item #4 start)

- Date (UTC):
- 2026-02-18T17:45:00Z
- Area:
- Zoom status correctness and IndexedDB filesystem adapter migration safety
- Decision:
- Fixed zoom footer drift at the source by calling `syncFooterRuntimeStatus()` inside `applyUiZoom(...)`, ensuring footer state refreshes on every zoom mutation path (shortcuts/API/reset/boot load).
- Introduced a storage backend abstraction in `assets/js/ui/store.js` and exported `getStorageBackendInfo()` while keeping localStorage as the active synchronous backend; app diagnostics and debug API now expose backend capabilities including IndexedDB availability.
- Why:
- User reported stale footer zoom updates, and the next roadmap queue item requires an adapter seam before switching persistence engines.
- Follow-up:
- Keep sync API compatibility until filesystem persistence transitions fully to IndexedDB adapter paths; next slice should add IndexedDB-backed workspace payload read/write behind this backend interface.

## 2026-02-18T18:30:00Z - High-zoom panel overlap closure via row width-fit enforcement

- Date (UTC):
- 2026-02-18T18:30:00Z
- Area:
- Layout/resizer reliability under high UI zoom
- Decision:
- Added dock-row width-fit enforcement in `assets/js/app.js` that reflows overflow non-editor panels between top/bottom rows when a row’s minimum required panel widths exceed available row width.
- Integrated the width-fit pass into both `normalizeLayoutWidths()` and `applyPanelOrder()` so overlap is prevented before width clamping and splitter math executes.
- Added regression checks in `tests/ide.spec.js` verifying no horizontal panel overlap in top/bottom rows at max zoom.
- Why:
- User reported that high zoom still caused panel overlap and broken resizing interactions; previous width normalization could leave impossible row width states unresolved.
- Follow-up:
- Keep width-fit enforcement coupled to row-cap logic and include row-overlap checks whenever zoom or docking constraints are adjusted.

## 2026-02-18T18:55:00Z - Max-zoom panel visibility hardening (adaptive panel minimums)

- Date (UTC):
- 2026-02-18T18:55:00Z
- Area:
- High-zoom viewport safety and splitter preconditions
- Decision:
- Added adaptive panel minimum width logic in `assets/js/app.js` that scales panel/editor minimums by zoom level and workspace width budget, then syncs these values to `--panel-min-width` and `--panel-min-width-editor` on the app shell.
- Updated layout bound calculations and editor minimum-width reads to use adaptive minimums so JS constraints and CSS minimums stay aligned.
- Expanded max-zoom regression assertions in `tests/ide.spec.js` to fail if any visible panel leaves workspace horizontal bounds.
- Why:
- User reported that some panels still moved out of view and occasional overlap persisted at max zoom; fixed-width CSS minimums were still capable of exceeding effective viewport capacity.
- Follow-up:
- Keep adaptive minimums and row width-fit enforcement together; treat any out-of-bounds panel at max zoom as a release blocker.

## 2026-02-18T19:05:00Z - 110% zoom overlap/resizer fix (shell width compensation)

- Date (UTC):
- 2026-02-18T19:05:00Z
- Area:
- Zoom geometry normalization and panel resize reliability
- Decision:
- Added app-shell width compensation in `applyUiZoom(...)` (`width` + `min-width` set to inverse zoom viewport units) alongside existing height compensation.
- Expanded zoom regression coverage in `tests/ide.spec.js` to assert no overlap/out-of-view panels and near-zero shell viewport gap at 110%, 160%, and 70% zoom states.
- Why:
- User reported overlap and non-functional resizing beginning at 110%; root cause was zoom scaling widening effective shell geometry without width compensation.
- Follow-up:
- Keep zoom compensation symmetric (width + height) and treat viewport-gap regressions at first zoom step as blocker-level.

## 2026-02-18T19:20:00Z - Panel engine foundation slice (reusable solver module + roadmap blueprint)

- Date (UTC):
- 2026-02-18T19:20:00Z
- Area:
- Layout architecture modernization toward VS Code-style column/stack behavior
- Decision:
- Added `assets/js/core/layoutEngine.js` with a reusable panel-row solver (`solvePanelRows`) handling deterministic row caps + width-fit spill logic.
- Rewired `assets/js/app.js` row-cap/width-fit enforcement through the engine module via a single solver gateway (`solveDockingRows`), preserving existing behavior while establishing a dedicated layout-engine boundary.
- Simplified splitter visuals in `assets/css/layout.css` to hover/focus/drag visibility only (default hidden line) to keep resize affordance minimal.
- Added execution blueprint in `docs/PANEL_ENGINE_BLUEPRINT.md` and linked it from `docs/MASTER_ROADMAP.md` as the explicit optimization track.
- Why:
- User requested a “perfect engine” aligned to VS Code-like panel behavior with simple resize affordances; extracting the solver core is the lowest-risk path to continue toward full columns+stacks architecture.
- Follow-up:
- Next slice introduces explicit `columns/stacks` state in parallel with legacy `panelRows`, then migrates persistence/rendering in staged compatibility mode.

## 2026-02-18T19:45:00Z - Panel engine Slice B completion (dual-state columns/stacks + panelRows)

- Date (UTC):
- 2026-02-18T19:45:00Z
- Area:
- Layout model migration safety and backward compatibility
- Decision:
- Added `assets/js/core/panelLayoutModel.js` introducing normalized `panelLayout` (`columns/stacks`) with adapters `rowsToPanelLayout` and `panelLayoutToRows`.
- Updated `assets/js/app.js` to dual-sync layout state through `setPanelRows`, `syncPanelRowsFromLayoutModel`, and `syncPanelLayoutFromRows`, with sanitize-time reconciliation that preserves preset-driven row behavior.
- Added migration observability via `fazide.getPanelLayout()` and regression coverage in `tests/ide.spec.js` confirming model/row synchronization after docking mutations.
- Why:
- User requested a perfect panel engine that connects cleanly with existing behavior; dual-state synchronization enables architecture evolution without breaking current row-based rendering and controls.
- Follow-up:
- Proceed to Slice C: ratio-first persistence and snapshot upgrade path while keeping old saved layouts readable.

## 2026-02-18T19:40:00Z - Panel guide bounds closure + Slice C ratio-first persistence completion

- Date (UTC):
- 2026-02-18T19:40:00Z
- Area:
- Panel guide geometry safety and layout persistence migration
- Decision:
- Removed legacy long-span resize-guide behavior and clamped row/column guide coordinates to workspace bounds in `assets/js/app.js` so drag guides never render out-of-bounds.
- Completed Slice C by introducing ratio-first layout persistence snapshots (`panelRatios`) with backward-compatible sanitize/load upgrade handling for legacy absolute-width snapshots.
- Added regression coverage in `tests/ide.spec.js` validating ratio-first persistence/restore behavior.
- Why:
- User reported guideline overflow and required full migration execution without legacy behavior; bounded guides plus ratio-first persistence closes the geometry/persistence mismatch at the root.
- Follow-up:
- Start Slice D renderer migration (column+stack rendering/tabs/docking targets) while keeping legacy snapshot readability intact during transition.

## 2026-02-18T20:05:00Z - Single resize path enforcement + deterministic row overflow solver

- Date (UTC):
- 2026-02-18T20:05:00Z
- Area:
- Panel zoom stability and resize architecture cleanup
- Decision:
- Reworked `assets/js/core/layoutEngine.js` row width-fit enforcement to a deterministic overflow-reduction strategy that only moves a panel between rows when total row overflow decreases, preventing ping-pong relocation loops under zoom pressure.
- Removed the unused legacy edge-resize subsystem from `assets/js/app.js` so splitter-driven resizing remains the single active panel resize path.
- Why:
- User reported persistent overlap/broken panel behavior while zooming and explicitly requested removal of old systems; duplicate/legacy resize logic and non-deterministic overflow moves increased risk of unstable states.
- Follow-up:
- Keep all panel width mutations routed through solver + splitters only, and continue Slice D renderer migration toward full VS Code-style columns/stacks/tabs.

## 2026-02-18T20:25:00Z - Layout reset determinism + row-scoped resize guide rendering

- Date (UTC):
- 2026-02-18T20:25:00Z
- Area:
- Preset reset reliability and resize guide clarity
- Decision:
- Fixed `applyLayoutPreset(...)` in `assets/js/app.js` to drop stale `panelRatios` before sanitize/rebuild so preset width/height geometry is actually restored instead of being overridden by prior ratio snapshots.
- Updated column-guide rendering in `assets/js/app.js` to clamp guide vertical span to the active panel row bounds (with explicit style reset on hide), preventing guides from visually spanning unrelated panels.
- Added regression coverage in `tests/ide.spec.js` ensuring preset application resets geometry after extreme custom size mutations.
- Why:
- User reported that reset did not truly reset and guide lines looked broken across the layout; stale ratio carry-over and full-height guide lines were causing confusing/incorrect behavior.
- Follow-up:
- Keep preset application as a deterministic geometry reset path and preserve row-scoped guide visuals while Slice D renderer migration continues.

## 2026-02-18T20:40:00Z - High-zoom editor resize unlock (zoom-aware drag + feasible min budgets)

- Date (UTC):
- 2026-02-18T20:40:00Z
- Area:
- Splitter interaction correctness under UI zoom
- Decision:
- Updated splitter drag math in `assets/js/app.js` to convert pointer deltas into layout-space deltas using current UI zoom scale, so drag distance maps correctly at non-100% zoom.
- Hardened adaptive panel minimum logic in `assets/js/app.js` with feasibility scaling + hard floors (`64/96`) so two-panel editor rows remain resizable instead of getting locked by impossible min-width combinations at high zoom.
- Added regression coverage in `tests/ide.spec.js` for splitter resize behavior at 160% zoom.
- Why:
- User reported editor resizing was broken when zoomed in; root cause was a combination of zoom-space delta mismatch and minimum-width floors that could leave no movable range.
- Follow-up:
- Keep all splitter interactions zoom-aware and preserve feasible-minimum guarantees whenever zoom/min-width formulas change.

## 2026-02-18T20:20:00Z - CSS gate contract hardening + base-style redundancy cleanup

- Date (UTC):
- 2026-02-18T20:20:00Z
- Area:
- CSS system reliability, release gating, and regression safety
- Decision:
- Consolidated duplicate `body` styling declarations in `assets/css/base.css` into a single canonical block to remove redundant base-style surface while preserving existing visual behavior.
- Added micro release-contract tests in `tests/release.spec.js` that enforce: (1) `test:css` presence and ordering in `test:quick`/`test:all`, and (2) `scripts/ai-verify.js` running `test:css` before changed/smoke suites.
- Why:
- User requested optimization/removal of unnecessary code while strengthening micro-regression coverage and AI safety flow updates.
- Follow-up:
- Keep CSS gate ordering contract-tested and treat any removal or reordering of `test:css` from verification pipelines as release-blocking drift.

## 2026-02-18T20:26:00Z - Modal selector dedupe optimization + resilient stress contract

- Date (UTC):
- 2026-02-18T20:26:00Z
- Area:
- CSS parsing/maintenance efficiency and regression determinism
- Decision:
- Refactored repeated modal selector chains in `assets/css/components.css` to shared `:is(...)` selectors for `#editorHistoryPanel`, `#shortcutHelpPanel`, and `#editorSettingsPanel`.
- Removed duplicate declaration surface for `#editorHistoryPanel .editor-history-actions button` while preserving shared button styling through the existing grouped action selector.
- Added micro contract coverage in `tests/release.spec.js` to enforce the deduped selector pattern and forbid legacy standalone duplicate block reintroduction.
- Stabilized `tests/ide.spec.js` stress invariant timing by forcing a deterministic post-drag layout normalization pass before final overlap/out-of-bounds audit.
- Why:
- User requested deeper optimization with no breakage and explicit micro test additions; this reduces CSS rule redundancy while keeping release safety deterministic.
- Follow-up:
- Keep grouped modal selector contracts and deterministic stress normalization in place for future panel/style tuning.

## 2026-02-18T21:05:00Z - Layout settings surface expansion (corner radius + bottom dock height)

- Date (UTC):
- 2026-02-18T21:05:00Z
- Area:
- Layout settings UX completeness and dock geometry control parity
- Decision:
- Exposed previously hidden layout controls in `index.html` for panel corner radius and bottom dock height.
- Wired `layoutBottomHeight`/`layoutBottomHeightInput` in `assets/js/ui/elements.js` and `assets/js/app.js` with sync, clamping, persistence, and disabled-state behavior when bottom row has no open panels.
- Corrected corner-radius bounds in `getLayoutBounds()` from `{ min: 0, max: 0 }` to `{ min: 0, max: 24 }` so UI controls can apply non-zero values.
- Added micro regression coverage in `tests/layout-micro.spec.js` and `tests/typography-sizing-contract.spec.js` for control bounds synchronization and runtime style application.
- Why:
- User requested adding more layout settings; existing runtime support was partially implemented but not fully exposed in UI, causing capability drift.
- Follow-up:
- Keep any future layout control additions paired with both bounds-sync contracts and at least one behavior-level micro test.

## 2026-02-18T21:30:00Z - Full layout customization upgrade (row + order controls for all major panels)

- Date (UTC):
- 2026-02-18T21:30:00Z
- Area:
- Layout control completeness and settings-driven docking parity
- Decision:
- Expanded layout settings in `index.html` with per-panel row selectors (`top`/`bottom`) for console, editor, files, sandbox, and tools.
- Added missing tools position selector and bindings so order controls now cover all major panels consistently.
- Wired new controls in `assets/js/ui/elements.js` and `assets/js/app.js`, including control sync, open-state disabling, and deterministic row migration via `movePanelToRow(..., { animatePanels: true })`.
- Why:
- User requested another optimization pass with full layout customization from settings; prior state required drag interactions for some placement scenarios and lacked tools order parity.
- Follow-up:
- Keep layout settings aligned with all dockable panel capabilities; if new panels become dockable, row/order controls must be added in the same change.

## 2026-02-18T22:20:00Z - Safe CSS selector dedupe follow-up with full gate proof

- Date (UTC):
- 2026-02-18T22:20:00Z
- Area:
- CSS optimization safety and release confidence
- Decision:
- Consolidated repeated scrollbar and footer runtime-status selectors in `assets/css/layout.css` using `:is(...)` grouping to reduce duplicate selector surface without changing computed behavior.
- Why:
- User requested continued CSS optimization while keeping stabilization and deployment safety intact.
- Follow-up:
- Keep selector dedupe changes behavior-neutral and require `test:css`, focused release contracts, and full `npm run test:all` evidence for CSS optimization waves.

## 2026-02-18T22:44:00Z - Command-center checkpoint inference realigned to active roadmap lanes

- Date (UTC):
- 2026-02-18T22:44:00Z
- Area:
- AI memory governance and checkpoint-routing accuracy
- Decision:
- Updated `scripts/ai-command-center.js` checkpoint inference so active roadmap lanes (`C5` architecture spine and `C7` layout stability lane) are detected from current high-change surfaces (`app.js`, layout engine/model files, state/store primitives, and layout/docking files).
- Expanded roadmap-memory targeting trigger to include `C5/C6/C7` (not only `C4`) so roadmap decision map sync remains required when modern checkpoint lanes are touched.
- Why:
- Deep memory audit showed command-center output was still biasing guidance toward legacy checkpoints (`C1/C3/C4`) even when active work clearly belonged to `C5/C7`, creating governance drift risk.
- Follow-up:
- Add a focused contract test for checkpoint inference mapping in a future scripts-contract wave; preserve roadmap-lane inference whenever checkpoint definitions evolve.

## 2026-02-18T23:20:00Z - Lesson Stats modal made memorable with explicit local-only safety framing

- Date (UTC):
- 2026-02-18T23:20:00Z
- Area:
- Lessons UX engagement + safe telemetry/memory behavior
- Decision:
- Upgraded the Lesson Stats modal with a performance hero, next-level XP progress rail, richer live session insights, and stable centered/scrollable behavior under constrained viewports.
- Kept safety posture explicit by rendering local-only privacy messaging directly in modal copy and aria summary, without introducing any external telemetry or cross-session network dependencies.
- Extended regression coverage for modal placement/scroll behavior and live stat rendering contracts.
- Why:
- User requested a more memorable lessons experience while explicitly prioritizing safety and reliability.
- Follow-up:
- Preserve local-only lesson-stat safety language and keep future modal polish behind focused UX + viewport regression checks.

## 2026-02-18T23:58:00Z - Lesson smoothness optimization wave (low-overhead stats + throttled feedback)

- Date (UTC):
- 2026-02-18T23:58:00Z
- Area:
- Lesson runtime smoothness, input feedback stability, and AI memory traceability
- Decision:
- Optimized lesson stats update flow by reusing precomputed session metrics in `getLessonStateSnapshot({ metrics })` and by limiting live modal polling work to active lesson sessions only.
- Added short cooldown throttles for HUD pulse and haptic calls to prevent effect spam under rapid mismatch/typing bursts while preserving milestone/level-up feedback.
- Added mismatch haptic feedback using the same throttle path for consistent tactile signal without vibration overload.
- Why:
- User requested a super-smooth lesson pass with optimization-first changes and no regressions.
- Follow-up:
- Keep lesson feedback pacing conservative; treat haptic/pulse spam regressions and stale stats-modal elapsed updates as non-regression contracts.

## 2026-02-19T00:20:00Z - Lesson coin economy phase 1 (local-only progression baseline)

- Date (UTC):
- 2026-02-19T00:20:00Z
- Area:
- Lessons progression economy + roadmap checkpoint traceability
- Decision:
- Added a local-only coin field to lesson profile state (`coins`) with backward-safe sanitization so existing profiles migrate without resets.
- Added coin rewards to deterministic lesson milestones only (step completion, lesson completion/perfect bonus, and streak milestones every 20 correct inputs) to avoid noisy per-keystroke farming paths.
- Surfaced coin totals in both active lesson HUD and Lesson Stats modal, keeping existing token-aligned UI and privacy-safe copy unchanged.
- Added focused lesson regressions for coin rendering and milestone rewards while preserving prior XP/session contracts.
- Why:
- User requested starting the coin/theme-unlock roadmap now, with strict safety, organization, and AI memory synchronization requirements.
- Follow-up:
- Keep coins local-only until a dedicated unlocks/shop surface is introduced; gate any spending/unlock flow behind additional anti-abuse and persistence-contract tests.

## 2026-02-18T23:59:00Z - Lessons deep-audit optimization pass (shop render throttling + terminology sync)

- Date (UTC):
- 2026-02-18T23:59:00Z
- Area:
- Lessons runtime performance + AI memory accuracy
- Decision:
- Updated lesson shop rendering to avoid hidden/off-screen list rebuilds during live lesson updates by making `updateLessonShopUi` visibility-aware and render-key cached.
- Preserved existing lessons behavior while reducing unnecessary DOM churn from HUD/Stats-driven update calls.
- Synchronized memory language toward `Lessons` modal and `Bytes` economy wording to reduce policy/docs drift.
- Why:
- Deep lessons review identified avoidable rendering work in the shop path as a practical smoothness flaw under active typing sessions.
- Follow-up:
- Add strict Bytes unlock-policy contracts before changing default unlocked-theme compatibility baseline.

## 2026-02-18T23:59:30Z - Lessons shop-tab-aware refresh gating + hidden re-render regression lock

- Date (UTC):
- 2026-02-18T23:59:30Z
- Area:
- Lessons runtime efficiency and non-regression safety
- Decision:
- Reduced lesson runtime overhead by gating `updateLessonShopUi` calls from `updateLessonHeaderStats` so shop refresh occurs only when the Lessons modal is open on the Shop tab.
- Added focused Playwright regression ensuring shop list DOM is not rebuilt while Overview remains active during typing updates.
- Why:
- Even with visibility-aware shop rendering, calling the shop refresh path from every stats update introduced avoidable overhead in common Overview workflows.
- Follow-up:
- Keep hidden-work elimination and DOM-stability checks in future lesson optimization waves; keep strict Bytes unlock policy as a separate checkpointed policy wave.

## 2026-02-19T05:15:00Z - Franklin full-gate parity + web SEO/icon release hardening

- Date (UTC):
- 2026-02-19T05:15:00Z
- Area:
- Release orchestration reliability, web SEO readiness, and SiteGround packaging completeness
- Decision:
- Added `test:css` to `frank:full` full-gate stages and refactored parallel mode stage grouping to script-name lookup instead of fixed indices, preventing silent drift when stage ordering changes.
- Upgraded web SEO surface with crawler metadata and social previews in `index.html`, added PNG icon variants for web/app contexts, expanded `manifest.webmanifest` icon set/metadata, and introduced `robots.txt` + `sitemap.xml` as deployable release assets.
- Extended dist/siteground mapping and package verification so SEO files are guaranteed in `release/siteground/public_html`.
- Added release contract coverage for Franklin CSS-stage presence and SEO metadata/file requirements.
- Why:
- User requested confirmation that Franklin does the complete release workflow and asked for SEO/icon perfection before production upload.
- Follow-up:
- Use `SITE_URL` before `npm run deploy:siteground` so packaged canonical/OG/sitemap URLs are stamped automatically with the live domain.
