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

- Checkpoint ID: C2
  - Area: Runtime validation templates
  - Gap: Add focused regression that verifies runtime full-matrix copy and checklist remain JS/HTML/CSS-only.
  - Why it matters: Prevents runtime scope drift and ambiguous matrix messaging.
  - Proposed test: Snapshot/marker assertion around matrix template labels and checklist entries.
  - Priority (P0/P1/P2): P0
  - Validation command: focused Playwright runtime app checks
  - Owner/next action: Add in next runtime-template touch.

- Checkpoint ID: C2
  - Area: Applications catalog scope guard
  - Gap: Add contract test that fails if unsupported language entries reappear in Applications catalog.
  - Why it matters: Locks catalog to JS/HTML/CSS scope contract.
  - Proposed test: Explicit catalog-entry allowlist assertion.
  - Priority (P0/P1/P2): P0
  - Validation command: focused catalog contract suite
  - Owner/next action: Add when touching catalog seed data.

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

- Added focused contract coverage for workspace preview sanitization and local asset inlining.
- Simplified runtime validation templates for deterministic marker-based pass/fail output.
- Removed unsupported runtime branches and aligned tests to web-language-only execution.
- Added lesson shop hidden-render regression (`overview` active should not rebuild shop list DOM during typing updates).
- Added strict lesson theme-unlock policy contracts for fresh-profile lock gating and buy/apply byte-economy flow (`tests/ide.spec.js`).
