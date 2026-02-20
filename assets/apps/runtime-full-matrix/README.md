# Runtime Full Matrix Report

Use this app to prove every language path in FAZ IDE is working.

## Files to run

1. `index.html` (entry)
   - Checks HTML + linked JavaScript in sandbox.
2. `matrix.css`
   - Checks CSS preview pipeline and visible style markers.

## Expected result

- You should see `runtime-full-matrix:*` markers in Console.
- HTML run should show `runtime-full-matrix:...:html-js:done`.
- CSS run should show `runtime-full-matrix:css:step-01` and `step-02` marker banners in Sandbox.

## Quick pass/fail

- PASS: all language checks show their done/step markers.
- FAIL: any marker is missing or run status is not `Ran`.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
