# Known Issues

Use this file for active, user-visible or operator-relevant issues only.
Each issue should link to a checkpoint and decision context when applicable.

## Open

- 2026-02-18: Lessons theme shop strict unlock policy is not yet enforced globally.
  - Checkpoint ID: C6
  - Decision reference: 2026-02-18T23:59:00Z
  - Area: Lessons economy / theme unlock flow
  - Symptoms: Theme shop UI exists, but compatibility baseline keeps themes broadly unlocked; Bytes spending path is underutilized for many profiles.
  - Repro steps: Open Lessons > Shop and compare available buy actions across themes on a fresh profile.
  - Validation command: focused lesson/shop contracts in `tests/ide.spec.js`
  - Fix status: Open (requires strict-policy contract wave)

## Tracking Rules

- Include Checkpoint ID for any issue tied to roadmap execution.
- Include Decision reference when an issue appears after a behavior/safety choice.
- Include exact validation command that currently fails or recently passed after fix.
- Remove from Open only after reproducible verification.

## Resolved

- 2026-02-14: `npm test:all` command confusion; standardized usage to `npm run test:all`.

## Template

- Date:
- Checkpoint ID:
- Decision reference:
- Area:
- Symptoms:
- Repro steps:
- Validation command:
- Fix status:
