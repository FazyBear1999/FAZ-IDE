# Session Command Center

Use this as the default operating loop at the start of every AI session.

## 0) Prime Context (2-3 minutes)

1. Read in order:
   - `project-context.md`
   - `feature-map.md`
   - `agent-operations.md`
   - `decision-framework.md`
   - `roadmap-decision-map.md`
2. Check latest:
   - `decisions.md`
   - `known-issues.md`
   - `test-gaps.md`

## 1) Classify Work

Pick one primary class:

- Behavior change
- Safety/reliability change
- Recovery/ops change
- Docs-only governance change

Then assign risk tier:

- Low / Medium / High (per `agent-operations.md`)

## 2) Choose Path (Decision Gate)

Before editing, run a short decision pass:

- List at least 2 options.
- Score options using `decision-framework.md` rubric.
- Record selected option + assumptions + rollback trigger.

If no clear validation path exists, do not proceed.

## 3) Execute in Small Units

- Keep changes minimal and reversible.
- For roadmap work, bind each change to checkpoint ID (`C1`, `C2`, etc.) from `roadmap-decision-map.md`.
- After each meaningful unit, update memory files immediately.

## 4) Validate by Risk

Minimum command ladder:

- Always after memory edits: `npm run test:memory`
- Medium risk baseline: `npm run test:integrity` + focused Playwright tests
- High risk or unresolved focused failures: `npm run frank:full`

If any focused test fails and cannot be resolved quickly, escalate risk tier and run full gate.

## 5) Sync Memory Before Handoff

Required sync checks:

- `decisions.md` entry exists for behavior/safety choices.
- `release-notes.md` updated if operator-facing or release-risk impact exists.
- `test-gaps.md` and `known-issues.md` carry checkpoint IDs where applicable.
- `error-catalog.md` includes deterministic fix path for new failure modes.

## 6) Session Exit Contract

Do not end session until all are true:

- Validation evidence is recorded (commands actually run).
- Open risks are explicit and actionable.
- Rollback direction is documented for risky changes.
- No contradictory statements across memory files.

## Fast Command Set

- AI command center (read-only): `npm run ai:command-center`
- AI command center (save brief): `npm run ai:command-center -- --write-session-brief`
- Memory validation: `npm run test:memory`
- Integrity gate: `npm run test:integrity`
- Quick gate: `npm run test:quick`
- Full gate: `npm run test:all`
- Franklin full: `npm run frank:full`

## Non-Negotiable Defaults

- Safety and testability beat speed.
- Root-cause fixes beat cosmetic patches.
- No behavior change ships without focused validation.
