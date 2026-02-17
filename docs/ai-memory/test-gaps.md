# Test Gaps

Track missing coverage that can cause regressions during release hardening.
Prioritize gaps that affect build determinism, privacy, rollback safety, and workspace integrity.

## High Priority

- Guard disk-full behavior in snapshot and restore flows.
- Expand checks for generated artifact cleanup under lock contention.
- Add a deterministic regression that simulates partial snapshot payloads and verifies rollback behavior without relying on live filesystem lock timing.

## Editor-Focused Next Gaps

- Add malformed HTML resilience tests for paired-tag rename and close-tag completion (mismatched nesting, incomplete tags, comment/script/style boundaries).
- Add textarea fallback parity tests for editor QoL shortcuts (duplicate/move/comment/delete) where multi-cursor is unavailable.
- Add multi-cursor safety tests for comment toggling, line move/duplicate behavior, and `Ctrl/Cmd+D` overlap/wrap-around cases to ensure deterministic selection outcomes.

## Python Runtime Next Gaps

- Add regression/contract check that validates required local Pyodide bundle files are present when offline-first Python mode is expected.
- Add timeout-path regression asserting stale worker responses are ignored after forced worker restart.
- Add CDN-failure regression asserting Python runtime load errors surface clear user-facing diagnostics without breaking subsequent JS/HTML runs.
- Add `.py` workspace import/export lifecycle test (active tab + status bar language + rerun continuity) for file-system parity confidence.
- Add Python syntax token granularity checks (comment/string/number classes) across available themes.
- Add regression that validates long-running Python `time.sleep`/streamed output UX with explicit loading status expectations on first-run Pyodide cold boot.
- Add regression ensuring Python-like source warnings in non-`.py` files are surfaced consistently in user-visible diagnostics/log channels.

## Recently Closed

- Added local-first Python runtime provisioning scripts (`python:runtime:setup`, `python:runtime:verify`) and multi-source runtime diagnostics (`local-bundle`, `cdn-jsdelivr`, `cdn-unpkg`) surfaced through Dev Terminal `python-check`.
- Added regression asserting Python startup log message appears before worker execution output in standard run flow.
- Added Python lifecycle diagnostics regressions covering delayed startup notice and explicit no-output completion guidance.
- Added Applications-tab runtime validation coverage: catalog presence + load/run assertions across JS/HTML/CSS/Python runtime probe templates.
- Added CSS token contract coverage that enforces no raw color literals in component/layout CSS layers.
- Stabilized run-context regression by asserting deterministic user-visible run-context evidence (seed/dt + marker) instead of flaky cross-window capture timing.
- Added Python console-channel regression verifying mocked runtime stdout/stderr forwarding and runtime-error surfacing in the virtual console/status flow.
- Added Python timeout-and-recovery regression ensuring subsequent JS runs still execute after Python timeout errors.
- Added Python syntax-mode regression verifying CodeMirror emits token classes for `.py` files using current theme token colors.
- Added deterministic Playwright coverage for Python Phase 1 integration (`.py` filesystem language/icon wiring + safe mocked runtime output path).
- Added Playwright coverage for new editor shortcuts: duplicate line up (`Alt+Shift+ArrowUp`), delete line/block (`Ctrl/Cmd+Shift+K`), and deterministic select-next-occurrence (`Ctrl/Cmd+D`).
- Added Playwright coverage that verifies the Dev Terminal runs safe commands and blocks disabled privileged eval commands.
- Hardened Franklin snapshot copy/restore handling and safety-check cleanup so `test:frank:safety` no longer removes `assets/*` before the Playwright gate.
- Added Playwright coverage that verifies oversized workspace imports are safety-capped (file/trash count and active code length).
- Added Playwright coverage that verifies logger output is bounded and trims older lines under high-volume logging.
- Added runtime hardening regression coverage for sandbox message trust gates: spoofed parent-window `postMessage` payloads are ignored even when they reuse a captured valid run token.
- Added sandbox payload safety regression coverage for console argument-count and message-length truncation paths to guard log-spam behavior.

## Template

- Area:
- Missing test:
- Risk if untested:
- Suggested assertion:
- Owner:
