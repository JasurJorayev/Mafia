-- ================================================================
-- MAFIA v22 — SKIN MIGRATION
-- psql -U postgres -d mafia -f migrate_skin.sql
-- ================================================================

-- users jadvaliga active_skin ustuni
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS active_skin VARCHAR(50) DEFAULT NULL;

SELECT 'Skin migration bajarildi ✅' AS status;
