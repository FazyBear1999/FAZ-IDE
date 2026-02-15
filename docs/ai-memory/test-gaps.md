# Test Gaps

Track missing coverage that can cause regressions during release hardening.
Prioritize gaps that affect build determinism, privacy, rollback safety, and workspace integrity.

## High Priority

- Guard disk-full behavior in snapshot and restore flows.
- Verify rollback does not remove required source files when snapshot copy is partial.
- Expand checks for generated artifact cleanup under lock contention.

## Template

- Area:
- Missing test:
- Risk if untested:
- Suggested assertion:
- Owner:

