-- ================================================================
-- MAFIA v22 — SHOP MIGRATION
-- Bajaring: psql -U postgres -d mafia -f migrate_shop.sql
-- ================================================================

-- 1. users jadvaliga coins ustuni qo'shish
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0;

-- 2. Xaridlar jadvali
CREATE TABLE IF NOT EXISTS user_purchases (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id     VARCHAR(50) NOT NULL,
    item_type   VARCHAR(20) NOT NULL DEFAULT 'name',
    price_paid  INTEGER NOT NULL DEFAULT 0,
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, item_id)
);

-- 3. Index — tezroq qidirish uchun
CREATE INDEX IF NOT EXISTS idx_user_purchases_user_id ON user_purchases(user_id);

-- Tekshirish
SELECT 'Migration muvaffaqiyatli bajarildi ✅' AS status;
