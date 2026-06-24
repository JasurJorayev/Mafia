// ===============================================================
// MAFIA — AUTH CONTROLLER
// Register, Login (JWT), Google OAuth, Profil
// ===============================================================

import pool         from '../config/db.js';
import bcrypt       from 'bcryptjs';
import jwt          from 'jsonwebtoken';
import crypto       from 'crypto';
import { OAuth2Client } from 'google-auth-library';

const GOOGLE_CLIENT = process.env.GOOGLE_CLIENT_ID
    ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
    : null;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('❌ XATO: JWT_SECRET .env faylida yo\'q! Auth ishlamaydi.');
}
const SALT_ROUNDS = 10;

// ---------------------------------------------------------------
// YORDAMCHI: input tozalash
// ---------------------------------------------------------------
function clean(str, max = 50) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, max).replace(/[<>"'`]/g, '');
}

// ---------------------------------------------------------------
// YORDAMCHI: JWT yaratish
// ---------------------------------------------------------------
function signToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// ---------------------------------------------------------------
// YORDAMCHI: session token yaratish
// ---------------------------------------------------------------
function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ---------------------------------------------------------------
// YORDAMCHI: foydalanuvchini xavfsiz shakl qaytarish (parolsiz)
// ---------------------------------------------------------------
function safeUser(u) {
    return {
        id:          u.id,
        username:    u.username,
        avatar_url:  u.avatar_url,
        bio:         u.bio,
        level:       u.level,
        xp:          u.xp,
        coins:       u.coins || 0,
        has_google:  !!u.google_id,
        created_at:  u.created_at,
        active_skin: u.active_skin || null,
    };
}

// ===============================================================
// POST /api/auth/register
// Body: { username, password }
// ===============================================================
export const register = async (req, res) => {
    try {
        const username = clean(req.body.username, 30);
        const password = typeof req.body.password === 'string'
            ? req.body.password.trim() : '';

        if (username.length < 2)
            return res.status(400).json({ message: "Username kamida 2 ta harf bo'lishi kerak!" });
        if (password.length < 6)
            return res.status(400).json({ message: "Parol kamida 6 ta belgi bo'lishi kerak!" });
        if (password.length > 72)
            return res.status(400).json({ message: "Parol juda uzun!" });

        // Username band emasligini tekshiramiz
        const exists = await pool.query(
            'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
            [username]
        );
        if (exists.rowCount > 0)
            return res.status(409).json({ message: "Bu username allaqachon band!" });

        const password_hash  = await bcrypt.hash(password, SALT_ROUNDS);
        const sessionToken   = generateSessionToken();

        const result = await pool.query(
            `INSERT INTO users (username, password_hash, session_token)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [username, password_hash, sessionToken]
        );

        const user  = result.rows[0];
        const token = signToken(user.id);

        res.status(201).json({ token, session_token: sessionToken, user: safeUser(user) });

    } catch (err) {
        console.error('register xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// POST /api/auth/login
// Body: { username, password }
// ===============================================================
export const login = async (req, res) => {
    try {
        const username = clean(req.body.username, 30);
        const password = typeof req.body.password === 'string'
            ? req.body.password.trim() : '';

        if (!username || !password)
            return res.status(400).json({ message: "Username va parol kiriting!" });

        const result = await pool.query(
            'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND is_active = true',
            [username]
        );

        if (result.rowCount === 0)
            return res.status(401).json({ message: "Username yoki parol noto'g'ri!" });

        const user = result.rows[0];

        // Google orqali ro'yxatdan o'tgan, paroli yo'q
        if (!user.password_hash)
            return res.status(401).json({ message: "Bu hisob faqat Google orqali kiriladi!" });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match)
            return res.status(401).json({ message: "Username yoki parol noto'g'ri!" });

        // Yangi session token — eski sessiyani bekor qiladi
        const sessionToken = generateSessionToken();

        await pool.query(
            'UPDATE users SET last_login = NOW(), session_token = $1 WHERE id = $2',
            [sessionToken, user.id]
        );

        const token = signToken(user.id);
        res.json({ token, session_token: sessionToken, user: safeUser(user) });

    } catch (err) {
        console.error('login xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// POST /api/auth/google
// Body: { id_token }   ← Google One Tap / OAuth dan olinadi
// ===============================================================
export const googleAuth = async (req, res) => {
    try {
        const { id_token } = req.body;
        if (!id_token)
            return res.status(400).json({ message: "Google token kerak!" });

        if (!GOOGLE_CLIENT)
            return res.status(503).json({ message: "Google kirish hozircha yoqilmagan!" });

        // Tokenni Google server orqali tekshiramiz
        let payload;
        try {
            const ticket = await GOOGLE_CLIENT.verifyIdToken({
                idToken:  id_token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } catch {
            return res.status(401).json({ message: "Google token yaroqsiz!" });
        }

        const { sub: google_id, email, name, picture } = payload;
        const sessionToken = generateSessionToken();

        // Mavjud foydalanuvchimi?
        let userResult = await pool.query(
            'SELECT * FROM users WHERE google_id = $1',
            [google_id]
        );

        if (userResult.rowCount > 0) {
            // Mavjud — last_login va session yangilash
            await pool.query(
                'UPDATE users SET last_login = NOW(), avatar_url = $1, session_token = $2 WHERE id = $3',
                [picture, sessionToken, userResult.rows[0].id]
            );
            const token = signToken(userResult.rows[0].id);
            return res.json({
                token,
                session_token: sessionToken,
                user: safeUser(userResult.rows[0]),
            });
        }

        // Yangi foydalanuvchi — username yasaymiz
        let baseUsername = clean(name?.split(' ')[0] || 'user', 25);
        if (baseUsername.length < 2) baseUsername = 'user';

        let username = baseUsername;
        let attempt  = 0;
        while (true) {
            const taken = await pool.query(
                'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
                [username]
            );
            if (taken.rowCount === 0) break;
            attempt++;
            username = `${baseUsername}${attempt}`;
        }

        const result = await pool.query(
            `INSERT INTO users (google_id, email, username, avatar_url, last_login, session_token)
             VALUES ($1, $2, $3, $4, NOW(), $5)
             RETURNING *`,
            [google_id, email, username, picture, sessionToken]
        );

        const token = signToken(result.rows[0].id);
        res.status(201).json({
            token,
            session_token: sessionToken,
            user: safeUser(result.rows[0]),
            is_new: true,
        });

    } catch (err) {
        console.error('googleAuth xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// GET /api/auth/me
// Header: Authorization: Bearer <token>
// ===============================================================
export const getMe = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1 AND is_active = true',
            [req.userId]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });

        res.json({ user: safeUser(result.rows[0]) });

    } catch (err) {
        console.error('getMe xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// GET /api/profile/:username
// Ochiq — token shart emas
// ===============================================================
export const getProfile = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    try {
        const username = clean(req.params.username, 30);

        const result = await pool.query(
            `SELECT u.*,
                    s.wins_as_mafia, s.wins_as_citizen, s.wins_as_doctor,
                    s.wins_as_sheriff, s.times_killed, s.lobbies_created
             FROM users u
             LEFT JOIN user_stats s ON s.user_id = u.id
             WHERE LOWER(u.username) = LOWER($1) AND u.is_active = true`,
            [username]
        );

        if (result.rowCount === 0)
            return res.status(404).json({ message: "Foydalanuvchi topilmadi!" });

        const u = result.rows[0];

        // Badge larni olamiz
        const badges = await pool.query(
            `SELECT b.badge_key, d.name_uz, d.icon, b.earned_at
             FROM user_badges b
             JOIN badge_definitions d ON d.key = b.badge_key
             WHERE b.user_id = $1
             ORDER BY b.earned_at DESC`,
            [u.id]
        );

        const gamesPlayed = parseInt(u.games_played) || 0;
        const gamesWon    = parseInt(u.games_won)    || 0;
        const winRate     = gamesPlayed > 0
            ? Math.round((gamesWon / gamesPlayed) * 100)
            : 0;

        res.json({
            user: safeUser(u),
            stats: {
                games_played:    gamesPlayed,
                games_won:       gamesWon,
                win_rate:        winRate,
                wins_as_mafia:   u.wins_as_mafia   || 0,
                wins_as_citizen: u.wins_as_citizen || 0,
                wins_as_doctor:  u.wins_as_doctor  || 0,
                wins_as_sheriff: u.wins_as_sheriff || 0,
                times_killed:    u.times_killed    || 0,
                lobbies_created: u.lobbies_created || 0,
            },
            badges: badges.rows,
        });

    } catch (err) {
        console.error('getProfile xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// PATCH /api/profile/update
// Header: Authorization: Bearer <token>
// Body: { username?, bio?, avatar_url? }
// ===============================================================
export const updateProfile = async (req, res) => {
    try {
        const userId = req.userId;

        const updates = {};
        const params  = [];
        let   idx     = 1;

        if (req.body.username !== undefined) {
            const username = clean(req.body.username, 30);
            if (username.length < 2)
                return res.status(400).json({ message: "Username kamida 2 ta harf!" });

            const taken = await pool.query(
                'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2',
                [username, userId]
            );
            if (taken.rowCount > 0)
                return res.status(409).json({ message: "Bu username band!" });

            updates.username = username;
        }

        if (req.body.bio !== undefined) {
            updates.bio = clean(req.body.bio, 200);
        }

        if (req.body.avatar_url !== undefined) {
            const url = typeof req.body.avatar_url === 'string'
                ? req.body.avatar_url.trim().slice(0, 500) : '';
            if (url && !url.startsWith('http'))
                return res.status(400).json({ message: "Avatar URL noto'g'ri format!" });
            updates.avatar_url = url || null;
        }

        if (Object.keys(updates).length === 0)
            return res.status(400).json({ message: "O'zgartirish uchun ma'lumot kiriting!" });

        const setClauses = Object.keys(updates).map(k => {
            params.push(updates[k]);
            return `${k} = $${idx++}`;
        });
        params.push(userId);

        const result = await pool.query(
            `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );

        res.json({ user: safeUser(result.rows[0]) });

    } catch (err) {
        console.error('updateProfile xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// PATCH /api/auth/change-password
// Header: Authorization: Bearer <token>
// Body: { old_password, new_password }
// ===============================================================
export const changePassword = async (req, res) => {
    try {
        const userId      = req.userId;
        const oldPassword = typeof req.body.old_password === 'string'
            ? req.body.old_password.trim() : '';
        const newPassword = typeof req.body.new_password === 'string'
            ? req.body.new_password.trim() : '';

        if (!newPassword || newPassword.length < 6)
            return res.status(400).json({ message: "Yangi parol kamida 6 ta belgi!" });

        const result = await pool.query(
            'SELECT * FROM users WHERE id = $1',
            [userId]
        );
        const user = result.rows[0];

        if (user.password_hash) {
            if (!oldPassword)
                return res.status(400).json({ message: "Eski parolni kiriting!" });
            const match = await bcrypt.compare(oldPassword, user.password_hash);
            if (!match)
                return res.status(401).json({ message: "Eski parol noto'g'ri!" });
        }

        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Parol o'zgarganda ham sessiyani yangilaymiz — boshqa qurilmalar chiqariladi
        const sessionToken = generateSessionToken();

        await pool.query(
            'UPDATE users SET password_hash = $1, session_token = $2 WHERE id = $3',
            [hash, sessionToken, userId]
        );

        res.json({
            message:       "Parol muvaffaqiyatli o'zgartirildi!",
            session_token: sessionToken,  // frontendda yangi session saqlansin
        });

    } catch (err) {
        console.error('changePassword xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};