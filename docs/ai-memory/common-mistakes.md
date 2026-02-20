# Common Mistakes

## Command Mistakes
- Running `npm test:all` instead of `npm run test:all`.
- Running commands in PowerShell with restricted script policy without `cmd /c` fallback.
- Forgetting that local pre-existing server can conflict unless Playwright reuses server.

## Testing Mistakes
- Leaving focused tests (`.only`) or skipped tests (`.skip`, `.fixme`).
- Writing tests that pass only because of fixed sleeps (`waitForTimeout`).
- Relying on helper assertions without direct assertions in the test body.
- Adding tests without integrating them into release gates.

## Release Mistakes
- Uploading from the wrong source folder (must use `release/siteground/public_html`).
- Skipping package verification before upload.
- Forgetting to set `SITE_URL` before `npm run deploy:siteground` for production web cutover.
- Assuming a passing local run equals deploy-ready without gate outputs.

## Memory Mistakes
- Not documenting new decisions and regressions.
- Keeping memory docs shallow and losing implementation context.
- Storing sensitive values in docs.

## Product Direction Mistakes
- Treating "beginner-friendly" as "remove tools" instead of adding guidance and safer defaults.
- Shipping destructive file actions without clear undo/trash recovery paths.
- Adding features that hide state/errors instead of making them observable and teachable.

## Editor QoL Mistakes
- Adding keyboard actions without focused regression tests for both positive and negative/edge cases.
- Implementing smart typing behaviors that over-trigger (e.g., invalid auto-closing on void/declaration tags).
- Introducing power features without shortcut discoverability updates (help panel/title/hints).
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
