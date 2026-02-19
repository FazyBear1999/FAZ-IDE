# File Organization Wave Map

This map turns large repository organization into reversible waves.

## Current status

- Major change 1 complete: governance + batching policy + playbook.
- Major change 2 complete: script-family inventory + canonical command naming guidance added.
- Major change 3 complete: docs path/command normalization synced to inventory.
- Checkpoint A complete: focused checks passed (`test:memory`, `test:integrity`) and full gate passed (`frank:full`, 14/14).

## Wave 1 (Low runtime risk)

### Major change 2 — Script family grouping prep
- Add path inventory for `scripts/` consumers (package scripts, docs references, Franklin checks).
- Normalize script naming consistency (no behavioral changes).
- Validation: `test:memory`, `test:integrity`.

### Major change 3 — Documentation path normalization
- Align docs references to canonical script/source paths.
- Remove stale path mentions and duplicate guidance.
- Validation: `test:memory`, focused docs checks.

### Checkpoint A
- Run full gate (`frank:full`) after major changes 1–3.

## Wave 2 (Medium risk)

### Major change 4 — Sandbox helper locality cleanup
- Group sandbox helper modules under consistent subfolders.
- Update import paths and related tests.
- Validation: focused runtime + preview contracts.

### Major change 5 — Test domain grouping
- Reorganize test files by domain while preserving Playwright config discovery.
- Validation: focused suites + `test:integrity`.

### Major change 6 — Cleanup tooling alignment
- Align `workspace-cleanup`/artifact scripts with updated structure.
- Validation: cleanup dry-run + Franklin safety checks.

### Checkpoint B
- Run full gate (`frank:full`) after major changes 4–6.

## Rollback rule

- Revert only the latest failing major change.
- Keep earlier validated waves intact.
- Log failure signature and recovery step in memory docs.