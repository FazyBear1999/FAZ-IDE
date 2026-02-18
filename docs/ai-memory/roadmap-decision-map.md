# Roadmap Decision Map

This map binds roadmap execution to explicit decision checkpoints.

## Why this exists

- Optimization waves are easy to start but hard to govern without decision gates.
- This file makes each roadmap step require a decision record + validation evidence.

## Decision Checkpoint Contract

For each roadmap step:

- Checkpoint ID
- Scope boundary (in/out)
- Decision reference (`decisions.md` entry)
- Validation minimum (focused + required gate)
- Rollback trigger

No checkpoint is complete without all five fields.

## Active Checkpoints

### C1 — App orchestration decomposition (`optimization-map` A1)
- Scope boundary: helper extraction only, no runtime behavior drift.
- Decision reference: required before first move.
- Validation minimum: focused contract tests + `test:integrity`.
- Rollback trigger: any run-token/sandbox message mismatch.
- Status note: initial extraction slice completed (`ui/fileIcons.js` boundary from `app.js`).

### C2 — Runtime validation simplification (`optimization-map` A2)
- Scope boundary: marker/copy simplification only; no new runtime branches.
- Decision reference: required before template edits.
- Validation minimum: focused runtime app checks + marker assertions.
- Rollback trigger: ambiguous pass/fail markers or nondeterministic status text.

### C3 — Filesystem hardening (`optimization-map` A3)
- Scope boundary: reversible file operations only.
- Decision reference: required before rename/move/trash flow edits.
- Validation minimum: focused file workflow tests + `test:integrity`.
- Rollback trigger: any data-loss risk or restore path inconsistency.

### C4 — Repo organization program (`optimization-map` A4)
- Scope boundary: structure/path updates only unless explicitly approved.
- Decision reference: one entry per major change batch.
- Validation minimum: focused checks per major change + full gate at 3-change checkpoint.
- Rollback trigger: unresolved path drift or release-script breakage.

## Exit Rule

- Before handoff, each touched checkpoint must include:
  - decision link,
  - command evidence,
  - open risk note or explicit “none observed.”

## Cross-File Sync Rule

- `test-gaps.md`: every open gap must include a checkpoint ID.
- `known-issues.md`: every open issue tied to roadmap work must include checkpoint + validation command.
- `error-catalog.md`: new significant failures should carry checkpoint ID when applicable.
