# Tutorial System (FAZ IDE)

This document is the fallback reference for the onboarding/tutorial engine.
Use it when extending, debugging, or recovering tutorial behavior.

## Scope

Current implementation supports a registry of tutorial tracks with one active track:

- `beginner`

The system is intentionally centralized in `assets/js/app.js` for predictable orchestration.

## Core Architecture

- **Tutorial registry**: `TUTORIAL_DEFINITIONS`
  - Each tutorial has:
    - `id`
    - `label`
    - `seenKey` (localStorage key)
    - `completeMessage`
    - `steps[]`
- **Runtime state**: `tutorialState`
  - `tutorialId`
  - `active`
  - `index`
  - `highlightNode`
- **Overlay UI**:
  - Root: `#tutorialIntro`
  - Dialog panel: `.tutorial-intro-panel`
  - Glow ring: `#tutorialIntroHighlight`

## Step Model

Each step supports:

- `id`
- `title`
- `body`
- `target` (query selector)
- optional `onEnter` callback

The engine resolves `target`, scrolls it into view, and positions a fixed highlight ring around its bounds.

## Interference Guards

The system prevents collisions with normal app input while tutorial is active:

- Main global keydown handler short-circuits all shortcuts when tutorial is active.
- `Escape` closes/skips tutorial.
- Highlight ring repositions on `resize` and capture-phase `scroll`.
- Tutorial uses dedicated overlay ring instead of mutating target z-index/box-shadow.

## Persistence Rules

Seen state is per tutorial track via `seenKey`.

- Read: `getTutorialSeen(tutorialId)`
- Write: `setTutorialSeen(value, tutorialId)`

`fresh-start confirm` clears all `fazide.*` keys, including tutorial seen keys.

## Public Surfaces

### Dev Terminal

- `tutorial list`
- `tutorial start [id]`
- `tutorial reset [id]`
- `tutorial status`

### Debug API (`window.fazide`)

- `startTutorial(tutorialId = "beginner")`
- `resetTutorial(tutorialId = "beginner")`
- `getTutorialState()`

## Add a New Tutorial Track

1. Add a new entry under `TUTORIAL_DEFINITIONS`:
   - unique `id`
   - unique `seenKey`
   - `steps[]`
2. Reuse existing step shape; keep selectors stable and explicit.
3. Use panel-open `onEnter` hooks when step targets can be hidden.
4. Validate with focused tests in `tests/ide.spec.js`:
   - start/reset path
   - step index resets to `0`
   - status and list include new track

## Recovery Checklist (Fallback)

If tutorials appear broken:

1. Verify overlay elements exist in `index.html`.
2. Confirm `wireTutorialIntro()` runs during boot.
3. Run in Dev Terminal:

   - `tutorial list`
   - `tutorial start beginner`
   - `tutorial status`

4. Confirm `tutorialState.active` and `tutorialState.index` via `window.fazide.getTutorialState()`.
5. If needed, clear seen state with:

   - `tutorial reset beginner`

## Contract Coverage

Primary coverage lives in `tests/ide.spec.js`:

- help command scope
- tutorial reset/start determinism
- centered panel + visible ring
- fresh-start clears tutorial seen state
