# FAZ IDE Desktop Wrapper

This folder contains the Electron wrapper for running FAZ IDE as a desktop app.

## Current status

- Desktop maintenance is paused while browser quality/stability is prioritized.
- Keep this wrapper as optional/open-source support, not part of default release gates.

## Why this is the safe path

- Your existing web app code stays in `dist_site/`.
- Electron only hosts that folder on a local in-app server.
- No rewrite of the IDE runtime, workers, or service behavior.

## Commands

- Run desktop app locally: `npm run desktop`
- Generate desktop icons from `assets/icons`: `npm run desktop:icon`
- Build unpacked desktop bundle: `npm run desktop:pack`
- Build Windows installer: `npm run desktop:dist`

## Notes

- Keep `dist_site/` up to date before packaging.
- Desktop mode does not require starting `scripts/serve.js`.
- Web release uploads are prepared from `release/siteground/public_html` using `npm run deploy:siteground`.
- For production web deploys, set `SITE_URL` first so packaged canonical/OG/sitemap URLs are stamped correctly.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
