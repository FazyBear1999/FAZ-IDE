# Test Gaps

## Template

- Checkpoint ID:
- Area:
- Gap:
- Why it matters:
- Proposed test:
- Priority (P0/P1/P2):
- Validation command:
- Owner/next action:

## High Priority

## Current Priority Gaps

- Checkpoint ID: C8
  - Area: Test quality signal strength
  - Gap: Add a focused quality audit that flags low-signal tests (existence-only assertions without behavior invariants) in high-risk suites.
  - Why it matters: Prevents false confidence from tests that pass without protecting real contracts.
  - Proposed test: Lint-style assertion-quality scanner + curated allowlist for intentional existence checks.
  - Priority (P0/P1/P2): P0
  - Validation command: `npm run test:integrity` + focused suite audit command
  - Owner/next action: Add with first C8 optimization implementation slice.

- Checkpoint ID: C1
  - Area: Dev Terminal command contract
  - Gap: Add lightweight smoke contract for Dev Terminal help text to keep command list aligned with supported runtime scope.
  - Why it matters: Prevents docs/help drift during orchestration refactors.
  - Proposed test: Help text includes expected command set and excludes unsupported entries.
  - Priority (P0/P1/P2): P1
  - Validation command: focused IDE terminal/help tests
  - Owner/next action: Add with next command-surface edit.

- Checkpoint ID: C2
  - Area: Sandbox runtime status determinism
  - Gap: Add focused assertion that sandbox run status + console marker pairing stays deterministic for JS/HTML/CSS templates.
  - Why it matters: Keeps runtime triage deterministic and repeatable.
  - Proposed test: Status marker + console marker pair contract per template.
  - Priority (P0/P1/P2): P0
  - Validation command: focused runtime validation app tests
  - Owner/next action: Add alongside runtime marker updates.

## Update Rules

- Every open gap must carry a Checkpoint ID from roadmap-decision-map.md.
- Close a gap only when command evidence is recorded in decisions/release notes or test output.
- If a gap has no active checkpoint, create a new checkpoint first, then track the gap.

## Completed Recently

- Added release contracts that enforce AI-memory markdown isolation from runtime wiring (`index.html`, `assets/js/app.js`, `assets/js/sw.js`) and lock worker/js setup correctness (service worker path, worker module URLs, cached worker assets, and file existence).
- Closed C2 runtime validation template scope guard with focused runtime-full-matrix copy/checklist contract in `tests/ide.spec.js` (JS/HTML/CSS references required; unsupported language terms forbidden).
- Closed C2 applications catalog scope guard with explicit extension allowlist contract in `tests/ide.spec.js` (`html/css/js/md` only; hard-fail on unsupported runtime extensions).
- Added focused command-registry API contract coverage in `tests/stability-contract.spec.js` (register replace semantics, list visibility, unregister idempotence).
- Added focused contract coverage for workspace preview sanitization and local asset inlining.
- Simplified runtime validation templates for deterministic marker-based pass/fail output.
- Removed unsupported runtime branches and aligned tests to web-language-only execution.
- Added lesson shop hidden-render regression (`overview` active should not rebuild shop list DOM during typing updates).
- Added strict lesson theme-unlock policy contracts for fresh-profile lock gating and buy/apply byte-economy flow (`tests/ide.spec.js`).
