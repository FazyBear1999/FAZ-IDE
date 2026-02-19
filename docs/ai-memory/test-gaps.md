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

## Update Rules

- Every open gap must carry a Checkpoint ID from roadmap-decision-map.md.
- Close a gap only when command evidence is recorded in decisions/release notes or test output.
- If a gap has no active checkpoint, create a new checkpoint first, then track the gap.

## Completed Recently

- Closed beginner onboarding reset gap with focused contracts in `tests/ide.spec.js` that assert tutorial reset/start returns to Step 1 and that `fresh-start confirm` clears tutorial seen state (`fazide.tutorial.beginner.seen.v1`).
- Closed C2 sandbox runtime status determinism gap with focused JS/HTML/CSS runtime contract in `tests/ide.spec.js` (status + marker pairing locked for each template path).
- Closed C1 Dev Terminal help scope gap with focused command help contract in `tests/ide.spec.js` (expected safe command snippets required; unsupported language/unsafe command snippets forbidden).
- Added release contracts that enforce AI-memory markdown isolation from runtime wiring (`index.html`, `assets/js/app.js`, `assets/js/sw.js`) and lock worker/js setup correctness (service worker path, worker module URLs, cached worker assets, and file existence).
- Closed C2 runtime validation template scope guard with focused runtime-full-matrix copy/checklist contract in `tests/ide.spec.js` (JS/HTML/CSS references required; unsupported language terms forbidden).
- Closed C2 applications catalog scope guard with explicit extension allowlist contract in `tests/ide.spec.js` (`html/css/js/md` only; hard-fail on unsupported runtime extensions).
- Added focused command-registry API contract coverage in `tests/stability-contract.spec.js` (register replace semantics, list visibility, unregister idempotence).
- Added focused contract coverage for workspace preview sanitization and local asset inlining.
- Simplified runtime validation templates for deterministic marker-based pass/fail output.
- Removed unsupported runtime branches and aligned tests to web-language-only execution.
- Added lesson shop hidden-render regression (`overview` active should not rebuild shop list DOM during typing updates).
- Added strict lesson theme-unlock policy contracts for fresh-profile lock gating and buy/apply byte-economy flow (`tests/ide.spec.js`).
