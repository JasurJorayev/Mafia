import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

if (!process.env.DB_PASSWORD || process.env.DB_PASSWORD === 'CHANGE_THIS_PASSWORD') {
    console.warn("⚠️  WARNING: DB_PASSWORD .env faylida o'rnatilmagan!");
}

const pool = new Pool({
    user:     process.env.DB_USER     || 'postgres',
    host:     process.env.DB_HOST     || 'localhost',
    database: process.env.DB_NAME     || 'mafia',
    password: process.env.DB_PASSWORD,
    port:     parseInt(process.env.DB_PORT) || 5432,

    // Connection pool sozlamalari
    max:                    20,   // max parallel ulanishlar
    min:                    2,    // har doim 2 ta tayyor ulanish
    idleTimeoutMillis:      30000, // 30s ishlatilmasa yopiladi
    connectionTimeoutMillis: 3000, // 3s ichida ulanolmasa xato
    allowExitOnIdle:         false,
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool xatosi:', err.message);
});

// Health check — server start bo'lganda DB ulanishni tekshiramiz
pool.query('SELECT 1')
    .then(() => console.log('✅ PostgreSQL ulandi'))
    .catch(err => console.error('❌ PostgreSQL ulanmadi:', err.message));

export default pool;
