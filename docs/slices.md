# Slices

Active slicing plan and status tracker for Brains / Hands / Tester collaboration.

## Status Legend

- `planned`
- `in_progress`
- `blocked`
- `done`

## Active / Recent Slices

### NAV-V1-3

- Status: `done`
- Title: Remove dead AppShell route code and redirect removed routes to `/today`
- Goal: Clean out `AppShell` logic tied to deleted non-V1 routes and add middleware redirects so legacy URLs land on `/today`.
- In scope:
- Remove deleted-route code paths/helpers from `app/AppShell.js`
- Remove `getStudyNightFeedbackContext` and feedback-context study-night diagnostics usage
- Simplify route flags and session-page keyboard guard list to existing V1 routes
- Add `middleware.js` redirects for removed route prefixes to `/today`
- Out of scope:
- Additional UI refactors in `AppShell`
- E2E redirect coverage additions
- Acceptance criteria:
- `AppShell` no longer contains deleted-route helper/flags for game/study-night/memory/etc.
- Removed routes (`/learn`, `/practice`, `/coach`, `/game/*`, `/boss-fight`, `/streak`, `/sprint`, `/memory`, `/flashcards`, `/anatomy`) redirect to `/today`
- Admin access checks remain intact
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/AppShell.js`
- `middleware.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Redirect middleware preserves query strings by cloning `request.nextUrl` and only changing `pathname`.

### NAV-V1-2

- Status: `done`
- Title: Delete non-V1 route folders and trim smoke checks
- Goal: Remove non-V1 App Router route folders after nav de-bloat, keep V1 routes/admin/auth intact, and update smoke coverage to stop referencing deleted routes.
- In scope:
- Delete non-V1 route directories (`learn`, `practice`, `coach`, `game`, `boss-fight`, `streak`, `sprint`, `memory`, `flashcards`, `anatomy`)
- Keep `today`, `drill`, `test`, `review`, `progress`, `settings`, `auth`, `admin`
- Update smoke runner to remove deleted-route regression scripts
- Remove obvious dead user-facing link to `/practice` from mobile nav
- Out of scope:
- Further AppShell dead-code cleanup beyond what is needed for functionality/build
- E2E suite pruning for deleted routes
- Acceptance criteria:
- Listed non-V1 route folders are deleted
- V1 routes and admin/auth remain intact
- `npm run smoke` passes without deleted-route checks
- `npm run build` passes after deletions
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/` route folders listed above (deleted)
- `scripts/smoke.mjs`
- `app/_components/MobileBottomNav.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Kept admin access checks and hidden-admin-nav behavior unchanged from Slice 1.

### NAV-V1-1

- Status: `done`
- Title: De-bloat AppShell navigation for V1 and restore `/` -> `/today` redirect
- Goal: Reduce sidebar navigation to a single V1 Study section while keeping `/test`, and make `/` server-redirect to `/today`.
- In scope:
- Replace `NAV_SECTIONS` with one `Study` section (`/today`, `/drill`, `/test`, `/review`, `/progress`, `/settings`)
- Trim `NAV_TEST_IDS` to those routes only
- Keep those routes protected plus `/test/run` and `/admin`
- Simplify `isCenteredPracticeRoute`
- Replace `app/page.js` landing page with `next/navigation` `redirect('/today')`
- Align smoke regression assertions with the new V1 sidebar nav shape (still verifying `/test` remains)
- Out of scope:
- `/app` auth-gate changes
- Admin access-check logic changes
- Landing page styling changes
- Acceptance criteria:
- Sidebar only shows the V1 Study links listed above
- `/test` remains present and protected
- `/admin` access checks continue working
- Visiting `/` redirects to `/today`
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/AppShell.js`
- `app/page.js`
- `scripts/auth-loading-regression.mjs`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- This intentionally replaces the prior marketing landing page at `/` with a server redirect per request.

### LANDING-BG-2

- Status: `done`
- Title: Prevent spa-room background seam on tall landing pages
- Goal: Stop the global spa-room background from visually restarting on tall pages by ensuring the background image is painted on `body` only (not both `html` and `body`).
- In scope:
- Move `--site-bg-overlay` painting to `body` only in base global styles
- Set `html` to solid fallback background only
- Preserve existing `html.light body` / `html.dark body` overrides
- Out of scope:
- Landing card styling changes
- Calm background route gating changes
- Acceptance criteria:
- Background image is no longer painted on both `html` and `body`
- Tall landing pages do not show a repeated/seam-like restart
- Light/dark body overrides continue to apply
- Required validation/tests:
- `npm run build`
- `npm run smoke`
- Files expected to change:
- `app/globals.css`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Also adjusted the early `prefers-color-scheme: dark` fallback block so only `body` owns the background image.

### LANDING-BG-1

- Status: `done`
- Title: Ensure landing route shows spa-room background by bypassing calm fixed layers
- Goal: Make the body spa-room background visible on `/` by preventing `CalmBackground` fixed layers from covering it, while keeping all other routes unchanged.
- In scope:
- Confirm calm background fixed layers are rendered on `/`
- Skip calm fixed layers on `/` only
- Add a landing marker class to root landing page markup
- Verify landing cards still use `landing-*` classes
- Out of scope:
- Dark-mode card styling changes
- `/app` auth gate behavior changes
- Acceptance criteria:
- `/` no longer renders calm fixed overlay layers (`.calm-bg__base/.blob/.noise/.watermark`)
- Spa-room background is visible behind landing page surfaces
- Landing page markup uses `.landing-surface` / `.landing-subcard` classes
- `/app` auth gate continues to route correctly
- Required validation/tests:
- `npm run build`
- `npm run smoke`
- Files expected to change:
- `app/_components/CalmBackground.js`
- `app/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Root cause was route-global `CalmBackground` layers from `app/layout.js` visually covering the body spa-room image on `/`.

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
