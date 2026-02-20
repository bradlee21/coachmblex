# V1 Runbook

## Scope
This runbook covers full setup for:
- Core learner flows (`/today`, `/drill`, `/review`, `/progress`)
- Study Night multiplayer (`/game/study-night`)
- Question Forge (`/admin/questions`)

Roles used in V1:
- `user`
- `questions_editor`
- `admin`

## Required Environment Variables
Runtime (local + Vercel):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (recommended)

Seed-only (local terminal only, not browser runtime):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Notes:
- `SUPABASE_SERVICE_ROLE_KEY` is used by `npm run seed` only.
- Do not set service role key in client-side code.

## Vercel Setup
1. Import repo into Vercel as a Next.js project.
2. Set env vars in both Preview and Production:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
3. Deploy once and verify build success.

## Supabase Project Setup
1. Create a new Supabase project.
2. Auth:
   - Enable Email/Password provider.
   - Add redirect URLs for local + deployed app.
3. SQL Editor: run files in order.

### SQL Order (Fresh Environment)
Run these files in this order:
1. `docs/sql/profiles.sql`
2. `docs/sql/concepts.sql`
3. `docs/sql/questions.sql`
4. `docs/sql/attempts.sql`
5. `docs/sql/diagram_attempts.sql` (if anatomy/diagram tracking is needed)
6. `docs/sql/study_rooms.sql`
7. `docs/sql/study_room_players.sql`
8. `docs/sql/study_room_state.sql`

This order ensures role-based policies and table dependencies are ready before Study Night writes.

### SQL Order (Existing Environment Patches)
If patching an already-running environment, apply in this order:
1. `docs/sql/run-these-queries/2026-02-20-tp17a-tp17b-roles-and-forge.sql`
2. `docs/sql/run-these-queries/2026-02-20-tp19-question-forge-update-policy.sql`
3. Re-run latest table docs as needed for additive `alter table if not exists` snippets:
   - `docs/sql/study_rooms.sql`
   - `docs/sql/study_room_players.sql`
   - `docs/sql/study_room_state.sql`

## Realtime Setup (Study Night)
Study Night uses Supabase Realtime subscriptions + broadcast in room pages.

Enable Realtime replication for these public tables:
- `study_rooms`
- `study_room_players`
- `study_room_state`

Checklist:
1. Realtime service enabled in project.
2. Each table above added to Realtime publication (Dashboard -> Database -> Replication).
3. RLS policies in the SQL files above are applied.

Channel note:
- Current client uses room-scoped channel names like `study-night-<roomId>`.
- Keep payloads non-sensitive; authorization relies on Auth + RLS + host checks in app logic.

## Seeding and Content Scripts
1. Set local shell vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Seed starter content:
   - `npm run seed`
3. Regenerate coverage targets (if updating target config/workflow):
   - `npm run coverage:gen`

## Verification
Automated checks:
1. `npm run smoke`
2. `npm run build`
3. Optional E2E single run:
   - Set `E2E_BASE_URL` (optional; defaults to `http://localhost:3000`)
   - Set `E2E_EMAIL` and `E2E_PASSWORD`
   - Run `npm run e2e:once`
   - If credentials are not set, the critical spec skips by design

E2E note:
- `npm run e2e` and `npm run e2e:once` are opt-in only.
- E2E is not part of `npm run smoke` or `npm run build`.

Manual checks:
1. Auth/login works.
2. Drill MCQ works (`/drill`).
3. Study Night works across two browsers:
   - Host creates room.
   - Second user joins by code.
   - Start game and advance at least one turn.
4. Question Forge for `questions_editor`:
   - Access `/admin/questions`.
   - Save new question.
   - Search and edit same question.
5. Role guard:
   - `questions_editor` cannot access unrelated `/admin/*` pages.

## Troubleshooting
### RLS symptoms
- Common errors: `401`, `403`, PostgREST `42501`, empty writes.
- Checks:
  1. Confirm correct user is signed in.
  2. Confirm `public.profiles.role` for that user.
  3. Re-run relevant SQL policy docs (`profiles.sql`, `questions.sql`, `study_*`).

### Realtime not updating
- Symptoms: room state only updates after refresh.
- Checks:
  1. Confirm Realtime publication includes the three Study Night tables.
  2. Confirm websocket connectivity from browser.
  3. Confirm table RLS still permits SELECT for authenticated users.

### PostgREST vs supabase-js timeouts
- Known issue observed: `supabase-js` table operations can timeout in Study Night for some environments.
- Current workaround scope:
  - Study Night create/join/room CRUD uses `postgrestFetch` (direct REST with auth token).
  - Other app surfaces may still use `supabase-js` where stable.
- If Study Night fails but `/rest/v1` works, verify env URL/key and continue using PostgREST path.
