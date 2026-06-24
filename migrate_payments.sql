-- ================================================================
-- MAFIA — TELEGRAM STARS TO'LOV JADVALI
-- Bajaring: psql -U postgres -d mafia -f migrate_payments.sql
-- ================================================================

CREATE TABLE IF NOT EXISTS payment_logs (
    id                   SERIAL PRIMARY KEY,
    user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id           VARCHAR(30) NOT NULL,
    coins                INTEGER NOT NULL,
    stars                INTEGER NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'pending',   -- pending | completed | failed
    telegram_message_id  BIGINT,
    telegram_charge_id   VARCHAR(200) UNIQUE,
    completed_at         TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON payment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status  ON payment_logs(status);

SELECT 'Payment migration bajarildi ✅' AS status;
