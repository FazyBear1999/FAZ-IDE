# Optimization Map (Safe-First)

This map helps AI agents pick high-value optimization work with controlled risk.

## Tier A: High Value + Medium Risk

### A1. Run Orchestration Decomposition (`assets/js/app.js`)
- Why: large run-path logic is high-churn and regression-prone.
- Safe tactic:
  - Extract helper boundaries without changing behavior.
  - Keep token/run-context semantics unchanged.
  - Add/maintain targeted runtime lifecycle tests.

### A2. Dev Terminal Command Clarity
- Why: command UX affects support/debug speed.
- Safe tactic:
  - Add explicit usage/help lines and deterministic command outputs.
  - Keep command allowlist strict; block privileged/eval paths.
  - Test command output contracts.

### A3. Python Runtime Diagnostics
- Why: blocked CDN/startup cases can look like silent failures.
- Safe tactic:
  - Prefer progressive diagnostics (start, loading, blocked hint, timeout).
  - Keep error messages actionable and short.
  - Verify fallback behavior for subsequent JS/HTML runs after Python failures.

## Tier B: Medium Value + Low Risk

### B1. Memory Doc Navigation
- Why: improves AI session consistency and reduces repeated missteps.
- Safe tactic:
  - Add cross-links and clear ownership of each memory file.
  - Keep required file contract intact.

### B2. Decision Log Quality
- Why: future agents rely on rationale, not just outcome.
- Safe tactic:
  - Keep entries timestamped and explicit (`Decision`, `Why`, `Follow-up`).
  - Avoid rewriting historical entries; append new deltas.

## Tier C: High Risk (Only with Strong Test Plan)

### C1. Persistence/Snapshot/Import Paths
- Risk: data loss or inconsistent workspace recovery.
- Requirement:
  - Add deterministic tests for failure paths before refactors.

### C2. Franklin Orchestration Contracts
- Risk: false green gates or skipped safety checks.
- Requirement:
  - Preserve stage ordering and contract verifiers.
  - Validate with full gate after changes.

## Optimization Readiness Checklist
- Is the target behavior currently covered by tests?
- Can the change be split into helper extraction first, behavior change second?
- Is rollback straightforward if a gate fails?
- Are memory docs updated to reflect the new architecture boundary?
