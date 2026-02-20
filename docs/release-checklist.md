# Release Checklist (V1)

## Pre-demo
- Confirm env vars are set (local or deployed target):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL` (recommended)
- Confirm SQL migrations are applied in order (see `docs/runbook.md`).
- Confirm question seed status:
  - `npm run seed` completed for the target Supabase project.
- Confirm Realtime is enabled and replication includes:
  - `study_rooms`
  - `study_room_players`
  - `study_room_state`
- Quick health checks:
  - `npm run smoke:critical`
  - `npm run build`
  - `npm run e2e:critical`

## Demo Script (5-8 minutes)
1. Login
   - Sign in as normal `user`.
2. Today/Drill quick run
   - Open `/today` and show protected-route loading is healthy.
   - Open `/drill` and run one quick MCQ.
3. Study Night multiplayer
   - Open `/game/study-night`.
   - Create room and copy/share invite link.
   - Join from a second browser/session via `?join=CODE`.
4. Play 1-2 turns
   - Start room, pick category/type, answer one turn.
   - Show scoreboard/marks update and finished flow concept.
   - Show Coach Review and the `Drill my weak spots` deep link.
5. Question Forge
   - Sign in as `questions_editor` (or admin).
   - Open `/admin/questions`.
   - Use Coverage Gaps `Write next`, fill prompt, preview, save.
   - Run Search, load same question, edit, save update.

## Demo Notes (Talking Points)
- Coverage-first authoring: instructors write where blueprint gaps are largest.
- Canonical blueprint taxonomy keeps content aligned to MBLEX structure.
- Short explanation format (Answer/Why/Trap/Hook) improves teaching clarity.
- Study Night supports multiplayer collaborative practice with host-driven flow.
- Coach Review turns gameplay misses into targeted Drill follow-up.
- During private beta, ask testers to use in-app Send feedback for issues.

## If Something Breaks (Quick Triage)
1. Realtime checks
   - Realtime service enabled.
   - Replication enabled for `study_rooms`, `study_room_players`, `study_room_state`.
2. RLS/policy checks
   - Run/verify SQL from `docs/sql/*.sql` and `docs/sql/run-these-queries/*`.
   - Confirm role in `public.profiles` for the current user.
3. Question Forge checks
   - Use Role and Permissions Status panel on `/admin/questions`.
4. Study Night checks
   - Use Study Night connection diagnostics panel on `/game/study-night`.

## Rollback Notes
- App deploy rollback:
  - Revert to previous Vercel deployment.
- SQL rollback:
  - Revert the last SQL change set manually in Supabase SQL Editor.
  - Re-apply known-good SQL from `docs/runbook.md` order if needed.
- After rollback:
  - Re-run `npm run smoke:critical` and a manual Study Night room check.

## E2E Tiers
- Fast demo gate: `npm run test:all` (`build -> smoke:critical -> e2e:critical`).
- Broad route pass (heavier, optional): `npm run e2e:journey`.
- Signup pass (optional): `npm run e2e:signup` with `E2E_SIGNUP=1` and email confirmation disabled.
