# Changelog

## 2026-02-20

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
