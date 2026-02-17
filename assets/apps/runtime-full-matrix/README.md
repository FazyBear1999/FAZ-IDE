# Runtime Full Matrix Report

Use this app to prove every language path in FAZ IDE is working.

## Files to run

1. `index.html` (entry)
   - Checks HTML + linked JavaScript in sandbox.
2. `matrix.css`
   - Checks CSS preview pipeline and visible style markers.
3. `main.py`
   - Checks Python stdout, stderr, and final done marker.

## Expected result

- You should see `runtime-full-matrix:*` markers in Console.
- HTML run should show `runtime-full-matrix:...:html-js:done`.
- CSS run should show `runtime-full-matrix:css:step-01` and `step-02` marker banners in Sandbox.
- Python run should finish with `runtime-full-matrix:python:...:done`.

## Quick pass/fail

- PASS: all four language checks show their done/step markers.
- FAIL: any marker is missing or run status is not `Ran`.
