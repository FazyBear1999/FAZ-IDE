# Handoff Checklist

## Before You Start
- Read `project-context.md` and `feature-map.md`.
- Read latest entries in `decisions.md` and `known-issues.md`.
- Confirm target command path (`npm run test:quick` or `npm run test:all`).

## During Work
- Keep changes scoped and minimal.
- Add or update tests with each functional change.
- Record important decisions and regressions immediately.

## Before You End
- Run `npm run test:memory`.
- Run `npm run test:integrity`.
- Run target QA gate (`test:quick` or `test:all`).
- Update `release-notes.md` if deploy-impacting behavior changed.

## Session Summary Template
- Date:
- Goal:
- Files changed:
- Tests added/updated:
- Gate results:
- Open follow-ups:
