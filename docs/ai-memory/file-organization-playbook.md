# File Organization Playbook (Safe-First)

Use this playbook for large repository organization work (moves, renames, grouping, archive cleanup).
Goal: improve structure without breaking release safety or runtime behavior.

## Scope

- Applies to source folders, scripts, docs, and generated artifact handling.
- Excludes product behavior changes unless explicitly planned in the same batch.

## Major-change batching rule

- Treat each significant reorganization unit as one **major change**.
- Run focused validations after each major change.
- Run **full gate** (`frank:full` or `test:all`) only after every 3 completed major changes, or immediately if a high-risk failure appears.

## What counts as one major change

- Moving one feature subtree (example: `assets/js/sandbox/*` re-homed with import updates).
- Re-grouping one script family under a new folder with command-path updates.
- Reorganizing one test domain with config + path updates.
- Large artifact policy cleanup that changes release/cleanup script targets.

## Required per-change checklist

1. Define blast radius (files + scripts + tests impacted).
2. Apply minimal move/rename patch set.
3. Update all path references immediately (imports, docs, scripts).
4. Run focused checks for touched surfaces.
5. Append decision + release-memory note when organization affects operator workflow.

## 3-change checkpoint checklist

- Confirm all three major changes have focused validation evidence.
- Run full gate once (`frank:full` preferred).
- Record checkpoint result and any rollback notes.

## Rollback protocol

- If a move breaks runtime/tests, revert that major change only.
- Keep other validated changes intact.
- Log failure signature in `error-catalog.md` if new.
- Resume from last known-good checkpoint.

## Suggested organization wave order

1. **Docs and memory paths** (lowest runtime risk).
2. **Script families** with command verification.
3. **Source helper extraction/moves** with focused contract tests.
4. **Artifact/cleanup policy alignment**.

## Validation minimums

- Every major change: focused specs + `test:memory`.
- Every 3 major changes: full gate.
- Any high-risk script/release flow touch: immediate full gate (do not wait for count).
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
