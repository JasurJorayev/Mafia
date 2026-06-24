import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'CHANGE_THIS_PASSWORD') {
    console.warn("⚠️  WARNING: DB_PASSWORD .env faylida o'rnatilmagan!");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
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
    .then(() => console.log('✅ PostgreSQL ulandi'))
    .catch(err => console.error('❌ PostgreSQL ulanmadi:', err.message));

export default pool;
