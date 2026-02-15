# Recovery Playbook

Use this playbook when release validation fails or when a local state regression needs fast containment.
Focus on reproducibility first, then minimal safe correction.

## Rapid Triage

- Capture the exact failing command and output.
- Confirm whether the failure is deterministic.
- Check disk space, lock contention, and corrupted files before deeper debugging.

## Failed Release Gate

- Run `npm run test:all:contract` to confirm pipeline shape.
- Run targeted gates one-by-one to isolate the failing stage.
- If Franklin rollback is involved, verify snapshot integrity before restore.

## Recovery Log Template

- Date (UTC):
- Failing command:
- Error summary:
- Root cause:
- Fix applied:
- Validation commands re-run:
- Final status:

