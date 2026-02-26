# Slices

Active slicing plan and status tracker for Brains / Hands / Tester collaboration.

## Status Legend

- `planned`
- `in_progress`
- `blocked`
- `done`

## Active / Recent Slices

### LANDING-STYLE-2

- Status: `done`
- Title: Reveal more spa-room background behind light-mode landing surfaces
- Goal: Reduce light-mode landing surface opacity and soften the light overlay gradient so the global spa-room background is more visible on `/`, without changing dark mode.
- In scope:
- Lower alpha for light-mode landing surfaces/chips/choices
- Reduce `html.light body` overlay gradient alpha
- Remove conflicting redundant early `html.light body` background-color rule if present
- Out of scope:
- Dark mode styling changes
- Routing/auth gate changes
- Acceptance criteria:
- Light-mode landing surfaces are visibly more translucent
- Spa-room background is more visible on `/` in light mode
- Dark mode styling remains unchanged
- Required validation/tests:
- `npm run build`
- `npm run smoke`
- Files expected to change:
- `app/globals.css`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Targeted only `html.light` landing/background overrides to avoid dark-mode regressions.

### LANDING-STYLE-1

- Status: `done`
- Title: Polish landing page visuals and dark-mode support on `/`
- Goal: Make `/` render as a modern in-app preview and respect `next-themes` dark/light mode without changing routing or adding dependencies.
- In scope:
- Restyle `app/page.js` landing page with repo-native class names and responsive layout
- Add landing page styles to `app/globals.css` with explicit `html.light` / `html.dark` support
- Validate `/` and `/app` route behavior remains unchanged
- Out of scope:
- Routing changes (`/` landing and `/app` auth gate stay as-is)
- `/today` or `/auth/sign-in` route logic changes
- Adding Tailwind or any new dependency
- Acceptance criteria:
- `/` renders as a modern card-based app preview (not default browser-styled HTML)
- `/` respects dark and light mode when theme class is applied by `next-themes`
- `/` does not show internal app chrome
- `/app` auth gate still redirects authed to `/today` and unauthed to `/auth/sign-in`
- Required validation/tests:
- `npm run build`
- `npm run smoke`
- Files expected to change:
- `app/page.js`
- `app/globals.css`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Tailwind utility classes in the prior landing page did not render because this repo does not currently include a Tailwind dependency/config, so the fix uses existing global CSS conventions instead.

### DOC-WORKFLOW-1

- Status: `done`
- Title: Add workflow contract (`AGENTS.md`) + changelog/slicing docs
- Goal: Establish a documented collaboration contract and required documentation workflow without touching application code.
- In scope:
- Add repo-root `AGENTS.md` (Brains/Hands/Tester workflow contract)
- Ensure `docs/CHANGELOG.md` exists and append a changelog entry (append-only)
- Ensure `docs/slices.md` exists and track this slice
- Out of scope:
- Any application code changes
- Refactors or dependency changes
- Acceptance criteria:
- `AGENTS.md` exists with workflow contract rules (small slices, minimal diffs, explicit acceptance criteria, required tests, docs updates)
- `docs/CHANGELOG.md` exists
- `docs/slices.md` exists
- No application code files modified
- Required validation/tests:
- `git diff --name-only` (confirm only markdown docs touched by this slice)
- `git status --short` (note any pre-existing unrelated changes)
- Files expected to change:
- `AGENTS.md`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Initial workflow baseline created for future slices.

## Next Slice Template

Copy this block for new work:

### SLICE-ID

- Status: `planned`
- Title:
- Goal:
- In scope:
- Out of scope:
- Acceptance criteria:
- Required validation/tests:
- Files expected to change:
- Notes:
