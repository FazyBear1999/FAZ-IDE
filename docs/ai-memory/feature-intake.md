# Feature Intake

## Purpose
- Structured feature requests for AI sessions.
- Makes scope and acceptance criteria explicit before implementation.

## Workflow
- Add entries with `npm run ai:feature -- "<short summary>"`.
- Fill in value, scope boundaries, risks, and test plan before handing to AI.

## Entry Template
- Outcome
- User Value
- Scope (In / Out)
- UX Notes
- Technical Plan
- Options Considered (at least 2)
- Selected Option + Why
- Assumptions (verified/partial/unverified)
- Risks
- Definition of Done
- Test Plan
- Gate Level (`test:memory` / `test:integrity` / `frank:full`)

## Active Intake — 2026-02-18 — Master Teaching IDE Program (Grid + Files + Ghost Lessons)

- Outcome
- Deliver a master-grade teaching IDE foundation that feels like a real toolchain first, then layer ghost-text lessons and game curriculum on top.

- User Value
- Beginners build real file-based projects (especially games) with clear progress and recoverability; advanced users keep credible IDE workflows.

- Scope (In / Out)
- In: command registry, state separation, filesystem recovery model, deterministic runtime context, CM6 lesson architecture, lesson assist ladder, inspector/overlay pathing, reproducibility bundles.
- Out (first increment): full AI tutor auto-writing, final polish of every panel, non-web language runtime expansion.

- UX Notes
- Keep square/grid language and tool-heavy layout intact.
- No dead-ends in lesson flow; checkpoint-first feedback cadence.

- Technical Plan
- Start with Phase 0 architecture spine from `docs/MASTER_ROADMAP.md`, then build lesson runtime on stable command/state/journal primitives.

- Options Considered (at least 2)
- Option A: Build ghost lesson system immediately in current architecture.
- Option B: Build architecture spine first, then lesson system.

- Selected Option + Why
- Option B selected: reduces long-term regressions and avoids rework across filesystem, diagnostics, and runtime reproducibility.

- Assumptions (verified/partial/unverified)
- Verified: product direction, CM6 target, and teaching/game-first goals are aligned in roadmap/context docs.
- Partial: exact sequencing between deterministic runtime and inspector overlays.

- Risks
- Over-parallelizing foundation and lesson UX could create drift between runtime and pedagogy layers.

- Definition of Done
- Checkpointed rollout with decision evidence for architecture spine and lesson engine milestones.

- Test Plan
- Focused IDE/import/filesystem tests + lesson-engine unit/contract tests + integrity/memory gates each checkpoint.

- Gate Level (`test:memory` / `test:integrity` / `frank:full`)
- `test:integrity` minimum per checkpoint; `frank:full` at phase boundary merges.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
