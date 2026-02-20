# Changelog

## 2026-02-20
- Study Night TP11: updated UI terminology from wedges to marks/badges and removed Trivial-Pursuit-specific wording in Study Night screens.
- Pick phase now renders neutral category progress tiles with earned indicators and disabled earned categories.
- Player and finished views now show earned-category chips with check marks and explicit progress counts toward the win target.
- Study Night TP10: hardened turn integrity by gating answer submission to the current turn player and showing waiting hints for others.
- Added local per-turn submit guards (`room:round:turn:question`) to block double-scoring and surface "Already answered" feedback.
- Added host-action guards/messages for Start/Advance and extra patch-target sanity checks in multiplayer update paths.
- Study Night TP8: added room-state `deck` and `deck_pos` support (SQL docs + migration snippets) for host-authoritative question rotation.
- Host start now prebuilds per-category/per-game-type question ID decks and initializes deck positions for synced multiplayer selection.
- Turn question selection now consumes `deck/deck_pos` first and advances position per key, with deterministic fallback when a deck bucket is empty.
- Study Night TP7: added player `last_seen_at` heartbeat updates every 15 seconds for reconnect-aware activity tracking.
- Added safe rejoin membership sync on room load so refresh/disconnect users are re-upserted if their player row is missing.
- Added lightweight `Active X / Total Y` presence hint in the room player panel.
- Study Night TP6: added `game_type_mode` room setting (`pick` or `roulette`) with create-room controls and SQL docs/migration snippets.
- Roulette mode now hides manual game-type selection and lets the host auto-select MCQ/Reverse/Fill with a simple no-repeat reroll rule.
- Pick/question UI now surfaces the active turn game type label for both modes.
- Study Night TP5: added host-configurable room settings (`win_wedges`, `duration_sec`, `question_count`) to room creation and SQL docs.
- Study Night runtime now uses room-level win/timer settings with backward-compatible defaults for older rooms.
- Study Night TP4: enforced Trivial Pursuit wedge win threshold via `WIN_WEDGES` with host finishing the room when any player reaches the target.
- Study Night pick phase now marks and disables categories already owned by the current turn player to encourage wedge variety.
- Study Night finished view now includes a final scoreboard with per-player score and wedge progress.
- Study Night TP3a: added Fill as a third per-turn mini-game option (`mcq`, `reverse`, `fill`) in the category pick phase.
- Study Night question phase now renders a fill-in text input for fill questions with normalized answer matching and Enter-to-submit behavior.
- Added fill question seed coverage for Study Night testing with canonical `blueprint_code` prefixes.
- Study Night TP2: added per-turn game type selection (`mcq` or `reverse`) in the pick phase, with room state persisted via `study_room_state.game_type`.
- Study Night question selection now filters by both canonical `blueprint_code` prefix and selected `question_type`, while keeping deterministic ordering.
- Reveal/question UI now surfaces the active game type so players can confirm the selected mini-game.

## 2026-02-19
- Gated auth/route debug logging behind dev-only helpers (`devLog`/`devWarn`) so production avoids `[AUTH]` guard noise.
- Added a smoke regression check (`scripts/auth-loading-regression.mjs`) to protect against protected-route session loading gates getting stuck.
- Added Study Night TP1 MVP scaffolding: multiplayer room routes, host-driven turn/phase loop, category wedges mapped to MBLEX blueprint prefixes, and shared Quickfire MCQ rounds.
- Added SQL docs for `study_rooms`, `study_room_players`, and `study_room_state` with RLS policies for host/player permissions.
- Added lightweight smoke coverage for Study Night routes and protected `/game` gating.
