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

## 2026-02-17T23:45:00Z - Live sandbox theme token sync + API icon consistency

- Date (UTC):
- 2026-02-17T23:45:00Z
- Area:
- Sandbox theme behavior and runtime validation UI consistency
- Decision:
- Parent now sends tokenized sandbox surface payload (`background/foreground/panel/border/accent/muted/colorScheme`) on `theme_update`; sandbox bridge applies those live so running iframe content updates to the current theme without mandatory rerun.
- Runtime JS/HTML test app headers now use the same API icon asset approach as matrix (Twemoji CDN SVG icons) for visual consistency.
- Why:
- Theme switching should be safe and visually consistent in sandbox even after code is already running; icon system should be uniform across runtime test surfaces.
- Follow-up:
- Add a regression that validates theme switch updates sandbox surface tokens post-run.

## 2026-02-17T23:25:00Z - Runtime test apps: simple words + detailed proof markers

- Date (UTC):
- 2026-02-17T23:25:00Z
- Area:
- Runtime validation UX clarity for beginners
- Decision:
- Updated runtime test app copy and step labels to very plain language while keeping detailed per-step diagnostics and existing marker strings that automated tests depend on.
- Refined Runtime Full Matrix README to provide clear pass/fail language per JS/HTML/CSS/Python channel.
- Why:
- Users need test apps that are immediately understandable while still proving each language path is functioning correctly.
- Follow-up:
- Add a dedicated UI test for beginner-friendly labels in runtime validation applications.

## 2026-02-17T23:10:00Z - Runtime validation square-theme contract + token-first diagnostics

- Date (UTC):
- 2026-02-17T23:10:00Z
- Area:
- Runtime validation visual contract and diagnostics richness
- Decision:
- Enforced square-theme styling across runtime validation CSS and preview shells (removed rounded corners/radius styling from runtime test surfaces).
- Kept styling token-first via sandbox theme variables and expanded JS/HTML/matrix diagnostic scripts with additional token/report coverage while preserving existing log markers used by tests.
- Why:
- Runtime test files should match the project’s square visual identity and provide clearer, more detailed diagnostics without breaking current regression expectations.
- Follow-up:
- Add targeted visual checks that assert runtime validation surfaces remain square (no radius regressions).

## 2026-02-17T22:55:00Z - First-load Welcome starter workspace with free/no-ads promise

- Date (UTC):
- 2026-02-17T22:55:00Z
- Area:
- New-user first-run workspace experience
- Decision:
- Added `DEFAULT_WELCOME_FILES` in `assets/js/config.js` to define a `Welcome/` folder starter set with `index.html`, `styles.css`, and `app.js`.
- Updated `hydrateFileState()` in `assets/js/app.js` so when there is no saved workspace, no snapshot, and no legacy code, FAZ IDE seeds this Welcome starter instead of a single fallback file.
- Why:
- New users should immediately see a structured multi-file workspace that clearly communicates product promises: free forever, no ads, never charging.
- Follow-up:
- Add a dedicated automated first-run assertion for Welcome starter presence after storage reset.

## 2026-02-17T22:40:00Z - Runtime validation app visual normalization + sandbox background contract

- Date (UTC):
- 2026-02-17T22:40:00Z
- Area:
- Runtime validation UX consistency across JS/HTML/CSS/Python and sandbox fallback surfaces
- Decision:
- Standardized runtime validation app styling to use sandbox-exported theme variables rather than file-local hard-coded colors.
- Extended sandbox theme lock in `assets/js/sandbox/runner.js` to publish `--fazide-sandbox-bg/fg/panel/border/accent/muted` for iframe content.
- Updated default CSS/Python preview templates in `assets/js/app.js` and set runner shell/iframe base backgrounds in `assets/css/components.css` to keep all sandbox states visually consistent.
- Why:
- Runtime test applications must look clean and theme-aligned in every active theme, and sandbox fallback/blank states should not flash mismatched backgrounds.
- Follow-up:
- Consider extracting a shared runtime-test stylesheet utility to avoid repeated style blocks across runtime app assets.

## 2026-02-17T22:20:00Z - Python startup reliability deadline + stage-visibility tuning

- Date (UTC):
- 2026-02-17T22:20:00Z
- Area:
- Python runtime startup behavior for beginner/slow environments
- Decision:
- Increased Python cold-start timeout in `assets/js/sandbox/pythonRunner.js` from `20_000` to `60_000` and increased app-side Python run wait in `assets/js/app.js` from `10_000` to `30_000`.
- Added explicit worker lifecycle stage logs in `assets/js/sandbox/pythonWorker.js` (`initializing core`, `core ready`, `executing code`, `execution complete`) after runtime-source reporting.
- Why:
- Users in slow or restricted environments were seeing only startup/loading/source messages and interpreting runtime as hung; longer bounded startup windows plus stage logs reduce false-frozen perception without removing timeout protections.
- Follow-up:
- If startup-only reports persist, emit a deterministic startup-deadline remediation block that points users to `python-check` and `python:runtime:setup`.

## 2026-02-17T22:00:00Z - Privacy verifier compatibility for vendored Pyodide runtime

- Date (UTC):
- 2026-02-17T22:00:00Z
- Area:
- Release privacy gate robustness with local Python runtime assets
- Decision:
- Updated `scripts/verify-public-privacy.js` to allow known synthetic `/home/*` path tokens inside vendored Pyodide runtime files only (`assets/vendor/pyodide/**`) so upstream runtime internals do not trigger false-positive privacy failures.
- Why:
- Local-first Python runtime bundling is required for reliable/offline execution, but upstream minified runtime files include non-user synthetic home-path strings that are not private project leaks.
- Follow-up:
- Keep privacy allowlist scope narrowly constrained to vendored third-party runtime paths and avoid widening to user-authored source files.

## 2026-02-17T21:55:00Z - Local-first Python runtime provisioning + multi-source diagnostics

- Date (UTC):
- 2026-02-17T21:55:00Z
- Area:
- Python runtime reliability across restricted/offline environments
- Decision:
- Added local runtime provisioning scripts (`python:runtime:setup`, `python:runtime:verify`) backed by `scripts/setup-python-runtime.js` to install required Pyodide assets under `assets/vendor/pyodide/v0.27.2/full/`.
- Upgraded runtime diagnostics so `python-check` probes local bundle + CDN fallbacks (`jsdelivr`, `unpkg`) and reports per-source pass/fail lines.
- Why:
- Users should not depend on a single CDN path for Python startup; local-first runtime with deterministic diagnostics dramatically improves “works anywhere” behavior.
- Follow-up:
- Add doctor/CI checks for required local runtime files and optional service-worker pre-cache warming for offline-first first launch.

## 2026-02-17T21:35:00Z - Cross-agent operations + optimization map hardening

- Date (UTC):
- 2026-02-17T21:35:00Z
- Area:
- AI handoff reliability, Franklin operating clarity, and safe optimization discipline
- Decision:
- Added `agent-operations.md` to define a deterministic cross-agent operating contract (architecture anchors, Franklin gate model, safe change protocol, high-risk zones, and session exit requirements).
- Added `optimization-map.md` to prioritize optimization targets by risk/value with safe-first tactics and readiness checks.
- Updated memory entrypoints (`README.md`, `project-context.md`, `handoff-checklist.md`) to include these documents in normal AI startup flow.
- Why:
- Repeated multi-agent sessions need a stable shared understanding of where to change, how to validate, and how to avoid high-blast-radius mistakes.
- Follow-up:
- Keep optimization-map tiers current as architecture shifts; require decision-log entries for any Tier C changes.

## 2026-02-17T21:05:00Z - run() decomposition batch 2 (source resolution + non-Python launch helper)

- Date (UTC):
- 2026-02-17T21:05:00Z
- Area:
- Runtime orchestration maintainability and deterministic launch behavior
- Decision:
- Extracted `resolveRunSource(...)` from `run()` to centralize language-to-mode/source resolution (`html`/`css`/`python`/default JS) and isolate Python-like warning generation.
- Extracted `launchStandardSandboxRun(...)` from `run()` to encapsulate non-Python iframe launch, readiness fallback timer, sandbox auto-open, inspect re-arm, and debug-watch refresh behavior.
- Added regression coverage for Python startup lifecycle message and re-ran focused Python lifecycle tests.
- Why:
- Keeping `run()` flat and orchestration-focused reduces merge-risk during repeated hardening cycles and makes future runtime feature insertion less error-prone.
- Follow-up:
- Continue splitting run-adjacent concerns (status/log boilerplate and run-context setup) into explicit helper boundaries while preserving existing run semantics.

## 2026-02-17T20:40:00Z - app.js organization pass + Python lifecycle diagnostics

- Date (UTC):
- 2026-02-17T20:40:00Z
- Area:
- Runtime orchestration maintainability, Python startup diagnostics, and release-gate discipline
- Decision:
- Extracted shared workspace run helpers (`createWorkspaceAssetResolver`, CSS/Python preview builders) from `run()` to top-level functions to reduce per-run setup churn and make execution flow easier to reason about.
- Moved Python branch logic into dedicated `runPythonExecution(...)` to centralize startup, loading notices, completion hints, and runtime error wiring.
- Added deterministic regressions for slow Python startup notice and no-output completion hint.
- Adopted explicit workflow policy: after every 3 major optimization changes, run `frank:full` before proceeding.
- Why:
- Large monolithic run-path logic increased risk during repeated hardening work; clearer boundaries and dedicated tests improve safety and refactor confidence.
- Follow-up:
- Continue modular extraction of run-path responsibilities into dedicated runtime modules while preserving existing UX/API behavior.

## 2026-02-17T20:10:00Z - Runtime validation output granularity upgrade

- Date (UTC):
- 2026-02-17T20:10:00Z
- Area:
- QA visibility, runtime diagnostics UX, and cross-language troubleshooting speed
- Decision:
- Upgraded runtime validation applications from basic markers to detailed, step-based diagnostic harnesses.
- JS/HTML/Python probes now emit structured multi-step logs with run markers, channel-specific output, environment details, timing checkpoints, and explicit completion lines.
- CSS runtime validation now includes explicit visual diagnostic chips/markers in sandbox preview so non-console run paths still provide rich verification cues.
- Why:
- Users troubleshooting runtime output need high-signal diagnostics directly in product without guessing whether failures are language-specific, channel-specific, or sandbox-render specific.
- Follow-up:
- Add optional diagnostic transcript export and command-palette summary runner for one-click validation reporting.

## 2026-02-17T15:05:00Z - Applications-tab runtime validation pack

- Date (UTC):
- 2026-02-17T15:05:00Z
- Area:
- Runtime verification UX, educational QA workflows, and cross-language regression confidence
- Decision:
- Added a dedicated runtime validation application pack to the Applications catalog with language-specific probes:
  - JavaScript console + sandbox probe app,
  - HTML linked-asset sandbox probe app,
  - CSS preview-path sandbox probe app,
  - Python stdout/stderr/result probe app.
- Added micro Playwright regressions that assert these application IDs exist and that loading/running each template emits expected language-specific output signals.
- Why:
- Enables repeatable master-grade manual and automated validation of console+sandbox paths directly from product UX (Applications tab), reducing ambiguity when users report runtime-output issues.
- Follow-up:
- Add a command-palette action to execute the full runtime validation pack and print a pass/fail summary in Console.

## 2026-02-17T14:30:00Z - Sandbox browser-isolation hardening + Python console reliability

- Date (UTC):
- 2026-02-17T14:30:00Z
- Area:
- Runtime sandbox security, Python education reliability, and regression stability
- Decision:
- Added a strict sandbox CSP at runner document generation and installed a security lock layer that blocks browser-interference APIs from user code paths (network/popup/dialog/worker/service-worker/geolocation entry points) while surfacing safe warnings in the virtual console.
- Tightened iframe bridge messaging by preferring parent-origin targeting and validating parent-message source/origin before processing control commands.
- Added Python cold-start timeout allowance (while preserving strict warm-run timeout) so first-run Pyodide initialization on slow or filtered school networks does not appear as a silent console failure.
- Simplified flaky run-context regression to assert deterministic user-visible evidence (run-context log + marker) and expanded Python regressions to verify stdout/stderr forwarding plus runtime-error surfacing.
- Why:
- Improves safety posture for education environments that require strict browser containment while keeping Python output visibility predictable for learners.
- Follow-up:
- Add explicit UI status for "Python runtime loading" and track blocked-API/import counters for diagnostics.

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
