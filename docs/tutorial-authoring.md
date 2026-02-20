# Tutorial Authoring Guide

This project now uses a data-first tutorial definition model.

## Where to add tutorials

- Definitions: `assets/js/core/tutorialDefinitions.js`
- Runtime engine: `assets/js/app.js` (rendering, spotlight, motion, progression)

## Step schema

Each step uses this shape:

- `id` (string, required)
- `title` (string, required)
- `body` (string, required)
- `target` (CSS selector string, required)
- `reveal` (object, optional)
- `actionKeys` (string[], optional)

Validation is enforced in `validateTutorialStep(...)` so malformed steps fail fast.

## Action system

Tutorials are now simple to extend by adding `actionKeys` on a step and mapping handlers in `app.js`:

- Action map location: `buildTutorialDefinitions({ actionMap })` call in `assets/js/app.js`
- Example keys:
  - `panel.files.open`
  - `welcome.focus`
  - `welcome.run`
  - `search.demo.start`
  - `header.open`
  - `footer.open`

This avoids embedding ad-hoc closures directly in step data and keeps behavior reusable.

## Visual behavior (safe)

When tutorial is active:

- Backdrop is darkened for focus.
- Galaxy canvas runs behind tutorial content.
- Particles repel from mouse movement.
- Effects are constrained away from highlighted target and tutorial modal.
- Reduced-motion users get no animated galaxy.

Safety/perf guards:

- No remote scripts/libraries are loaded.
- No eval paths are introduced.
- Animation is canceled when tutorial closes or tab is hidden.
- Canvas is non-interactive (`pointer-events: none`) to avoid click interception.

## Testing checklist

Before shipping tutorial changes:

1. Run tutorial behavior tests in `tests/ide.spec.js`.
2. Verify spotlight target selectors still exist.
3. Verify header/footer-hidden start state still recovers correctly.
4. Verify tutorial skip and completion both clean up state.
