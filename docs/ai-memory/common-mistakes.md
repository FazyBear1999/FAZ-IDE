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
- Assuming a passing local run equals deploy-ready without gate outputs.

## Memory Mistakes
- Not documenting new decisions and regressions.
- Keeping memory docs shallow and losing implementation context.
- Storing sensitive values in docs.
