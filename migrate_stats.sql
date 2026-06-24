-- O'yin statistikasi ustunlarini qo'shish
-- Agar ustunlar allaqachon mavjud bo'lsa xato bermaydi

ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS games_played INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS games_won    INTEGER DEFAULT 0;

-- Mavjud NULL qiymatlarni 0 ga tenglashtirish
UPDATE users SET games_played = 0 WHERE games_played IS NULL;
UPDATE users SET games_won    = 0 WHERE games_won    IS NULL;
