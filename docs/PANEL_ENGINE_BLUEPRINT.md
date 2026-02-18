# Panel Engine Blueprint (VS Code-style)

## Goal

Deliver a deterministic panel layout engine where:

- Panels can be arranged in main columns.
- Each column can stack panels top-to-bottom.
- Resize handles remain visually minimal (hover-only) with reliable drag hit areas.
- Zoom and resize never produce overlap, off-screen panels, or dead splitters.

## Core Model

Represent layout as a canonical tree:

- `columns[]`
  - `id`
  - `widthRatio`
  - `stacks[]`
    - `id`
    - `heightRatio`
    - `panels[]`
    - `activePanelId`

Auxiliary state:

- `panelVisibility`
- `panelConstraints` (`min`, `preferred`, `max`)
- `layoutVersion`

## Invariants

- Geometry is computed from ratios + container size only.
- Any mutation must preserve valid tree shape.
- No silent overlap is allowed.
- No panel may render outside workspace bounds.
- Sash interactions always resolve to a valid state.

## Solver Pipeline

For each layout commit:

1. Normalize structure (dedupe/missing panel recovery).
2. Apply row/column caps.
3. Convert ratios to target pixel sizes.
4. Enforce min/max constraints.
5. Redistribute deficits/surplus across siblings.
6. Spill impossible panels by deterministic priority rule.
7. Emit final CSS tokens in one frame commit.

## Resize UX (Minimal)

- Visible sash line: hidden by default, shown on hover/focus/drag.
- Hit area: wider invisible zone for usability.
- During drag: highlight only active sash + adjacent containers.
- No persistent icons/arrows.

## Command Surface

All layout mutations should route through command IDs:

- `layout.movePanel`
- `layout.splitColumn`
- `layout.splitStack`
- `layout.mergeStack`
- `layout.resizeSash`
- `layout.resetPreset`
- `layout.normalize`

## Migration Plan

### Slice A (completed in this session)

- Add reusable row-solver engine module (`assets/js/core/layoutEngine.js`).
- Route panel row cap/width-fit logic through the engine.
- Simplify splitter affordance to hover-only visible line.

### Slice B (completed in this session)

- Introduce explicit `columns/stacks` state in parallel with legacy `panelRows`.
- Build bidirectional adapter (`panelRows <-> columns/stacks`).
- Keep rendering unchanged while dual-writing state.
- Added `assets/js/core/panelLayoutModel.js` with model normalization + adapters.
- App now dual-syncs `panelRows` and `panelLayout` across sanitize/layout/docking flows.
- Exposed `fazide.getPanelLayout()` for migration observability.

### Slice C (completed in this session)

- Moved layout persistence to ratio-first snapshots via `panelRatios` while preserving legacy width snapshots.
- Added sanitize/load upgrade path to restore from ratio snapshots first and safely backfill from legacy absolute widths.
- Added regression coverage for ratio-first persistence/restore compatibility.

### Slice D

- Replace row-only rendering with column+stack renderer.
- Add panel tabs per stack and drag-to-stack docking targets.

### Slice E

- Add deterministic spill policy and operation log for every enforced move.
- Add fast path for large layouts and worker-prepared geometry plans.

## Verification Contracts

Must pass before each slice lands:

- 110% / 125% / 150% zoom: no overlap, no out-of-bounds panels.
- Splitter drag: no dead zones, no pointer-capture leaks.
- Reload/restore: exact structural restoration.
- Command parity: keyboard/menu/palette mutations produce same layout state.

## Performance Targets

- One layout commit per animation frame max.
- No forced sync reflow loops in drag path.
- Geometry solver runtime budget: < 2 ms average on normal workspace state.

## Rollback

- Keep the solver integration feature-flagged by module boundary.
- Preserve legacy `panelRows` compatibility until Slice D completes.
