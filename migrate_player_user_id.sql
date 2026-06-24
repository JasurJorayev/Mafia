-- ================================================================
-- MAFIA v25.3 — PLAYERS USER_ID MIGRATION
-- Bajaring: psql -U postgres -d mafia -f migrate_player_user_id.sql
-- ================================================================

-- players jadvaliga user_id ustuni qo'shish (NULL = mehmon o'yinchi)
ALTER TABLE players
    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Index — tezroq qidirish uchun
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);

SELECT 'Player user_id migration bajarildi ✅' AS status;
