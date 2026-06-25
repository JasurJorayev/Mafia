import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import TelegramBot from 'node-telegram-bot-api';
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
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org");
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ===============================================================
// RATE LIMITING
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
app.use('/api', paymentRouter);

// ===============================================================
// TELEGRAM BOT — tanga sotib olish uchun
// ===============================================================
const COIN_PACKAGES = {
    'buy_150': { coins: 150, stars: 75,  title: '💰 150 Tanga', desc: "Mafia Online uchun 150 tanga to'plami" },
    'buy_300': { coins: 300, stars: 140, title: '💰 300 Tanga', desc: "Mafia Online uchun 300 tanga to'plami" },
    'buy_500': { coins: 500, stars: 220, title: '💰 500 Tanga', desc: "Mafia Online uchun 500 tanga to'plami" },
};

let bot = null;

if (process.env.BOT_TOKEN) {
    try {
        bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

        // /start komandasi
        bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
            const chatId = msg.chat.id;
            const param  = match[1];

            // Agar /start buy_150 kabi parametr kelsa — to'g'ridan invoice yuboramiz
            if (param && COIN_PACKAGES[param]) {
                const pkg = COIN_PACKAGES[param];
                try {
                    await bot.sendInvoice(
                        chatId,
                        pkg.title,
                        pkg.desc,
                        JSON.stringify({ telegram_id: chatId, coins: pkg.coins, pkg_key: param }),
                        '',
                        'XTR',
                        [{ label: pkg.title, amount: pkg.stars }]
                    );
                } catch (e) {
                    console.error('[bot] invoice xato:', e.message);
                    bot.sendMessage(chatId, "❌ To'lov yaratishda xato. Qayta urinib ko'ring.");
                }
                return;
            }

            // Oddiy /start
            bot.sendMessage(chatId,
                `👋 Salom! *Mafia Online* botiga xush kelibsiz!\n\n` +
                `🎮 O'yin: [Mafia Online](https://mafia-production-7dd2.up.railway.app)\n\n` +
                `💰 *Tanga sotib olish:*\n` +
                `/buy\\_150 — 150 tanga (75 ⭐ Stars)\n` +
                `/buy\\_300 — 300 tanga (140 ⭐ Stars)\n` +
                `/buy\\_500 — 500 tanga (220 ⭐ Stars)`,
                { parse_mode: 'Markdown' }
            );
        });

        // /buy_150, /buy_300, /buy_500
        bot.onText(/\/(buy_150|buy_300|buy_500)/, async (msg, match) => {
            const chatId = msg.chat.id;
            const key    = match[1];
            const pkg    = COIN_PACKAGES[key];
            try {
                await bot.sendInvoice(
                    chatId,
                    pkg.title,
                    pkg.desc,
                    JSON.stringify({ telegram_id: chatId, coins: pkg.coins, pkg_key: key }),
                    '',
                    'XTR',
                    [{ label: pkg.title, amount: pkg.stars }]
                );
            } catch (e) {
                console.error('[bot] invoice xato:', e.message);
                bot.sendMessage(chatId, "❌ To'lov yaratishda xato. Qayta urinib ko'ring.");
            }
        });

        // To'lovni tasdiqlash
        bot.on('pre_checkout_query', (query) => {
            bot.answerPreCheckoutQuery(query.id, true).catch(e => {
                console.error('[bot] pre_checkout xato:', e.message);
            });
        });

        // To'lov muvaffaqiyatli
        bot.on('successful_payment', async (msg) => {
            try {
                const payment = msg.successful_payment;
                const payload = JSON.parse(payment.invoice_payload);
                const { telegram_id, coins } = payload;

                // telegram_id orqali userni topib tanga beramiz
                const userRes = await pool.query(
                    'SELECT id, username, coins FROM users WHERE telegram_id = $1',
                    [telegram_id]
                );

                if (userRes.rowCount === 0) {
                    // User topilmadi — telegram_id saytdagi akkauntga bog'lanmagan
                    bot.sendMessage(msg.chat.id,
                        `⚠️ Hisobingiz topilmadi!\n\n` +
                        `Mafia Online saytiga kiring va profilingizdagi *Telegram ID* ni tekshiring.\n` +
                        `Sizning Telegram ID: \`${telegram_id}\``,
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }

                const user = userRes.rows[0];

                // Tanga berish + log
                const client = await pool.connect();
                try {
                    await client.query('BEGIN');
                    await client.query(
                        'UPDATE users SET coins = coins + $1 WHERE id = $2',
                        [coins, user.id]
                    );
                    await client.query(
                        `INSERT INTO payment_logs (user_id, package_id, coins, stars, status, telegram_charge_id, completed_at)
                         VALUES ($1, $2, $3, $4, 'completed', $5, NOW())`,
                        [user.id, payload.pkg_key, coins, payment.total_amount, payment.telegram_payment_charge_id]
                    );
                    await client.query('COMMIT');
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }

                const newBalance = user.coins + coins;
                bot.sendMessage(msg.chat.id,
                    `✅ *${coins} tanga* hisobingizga tushdi!\n\n` +
                    `👤 Hisob: *${user.username}*\n` +
                    `💰 Yangi balans: *${newBalance} tanga*\n\n` +
                    `🎮 [O'yinga qaytish](https://mafia-production-7dd2.up.railway.app)`,
                    { parse_mode: 'Markdown' }
                );

                console.log(`[bot] ✅ ${user.username} ga ${coins} tanga berildi (telegram_id: ${telegram_id})`);

            } catch (e) {
                console.error('[bot] successful_payment xato:', e.message);
                bot.sendMessage(msg.chat.id, "❌ To'lov qayta ishlashda xato yuz berdi. Admin bilan bog'laning.");
            }
        });

        console.log('🤖 Telegram bot ishga tushdi!');

    } catch (e) {
        console.error('❌ Telegram bot xato:', e.message);
    }
} else {
    console.warn('⚠️ BOT_TOKEN yo\'q — Telegram bot o\'chirilgan.');
}

// Bot ni boshqa controllerlarga export qilamiz (kerak bo'lsa)
export { bot };

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

        try {
            const lobbyQ = await pool.query(
                'SELECT current_phase FROM lobbies WHERE lobby_code=$1',
                [lobbyCode]
            );
            if (!lobbyQ.rowCount) return;
            // Faqat tanishuv va muhokama fazalarida ishlaydi
            const allowedPhases = ['introduction', 'discussion'];
            if (!allowedPhases.includes(lobbyQ.rows[0].current_phase)) return;

            const playerQ = await pool.query(
                'SELECT role FROM players WHERE lobby_code=$1 AND username=$2',
                [lobbyCode, username]
            );
            const pRole = playerQ.rowCount ? playerQ.rows[0].role : null;
            const role  = (pRole && pRole !== 'unassigned') ? pRole : null;

            const msgData = { username, text: clean, role, ts: Date.now() };
            io.to(lobbyCode).emit('chat-message', msgData);
        } catch (e) {
            console.error('[chat] Xato:', e.message);
        }
    });

    // ── MAFIA CHAT (faqat tunda, faqat mafia rollari) ──────────
    socket.on('mafia-chat-message', async ({ lobbyCode, username, text }) => {
        if (!lobbyCode || !username || !text) return;
        if (typeof text !== 'string') return;
        const clean = text.trim().slice(0, 200);
        if (!clean) return;

        try {
            // Lobbining mavjudligini tekshir
            const lobbyQ = await pool.query(
                'SELECT current_phase FROM lobbies WHERE lobby_code=$1',
                [lobbyCode]
            );
            if (!lobbyQ.rowCount) return;
            // Faza tekshiruvi yo'q — mafia har doim yoza oladi

            // 2. O'yinchining rolini tekshir — faqat mafia
            const playerQ = await pool.query(
                'SELECT role, is_alive FROM players WHERE lobby_code=$1 AND username=$2',
                [lobbyCode, username]
            );
            if (!playerQ.rowCount) return;

            const { role, is_alive } = playerQ.rows[0];
            if (!role.toLowerCase().includes('mafia')) return; // Mafia va Don yoza oladi
            if (!is_alive) return;         // O'lik mafia yoza olmaydi

            // 3. Faqat mafia xona'siga yuborish
            const msgData = { username, text: clean, ts: Date.now() };
            const mafiaRoomKey = `mafia:${lobbyCode}`;
            io.to(mafiaRoomKey).emit('mafia-chat-message', msgData);

            console.log(`[mafia-chat] ${username} → ${lobbyCode}: ${clean}`);
        } catch (e) {
            console.error('[mafia-chat] Xato:', e.message);
        }
    });

    // Mafia xonasiga qo'shilish (faqat mafia roli bo'lganda)
    socket.on('join-mafia-room', async ({ lobbyCode, username }) => {
        if (!lobbyCode || !username) return;
        if (typeof lobbyCode !== 'string' || typeof username !== 'string') return;
        if (lobbyCode.length > 10 || username.length > 50) return;

        try {
            const playerQ = await pool.query(
                'SELECT role FROM players WHERE lobby_code=$1 AND username=$2',
                [lobbyCode, username]
            );
            if (!playerQ.rowCount) return;
            const role = playerQ.rows[0].role || '';
            // Mafia va Don (Mafia DON) ham kirishi mumkin
            if (!role.toLowerCase().includes('mafia')) return;

            const mafiaRoomKey = `mafia:${lobbyCode}`;
            socket.join(mafiaRoomKey);
            console.log(`[mafia-room] ${username} (${role}) mafia xonasiga qo'shildi: ${lobbyCode}`);
        } catch (e) {
            console.error('[mafia-room] Xato:', e.message);
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

                if (activeCount === 0) {
                    console.log(`Lobbi ${lobbyCode} bo'sh — o'chirildi.`);
                    await pool.query('DELETE FROM players WHERE lobby_code=$1', [lobbyCode]);
                    await pool.query('DELETE FROM lobbies WHERE lobby_code=$1', [lobbyCode]);
                    io.to(lobbyCode).emit('lobby-closed');
                    io.emit('lobbies-updated');
                    return;
                }

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
        const res = await pool.query(`
            DELETE FROM lobbies
            WHERE last_activity < NOW() - INTERVAL '30 minutes'
            RETURNING lobby_code
        `);
        for (const row of res.rows) {
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
// SERVER-SIDE FAZA SCHEDULER — har 5s
// ===============================================================
const schedulerLocks = new Set();

async function serverPhaseScheduler() {
    try {
        const now = new Date();
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

setInterval(serverPhaseScheduler, 5000);
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