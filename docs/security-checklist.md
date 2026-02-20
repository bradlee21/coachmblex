# Security Checklist (V1)

## Roles and Expected Permissions
- `user`
  - Can access learning routes (`/today`, `/review`, `/drill`, `/progress`, `/settings`).
  - Can access Study Night routes (`/game/study-night`, room routes) after auth.
  - Can only act within joined rooms and own player row permissions.
- `questions_editor`
  - Can access `/admin/questions` only.
  - Can insert and update questions (per RLS policy).
  - Cannot access other `/admin/*` routes.
- `admin`
  - Keeps existing admin scope.
  - Can access `/admin/questions` and existing admin routes.

## Route Access Summary
Current route guard behavior (AppShell):
- All `/game/*` routes are protected (auth required).
- All `/admin/*` routes are protected and role-gated.
- `questions_editor` is restricted to `/admin/questions` and `/admin/questions/*` only.
- Non-privileged users get: `You do not have access to this area.` on blocked admin routes.

## Table Access Summary (RLS intent)
- `public.profiles`
  - Self-only select/insert/update (`auth.uid() = id`).
- `public.questions`
  - SELECT: authenticated users.
  - INSERT/UPDATE: `questions_editor` and `admin` via `profiles.role` policy checks.
- `public.study_rooms`
  - SELECT: authenticated users.
  - INSERT: host row only (`auth.uid() = host_user_id`).
  - UPDATE: host-only.
- `public.study_room_players`
  - SELECT: authenticated users with room membership relation.
  - INSERT: self join row only.
  - UPDATE: self row and host-in-room updates (limited update grant columns).
- `public.study_room_state`
  - SELECT: authenticated users with room relation.
  - INSERT/UPDATE: host-only for that room.

## Realtime Notes
- Replication should be enabled for:
  - `study_rooms`
  - `study_room_players`
  - `study_room_state`
- Expected behavior:
  - Unauthorized/anon users should not be able to read protected room data via postgres changes.
  - Room updates should be visible only to authenticated users allowed by table policies.

## Quick Sanity Probe
Run:

```bash
node scripts/rls-sanity.mjs
```

This anon-key probe checks for obvious public data leaks on protected Study Night tables and current question read policy expectations.

## References
- `docs/sql/profiles.sql`
- `docs/sql/questions.sql`
- `docs/sql/study_rooms.sql`
- `docs/sql/study_room_players.sql`
- `docs/sql/study_room_state.sql`
- `app/AppShell.js`
