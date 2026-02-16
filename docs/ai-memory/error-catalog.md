# Error Catalog

## Runtime and Build Errors
- Error: `http://localhost:4173 is already used`
  - Meaning: Playwright web server collision with existing process.
  - Fix: Use `reuseExistingServer: !process.env.CI` in Playwright config and rerun.

- Error: `npm.ps1 cannot be loaded because running scripts is disabled`
  - Meaning: PowerShell execution policy blocks npm shim.
  - Fix: Run commands via `cmd /c npm run <script>`.

## Test and Release Errors
- Error: `Unknown command: test:all`
  - Meaning: npm custom scripts require `run`.
  - Fix: Use `npm run test:all`.

- Error: `test integrity verification failed`
  - Meaning: Banned pattern/trivial assertion/missing assertion detected.
  - Fix: Remove banned pattern and add meaningful direct assertions.

- Error: `SiteGround package verification failed`
  - Meaning: Required file/dir missing in package output.
  - Fix: Run `npm run deploy:siteground`, then `npm run verify:siteground`, inspect missing path report.

- Error: `Missing source directory: assets/apps`
  - Meaning: `sync:dist-site` map expects `assets/apps` but source directory was missing.
  - Fix: Restore or recreate `assets/apps` (and expected app files), then rerun `npm run sync:dist-site`.

- Error: `/assets/js/app.js should be reachable` after `npm run test:frank:safety`
  - Meaning: Workspace assets were mutated before Playwright stage, causing static asset 404s and cascading UI test failures.
  - Fix: Restore `assets/*` from a known-good snapshot/package and run patched Franklin safety flow that preserves assets.

## When adding new errors
- Add exact error text.
- Add clear meaning in one line.
- Add deterministic fix steps.

- 2026-02-14: Franklin rescue generated docs/ai-memory/franklin-fix-request.md for failing script npm run definitely-not-a-real-script

- 2026-02-14: Franklin rescue generated docs/ai-memory/franklin-fix-request.md for failing script npm run test:all

- 2026-02-15: Franklin rescue generated docs/ai-memory/franklin-fix-request.md for failing script npm run test:integrity

- 2026-02-15: franklin-safety-1771131011986

- 2026-02-15: Guardian rollback restored snapshot 1771163555193-guardian-preflight after gate failure

- 2026-02-15: Guardian failure generated docs/ai-memory/franklin-fix-request.md for npm run test
