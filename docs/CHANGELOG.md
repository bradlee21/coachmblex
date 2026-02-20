# Changelog

## 2026-02-20
- Study Night TP2: added per-turn game type selection (`mcq` or `reverse`) in the pick phase, with room state persisted via `study_room_state.game_type`.
- Study Night question selection now filters by both canonical `blueprint_code` prefix and selected `question_type`, while keeping deterministic ordering.
- Reveal/question UI now surfaces the active game type so players can confirm the selected mini-game.

## 2026-02-19
- Gated auth/route debug logging behind dev-only helpers (`devLog`/`devWarn`) so production avoids `[AUTH]` guard noise.
- Added a smoke regression check (`scripts/auth-loading-regression.mjs`) to protect against protected-route session loading gates getting stuck.
- Added Study Night TP1 MVP scaffolding: multiplayer room routes, host-driven turn/phase loop, category wedges mapped to MBLEX blueprint prefixes, and shared Quickfire MCQ rounds.
- Added SQL docs for `study_rooms`, `study_room_players`, and `study_room_state` with RLS policies for host/player permissions.
- Added lightweight smoke coverage for Study Night routes and protected `/game` gating.
