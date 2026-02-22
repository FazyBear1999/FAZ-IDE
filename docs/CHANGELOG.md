# Changelog

## 2026-02-21

- Began optimization lockdown slices with a behavior-preserving cleanup pass.
- Removed inline styles from `assets/lessons/quick-output-instant/index.html` and moved those declarations into `assets/lessons/quick-output-instant/styles.css`.
- Updated roadmap execution tracking with a dedicated lockdown slice log entry.
- Added a hard mobile access gate that blocks IDE boot for mobile user agents and shows a desktop-required message with a FAZIDE.COM link.
- Added a focused contract test in `tests/ide.spec.js` to ensure mobile user agents cannot access IDE shell UI.
- Refactored mobile gate rendering from inline JS DOM styling to structured HTML (`index.html`) and tokenized CSS (`assets/css/layout.css`) to reduce `app.js` complexity and improve maintainability.
- Added a panel-contract guard in `assets/js/app.js` to prevent closing the final remaining primary panel, avoiding blank-shell dead-end states.
- Added focused contract coverage in `tests/layout-micro.spec.js` to lock the "at least one panel remains open" behavior.
- Added panel API input hardening in `assets/js/app.js` so invalid panel names are explicit no-ops across open/order/dock/toggle pathways.
- Added focused contract coverage in `tests/layout-micro.spec.js` to ensure invalid panel API inputs do not mutate layout state.
- Added row/order normalization hardening in `assets/js/app.js` so malformed docking rows and non-integer order indices are treated as safe no-ops.
- Added focused contract coverage in `tests/layout-micro.spec.js` to ensure malformed row/order panel API inputs do not mutate layout state.
- Added safe-integer normalization in `assets/js/app.js` for panel order indices so precision-unsafe integers are rejected as no-ops while valid extreme safe integers remain clamped deterministically.
- Added focused contract coverage in `tests/layout-micro.spec.js` for safe-extreme panel order clamping and unsafe-integer no-op behavior.
- Added sanitize-time row-cap hardening in `assets/js/app.js` so persisted dense panel row states are normalized to docking caps on reload.
- Added focused contract coverage in `tests/layout-micro.spec.js` to verify persisted dense row layouts are capped deterministically after reload.
- Added sanitize-time primary panel floor recovery in `assets/js/app.js` so persisted all-closed primary panel payloads reopen a safe default panel at boot.
- Added focused contract coverage in `tests/layout-micro.spec.js` to verify all-closed persisted panel states recover to at least one open panel on reload.
- Decomposed sanitize-time panel guard logic in `assets/js/app.js` into dedicated snapshot helpers (`ensureSnapshotPrimaryPanelFloor`, `applySnapshotRowCapNormalization`) to reduce orchestrator coupling while preserving behavior.
- Added focused contract coverage in `tests/layout-micro.spec.js` for a combined persisted payload (dense rows + all-closed panels) to verify boot recovery enforces both primary-panel floor and row caps together.
- Optimized `sanitizeLayoutState` in `assets/js/app.js` by caching row width reads for ratio width reconstruction and reusing the already-normalized panel-gap value, reducing redundant normalization/DOM width lookups while preserving behavior.
- Optimized ratio reconstruction pathways in `assets/js/app.js` by adding a normalized panel→row lookup helper (`buildPanelRowLookup`) and reusing it in both `buildPanelRatioSnapshot` and `sanitizeLayoutState` to avoid repeated row membership scans.
- Optimized lesson marker parsing in `assets/js/core/lessonEngine.js` by precomputing next blank-line lookups for `[LESSON:*]` segmentation, replacing repeated per-marker blank-line scans while preserving parsing behavior.
- Updated lesson typing progression in `assets/js/core/lessonEngine.js` so parsed lesson segments collapse into a single completion target per lesson session, preserving detailed in-file tutorial comments/content while removing multi-step completion checkpoints.
- Added focused contract coverage in `tests/lesson-system-micro.spec.js` to enforce single-step typing sessions per lesson.
- Updated lesson typing normalization in `assets/js/app.js` to auto-skip instructional comment segments (`//`, `/* */`, `<!-- -->`) so learners type code only while detailed lesson comments remain in files.
- Added focused contract coverage in `tests/lesson-system-micro.spec.js` to verify comment-prefixed lessons start typing on code characters.
- Updated lesson active-range rendering in `assets/js/app.js` so auto-skipped comment spans are not highlighted as typed ranges.
- Added focused contract coverage in `tests/lesson-system-micro.spec.js` to verify pressing Enter after a completed code line skips intervening comments and advances to the next code character.
- Hardened beginner lesson runtime scripts (`assets/lessons/beginner-js-01` through `beginner-js-17`) to use safe render target fallbacks (`#app` → `#out` → `document.body`), preventing null `innerHTML` crashes when completing and auto-running lessons.
- Added focused runtime regression coverage in `tests/lesson-system-micro.spec.js` to assert lesson completion auto-run emits no uncaught page errors.
- Added code-objective lesson mark rendering in `assets/js/app.js` + `assets/css/components.css` so remaining code targets are highlighted separately from skipped instructional comments.
- Added adaptive lesson hints with tiered mismatch feedback and optional reveal (`F2`) in `assets/js/app.js`.
- Added deterministic lesson analytics tracking in `assets/js/app.js` (time-on-objective, retries, pain points) with API snapshots and persisted session support.
- Added lesson authoring lint checks via `lintLessonAuthoring` in `assets/js/core/lessonEngine.js`, surfaced through lesson load warnings and the public API.
- Added an Explain This Step block in `index.html` lesson stats panel, driven by comment-sourced guidance from `assets/js/app.js`.
- Added focused lesson contracts in `tests/lesson-system-micro.spec.js` for lint reporting, adaptive hint reveal/analytics, and explain panel rendering.

## 2026-02-20

- Added a lessons progression map with `All`, `Beginner`, `Intermediate`, and `Expert` tier chips in the Files sidebar, including per-tier counts and safe filtering that preserves existing lesson load/typing flows.
- Added CI-safe Playwright retry policy (`retries: 1` on CI, `0` locally) to reduce transient flake failures without slowing local feedback loops.
- Added `PLAYWRIGHT_RETRIES` override support in Playwright config for deterministic local retry tuning.
- Added `test:stable` script for explicit one-retry end-to-end runs during optimization/polish waves.
- Added `frank:full:stable` / `frank:all:stable` commands to run full gate with retry-backed Playwright stage for safer polish loops.
- Hardened folder rename Playwright coverage by committing inline rename via blur + poll semantics, avoiding Enter-key timing detaches during DOM re-render.
- Added Supabase + Google OAuth account integration with local-first fallback when auth keys are not configured.
- Reworked Account modal UX: cloud connect controls, sync status metadata, disconnected email hiding, and in-field eye toggle visibility control.
- Hardened cloud sync trust path with per-user lesson baseline/delta verification to block manipulated local byte/XP uploads.
- Added SQL account hardening migration for profile/workspace payload constraints, RLS ownership policies, and progression guard trigger windows.
- Extended production CSP/connect allowances for Supabase + `esm.sh` and added deploy-time auth env injection for SiteGround packaging.
- Added security guardrails (`test:secrets`, pre-commit privacy/secret hook) plus account micro/live test coverage updates.
- Verified full readiness with passing integrity/privacy/secrets checks and a green `frank:full` release gate.
- Completed CSS maintainability hardening pass with shared micro-primitives for stroke/ring/letter-spacing tokens in `assets/css/base.css`.
- Ran Phase 2 typography consistency refactor by replacing repeated `letter-spacing` literals in `assets/css/components.css` with shared token variables.
- Refined high-churn layout/component interaction styling to consume shared primitives without visual behavior drift.
- Re-ran focused CSS/UI/layout/theme contract suites after each safe batch and kept results green.
- Synchronized AI memory markdown logs for release traceability.

## 2026-02-18 (v0.2.0)

- Hardened Franklin full release orchestration (`frank:full`) and verified full stage parity, including CSS safety gate coverage.
- Expanded web SEO/release readiness: canonical + Open Graph URL metadata, crawler assets, and web icon coverage.
- Added domain-aware SiteGround packaging support via `SITE_URL` so packaged canonical/OG/sitemap URLs can be stamped for production.
- Expanded release runbook with a full preflight/deploy/crawl checklist and explicit production domain-input contract.
- Synced AI memory docs and operating checklists to enforce release-domain verification during handoff.

## 2026-02-13 (v0.1.0)

- Set project version metadata to 0.1.0.
- Added safe release workflow commands and documentation for repeatable deploys.
- Added SiteGround package verification checks to block incomplete uploads.
- Fixed production module loading by switching runtime vendor imports from .mjs to .js.
- Added root favicon support and deployment checks for favicon and .htaccess.
- Improved test stability for inspect and find/replace Playwright cases.

## 2026-02-12

- Added Dark/Light theme toggle with pop-out sandbox sync.
- Refined docking, snapping, and panel resizing behaviors.
- Enhanced Files panel: menus, search/sort, games library, and compact UI.
- Improved layout stability for top header and editor header.
- Playwright test suite expanded and passing.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
