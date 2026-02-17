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

- Add timeout-path regression asserting stale worker responses are ignored after forced worker restart.
- Add CDN-failure regression asserting Python runtime load errors surface clear user-facing diagnostics without breaking subsequent JS/HTML runs.
- Add `.py` workspace import/export lifecycle test (active tab + status bar language + rerun continuity) for file-system parity confidence.
- Add Python syntax token granularity checks (comment/string/number classes) across available themes.

## Recently Closed

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
