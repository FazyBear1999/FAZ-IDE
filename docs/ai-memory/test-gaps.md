# Test Gaps

Track missing coverage that can cause regressions during release hardening.
Prioritize gaps that affect build determinism, privacy, rollback safety, and workspace integrity.

## High Priority

- Guard disk-full behavior in snapshot and restore flows.
- Expand checks for generated artifact cleanup under lock contention.
- Add a deterministic regression that simulates partial snapshot payloads and verifies rollback behavior without relying on live filesystem lock timing.

## Recently Closed

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
