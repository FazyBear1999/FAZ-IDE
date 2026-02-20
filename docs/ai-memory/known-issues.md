# Known Issues

Use this file for active, user-visible or operator-relevant issues only.
Each issue should link to a checkpoint and decision context when applicable.

## Open

- None currently recorded.

## Tracking Rules

- Include Checkpoint ID for any issue tied to roadmap execution.
- Include Decision reference when an issue appears after a behavior/safety choice.
- Include exact validation command that currently fails or recently passed after fix.
- Remove from Open only after reproducible verification.

## Resolved

- 2026-02-14: `npm test:all` command confusion; standardized usage to `npm run test:all`.
- 2026-02-18: Lessons theme shop strict unlock policy enforced globally.
  - Checkpoint ID: C6
  - Decision reference: 2026-02-18T23:59:00Z
  - Area: Lessons economy / theme unlock flow
  - Resolution summary: Theme unlock baseline now defaults to `DEFAULT_THEME` only; locked theme selection remains gated until unlock.
  - Validation command: `npx playwright test tests/ide.spec.js --grep "lesson shop keeps premium themes locked on a fresh profile|lesson shop buy flow deducts bytes and allows re-apply after unlock"`
  - Fix status: Closed

## Template

- Date:
- Checkpoint ID:
- Decision reference:
- Area:
- Symptoms:
- Repro steps:
- Validation command:
- Fix status:
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
