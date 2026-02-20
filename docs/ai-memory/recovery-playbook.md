# Recovery Playbook

Use this playbook when release validation fails or when a local state regression needs fast containment.
Focus on reproducibility first, then minimal safe correction.

## Rapid Triage

- Capture the exact failing command and output.
- Confirm whether the failure is deterministic.
- Check disk space, lock contention, and corrupted files before deeper debugging.
- Identify first failing gate stage before editing any code.
- Prefer smallest reversible fix that restores contract behavior.

## Containment Priorities

- Freeze scope: avoid opportunistic refactors while recovering.
- Preserve evidence: keep failing logs and stage output paths.
- Protect release artifacts: do not overwrite unknown-good outputs until diagnosis is clear.
- Isolate root cause before applying broad changes.

## Failed Release Gate

- Run `npm run test:all:contract` to confirm pipeline shape.
- Run targeted gates one-by-one to isolate the failing stage.
- If Franklin rollback is involved, verify snapshot integrity before restore.
- Re-run the failing stage first after each fix; avoid noisy full reruns until stage is stable.
- Promote to `frank:full` only after isolated failure is resolved.

## Rollback Rules

- Roll back immediately when a fix introduces unrelated failures.
- Favor deterministic known-good state over speculative patches.
- Document rollback reason in session summary and decisions log when impactful.

## Post-Recovery Hardening

- Add or update a focused regression test for the recovered failure mode.
- Update `error-catalog.md` if a new signature was discovered.
- Update `test-gaps.md` when hardening is still incomplete.

## Memory Drift Recovery

- If incident fixes changed behavior, append a same-session decision entry before ending work.
- Reconcile `release-notes.md` and `known-issues.md` so status is not contradictory.
- Prefer one explicit rollback note over scattered partial references.
- Run `npm run test:memory` after recovery edits to ensure required-memory contract remains valid.

## Recovery Log Template

- Date (UTC):
- Failing command:
- Error summary:
- Root cause:
- Fix applied:
- Validation commands re-run:
- Final status:
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
