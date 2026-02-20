# Changelog

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
