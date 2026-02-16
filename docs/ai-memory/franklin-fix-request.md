# Franklin Fix Request

- Generated: 2026-02-15T13:52:50.364Z
- Failing command: npm run test
- Failure status: exit code 1

## Summary
- Reproduce with the exact command above.
- Fix only the first failing root cause.
- Re-run isolated gate, then re-run full target gate.

## Captured Output (stdout)
```text
Running 4 tests using 2 workers

[1/4] tests\ide.spec.js:3:1 ? loads the IDE shell with files and editor
[2/4] tests\release.spec.js:3:1 ? manifest is reachable and valid
[3/4] tests\release.spec.js:13:1 ? critical static assets are reachable
  1) tests\ide.spec.js:3:1 ? loads the IDE shell with files and editor ?????????????????????????????

    Error: expect(locator).toBeVisible() failed

    Locator:  locator('#fileList')
    Expected: visible
    Received: hidden
    Timeout:  5000ms

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for locator('#fileList')
        9 ? locator resolved to <ul id="fileList" role="listbox" class="file-list" aria-label="Saved files" aria-activedescendant="file-option-files-file-19c6193374f-841c">?</ul>
          - unexpected value "hidden"


       5 |
       6 |   await expect(page.locator("#appShell")).toBeVisible();
    >  7 |   await expect(page.locator("#fileList")).toBeVisible();
         |                                           ^
       8 |
       9 |   const hasEditorSurface = await page.evaluate(() => {
      10 |     return Boolean(document.querySelector(".CodeMirror") || document.querySelector("textarea"));
        at C:\Users\Juan_\Desktop\FAZ-IDE\tests\ide.spec.js:7:43

    Error Context: artifacts\test-results\ide-loads-the-IDE-shell-with-files-and-editor\error-context.md


[4/4] tests\ide.spec.js:18:1 ? theme selector switches value safely
  1 failed
    tests\ide.spec.js:3:1 ? loads the IDE shell with files and editor ??????????????????????????????
  3 passed (10.3s)
```

## Captured Output (stderr)
```text
(no output)
```

## Recovery Checklist
1. Identify failing stage and exact assertion/error text.
2. Apply minimal fix.
3. Re-run failing stage only.
4. Re-run `npm run test:quick` or `npm run test:all`.
