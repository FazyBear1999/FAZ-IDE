# FAZ IDE Release Checklist

Use this checklist for every website release.

## 1) Pre-release sync and tests

- Run: npm run preupload:safe
- Expected result: exit code 0
- This command runs:
  - sync + verify dist_site
  - full Playwright suite
  - SiteGround package preparation
  - SiteGround package verification

If this command fails, do not upload.

## 2) Upload package source

- Upload from: release/siteground/public_html
- Upload destination on host: public_html
- Choose overwrite/replace all when prompted.

Do not upload dist_site directly for final production release.

## 3) Immediate live-site checks

- Open the live site.
- Hard refresh (Ctrl+F5).
- Confirm HTML, CSS, and JS load correctly.
- Confirm core IDE actions work (open file, edit, run, console output).

## 4) If caching issues appear

- Clear SiteGround cache/CDN.
- Hard refresh again.

## 5) Release record

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
- Full QA + upload package verification (web + desktop + SiteGround): npm run test:all