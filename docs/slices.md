# Slices

Active slicing plan and status tracker for Brains / Hands / Tester collaboration.

## Status Legend

- `planned`
- `in_progress`
- `blocked`
- `done`

## Active / Recent Slices

### SLICE-D

- Status: `done`
- Title: Add "Send missed to Review" at exam simulation completion
- Goal: Add a completion CTA in exam-style `QuestionRunner` runs that saves missed question IDs into a review queue (localStorage fallback) and lets users jump to `/review`.
- In scope:
- Add `Send missed to Review` CTA and completion status UX to `QuestionRunner` end screen when `revealPolicy='end'` and misses exist
- Persist missed question IDs idempotently in localStorage under `coachmblex_review_queue_v1:<userId|anon>`
- Update `/review` to read the local queue as a fallback/priority source (including anon queue)
- Keep drill/practice behavior unchanged
- Out of scope:
- New Supabase review queue tables/migrations
- Refactors to review selection heuristics from `attempts`
- New dependencies
- Acceptance criteria:
- Exam completion screen shows `Send missed to Review` only for `revealPolicy='end'` and at least one missed question
- Clicking CTA disables the button while saving and shows success/error status
- Success status includes `Saved locally` when auth/session is missing
- `/review` can start from locally saved missed question IDs (fallback path) and shows those questions
- Re-clicking CTA does not duplicate queued IDs in localStorage
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Manual: finish a short `/test/run` with at least one miss, click CTA, open `/review`, confirm items appear
- Files expected to change:
- `app/_components/QuestionRunner.js`
- `app/review/page.js`
- `src/lib/reviewQueueLocal.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal diff implementation uses localStorage queue because no existing review queue persistence table/path was found in repo code.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester manual verification pending: finish short `/test/run`, click `Send missed to Review`, confirm `/review` shows queued items.

### SLICE-C

- Status: `done`
- Title: Add exam timer to `/test/run`
- Goal: Add a minimal exam timer to the test runner page (`/test/run`) with exam-safe defaults, optional URL disable, header display, completion time reporting, and completion event tracking.
- In scope:
- Implement timer state/effects in `app/test/run/page.js` (not `QuestionRunner`)
- Start timer only when exam run is active (not during loading)
- Stop timer on completion and surface time taken in completion UI/page
- Add `seconds_elapsed` to `test_run_complete` tracking payload
- Respect `timer=0` / `timer=false` URL param to disable timer
- Preserve `timer` param in Change settings URL when present
- Out of scope:
- New timer UI in `/test` setup
- Timer logic inside `QuestionRunner`
- New dependencies or broader refactors
- Acceptance criteria:
- Exam runs default timer ON unless URL explicitly disables it
- Practice mode timer defaults OFF
- Timer is visible in `/test/run` header and does not run during loading
- Timer stops when the test completes and time taken is shown
- `trackEvent('test_run_complete', ...)` includes `seconds_elapsed`
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/test/run/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal diff follow-up to exam simulation slices.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass

### SLICE-B1

- Status: `done`
- Title: Tighten exam-mode runner gating and preserve test runner policy params
- Goal: Enforce exam-session UI gating when mode/policies indicate exam behavior and keep `mode`/`feedback`/`reveal` params on `/test/run` -> `/test` Change settings links.
- In scope:
- Gate immediate MCQ/FIB/explanation UI in `QuestionRunner` when `mode='exam'` OR delayed feedback/reveal policies are used
- Keep end Review rendering tied to `revealPolicy='end'`
- Make `/test/run` `runnerConfig.mode` parsing deterministic (`practice` else `exam`)
- Preserve `mode`/`feedback`/`reveal` query params in `buildTestSettingsHref` when present
- Out of scope:
- New test runner features or timer changes
- Drill route behavior changes
- Acceptance criteria:
- Exam mode suppresses immediate correctness styling/text/explanations during the session
- End Review still renders only when `revealPolicy='end'`
- Drill/practice defaults remain unchanged
- `/test` Change settings link preserves `mode`/`feedback`/`reveal` params when present
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/_components/QuestionRunner.js`
- `app/test/run/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Follow-up to `SLICE-B` with minimal diff.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass

### SLICE-B

- Status: `done`
- Title: Add exam-simulation feedback/reveal policies to `QuestionRunner`
- Goal: Support exam-style delayed feedback/reveal in `QuestionRunner` with minimal diff while preserving existing drill/practice behavior by default.
- In scope:
- Add `mode`, `feedbackPolicy`, and `revealPolicy` props to `QuestionRunner` with practice-safe defaults
- Hide immediate MCQ/FIB correctness feedback when `feedbackPolicy='end'`
- Hide per-question explanation box when `revealPolicy='end'`
- Add completion-time `Review` section (prompt, user answer, correct answer, why/trap/hook) when `revealPolicy='end'`
- Update `/test/run` to pass exam mode/policies from URL params with sane test defaults
- Out of scope:
- Timer behavior or timer UI
- Question selection/scoring logic changes
- Drill route behavior changes
- Acceptance criteria:
- Existing drill/practice flows behave the same when props are omitted
- `/test/run` passes exam-mode delayed feedback/reveal to `QuestionRunner`
- In delayed feedback mode, correct/wrong choice classes and FIB correctness status are not shown after submit
- In delayed reveal mode, explanation box is hidden per question and a completion `Review` section lists prompt, user answer, correct answer, why/trap/hook for each answered question
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/_components/QuestionRunner.js`
- `app/test/run/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Keep diff narrow and avoid runner refactors.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass

### SLICE-A

- Status: `done`
- Title: Clarify `/test` as Exam Simulation and `/drill` as Practice
- Goal: Update route copy so users can clearly distinguish exam-style testing from practice drills without changing any runner behavior.
- In scope:
- Update `/test` heading/subtitle copy to exam-simulation language
- Add a short `/test` rules list covering question count, timer toggle availability, and post-finish review guidance
- Update `/drill` heading/subtitle copy to practice language
- Out of scope:
- Test/drill runner logic changes
- Timer behavior or new toggles
- Route flow/navigation changes
- Acceptance criteria:
- `/test` shows title `Exam Simulation`
- `/test` shows subtitle `Timed, exam-like conditions. No hints. Explanations at the end.`
- `/test` shows a short rules list mentioning question count, timer toggle availability, and reviewing misses after finishing
- `/drill` shows title `Practice Drill`
- `/drill` shows subtitle `Fast practice with immediate feedback.`
- No behavior changes to starting or running tests/drills
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/test/TestCenterClient.js`
- `app/drill/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Purely presentational slice; keep diffs minimal.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass

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
