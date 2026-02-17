# AI Session Brief

## Purpose
- Generated startup brief for AI coding sessions in this repository.
- Provides deterministic context so issue fixes and feature work are easier to execute safely.

## How to Use
- Run `npm run ai:kickoff -- "<goal>"` before starting a Codex/chat session.
- Paste this brief into the first AI message, then attach one issue/feature intake entry.
- Re-run kickoff when branch context or priorities change.

## Minimum Content Contract
- Timestamp and goal
- Current priorities snapshot
- Open issue snapshot
- High-priority test gaps
- Working tree summary
- Standard QA path

## Generated
- Timestamp: 2026-02-16T21:11:10.875Z
- Goal: Stabilize current branch and implement scoped change safely.

## Fast Start Checklist
- Read `project-context.md` and `feature-map.md`.
- Read latest entries in `decisions.md` and `known-issues.md`.
- Confirm target command path (`npm run test:quick` or `npm run test:all`).

## Current Priorities
- Stability of file workflows (create/rename/move/delete/trash/undo).
- Reliable workspace import/export and persistence.
- Strong release gating (`npm run test:all`).

## Open Issues Snapshot
- (none)

## High-Priority Test Gaps
- Guard disk-full behavior in snapshot and restore flows.
- Expand checks for generated artifact cleanup under lock contention.
- Add a deterministic regression that simulates partial snapshot payloads and verifies rollback behavior without relying on live filesystem lock timing.

## Working Tree
- README.md
- assets/css/base.css
- assets/css/components.css
- assets/js/app.js
- config/playwright.config.js
- docs/ai-memory/README.md
- docs/ai-memory/project-context.md
- docs/ai-memory/release-notes.md
- package.json
- scripts/verify-ai-memory.js
- tests/ide.spec.js
- docs/ai-memory/ai-prompt.md
- docs/ai-memory/feature-intake.md
- docs/ai-memory/issue-intake.md
- docs/ai-memory/session-brief.md
- scripts/ai-assist.js
- scripts/ai-verify.js
- scripts/run-playwright-changed.js
- scripts/run-playwright-flake-critical.js
- scripts/run-playwright-smoke.js

## Standard QA Path
- npm run frank:check
- npm run test:quick

## Decision Log Format
- Date (UTC):
- Area:
- Decision:
- Why:
- Follow-up:

## Copilot/Codex Prompt Starter
Use this exact operating mode:
- Read docs/ai-memory/project-context.md and docs/ai-memory/known-issues.md first.
- Propose minimal root-cause fix or scoped feature patch.
- Implement code changes directly.
- Run targeted tests first, then npm run test:quick.
- Update docs/ai-memory/decisions.md and docs/ai-memory/release-notes.md if behavior changed.
