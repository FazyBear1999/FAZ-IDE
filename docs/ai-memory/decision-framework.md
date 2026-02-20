# Decision Framework

Use this framework when choosing between implementation paths, roadmap options, or risk-handling strategies.

## Goal

- Make AI decisions repeatable, testable, and easy to audit.
- Prevent “fast but vague” decisions that create regressions later.

## Decision Record Format

- Decision ID: short label (example: `D-2026-02-17-center-reset-preset`)
- Context: what changed and why now
- Options considered: at least 2 realistic paths
- Selected option: one path only
- Rejected options: why they were not selected
- Assumptions: explicit assumptions that must hold
- Validation plan: focused checks + gate level
- Rollback trigger: concrete conditions that force rollback

## Scoring Rubric (1-5)

Score each candidate option:

- Safety impact (regression risk)
- User value (direct experience improvement)
- Reversibility (easy rollback)
- Testability (clear deterministic assertions)
- Maintenance cost (future complexity)

Use weighted bias:

- Safety and Testability are tie-breakers over raw speed.
- If Safety < 3 or Testability < 3, option is blocked unless emergency patch.

## Go / No-Go Rules

- **Go** when selected option has:
  - explicit validation plan,
  - rollback trigger,
  - no unresolved critical assumptions.
- **No-Go** when:
  - assumptions are unverified and high-risk,
  - validation path is undefined,
  - rollback cannot be scoped to a single change unit.

## Assumption Handling

- Tag each assumption as `verified`, `partially-verified`, or `unverified`.
- Any `unverified` assumption touching runtime/safety moves change to medium/high risk.

## Decision-to-Roadmap Link

- Every Tier A roadmap item must reference:
  - one decision entry,
  - one test gap or regression contract,
  - one rollback note.

## Session Minimum

For every meaningful behavior/safety change:

1. Record the option choice using this framework.
2. Add validation evidence command.
3. Add rollback trigger sentence.
4. Cross-link to `decisions.md` and one supporting file.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
