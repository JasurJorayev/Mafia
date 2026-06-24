import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import playerRouter from './router/player.route.js';
import pool from './config/db.js';
import dotenv from 'dotenv';
import { advancePhaseLogic } from './controller/player.controller.js';
import authRouter from './router/auth.route.js';
import shopRouter from './router/shop.route.js';
import paymentRouter from './router/payment.route.js';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const server = createServer(app);

// ===============================================================
// CORS
// ===============================================================
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const io = new Server(server, {
    cors: { origin: allowedOrigin, methods: ['GET', 'POST'] }
});

// ===============================================================
// XAVFSIZLIK HEADERLAR
// ===============================================================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-Frame-Options: DENY o'rniga Telegram Mini App uchun ruxsat beramiz
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ===============================================================
// RATE LIMITING — yaxshilangan: window o'tganda avtomatik reset
// ===============================================================
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX    = 6000;

function rateLimiter(req, res, next) {
    const ip  = req.ip || req.socket.remoteAddress;
    const now = Date.now();
    const rec = rateLimitMap.get(ip);

    if (!rec || now - rec.start > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(ip, { count: 1, start: now });
        return next();
    }
    rec.count++;
    if (rec.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ message: "Juda ko'p so'rov. Biroz kuting." });
    }
    next();
}

// Eski yozuvlarni tozalash — har 5 daqiqa
setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW * 5;
    for (const [ip, rec] of rateLimitMap) {
        if (rec.start < cutoff) rateLimitMap.delete(ip);
    }
}, 5 * 60 * 1000);

app.use(express.json({ limit: '10kb' }));

const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.use('/api', rateLimiter, authRouter);
app.set('io', io);
app.use('/api', rateLimiter, playerRouter);
app.use('/api', rateLimiter, shopRouter);
app.use('/api', paymentRouter);   // To'lov webhook rate limit olmaydi (Telegram IP dan keladi)

// ===============================================================
// SOCKET
// ===============================================================
io.on('connection', (socket) => {
    console.log(`Ulandi: ${socket.id}`);

    socket.on('join-lobby-room', ({ lobbyCode, username }) => {
        if (!lobbyCode || !username) return;
        if (typeof lobbyCode !== 'string' || typeof username !== 'string') return;
        if (lobbyCode.length > 10 || username.length > 50) return;
        socket.join(lobbyCode);
        socket.lobbyCode = lobbyCode;
        socket.username  = username;
        console.log(`${username} → xona: ${lobbyCode}`);
    });

    // ── CHAT ────────────────────────────────────────────────────
    socket.on('chat-message', async ({ lobbyCode, username, text }) => {
        if (!lobbyCode || !username || !text) return;
        if (typeof text !== 'string') return;
        const clean = text.trim().slice(0, 200);
        if (!clean) return;

        // Faqat discussion fazasida ruxsat
        try {
            const lobbyQ = await pool.query(
                'SELECT current_phase FROM lobbies WHERE lobby_code=$1',
                [lobbyCode]
            );
            if (!lobbyQ.rowCount || lobbyQ.rows[0].current_phase !== 'discussion') return;

            // O'yinchining rolini olish
            const playerQ = await pool.query(
                'SELECT role FROM players WHERE lobby_code=$1 AND username=$2',
                [lobbyCode, username]
            );
            const pRole = playerQ.rowCount ? playerQ.rows[0].role : null;
            const role = (pRole && pRole !== 'unassigned') ? pRole : null;

            const msgData = { username, text: clean, role, ts: Date.now() };
            io.to(lobbyCode).emit('chat-message', msgData);
        } catch (e) {
            console.error('[chat] Xato:', e.message);
        }
    });

    socket.on('disconnect', async () => {
        const { lobbyCode, username } = socket;
        if (!lobbyCode || !username) return;
        console.log(`Chiqdi: ${username} (${lobbyCode})`);

        setTimeout(async () => {
            try {
                const room        = io.sockets.adapter.rooms.get(lobbyCode);
                const activeCount = room ? room.size : 0;

                const lobbyQ = await pool.query(
                    'SELECT current_phase, admin_username FROM lobbies WHERE lobby_code=$1',
                    [lobbyCode]
                );
                if (lobbyQ.rowCount === 0) return;
                const { current_phase, admin_username } = lobbyQ.rows[0];

                // Hamma socketdan chiqib ketgan — lobbini to'liq tozalaymiz
                if (activeCount === 0) {
                    console.log(`Lobbi ${lobbyCode} bo'sh — o'chirildi.`);
                    await pool.query('DELETE FROM players WHERE lobby_code=$1', [lobbyCode]);
                    await pool.query('DELETE FROM lobbies WHERE lobby_code=$1', [lobbyCode]);
                    io.to(lobbyCode).emit('lobby-closed');
                    io.emit('lobbies-updated');
                    return;
                }

                // Waiting fazasida disconnect — o'yinchini DB dan O'CHIRMAYMIZ
                // Qayta ulanishi uchun saqlab qo'yamiz
                // Faqat admin o'zgartirish kerak bo'lsa yangilaymiz
                if (admin_username === username) {
                    const anyQ = await pool.query(
                        'SELECT username FROM players WHERE lobby_code=$1 AND username!=$2 ORDER BY id ASC LIMIT 1',
                        [lobbyCode, username]
                    );

                    if (anyQ.rowCount > 0) {
                        const newAdmin = anyQ.rows[0].username;
                        await pool.query(
                            'UPDATE lobbies SET admin_username=$1 WHERE lobby_code=$2',
                            [newAdmin, lobbyCode]
                        );
                        console.log(`[disconnect] Yangi admin: ${newAdmin}`);
                        io.to(lobbyCode).emit('admin-changed', { newAdmin, currentPhase: current_phase });
                    } else {
                        // Boshqa o'yinchi yo'q
                        await pool.query('DELETE FROM players WHERE lobby_code=$1', [lobbyCode]);
                        await pool.query('DELETE FROM lobbies WHERE lobby_code=$1', [lobbyCode]);
                        io.to(lobbyCode).emit('lobby-closed');
                        io.emit('lobbies-updated');
                        return;
                    }
                }

                await pool.query(
                    'UPDATE lobbies SET last_activity=NOW() WHERE lobby_code=$1',
                    [lobbyCode]
                );
                io.to(lobbyCode).emit('update-data');
            } catch (e) {
                console.error('Disconnect cleanup xato:', e.message);
            }
        }, 10000);
    });
});

// ===============================================================
// AVTOMATIK TOZALASH — har 2 daqiqa
// ===============================================================
async function cleanupInactiveLobbies() {
    try {
        // ON DELETE CASCADE bo'lmagan hollarda players ham o'chiriladi
        const res = await pool.query(`
            DELETE FROM lobbies
            WHERE last_activity < NOW() - INTERVAL '10 minutes'
            RETURNING lobby_code
        `);
        for (const row of res.rows) {
            // players ON DELETE CASCADE bo'lsa shart emas, bo'lmasa:
            await pool.query('DELETE FROM players WHERE lobby_code=$1', [row.lobby_code]);
            io.to(row.lobby_code).emit('lobby-closed');
            console.log(`⏰ Harakatsiz lobbi o'chirildi: ${row.lobby_code}`);
        }
    } catch (e) {
        console.error('Cleanup xato:', e.message);
    }
}
setInterval(cleanupInactiveLobbies, 2 * 60 * 1000);

// ===============================================================
// SERVER-SIDE FAZA SCHEDULER — har 3s o'rniga 5s (kamroq load)
// Optimizatsiya: bitta query bilan hamma overdue lobbilarni olamiz
// ===============================================================
const schedulerLocks = new Set();

async function serverPhaseScheduler() {
    try {
        const now = new Date();

        // Barcha overdue lobbilarni bitta queryda olamiz
        const allOverdue = await pool.query(`
            SELECT lobby_code, current_phase, admin_username
            FROM lobbies
            WHERE is_active = true
              AND current_phase NOT IN ('waiting')
              AND phase_end_time IS NOT NULL
              AND phase_end_time < $1
        `, [now]);

        for (const row of allOverdue.rows) {
            const { lobby_code, current_phase, admin_username } = row;
            const lockKey = `${lobby_code}:${current_phase}`;
            if (schedulerLocks.has(lockKey)) continue;
            schedulerLocks.add(lockKey);

            (async () => {
                try {
                    console.log(`[scheduler] ${lobby_code}: ${current_phase} → keyingi faza`);
                    await advancePhaseLogic(lobby_code, current_phase, admin_username, io);
                } catch (e) {
                    console.error(`[scheduler] ${lobby_code} xato:`, e.message);
                } finally {
                    schedulerLocks.delete(lockKey);
                }
            })();
        }
    } catch (e) {
        console.error('[scheduler] Umumiy xato:', e.message);
    }
}

setInterval(serverPhaseScheduler, 5000); // 3s → 5s (33% kamroq DB load)
console.log('✅ Server-side faza scheduler yoqildi (har 5 soniya)');

// ===============================================================
// IP TOPISH
// ===============================================================
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return 'localhost';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`\n🚀 Server ishga tushdi!`);
    console.log(`   Lokal:   http://localhost:${PORT}`);
    console.log(`   Tarmoq:  http://${localIP}:${PORT}  ← Do'stlarga shu linkni yuboring\n`);
});
