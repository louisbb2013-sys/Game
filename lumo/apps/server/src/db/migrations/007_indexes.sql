-- Indexes for hot lookups and for fast cascading deletes (deleting a deck or an account).
CREATE INDEX IF NOT EXISTS attempts_session_idx ON attempts (session_id);
CREATE INDEX IF NOT EXISTS attempts_concept_idx ON attempts (concept_id);
CREATE INDEX IF NOT EXISTS concept_states_concept_idx ON concept_states (concept_id);
CREATE INDEX IF NOT EXISTS quiz_sessions_deck_idx ON quiz_sessions (deck_id);
CREATE INDEX IF NOT EXISTS xp_events_user_time_idx ON xp_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads (user_id);
CREATE INDEX IF NOT EXISTS league_members_user_idx ON league_members (user_id);
CREATE INDEX IF NOT EXISTS group_decks_deck_idx ON group_decks (deck_id);
CREATE INDEX IF NOT EXISTS group_daily_user_idx ON group_daily (user_id);
CREATE INDEX IF NOT EXISTS study_plans_deck_idx ON study_plans (deck_id);
CREATE INDEX IF NOT EXISTS friendships_requested_by_idx ON friendships (requested_by);
CREATE INDEX IF NOT EXISTS live_games_host_idx ON live_games (host_id);
CREATE INDEX IF NOT EXISTS study_groups_owner_idx ON study_groups (owner_id);
CREATE INDEX IF NOT EXISTS chats_deck_idx ON chats (deck_id);
CREATE INDEX IF NOT EXISTS sandbox_deck_idx ON sandbox_activities (deck_id);
