# FAZ IDE Desktop Wrapper

This folder contains the Electron wrapper for running FAZ IDE as a desktop app.

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
