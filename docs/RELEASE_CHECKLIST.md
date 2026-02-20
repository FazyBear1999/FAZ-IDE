# FAZ IDE Release Checklist

Use this checklist for every website release.

## 0) Version + domain inputs (required)

- Confirm release version in `package.json`.
- Confirm production domain URL (example: `https://yourdomain.com`).
- Export domain for package prep in the same terminal session:
  - PowerShell: `$env:SITE_URL = "https://yourdomain.com"`

## 1) Pre-release sync and tests

- Run: npm run preupload:safe
- Expected result: exit code 0
- This command runs:
  - sync + verify dist_site
  - full Playwright suite
  - SiteGround package preparation
  - SiteGround package verification

If this command fails, do not upload.

## 1b) Final full gate (recommended before production)

- Run: npm run test:all
- Expected result: all gates pass, including SiteGround package verification and privacy validation.

## 1c) Franklin full orchestration (recommended)

- Run: npm run frank:full
- Expected result: all FRANKLEEN stages pass and upload source reports as `release/siteground/public_html`.

## 2) SEO + metadata checks

- Confirm `index.html` has:
  - `meta description`
  - `meta robots`
  - canonical link
  - Open Graph tags (`og:title`, `og:description`, `og:url`, `og:image`)
  - Twitter tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)
- Confirm `manifest.webmanifest` has PNG + SVG icons and valid `start_url/scope/display`.
- Confirm `robots.txt` exists and references `/sitemap.xml`.
- Confirm `sitemap.xml` exists and uses production domain URL.

## 3) Icon checks

- Confirm files exist:
  - `favicon.ico`
  - `assets/icons/faz-192.png`
  - `assets/icons/faz-512.png`
  - `assets/icons/faz-192.svg`
  - `assets/icons/faz-512.svg`
- Confirm head links in `index.html` reference PNG icons and touch icon.

## 4) Upload package source

- Upload from: release/siteground/public_html
- Upload destination on host: public_html
- Choose overwrite/replace all when prompted.

Do not upload dist_site directly for final production release.

## 5) Immediate live-site checks

- Open the live site.
- Hard refresh (Ctrl+F5).
- Confirm HTML, CSS, and JS load correctly.
- Confirm core IDE actions work (open file, edit, run, console output).

## 6) SEO crawl sanity checks

- Visit `/robots.txt` on live site and confirm sitemap line.
- Visit `/sitemap.xml` and confirm production domain in `<loc>`.
- Use a social preview debugger (Open Graph/Twitter) for homepage URL.
- Confirm homepage title/description snippets look correct in an SEO preview tool.

## 7) If caching issues appear

- Clear SiteGround cache/CDN.
- Hard refresh again.

## 8) Release record

- Add a short entry to docs/CHANGELOG.md:
  - date
  - summary of shipped changes
  - any notable deployment notes

## Quick Commands

- Full safe release gate: npm run preupload:safe
- AI memory gate: npm run test:memory
- Test integrity gate: npm run test:integrity
- Package only: npm run deploy:siteground
- Verify package only: npm run verify:siteground
- Franklin full orchestration: npm run frank:full
- Full QA + upload package verification (web + SiteGround): npm run test:all
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
