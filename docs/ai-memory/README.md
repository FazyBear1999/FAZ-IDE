# AI Memory for FAZ IDE

This folder stores operational memory that helps keep releases stable and recoverable.
Treat it as a lightweight runbook for daily development and emergency fixes.

## Update flow (quick)

- Update the relevant memory file after meaningful changes.
- Keep entries concise, factual, and timestamped when useful.
- Prefer appending new entries over rewriting history.
- If behavior changed, update `decisions.md` and at least one of (`feature-map.md`, `test-gaps.md`, `release-notes.md`).
- If only docs changed, record why the docs-only change improves safety or clarity.
- If deploy packaging changed, record `SITE_URL` expectations and packaged-output verification evidence.

## Fast decision loop

- Classify change once: behavior, safety, recovery, or docs-only.
- Write one minimal decision entry with `Decision`, `Why`, and `Follow-up`.
- Link validation evidence by command family (focused tests, contract gate, or release gate).
- Mirror release impact in `release-notes.md` only when operator-facing behavior or release risk changed.
- Close with unresolved risk notes instead of implied green status.

### Entry shortcuts

- **Behavior change:** `decisions.md` + `release-notes.md` + focused test proof.
- **Safety/recovery change:** `decisions.md` + (`recovery-playbook.md` or `error-catalog.md`) + rerun evidence.
- **Docs-only governance change:** `decisions.md` + short rationale + `test:memory` result.

## Rules

- Do not store secrets, credentials, or private tokens.
- Keep references path-relative and deterministic.
- Record failures with exact failing command names when possible.
- Treat memory as release-critical: stale or vague docs are considered defects.
- Prefer invariant language for contracts (what must always be true).
- Keep entries actionable: include owner-facing follow-up tasks, not vague notes.

## Quality Bar

- **Accuracy first**: memory must match current implementation and test behavior.
- **Decision traceability**: major changes require `Decision`, `Why`, and `Follow-up`.
- **Recovery readiness**: common failures should map to clear triage + rollback steps.
- **Test alignment**: any behavioral change must reference focused validation.
- **Drift control**: remove stale references quickly after scope shifts.

## Freshness contract

- Update memory in the same session as code changes.
- At session end, verify `test:memory` passes and unresolved risks are explicit.
- Never leave contradictory statements across memory files.

## Required files

- `project-context.md`
- `feature-map.md`
- `decisions.md`
- `known-issues.md`
- `common-mistakes.md`
- `error-catalog.md`
- `franklin-fix-request.md`
- `recovery-playbook.md`
- `test-gaps.md`
- `release-notes.md`
- `handoff-checklist.md`

## Agent orientation (recommended)

- `agent-operations.md` for cross-agent operating contract and safe workflow.
- `optimization-map.md` for prioritized, risk-aware optimization targets.
- `file-organization-playbook.md` for phased, rollback-safe repository reorganization.
- `file-organization-wave-map.md` for concrete major-change sequencing and full-gate checkpoints.
- `script-family-inventory.md` for canonical script ownership, command naming, and path-reference governance.
- `decision-framework.md` for repeatable option scoring, go/no-go, and rollback criteria.
- `roadmap-decision-map.md` for binding roadmap checkpoints to decisions and validation gates.
- `session-command-center.md` for a one-page, start-to-finish AI operating loop each session.

