# Slices

Active slicing plan and status tracker for Brains / Hands / Tester collaboration.

## Status Legend

- `planned`
- `in_progress`
- `blocked`
- `done`

## Active / Recent Slices

### SLICE-1

- Status: `done`
- Title: Weighted domain plan + quota-based exam assembly
- Goal: Build deterministic weighted domain quotas (largest remainder) and use them in `/test/run` exam assembly with inventory-aware fallback warnings.
- In scope:
- Add pure `makeWeightedDomainPlan(N, weights)` using largest remainder with deterministic tie-breaks
- Integrate `/test/run` assembly to apply domain quotas (`D1..D7`) against `questions.domain_code`
- Add inventory-aware fallback warnings for per-domain and total inventory shortfalls
- Add tiny self-test script for `makeWeightedDomainPlan`
- Update `docs/CHANGELOG.md` and `docs/slices.md`
- Out of scope:
- SQL/schema changes
- `/test` setup page UI changes
- Pack import changes
- Acceptance criteria:
- `makeWeightedDomainPlan(100, weights)` returns `D1 11, D2 12, D3 14, D4 15, D5 17, D6 16, D7 15`
- `makeWeightedDomainPlan(10, weights)` is deterministic and sums to 10
- `/test/run` assembles with weighted quotas and redistributes shortfalls across available domains
- If total domain inventory is insufficient, test starts with fewer questions and reports warning without crashing
- Required validation/tests:
- `node scripts/weighted-domain-plan-self-test.mjs`
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `src/lib/makeWeightedDomainPlan.mjs`
- `app/test/run/page.js`
- `scripts/weighted-domain-plan-self-test.mjs`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Uses domain weights: `D1 0.11, D2 0.12, D3 0.14, D4 0.15, D5 0.17, D6 0.16, D7 0.15`.
- Validation (2026-02-27):
- `node scripts/weighted-domain-plan-self-test.mjs` pass (`N=100 => D1 11, D2 12, D3 14, D4 15, D5 17, D6 16, D7 15`; deterministic `N=10`)
- `npm run smoke` pass
- `npm run build` pass

### SLICE-I

- Status: `done`
- Title: Standardize 100-question MBLEx pack workflow
- Goal: Document a consistent 100-question MBLEx pack authoring standard and confirm importer behavior tolerates pack metadata/meta fields without DB changes.
- In scope:
- Update `docs/content-packs.md` with MBLEx 100-question standard:
- Difficulty mix: `40 easy / 40 medium / 20 hard`
- `domain_code` required per question
- `meta.visibility: "active"` required for packs intended for Test Center visibility
- Clarify importer metadata behavior (tolerates extra `meta`/pack-level metadata fields)
- Out of scope:
- DB schema/migration changes
- `/test/run` behavior changes
- Importer write-path schema changes
- Acceptance criteria:
- `docs/content-packs.md` clearly documents 100-question MBLEx standard and required metadata fields
- Importer behavior is documented as metadata-tolerant (no DB changes needed)
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `docs/content-packs.md`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Workflow standardization slice only.
- Validation (2026-02-27):
- `npm run smoke` pass
- `npm run build` pass

### SLICE-H

- Status: `done`
- Title: Hide legacy packs from Test Center using pack visibility metadata
- Goal: Add optional `meta.visibility` pack metadata and update `/test` pack loading to show only active packs while hiding legacy/draft (including untagged packs by default).
- In scope:
- Add `meta.visibility` support in `app/test/page.js` pack loader
- Filter Test Center pack options to show only packs with `meta.visibility: "active"`
- Treat missing/invalid visibility as `legacy` (hidden)
- Update `docs/content-packs.md` with `meta.visibility` field and behavior
- Mark `src/content/packs/mblex-d6-ethics-v1.json` as `meta.visibility: "active"`
- Out of scope:
- Deleting legacy pack files
- Changing `/test/run` `pack_id` query/filter behavior
- Importer behavior changes
- Acceptance criteria:
- `/test` pack list excludes legacy/draft packs and excludes untagged packs by default
- `mblex-d6-ethics-v1` remains visible via `meta.visibility: "active"`
- `/test/run` continues to use `questions.pack_id` unchanged
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `app/test/page.js`
- `src/content/packs/mblex-d6-ethics-v1.json`
- `docs/content-packs.md`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Chosen visibility policy: explicit `active` only; default for missing/invalid visibility is `legacy`.
- Validation (2026-02-27):
- `npm run smoke` pass
- `npm run build` pass

### SLICE-M3

- Status: `done`
- Title: Support domain_code-only pack imports (blueprint_code legacy optional)
- Goal: Update pack import validation/mapping to require `domain_code` (`D1..D7`) while treating `blueprint_code` as optional legacy input, and keep pack-id + `pack_id` write behavior stable for `/test` pack filtering.
- In scope:
- Update `scripts/import-pack.mjs` question validation to require valid `domain_code` (`D1..D7`)
- Allow legacy fallback mapping from `blueprint_code` to `domain_code` when `domain_code` is missing
- Keep `blueprint_code` optional (no longer required)
- Ensure importer writes `questions.domain_code`
- Expand pack id resolver to accept `pack_id` or `packId` or `meta.id` (priority order)
- Keep writing `pack_id` on imported rows
- Update relevant pack-shape docs/schema validation notes for the new requirement
- Out of scope:
- Changes to `/test/run` pack filter behavior
- Dropping `questions.blueprint_code` from DB
- Broad refactors across unrelated scripts
- Acceptance criteria:
- Importer accepts `domain_code`-only packs and imports valid rows without requiring `blueprint_code`
- If `domain_code` is missing and `blueprint_code` maps to section 1..7, importer derives `domain_code`
- Invalid/missing `domain_code` rows are reported as validation failures
- Pack-level id resolves from `pack_id`, then `packId`, then `meta.id`
- Imported rows still include `pack_id` and `/test/run` behavior remains unchanged
- Required validation/tests:
- `npm run import:pack -- src/content/packs/mblex-d6-ethics-v1.json`
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `scripts/import-pack.mjs`
- `docs/content-packs.md`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Follow-up to SLICE-M1/M2 taxonomy transition.
- Validation (2026-02-27):
- `npm run import:pack -- src/content/packs/mblex-d6-ethics-v1.json` pass (`Inserted: 50`, `Updated: 0`, `Tagged: 0`, `Skipped duplicates: 0`, `Skipped/invalid: 0`)
- `npm run smoke` pass
- `npm run build` pass

### SLICE-M2

- Status: `done`
- Title: Domain code SQL follow-up with unmapped blueprint_code report
- Goal: Add an idempotent SQL script that ensures `questions.domain_code` (`D1..D7`) exists/backfilled/indexed and reports any nonblank `blueprint_code` values that do not map to a valid domain code.
- In scope:
- Add a copy/paste SQL script in `docs/sql/run-these-queries/` for `domain_code` column/check/index/backfill
- Include an unmapped-value report query (counts + example row id) for nonblank `blueprint_code` values
- Keep app code untouched
- Out of scope:
- App/query code changes
- Dropping `blueprint_code`
- Write-path changes that populate `domain_code` on insert/update
- Acceptance criteria:
- SQL script is idempotent for adding `domain_code`, `D1..D7` check constraint, and `domain_code` index
- Script backfills `domain_code` from existing `blueprint_code`
- Script ends with a query that reports unmapped nonblank `blueprint_code` values
- Required validation/tests:
- Manual SQL review of `docs/sql/run-these-queries/2026-02-26-slice-m2-questions-domain-code-unmapped-report.sql`
- Run script in Supabase SQL Editor and inspect final result set for unmapped rows (empty result = none unmapped)
- Files expected to change:
- `docs/sql/run-these-queries/2026-02-26-slice-m2-questions-domain-code-unmapped-report.sql`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Follow-up to `SLICE-M1` to add explicit unmapped reporting before any stricter domain-code enforcement.

### SLICE-M1

- Status: `done`
- Title: Replace `blueprint_code` with `domain_code` (Phase 1: add + backfill)
- Goal: Add `questions.domain_code` (`D1..D7`) with a backfill from existing `blueprint_code`, keep `blueprint_code` in place for safety, and switch feasible domain-level queries to `domain_code`.
- In scope:
- Add a SQL migration to add `questions.domain_code` (text) with a `D1..D7` check constraint
- Backfill `domain_code` from `blueprint_code` using a CASE mapping in the migration
- Add an index on `questions.domain_code`
- Update feasible server/query filters that are domain-level to use `domain_code` without removing `blueprint_code`
- Out of scope:
- Dropping `questions.blueprint_code`
- Broad refactors of question authoring/import/write paths
- Replacing leaf-level `blueprint_code` usage where leaf granularity is still required
- Acceptance criteria:
- SQL migration adds `questions.domain_code`, backfills from `blueprint_code`, enforces `D1..D7` (nullable allowed), and adds an index
- `blueprint_code` remains present (no drop in this slice)
- At least one feasible domain-level question query filter switches from `blueprint_code` to `domain_code` with compile/build passing
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Files expected to change:
- `docs/sql/run-these-queries/2026-02-26-slice-m1-questions-domain-code-phase1.sql`
- `app/today/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Phase 1 keeps `blueprint_code` as the source of truth for leaf-level coverage and legacy write paths; follow-up slice should populate `domain_code` on insert/update paths before broader query migration.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester follow-up: run `docs/sql/run-these-queries/2026-02-26-slice-m1-questions-domain-code-phase1.sql` in Supabase/Postgres before relying on `/today` `domain_code` filtering in production.

### SLICE-G

- Status: `done`
- Title: Make `/review` queue-backed sessions queue-only (no padding)
- Goal: When local queued review IDs exist, `/review` should build a session strictly from queued items (no attempts/random padding) and show the matching start count in the CTA.
- In scope:
- Use queued-only questions when local queued IDs exist (user queue preferred, else anon fallback)
- Prevent padding queued sessions with attempts-based review items
- Update `/review` Start CTA count to show queued count (capped at default request size of 10)
- Keep queue consumption behavior unchanged (consume only used queued IDs after success)
- Out of scope:
- Changes to queue persistence or consumption rules
- QuestionRunner changes
- Sidebar review badge changes
- Acceptance criteria:
- With queued IDs present (e.g. 3), `/review` Start CTA shows `Start Review (3)` and session uses exactly queued items without padding
- With no queued IDs, existing attempts-based behavior remains and CTA shows `Start Review (10)`
- Queue consumption still happens only for used queued IDs after successful session build
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Manual: queue 3 misses, verify `/review` CTA shows `Start Review (3)`, session uses exactly 3, queue becomes 0 after start
- Files expected to change:
- `app/review/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal follow-up to Slice F/E2 review queue UX/behavior.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester manual verification pending: queue 3 misses, verify `/review` CTA shows `Start Review (3)`, session uses exactly 3, and queue becomes 0 after start.

### SLICE-F

- Status: `done`
- Title: Show queued review count in `/review` page header
- Goal: Add a small normal UI header line on `/review` that shows the current local queued count (`Queued: N`) and optionally the queued-backed fetch count (`Using: M`) when a queued session is built.
- In scope:
- Add client-only local queue count sync in `/review` using existing local queue helpers
- Render `Queued: N` near the top/Start Review section
- Optionally render `Using: M` when queued-backed fetch count is available
- Keep review behavior unchanged (selection/consume logic intact)
- Out of scope:
- Changes to QuestionRunner or sidebar badge behavior
- New review queue persistence mechanisms
- Acceptance criteria:
- `/review` shows `Queued: N` (including `Queued: 0`) based on localStorage queue count
- `/review` may show `Using: M` after queued-backed fetch/session build when available
- Client-only localStorage access avoids SSR/window errors
- No behavior changes to review start/consume flow
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Manual: queue 3 misses, open `/review`, verify `Queued: 3`; start review and confirm count updates after consumption
- Files expected to change:
- `app/review/page.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal UI-only follow-up to Slice E2 queue fixes.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester manual verification pending: queue 3 misses, open `/review`, verify `Queued: 3`, start review, confirm header count updates after consumption.

### SLICE-E2

- Status: `done`
- Title: Fix `/review` queued loading and wire local Review count badge
- Goal: Make `/review` reliably load queued local review IDs (with explicit stale-queue error handling) and replace the sidebar's hardcoded `Review (0)` pill with the live local queue count.
- In scope:
- Normalize local queued question IDs for Supabase `questions.id` fetches in `/review`
- Prevent silent fallback when queued IDs exist but queued fetch returns 0 rows; show explicit on-page error and keep queue intact
- Consume queued IDs only after successful queued fetch + review session build
- Add a small dev-only debug log with queued count and fetched-from-queue count
- Replace hardcoded sidebar `Review (0)` label with local queue count (prefer user queue, fallback anon) using client-safe localStorage reads
- Out of scope:
- New review UI surfaces/badges beyond the existing sidebar pill label
- QuestionRunner changes
- Server-side review queue persistence
- Acceptance criteria:
- `/review` reads authed user queue plus anon fallback and reliably loads queued questions when IDs exist
- If queued IDs exist but queued fetch returns 0 rows, `/review` shows an explicit error and does not consume queue IDs or silently fall back
- Queued IDs are consumed only after a review session is successfully built from queued rows
- Sidebar review pill shows `Review (N)` using local localStorage queue count
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Manual: queue 3 misses, confirm sidebar shows `Review (3)`, open `/review`, confirm queued items load and queue shrinks after start
- Files expected to change:
- `app/review/page.js`
- `app/AppShell.js`
- `src/lib/reviewQueueLocal.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal follow-up to Slice D/E1 local review queue behavior.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester manual verification pending: queue 3 misses, verify sidebar `Review (3)`, start `/review`, confirm queued items load and queue shrinks by used IDs.

### SLICE-E1

- Status: `done`
- Title: Auto-clear consumed local review queue IDs when starting `/review`
- Goal: Add consume semantics for the local review queue so queued IDs actually used to start a review session are removed while unused queued IDs remain.
- In scope:
- Add local review queue remove/consume helper in `src/lib/reviewQueueLocal.js`
- Update `/review` start flow to consume only queued IDs actually included in the session
- Prefer consuming from authed user queue and only consume anon fallback IDs when they were actually sourced from anon queue
- Add a small dev-only debug log for consumption counts
- Out of scope:
- UI changes or queue badge/count display
- QuestionRunner changes
- Supabase review queue table work
- Acceptance criteria:
- Starting `/review` consumes local queued IDs that are actually included in the started session
- Unused local queued IDs remain in localStorage
- Authed users consume from `user.id` queue first; anon queue is consumed only for IDs sourced from anon fallback
- No new UI added; smoke/build continue passing
- Required validation/tests:
- `npm run smoke`
- `npm run build`
- Manual: queue 3 misses, start `/review`, confirm local queue shrinks by used IDs and keeps unused IDs
- Files expected to change:
- `app/review/page.js`
- `src/lib/reviewQueueLocal.js`
- `docs/CHANGELOG.md`
- `docs/slices.md`
- Notes:
- Minimal follow-up to Slice D localStorage queue fallback.
- Validation (2026-02-26): `npm run smoke` pass, `npm run build` pass
- Tester manual verification pending: queue 3 misses, start `/review`, confirm local queue shrinks by used IDs and leaves unused IDs.

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
