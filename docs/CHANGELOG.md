# Changelog

## 2026-02-19
- Gated auth/route debug logging behind dev-only helpers (`devLog`/`devWarn`) so production avoids `[AUTH]` guard noise.
- Added a smoke regression check (`scripts/auth-loading-regression.mjs`) to protect against protected-route session loading gates getting stuck.
- Added Study Night TP1 MVP scaffolding: multiplayer room routes, host-driven turn/phase loop, category wedges mapped to MBLEX blueprint prefixes, and shared Quickfire MCQ rounds.
- Added SQL docs for `study_rooms`, `study_room_players`, and `study_room_state` with RLS policies for host/player permissions.
- Added lightweight smoke coverage for Study Night routes and protected `/game` gating.
