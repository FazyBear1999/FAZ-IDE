# Handoff Checklist

## Before You Start
- Read `project-context.md` and `feature-map.md`.
- Read `agent-operations.md` and `optimization-map.md`.
- Read latest entries in `decisions.md` and `known-issues.md`.
- Confirm target command path (`npm run test:quick` or `npm run test:all`).
- Confirm current scope boundaries (JS/HTML/CSS runtime only).

## During Work
- Keep changes scoped and minimal.
- Add or update tests with each functional change.
- Record important decisions and regressions immediately.
- Track risk tier (low/medium/high) and match validation depth accordingly.

### Decision Loop (per meaningful change)
- Classify: behavior, safety, recovery, or docs-only.
- Log one entry in `decisions.md` using Template fields.
- Add/update one supporting memory file when needed (`release-notes.md`, `recovery-playbook.md`, `test-gaps.md`, or `error-catalog.md`).
- Attach command evidence before moving to next change.

## Before You End
- Run `npm run test:memory`.
- Run `npm run test:integrity`.
- Run target QA gate (`test:quick` or `test:all`).
- Update `release-notes.md` if deploy-impacting behavior changed.
- Update `decisions.md` for behavior, architecture, or safety-policy changes.
- If anything failed during session, update `recovery-playbook.md` or `known-issues.md`.
- Make open risks explicit; do not imply green status without command evidence.

### Session-close sync
- Confirm latest `decisions.md` entry has matching validation evidence.
- Confirm no contradictory statements across `release-notes.md`, `test-gaps.md`, and `known-issues.md`.
- Leave next-step follow-up as an action, not a generic note.

## Session Summary Template
- Date:
- Goal:
- Files changed:
- Tests added/updated:
- Gate results:
- Open follow-ups:
- Risk tier:
- Rollback note:
