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

- Timestamp: 2026-02-18T00:00:00.000Z
- Goal: Keep release/docs/AI memory fully synchronized and production deploy-safe.

## Fast Start Checklist

- Read `project-context.md` and `feature-map.md`.
- Read latest entries in `decisions.md` and `known-issues.md`.
- Confirm target command path (`npm run test:quick` or `npm run test:all`).

## Current Priorities

- Stability of file workflows (create/rename/move/delete/trash/undo).
- Reliable workspace import/export and persistence.
- Strong release gating (`npm run test:all`).
- Domain-accurate SiteGround packaging (`SITE_URL`) for canonical/OG/sitemap output.
- CSS maintainability hardening via shared micro-primitives and token-first styling updates.

## Open Issues Snapshot

- (none)

## High-Priority Test Gaps

- Guard disk-full behavior in snapshot and restore flows.
- Expand checks for generated artifact cleanup under lock contention.
- Add a deterministic regression that simulates partial snapshot payloads and verifies rollback behavior without relying on live filesystem lock timing.

## Working Tree

- README.md
- docs/CHANGELOG.md
- docs/RELEASE_CHECKLIST.md
- docs/ai-memory/release-notes.md
- docs/ai-memory/decisions.md
- assets/css/base.css
- assets/css/layout.css
- assets/css/components.css
- docs/ai-memory/README.md
- docs/ai-memory/handoff-checklist.md
- docs/ai-memory/project-context.md
- docs/ai-memory/session-brief.md
- docs/ai-memory/session-command-center.md

## Standard QA Path

- npm run test:memory
- npm run test:integrity
- npm run frank:full

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
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
