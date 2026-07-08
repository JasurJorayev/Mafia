import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'CHANGE_THIS_PASSWORD') {
    console.warn("⚠️  WARNING: DB_PASSWORD .env faylida o'rnatilmagan!");
}

// Lokal (localhost/127.0.0.1) ulanishda SSL kerak emas — mahalliy Postgres
// odatda SSL'ni qo'llab-quvvatlamaydi. Railway/production'da esa SSL majburiy.
const dbUrl = process.env.DATABASE_URL || '';
const isLocal = /localhost|127\.0\.0\.1/.test(dbUrl) || /localhost|127\.0\.0\.1/.test(process.env.DB_HOST || '');
const useSSL = process.env.DB_SSL === 'true' ? true
             : process.env.DB_SSL === 'false' ? false
             : !isLocal;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    allowExitOnIdle: false,
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool xatosi:', err.message);
});

// Health check — server start bo'lganda DB ulanishni tekshiramiz
pool.query('SELECT 1')
    .then(() => console.log(`✅ PostgreSQL ulandi (SSL: ${useSSL ? 'yoqilgan' : "o'chirilgan"})`))
    .catch(err => console.error('❌ PostgreSQL ulanmadi:', err.message));

export default pool;
