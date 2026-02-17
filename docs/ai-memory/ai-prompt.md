# AI Prompt Pack

## Purpose
- Ready-to-paste prompt context generated for Codex/AI chat sessions.

## How to Generate
- npm run ai:prompt issue
- npm run ai:prompt feature

## Usage
- Generate this file after kickoff + intake entry, then paste into AI chat.

## Mode
- issue

## Instructions for AI
- Read and obey the repository guardrails and memory files.
- Apply minimal root-cause changes only.
- Run targeted tests first, then npm run test:quick.
- Update docs/ai-memory/decisions.md and docs/ai-memory/release-notes.md if behavior changes.

## Session Brief
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
- Timestamp: 2026-02-16T19:20:12.669Z
- Goal: Codex startup system smoke check

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
- EADME.md
- ssets/css/components.css
- ssets/js/app.js
- ocs/ai-memory/README.md
- ackage.json
- cripts/verify-ai-memory.js
- ests/ide.spec.js
- docs/ai-memory/feature-intake.md
- docs/ai-memory/issue-intake.md
- docs/ai-memory/session-brief.md
- scripts/ai-assist.js

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


## Latest Issue Intake
No issue intake entry found. Run: npm run ai:issue -- "<summary>"

## Required Sections
- Mode
- Instructions for AI
- Session Brief
- Latest Issue Intake
- Deliverables

## Deliverables
- Code changes
- Tests/validation output
- Short risk summary
