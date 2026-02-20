# FAZ IDE v0.2.0 — Detailed Release Notes

Release date: 2026-02-18

## Highlights

- Lessons experience upgraded with a dedicated `Lessons` modal, live session metrics, and a new local-only `Bytes` progression loop.
- Theme economy foundation added: earn Bytes from lesson milestones and unlock/apply themes from the in-app shop.
- UX smoothness and safety improved with throttled HUD/haptic feedback, active-session-only live polling, and lower-overhead lesson shop updates.
- Release pipeline hardened end-to-end with Franklin full-gate parity, stronger contracts, SEO metadata upgrades, and SiteGround packaging validation.
- Open-source ops documentation expanded with a launch-grade checklist, deployment safety notes, and synchronized AI memory governance.

## What’s New

### 1) Lessons + Economy

- Added a new `Lessons` modal with:
  - `Overview` tab (level, XP, Bytes, pace, accuracy, streak, live elapsed/session stats)
  - `Shop` tab (theme unlock/apply actions and affordability state)
- Added local-only `Bytes` progression:
  - Step completion rewards
  - Lesson completion rewards
  - Perfect completion bonus
  - Streak milestone rewards
- Added theme unlock state to lesson profile persistence with backward-compatible sanitization.

### 2) Lessons UX + Performance

- Reduced avoidable UI churn by making shop rendering visibility-aware and tab-aware.
- Added throttles for HUD pulse and haptic calls to prevent feedback spam during rapid input bursts.
- Added professionalized HUD copy and cleaner momentum/burst labels.
- Added level-up editor celebration and improved compact HUD readability.

### 3) Reliability + Safety

- Hardened `fresh-start confirm` reset path:
  - Locks persistence writes during reset
  - Clears local/session storage, caches, service workers, and IndexedDB
- Improved session/state persistence safeguards to avoid writes during reset windows.

### 4) Release + Deployment Hardening

- `frank:full` now includes CSS gate parity and safer script-name-based parallel grouping.
- Added SEO/crawler assets and metadata coverage:
  - canonical + Open Graph + Twitter metadata
  - `robots.txt` and `sitemap.xml`
  - PNG icon variants for web/manifest contexts
- Added domain-aware SiteGround packaging in `deploy:siteground`:
  - Use `SITE_URL` to stamp canonical, `og:url`, and sitemap `<loc>` in package output.

### 5) Docs + Governance

- Expanded release runbook to a launch-grade checklist (`docs/RELEASE_CHECKLIST.md`).
- Updated README/docs with production `SITE_URL` deployment contract.
- Synchronized AI memory docs (`decisions`, `release-notes`, `handoff`, `session command center`, common mistakes, error catalog, roadmap mapping, and related context files).

## Validation Summary

The release wave passed the project’s safety and release contracts:

- `npm run frank:full` ✅ (14/14 stages)
- `npm run test -- tests/release.spec.js` ✅ (10/10)
- `npm run test:memory` ✅

## Open Items / Known Follow-up

- Strict global theme-unlock policy remains intentionally staged for a dedicated policy wave.
- Current known issue is tracked in `docs/ai-memory/known-issues.md` under checkpoint `C6`.

## Upgrade / Deployment Notes

### For maintainers

1. Run full release gate:
   - `npm run frank:full`
2. Set production URL in PowerShell before package prep:
   - `$env:SITE_URL = "https://yourdomain.com"`
3. Build SiteGround package:
   - `npm run deploy:siteground`
4. Verify package:
   - `npm run verify:siteground`
5. Upload from:
   - `release/siteground/public_html`

### For contributors

- No secrets or telemetry paths were introduced in this release.
- Lessons progression and profile state remain local-only.
- Contracts and guardrails were expanded; run `npm run test:memory` and `npm run test:integrity` for docs/policy-sensitive changes.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
