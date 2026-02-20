# Script Family Inventory

Canonical map for script organization during optimization lockdown.
Use this file as the source of truth for script ownership and command-path references.

## Purpose

- Keep `scripts/` consumers aligned (package scripts, docs, and Franklin guidance).
- Reduce command/path drift before any future script relocation waves.
- Provide a stable inventory for Wave O6 / C4 repository organization work.

## Canonical command naming

- Prefer `npm run frank:full` as the canonical full-gate command (`frank:all` remains an alias).
- Prefer `npm run codex:checkpoint` for savepoint creation (`codex:savepoint` remains an alias).
- Prefer direct named command families over ad-hoc `node scripts/...` invocation in docs.

## Script families (current)

### AI operations

- `scripts/ai-assist.js`
- `scripts/ai-command-center.js`
- `scripts/ai-verify.js`

### Codex safety workflow

- `scripts/codex-ops.js`

### Franklin orchestration

- `scripts/franklin.js`
- `scripts/cleanup-frankleen-artifacts.js`

### Test and integrity verification

- `scripts/run-playwright-smoke.js`
- `scripts/run-playwright-changed.js`
- `scripts/run-playwright-flake-critical.js`
- `scripts/verify-ai-memory.js`
- `scripts/verify-franklin-safety.js`
- `scripts/verify-test-integrity.js`
- `scripts/verify-testall-contract.js`
- `scripts/verify-dist-site-sync.js`
- `scripts/verify-public-privacy.js`

### Build, packaging, and deployment

- `scripts/serve.js`
- `scripts/sync-dist-site.js`
- `scripts/dist-site-map.js`
- `scripts/prepare-siteground.js`
- `scripts/verify-siteground-package.js`
- `scripts/generate-desktop-icon.js`
- `scripts/desktop-pack.js`
- `scripts/desktop-pack-clean.js`
- `scripts/desktop-artifacts-clean.js`
- `scripts/desktop-dist.js`

### Developer utilities

- `scripts/list-commands.js`
- `scripts/workspace-cleanup.js`
- `scripts/audit-css-imports.js`

## Documentation rules

- Use exact script filenames when referencing implementation ownership.
- Use npm command aliases for operator workflows.
- Update this inventory in the same session whenever script paths or ownership change.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
