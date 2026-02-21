# FAZ IDE

Local, in-browser JavaScript playground with a configurable layout.
Console, Editor, Files, and Sandbox are separate panels with independent sizing and order.

## Author & License

- Author / Maintainer: Faz (FazyBear)
- License: MIT
- Attribution files: `LICENSE`, `AUTHORS`, `NOTICE`

## Layout Panel

Click **Layout** in the header for pixel-precise controls (panel order, sizes, visibility, and spacing).

## Themes

Use the **Theme** button in the header to switch between Dark and Light themes.

## Files Panel

Use the `...` menu (or right-click a file) to create, duplicate, rename, pin, lock, or delete files.
Search and sort live in the toolbar for quick filtering.
Use the `...` menu to show/hide Filters (search/sort), Games, and Apps for a minimal layout.

## Games Library

Define game templates in `assets/js/config.js` under `GAMES`.
Current setup uses a simple single-file JavaScript template at `assets/games/click-counter.js`.
Use the Files panel **Games** selector to import templates into the workspace.

## Applications Library

Define application templates in `assets/js/config.js` under `APPLICATIONS`.
Starter templates live in `assets/apps/` and load multiple files (`index.html`, `styles.css`, `app.js`).
Use the Files panel **Applications** selector to import templates into the workspace.

## Project Structure

- `assets/` UI, JS modules, vendor assets, games, and applications
- `config/` configuration (Playwright)
- `docs/` documentation (changelog)
- `scripts/` automation scripts for dev server, testing, release packaging, Codex, and Franklin ops
- `tests/` Playwright tests
- `artifacts/` generated outputs (ignored by git)

## Console QA (DevTools)

Open the **parent page** DevTools console (not the sandbox iframe) and run:

```js
fazide.help();
fazide.selfTest();
fazide.setCode('console.log("from console")');
fazide.getCode();
fazide.listFiles();
fazide.createFile("demo.js", "console.log('demo')");
fazide.deleteFile("demo.js");
fazide.renameFile("demo.js", "demo-renamed.js");
fazide.listGames();
fazide.loadGame("click-counter");
fazide.listApplications();
fazide.loadApplication("calculator-app");
fazide.setPanelOpen("log", true);
fazide.setPanelOpen("sandbox", true);
fazide.setPanelOrder("sandbox", 0);
fazide.setSidebarWidth(260);
fazide.setLogWidth(320);
fazide.setSandboxWidth(460);
fazide.setSizes({ logWidth: 320, sidebarWidth: 260, sandboxWidth: 460 });
fazide.setPanelGap(12);
fazide.setCornerRadius(8);
fazide.setTheme("light");
fazide.applyPreset("focus");
fazide.runSample("basic");
fazide.runSample("inspect");
fazide.resetLayout();
```

If `selfTest()` reports any failures, check the console output table for details.

## Changelog

See `docs/CHANGELOG.md`.

## Detailed Release Notes

See `docs/RELEASE_NOTES_v0.2.0.md` for the full open-source release narrative and deployment notes.

## AI Memory

Project memory for future updates lives in `docs/ai-memory/`:

- `project-context.md` for high-level architecture/product context
- `feature-map.md` for complete feature inventory and polish targets
- `decisions.md` for important decisions
- `known-issues.md` for bug/edge-case tracking
- `common-mistakes.md` for recurring mistakes to avoid
- `error-catalog.md` for known errors and deterministic fixes
- `franklin-fix-request.md` for the latest rescue snapshot and fix checklist
- `recovery-playbook.md` for triage and recovery steps
- `test-gaps.md` for planned test expansion
- `release-notes.md` for deployment-impacting notes
- `handoff-checklist.md` for session start/end quality checklist

Master product direction and phased implementation plan:

- `docs/MASTER_ROADMAP.md` for strategic constraints, phased build order, and immediate execution queue

## Release Checklist

See `docs/RELEASE_CHECKLIST.md` for the safe pre-upload and deployment flow.

## Real Accounts (Google + SiteGround)

See `docs/SITEGROUND_REAL_ACCOUNTS_SETUP.md` for the full production setup using Supabase Auth + Google OAuth.

Production domain stamping note:

- Before `npm run deploy:siteground`, set `SITE_URL` in PowerShell so packaged canonical/OG/sitemap URLs are correct.
- Example: `$env:SITE_URL = "https://yourdomain.com"`
- For real cloud accounts in the deploy package, also set `SUPABASE_URL` and `SUPABASE_ANON_KEY` before deploy.
- Example: `$env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"` and `$env:SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY"`
- Recommended production command: `npm run frank:full:cloud` (requires `SUPABASE_URL` + `SUPABASE_ANON_KEY` and enforces cloud-auth packaging end-to-end).

Persistent local release env (one-time setup):

- Create `.env.release.local` at repo root (gitignored by default).
- Add your values once:
  - `SITE_URL=https://yourdomain.com`
  - `SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co`
  - `SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY`
  - `SUPABASE_OAUTH_REDIRECT_PATH=/`
- After that, `npm run frank:full`, `npm run frank:full:cloud`, and `npm run deploy:siteground` auto-load these values when shell env vars are not already set.

## QA Commands

- `npm run sync:dist-site` copies source web assets into `dist_site/` and removes stale files.
- `npm run test:sync:dist-site` verifies `dist_site/` stays in sync with source web assets.
- `npm run test:memory` verifies required AI memory docs are present and structured.
- `npm run test:frank:safety` verifies Franklin command safety (allowlist behavior, sanitized memory writes, and docs/ai-memory path boundaries).
- `npm run test:integrity` verifies test hygiene (no focused/skipped/fixme tests, no trivial assertions, and assertion presence checks).
- `npm run test:opt:safety` enforces optimization safety budgets (key file-size caps + AI memory file-count cap) before large refactors.
- `npm run test:all:contract` verifies `test:all` still includes all required gates in order.
- `npm run test` runs the full Playwright E2E suite.
- `npm run test:stable` runs Playwright with one retry to reduce transient flake noise during optimization/polish passes.
- `PLAYWRIGHT_RETRIES` can override retry count (`0` default local, `1` default CI).
- `npm run test:quick` runs sync check + AI memory check + test integrity check + full E2E suite.
- `npm run test:all` runs the browser-first release gate (sync + E2E + SiteGround package prep/verification + privacy checks).
- `npm run deploy:siteground` supports optional `SITE_URL` rewrite for packaged `canonical`, `og:url`, and `sitemap.xml` `<loc>` entries.
- `npm run deploy:siteground` also supports optional deploy-time auth injection via `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optional `SUPABASE_OAUTH_REDIRECT_PATH`.
- `npm run verify:siteground` supports optional strict mode via `REQUIRE_CLOUD_AUTH=1` to fail packaging if cloud auth keys were not injected.
- `npm run test:secrets` scans tracked git files for high-risk credential patterns.
- `npm run precommit:guard` runs secret + privacy checks before commit.
- `npm run hooks:install` enables local git hooks from `.githooks/` (includes `pre-commit` guard).

Script-path governance:

- Canonical script ownership map: `docs/ai-memory/script-family-inventory.md`.
- Prefer canonical full gate command `npm run frank:full` (`frank:all` remains an alias).

## Codex Safe Workflow (Issue → Change → Rollback)

Use this flow to keep Codex sessions simple and reversible:

- `npm run codex:scan`
  - Fast snapshot of branch, changed files, and untracked files.
  - Add `-- --json` for automation-friendly output.
- `npm run codex:checkpoint -- "before-<task>"`
  - Creates a rollback patch + metadata under `artifacts/codex/checkpoints/`.
  - Add `-- --json` for machine-readable output.
- `npm run codex:savepoint -- "before-<task>"`
  - Shortcut alias for `codex:checkpoint` during rapid Codex loops.
- Make the change with focused tests first.
- Run quality gates:
  - `npm run test:integrity`
  - `npm run test:memory`
- If rollback is needed:
  - Dry-run: `npm run codex:rollback -- artifacts/codex/checkpoints/<file>.patch`
  - Dry-run latest checkpoint: `npm run codex:rollback:latest`
  - Apply rollback: `npm run codex:rollback -- artifacts/codex/checkpoints/<file>.patch --apply`
  - Apply latest rollback: `npm run codex:rollback:latest:apply`

Checkpoint utilities:

- `npm run codex:checkpoint:list` lists all saved checkpoint patch files.
- `npm run codex:checkpoint:list -- --limit=10` shows only the latest N checkpoints.
- `npm run codex:checkpoint:list -- --json` returns list output in JSON format.

If rollback dry-run fails, use this recovery sequence:

1) `npm run codex:scan`
2) `npm run codex:checkpoint:list`
3) choose a matching checkpoint for current workspace state (or create a fresh savepoint)

Notes:

- Rollback patches cover tracked file changes (`git diff --binary HEAD`).
- Untracked files are listed in checkpoint metadata and should be added/stashed separately when needed.

## Franklin (Terminal AI Ops)

- `npm run frank -- help` shows all Franklin commands.
- `npm run frank:check` runs contract + sync verify + memory verify + Franklin safety + test integrity.
- `npm run frank:all` is a compatibility alias for `npm run frank:full`.
- `npm run frank:full` runs the browser-first full release gate (`test:all`) with the same organized digest view and writes per-stage logs under `artifacts/frankleen/reports/`.
- `npm run frank:full:stable` runs full gate with `PLAYWRIGHT_RETRIES=1` for safer polish/reliability passes.
- `npm run frank:full:cloud` runs full gate in strict cloud mode (`REQUIRE_CLOUD_AUTH=1`) and fails if Supabase env keys are missing.
- `npm run frank:guardian` runs full gate with auto preflight snapshot + rollback on failure + fix-request capture.
- `npm run frank:doctor` runs non-mutating Franklin readiness diagnostics.
- `npm run frank:snapshot:create` creates a manual guardian snapshot.
- `npm run frank:snapshot:list` lists recent guardian snapshots.
- `npm run frank:snapshot:restore` restores the latest guardian snapshot.
- `npm run frank:snapshot:verify` verifies snapshot payload/metadata integrity for the latest snapshot.
- `npm run frank:cleanup:preview` previews stale Frankleen report/snapshot cleanup targets.
- `npm run frank:cleanup` applies stale Frankleen report/snapshot cleanup targets.
- `npm run frank:cleanup:all` runs Frankleen cleanup in one safe pass.
- `npm run frank -- rescue <script>` captures a failing `npm run <script>` into `docs/ai-memory/franklin-fix-request.md`.
- `npm run frank -- note "message"` appends a dated entry to `docs/ai-memory/decisions.md`.
- `npm run frank -- error "message"` appends a dated entry to `docs/ai-memory/error-catalog.md`.
- `npm run frank:status` shows Franklin memory/check status.

Reliability note for optimization waves:

- If `frank:full` fails with a single Playwright test while all prior stages are green, rerun `npm run test` once to check for transient flakes.
- If the rerun is green, rerun `npm run frank:full` before commit/push so release evidence stays current.
- If the rerun fails again on the same spec, treat as deterministic and fix before merge.
<!-- docs-sync: 2026-02-20 optimization + command-health pass -->
