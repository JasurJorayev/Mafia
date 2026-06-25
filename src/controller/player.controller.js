// ===============================================================
// MAFIA O'YINI — BACKEND CONTROLLER
// v21 — Optimizatsiya va bug-fix versiyasi
// ===============================================================

import pool from '../config/db.js';
import { rewardWinners } from './shop.controller.js';

// ===============================================================
// YORDAMCHI: Input tozalash
// ===============================================================
function sanitizeString(str, maxLen = 50) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLen).replace(/[<>"'`]/g, '');
}

// ===============================================================
// YORDAMCHI: last_activity yangilash
// ===============================================================
async function touchActivity(lobbyCode) {
    try {
        await pool.query(
            'UPDATE lobbies SET last_activity=NOW() WHERE lobby_code=$1',
            [lobbyCode]
        );
    } catch (_) {}
}

// ===============================================================
// RANG TIZIMI
// ===============================================================
const PLAYER_COLORS = [
    'red', 'orange', 'yellow', 'green', 'blue',
    'purple', 'black', 'white', 'brown',
];

// Lobbyda band bo'lmagan rangni topadi — bitta query
async function pickColor(lobbyCode) {
    const usedRes = await pool.query(
        'SELECT player_color FROM players WHERE lobby_code=$1', [lobbyCode]
    );
    const used = new Set(usedRes.rows.map(r => r.player_color).filter(Boolean));
    const free = PLAYER_COLORS.find(c => !used.has(c));
    return free ?? PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

// Bir xil ism bo'lsa _2, _3 qo'shadi
// Optimizatsiya: bitta query bilan barcha o'xshash ismlarni olamiz
async function uniqueUsername(lobbyCode, base) {
    const res = await pool.query(
        `SELECT username FROM players
         WHERE lobby_code=$1 AND LOWER(username) LIKE LOWER($2)`,
        [lobbyCode, base + '%']
    );
    if (res.rowCount === 0) return base;

    const existing = new Set(res.rows.map(r => r.username.toLowerCase()));
    if (!existing.has(base.toLowerCase())) return base;

    let n = 2;
    while (existing.has(`${base}_${n}`.toLowerCase())) n++;
    return `${base}_${n}`;
}

// ===============================================================
// LOBBI OCHISH
// ===============================================================
export const createLobby = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || typeof username !== 'string' || !username.trim())
            return res.status(400).json({ message: 'Ism kiriting!' });

        const trimmed = sanitizeString(username);
        if (trimmed.length < 2)
            return res.status(400).json({ message: "Ism kamida 2 ta harf bo'lishi kerak!" });

        // Unikal 5-xonali kod
        let lobbyCode;
        while (true) {
            const candidate = String(Math.floor(10000 + Math.random() * 90000));
            const check = await pool.query('SELECT id FROM lobbies WHERE lobby_code=$1', [candidate]);
            if (check.rowCount === 0) { lobbyCode = candidate; break; }
        }

        // Transaction: lobbi + player bitta atomik operatsiyada
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'INSERT INTO lobbies (lobby_code, admin_username, is_active, current_phase) VALUES ($1,$2,true,$3)',
                [lobbyCode, trimmed, 'waiting']
            );
            const color = await pickColor(lobbyCode);
            // user_id — agar login bo'lgan bo'lsa yozamiz
            const userId = req.userId || null;
            await client.query(
                'INSERT INTO players (lobby_code, username, role, is_alive, player_color, user_id) VALUES ($1,$2,$3,true,$4,$5)',
                [lobbyCode, trimmed, 'unassigned', color, userId]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        req.app.get('io').to(lobbyCode).emit('update-data');
        res.status(201).json({ message: 'Lobbi yaratildi!', lobbyCode, adminUsername: trimmed });
    } catch (error) {
        console.error('createLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// LOBBIGA QO'SHILISH
// ===============================================================
export const joinLobby = async (req, res) => {
    try {
        const { username, lobbyCode, password } = req.body;
        if (!username || typeof username !== 'string' || !username.trim())
            return res.status(400).json({ message: 'Ism kiriting!' });
        if (!lobbyCode || typeof lobbyCode !== 'string' || !lobbyCode.trim())
            return res.status(400).json({ message: 'Lobbi kodini kiriting!' });

        const trimmed = sanitizeString(username);
        const code    = lobbyCode.trim().slice(0, 10);

        if (trimmed.length < 2)
            return res.status(400).json({ message: "Ism kamida 2 ta harf bo'lishi kerak!" });
        if (!/^\d{5}$/.test(code))
            return res.status(400).json({ message: "Lobbi kodi 5 xonali raqam bo'lishi kerak!" });

        const lobbyRes = await pool.query(
            'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Bunday lobbi topilmadi yoki yakunlangan!' });

        const lobby = lobbyRes.rows[0];
        if (lobby.current_phase !== 'waiting')
            return res.status(400).json({ message: "O'yin allaqachon boshlangan!" });

        if (lobby.is_private) {
            if (!password || typeof password !== 'string' || !password.trim())
                return res.status(403).json({ message: 'Bu lobbi yopiq. Parol kiriting!', requiresPassword: true });
            if (password.trim() !== lobby.lobby_password)
                return res.status(403).json({ message: "Parol noto'g'ri!", requiresPassword: true });
        }

        const finalUsername = await uniqueUsername(code, trimmed);

        const countRes = await pool.query('SELECT COUNT(*) FROM players WHERE lobby_code=$1', [code]);
        if (parseInt(countRes.rows[0].count) >= 20)
            return res.status(400).json({ message: "Lobbi to'lib qoldi! (max 20 kishi)" });

        const color  = await pickColor(code);
        const userId = req.userId || null;
        await pool.query(
            'INSERT INTO players (lobby_code, username, role, is_alive, player_color, user_id) VALUES ($1,$2,$3,true,$4,$5)',
            [code, finalUsername, 'unassigned', color, userId]
        );
        await touchActivity(code);
        req.app.get('io').to(code).emit('update-data');
        res.status(201).json({
            message: "Lobbiga qo'shildingiz!",
            lobbyCode: code,
            adminUsername: lobby.admin_username,
            username: finalUsername,
        });
    } catch (error) {
        console.error('joinLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// LOBBI MA'LUMOTLARI
// ===============================================================
export const getLobbyInfo = async (req, res) => {
    try {
        const code = req.params.code?.trim().slice(0, 10);
        if (!code) return res.status(400).json({ message: 'Kod kiritilmagan!' });

        const lobbyRes = await pool.query('SELECT * FROM lobbies WHERE lobby_code=$1', [code]);
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Lobbi topilmadi!' });
        res.json(lobbyRes.rows[0]);
    } catch (error) {
        console.error('getLobbyInfo xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// BARCHA O'YINCHILAR
// ===============================================================
export const getAllPlayers = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const username = sanitizeString(req.query.username || '');
        if (!code) return res.status(400).json({ message: 'Kod kiritilmagan!' });

        const result = await pool.query(
            'SELECT * FROM players WHERE lobby_code=$1 ORDER BY id ASC', [code]
        );
        const rows = result.rows;

        const me       = rows.find(p => p.username === username);
        const myRole   = me?.role ?? null;
        const isMafia  = myRole?.includes('Mafia') ?? false;

        const filtered = rows.map(p => {
            if (p.username === username)                         return p;
            if (isMafia && p.role?.includes('Mafia'))           return p;
            return { ...p, role: 'hidden' };
        });

        res.json(filtered);
    } catch (error) {
        console.error('getAllPlayers xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// O'YINNI BOSHLASH
// ===============================================================
export const startGame = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const username = sanitizeString(req.body.username || '');
        if (!code || !username)
            return res.status(400).json({ message: 'Kod yoki ism kiritilmagan!' });

        const lobbyRes = await pool.query(
            'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Lobbi topilmadi!' });

        const lobby = lobbyRes.rows[0];
        if (lobby.admin_username !== username)
            return res.status(403).json({ message: "Faqat admin o'yinni boshlay oladi!" });
        if (lobby.current_phase !== 'waiting')
            return res.status(400).json({ message: "O'yin allaqachon boshlangan!" });

        const playersResult = await pool.query(
            'SELECT * FROM players WHERE lobby_code=$1', [code]
        );
        const players = playersResult.rows;
        const count   = players.length;
        if (count < 5)
            return res.status(400).json({ message: 'Kamida 5 kishi kerak!' });

        // Rol taqsimlash
        const mafiaCount = count >= 10 ? 3 : count > 6 ? 2 : 1;
        const roles = ['Mafia (DON)'];
        for (let i = 1; i < mafiaCount; i++) roles.push('Mafia');
        roles.push('Doctor');
        while (roles.length < count) roles.push('Citizen');

        // Fisher-Yates shuffle
        for (let i = roles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [roles[i], roles[j]] = [roles[j], roles[i]];
        }

        const phaseEndTime = new Date(Date.now() + 30 * 1000);

        // Bitta query bilan hamma playerlarni yangilaymiz
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (let i = 0; i < count; i++) {
                await client.query(
                    `UPDATE players SET role=$1, is_alive=true, pending_kill=NULL, pending_save=NULL,
                     vote_count=0, voted_for=NULL, current_phase='introduction', phase_end_time=$2
                     WHERE id=$3`,
                    [roles[i], phaseEndTime, players[i].id]
                );
            }
            await client.query(
                "UPDATE lobbies SET current_phase='introduction', phase_end_time=$1 WHERE lobby_code=$2",
                [phaseEndTime, code]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        await touchActivity(code);
        const io = req.app.get('io');
        io.to(code).emit('game-started-signal');
        io.to(code).emit('update-data');
        res.json({ message: "O'yin boshlandi! Rollar taqsimlandi." });
    } catch (error) {
        console.error('startGame xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// FAZA YANGILASH (admin/frontend trigger)
// ===============================================================
export const updatePhase = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const phase    = req.body.phase;
        const username = sanitizeString(req.body.username || '');

        if (!code || !phase || !username)
            return res.status(400).json({ success: false, message: 'Parametrlar yetishmayapti!' });

        const validPhases = ['introduction','night_preparing','night_mafia','night_doctor',
                             'discussion','voting','vote_results','waiting'];
        if (!validPhases.includes(phase))
            return res.status(400).json({ success: false, message: "Noto'g'ri faza!" });

        const lobbyRes = await pool.query(
            'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(400).json({ success: false, message: 'Lobbi topilmadi!' });

        const lobby = lobbyRes.rows[0];
        if (lobby.admin_username !== username)
            return res.status(403).json({ success: false, message: 'Faqat admin!' });
        if (lobby.current_phase !== phase)
            return res.status(400).json({
                success: false,
                message: `Faza mos kelmadi. Kelgan: ${phase}, Bazada: ${lobby.current_phase}`
            });

        const io = req.app.get('io');
        await advancePhaseLogic(code, phase, username, io);
        res.json({ success: true, message: "Faza o'zgartirildi." });
    } catch (error) {
        console.error('updatePhase xatoligi:', error);
        res.status(500).json({ success: false, message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// MAFIYA OTISH
// ===============================================================
export const killAction = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const target   = sanitizeString(req.body.target   || '');
        const username = sanitizeString(req.body.username || '');

        if (!code || !target || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        // Lobbi + shooter ni bitta joinli query bilan olamiz
        const check = await pool.query(`
            SELECT l.current_phase, p.role, p.is_alive
            FROM lobbies l
            JOIN players p ON p.lobby_code = l.lobby_code AND p.username = $2
            WHERE l.lobby_code = $1 AND l.is_active = true
        `, [code, username]);

        if (check.rowCount === 0) return res.status(404).json({ message: "O'yinchi yoki lobbi topilmadi!" });
        const { current_phase, role, is_alive } = check.rows[0];

        if (!is_alive)              return res.status(403).json({ message: "Siz o'liksiz!" });
        if (!role.includes('Mafia')) return res.status(403).json({ message: 'Faqat Mafiya ota oladi!' });
        if (current_phase !== 'night_mafia') return res.status(400).json({ message: "Hozir tun emas!" });
        if (target === username)    return res.status(400).json({ message: "O'zingizni nishon qila olmaysiz!" });

        const donQ = await pool.query(
            "SELECT username FROM players WHERE lobby_code=$1 AND role='Mafia (DON)' AND is_alive=true LIMIT 1",
            [code]
        );
        if (donQ.rowCount > 0 && role !== 'Mafia (DON)')
            return res.status(403).json({ message: 'DON tirik! Faqat DON ota oladi.' });

        const tCheck = await pool.query(
            'SELECT id FROM players WHERE lobby_code=$1 AND username=$2 AND is_alive=true',
            [code, target]
        );
        if (tCheck.rowCount === 0)
            return res.status(404).json({ message: "Nishon topilmadi yoki allaqachon o'lik!" });

        // pending_kill ni bitta UPDATE bilan reset + set
        await pool.query(
            'UPDATE players SET pending_kill=NULL WHERE lobby_code=$1 AND pending_kill IS NOT NULL',
            [code]
        );
        await pool.query(
            'UPDATE players SET pending_kill=$1 WHERE lobby_code=$2 AND username=$3',
            [target, code, target]
        );

        await touchActivity(code);
        const io = req.app.get('io');
        io.to(code).emit('action-done', { phase: 'night_mafia' });
        res.json({ message: `Nishon belgilandi. 🎯` });

        autoAdvancePhase(code, 'night_mafia', io);
    } catch (error) {
        console.error('killAction xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// DOKTOR DAVOLASH
// ===============================================================
export const healAction = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const target   = sanitizeString(req.body.target   || '');
        const username = sanitizeString(req.body.username || '');

        if (!code || !target || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        const check = await pool.query(`
            SELECT l.current_phase, p.role, p.is_alive
            FROM lobbies l
            JOIN players p ON p.lobby_code = l.lobby_code AND p.username = $2
            WHERE l.lobby_code = $1 AND l.is_active = true
        `, [code, username]);

        if (check.rowCount === 0) return res.status(404).json({ message: "O'yinchi yoki lobbi topilmadi!" });
        const { current_phase, role, is_alive } = check.rows[0];

        if (current_phase !== 'night_doctor') return res.status(400).json({ message: "Hozir doktor faol emas!" });
        if (role !== 'Doctor') return res.status(403).json({ message: 'Siz doktor emassiz!' });
        if (!is_alive)         return res.status(403).json({ message: "Siz o'liksiz!" });

        const pCheck = await pool.query(
            'SELECT id FROM players WHERE lobby_code=$1 AND username=$2 AND is_alive=true',
            [code, target]
        );
        if (pCheck.rowCount === 0)
            return res.status(404).json({ message: "Bemor topilmadi yoki allaqachon o'lik!" });

        await pool.query(
            'UPDATE players SET pending_save=NULL WHERE lobby_code=$1 AND pending_save IS NOT NULL',
            [code]
        );
        await pool.query(
            'UPDATE players SET pending_save=$1 WHERE lobby_code=$2 AND username=$3',
            [target, code, target]
        );

        await touchActivity(code);
        const io = req.app.get('io');
        io.to(code).emit('action-done', { phase: 'night_doctor' });
        res.json({ message: `Bemor tanlandi. 🩺` });

        autoAdvancePhase(code, 'night_doctor', io);
    } catch (error) {
        console.error('healAction xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// OVOZ BERISH
// ===============================================================
export const voteAction = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const target   = sanitizeString(req.body.target   || '');
        const username = sanitizeString(req.body.username || '');

        if (!code || !target || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        const check = await pool.query(`
            SELECT l.current_phase, p.is_alive, p.voted_for
            FROM lobbies l
            JOIN players p ON p.lobby_code = l.lobby_code AND p.username = $2
            WHERE l.lobby_code = $1 AND l.is_active = true
        `, [code, username]);

        if (check.rowCount === 0) return res.status(404).json({ message: "O'yinchi yoki lobbi topilmadi!" });
        const { current_phase, is_alive, voted_for } = check.rows[0];

        if (current_phase !== 'voting') return res.status(400).json({ message: "Hozir ovoz berish fazasi emas!" });
        if (target === username)        return res.status(400).json({ message: "O'zingizga ovoz bera olmaysiz!" });
        if (!is_alive)                  return res.status(403).json({ message: "O'liklar ovoz bera olmaydi!" });
        if (voted_for)                  return res.status(400).json({ message: "Allaqachon ovoz berib bo'lgansiz!" });

        const targetQ = await pool.query(
            'SELECT id FROM players WHERE lobby_code=$1 AND username=$2 AND is_alive=true',
            [code, target]
        );
        if (targetQ.rowCount === 0)
            return res.status(404).json({ message: "Bu o'yinchi topilmadi yoki o'lik!" });

        // Bitta transactionda ikkala UPDATE
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'UPDATE players SET vote_count=vote_count+1 WHERE lobby_code=$1 AND username=$2',
                [code, target]
            );
            await client.query(
                'UPDATE players SET voted_for=$1 WHERE lobby_code=$2 AND username=$3',
                [target, code, username]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        await touchActivity(code);
        req.app.get('io').to(code).emit('update-data');
        res.json({ message: `Ovoz berdingiz. 🗳️` });
    } catch (error) {
        console.error('voteAction xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// RESET
// ===============================================================
export const resetGame = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const username = sanitizeString(req.body.username || '');
        if (!code || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        const lobbyRes = await pool.query(
            'SELECT admin_username FROM lobbies WHERE lobby_code=$1', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Lobbi topilmadi!' });
        if (lobbyRes.rows[0].admin_username !== username)
            return res.status(403).json({ message: 'Faqat admin!' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE players SET role='unassigned', is_alive=true,
                 pending_kill=NULL, pending_save=NULL,
                 vote_count=0, voted_for=NULL,
                 current_phase='waiting', phase_end_time=NULL
                 WHERE lobby_code=$1`,
                [code]
            );
            await client.query(
                "UPDATE lobbies SET current_phase='waiting', phase_end_time=NULL, is_active=true WHERE lobby_code=$1",
                [code]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        req.app.get('io').to(code).emit('game-reset-signal');
        voteReadyMap.delete(code);
        res.json({ message: "O'yin qayta tiklandi!" });
    } catch (error) {
        console.error('resetGame xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// OVOZ BERISHGA TAYYOR
// ===============================================================
const voteReadyMap = new Map();

export const voteReady = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const username = sanitizeString(req.body.username || '');
        if (!code || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        // Lobbi + player bitta query
        const check = await pool.query(`
            SELECT l.current_phase, l.admin_username, p.is_alive
            FROM lobbies l
            JOIN players p ON p.lobby_code = l.lobby_code AND p.username = $2
            WHERE l.lobby_code = $1 AND l.is_active = true
        `, [code, username]);

        if (check.rowCount === 0) return res.status(404).json({ message: 'Lobbi topilmadi!' });
        const { current_phase, is_alive } = check.rows[0];

        if (current_phase !== 'discussion')
            return res.status(400).json({ message: 'Hozir muhokama fazasi emas!' });
        if (!is_alive)
            return res.status(403).json({ message: "O'liklar tayyor bo'la olmaydi!" });

        if (!voteReadyMap.has(code)) voteReadyMap.set(code, new Set());
        voteReadyMap.get(code).add(username);

        const aliveQ = await pool.query(
            'SELECT COUNT(*) FROM players WHERE lobby_code=$1 AND is_alive=true', [code]
        );
        const aliveCount = parseInt(aliveQ.rows[0].count);
        const readyCount = voteReadyMap.get(code).size;

        console.log(`[voteReady] ${code}: ${username} tayyor. ${readyCount}/${aliveCount}`);

        if (readyCount >= aliveCount) {
            voteReadyMap.delete(code);
            const voteDuration = 20;
            const voteEnd = new Date(Date.now() + voteDuration * 1000);

            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    'UPDATE players SET current_phase=$1, phase_end_time=$2, vote_count=0, voted_for=NULL WHERE lobby_code=$3 AND is_alive=true',
                    ['voting', voteEnd, code]
                );
                await client.query(
                    'UPDATE players SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3 AND is_alive=false',
                    ['voting', voteEnd, code]
                );
                await client.query(
                    'UPDATE lobbies SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3',
                    ['voting', voteEnd, code]
                );
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }

            req.app.get('io').to(code).emit('update-data');
            return res.json({ message: 'Ovoz berish boshlandi!', started: true, readyCount, aliveCount });
        }

        req.app.get('io').to(code).emit('vote-ready-update', {
            readyUsernames: Array.from(voteReadyMap.get(code) || []),
            readyCount,
            aliveCount
        });
        return res.json({ message: `Tayyor! (${readyCount}/${aliveCount})`, started: false, readyCount, aliveCount });
    } catch (error) {
        console.error('voteReady xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

export function clearVoteReady(code) {
    voteReadyMap.delete(code);
}

// ===============================================================
// LOBBI DAN CHIQISH
// ===============================================================
export const leaveLobby = async (req, res) => {
    try {
        const code     = req.params.code?.trim().slice(0, 10);
        const username = sanitizeString(req.body.username || '');
        if (!code || !username)
            return res.status(400).json({ message: 'Parametrlar yetishmayapti!' });

        const lobbyRes = await pool.query('SELECT * FROM lobbies WHERE lobby_code=$1', [code]);
        if (lobbyRes.rowCount === 0)
            return res.json({ message: "Lobbi topilmadi.", remaining: 0 });
        const lobby = lobbyRes.rows[0];

        await pool.query('DELETE FROM players WHERE lobby_code=$1 AND username=$2', [code, username]);

        const remaining = await pool.query(
            'SELECT * FROM players WHERE lobby_code=$1 ORDER BY id ASC', [code]
        );
        const count = remaining.rowCount;
        const io = req.app.get('io');

        if (count === 0) {
            await pool.query('DELETE FROM lobbies WHERE lobby_code=$1', [code]);
            io.to(code).emit('lobby-closed');
            io.emit('lobbies-updated');
        } else if (lobby.admin_username === username) {
            if (lobby.current_phase === 'waiting') {
                await pool.query('DELETE FROM players WHERE lobby_code=$1', [code]);
                await pool.query('DELETE FROM lobbies WHERE lobby_code=$1', [code]);
                io.to(code).emit('lobby-closed');
                io.emit('lobbies-updated');
            } else {
                const aliveQ = await pool.query(
                    'SELECT username FROM players WHERE lobby_code=$1 AND is_alive=true ORDER BY id ASC LIMIT 1',
                    [code]
                );
                const newAdmin = aliveQ.rowCount > 0
                    ? aliveQ.rows[0].username
                    : remaining.rows[0].username;
                await pool.query(
                    'UPDATE lobbies SET admin_username=$1 WHERE lobby_code=$2',
                    [newAdmin, code]
                );
                io.to(code).emit('admin-changed', { newAdmin, currentPhase: lobby.current_phase });
                io.to(code).emit('update-data');
            }
        } else {
            io.to(code).emit('update-data');
        }

        res.json({ message: "Lobbydan chiqdingiz.", remaining: count });
    } catch (error) {
        console.error('leaveLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// QAYTA KIRISH
// ===============================================================
export const rejoinLobby = async (req, res) => {
    try {
        const { username, lobbyCode } = req.body;
        if (!username || typeof username !== 'string' || !username.trim())
            return res.status(400).json({ message: 'Ism kiriting!' });
        if (!lobbyCode || typeof lobbyCode !== 'string' || !lobbyCode.trim())
            return res.status(400).json({ message: 'Lobbi kodini kiriting!' });

        const trimmed = sanitizeString(username);
        const code    = lobbyCode.trim().slice(0, 10);
        if (!/^\d{5}$/.test(code))
            return res.status(400).json({ message: "Lobbi kodi 5 xonali raqam bo'lishi kerak!" });

        const lobbyRes = await pool.query(
            'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Lobbi topilmadi yoki yakunlangan!' });

        const playerRes = await pool.query(
            'SELECT * FROM players WHERE lobby_code=$1 AND LOWER(username)=LOWER($2)',
            [code, trimmed]
        );
        if (playerRes.rowCount === 0)
            return res.status(403).json({ message: "Siz bu lobbida ro'yxatdan o'tmagansiz!" });

        req.app.get('io').to(code).emit('update-data');
        res.status(200).json({
            message: "Lobbiga qayta kirdingiz!",
            lobbyCode: code,
            adminUsername: lobbyRes.rows[0].admin_username
        });
    } catch (error) {
        console.error('rejoinLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// ICHKI FUNKSIYALAR
// ===============================================================
const phaseTimers = {};

function autoAdvancePhase(code, currentPhase, io) {
    const key = `${code}:${currentPhase}`;
    clearTimeout(phaseTimers[key]);
    phaseTimers[key] = setTimeout(async () => {
        delete phaseTimers[key];
        try {
            const lobbyRes = await pool.query(
                'SELECT current_phase, admin_username FROM lobbies WHERE lobby_code=$1 AND is_active=true',
                [code]
            );
            if (lobbyRes.rowCount === 0) return;
            if (lobbyRes.rows[0].current_phase !== currentPhase) return;
            await advancePhaseLogic(code, currentPhase, lobbyRes.rows[0].admin_username, io);
        } catch (e) {
            console.error('autoAdvancePhase xato:', e.message);
        }
    }, 5000);
}

// ===============================================================
// advancePhaseLogic — YAGONA FAZA O'TISH LOGIKASI
// Ilgari updatePhase va advancePhaseLogic ikki joyda takrorlanayotgan edi.
// Endi updatePhase → bu funksiyani chaqiradi, duplicate yo'q.
// ===============================================================
export async function advancePhaseLogic(code, phase, username, io) {
    const lobbyRes = await pool.query(
        'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
    );
    if (lobbyRes.rowCount === 0) return;
    const lobby = lobbyRes.rows[0];
    if (lobby.current_phase !== phase) return;

    let nextPhase = '', duration = 0;

    switch (phase) {
        case 'introduction':    nextPhase = 'night_preparing'; duration = 8;   break;
        case 'night_preparing': nextPhase = 'night_mafia';     duration = 30;  break;
        case 'night_mafia': {
            const doctorQ = await pool.query(
                "SELECT id FROM players WHERE lobby_code=$1 AND role='Doctor' AND is_alive=true LIMIT 1",
                [code]
            );
            if (doctorQ.rowCount > 0) {
                nextPhase = 'night_doctor'; duration = 30;
            } else {
                // Doktor o'lgan — tungi hisob-kitob shu yerda
                const killed = await _processNightKill(code, null /* savedId */, io);
                await pool.query('UPDATE players SET pending_kill=NULL WHERE lobby_code=$1', [code]);
                io.to(code).emit('night-summary-report', { message: killed.msg, winner: null });
                nextPhase = 'discussion'; duration = 300;
            }
            break;
        }
        case 'night_doctor': {
            const nightResult = await _processNightDoctor(code, io);
            io.to(code).emit('night-summary-report', { message: nightResult.msg, winner: null });
            nextPhase = 'discussion'; duration = 300;
            break;
        }
        case 'discussion': nextPhase = 'voting'; duration = 30; break;
        case 'voting': {
            const voteResult = await _processVoting(code, io);
            if (voteResult.isTie) return; // tie holda o'zi fazani yangiladi
            nextPhase = 'vote_results'; duration = 15;
            break;
        }
        case 'vote_results': nextPhase = 'night_preparing'; duration = 8; break;
        default: return;
    }

    // G'olib tekshirish
    const winnerData = await checkWinnerInternal(code);
    if (winnerData.winner) {
        io.to(code).emit('game-over', { winner: winnerData.winner, message: winnerData.message, players: winnerData.players });
        // G'oliblarga tanga berish
        rewardWinners(code, winnerData.winner).catch(() => {});
        setTimeout(() => cleanupLobby(code), 3000);
        return;
    }

    // Faza yangilash — bitta transactionda
    const nextPhaseEndTime = new Date(Date.now() + duration * 1000);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let playersUpdateExtra = '';
        if (phase === 'night_doctor') {
            playersUpdateExtra = ', pending_kill=NULL, pending_save=NULL';
        } else if (phase === 'voting' || phase === 'discussion') {
            // vote_results ga o'tganda yoki yangi discussion dan keyingi voting
        }

        if (phase === 'night_doctor') {
            await client.query(
                `UPDATE players SET current_phase=$1, phase_end_time=$2,
                 vote_count=0, voted_for=NULL, pending_kill=NULL, pending_save=NULL
                 WHERE lobby_code=$3 AND is_alive=true`,
                [nextPhase, nextPhaseEndTime, code]
            );
        } else if (phase === 'voting') {
            await client.query(
                `UPDATE players SET current_phase=$1, phase_end_time=$2,
                 vote_count=0, voted_for=NULL
                 WHERE lobby_code=$3 AND is_alive=true`,
                [nextPhase, nextPhaseEndTime, code]
            );
        } else {
            await client.query(
                'UPDATE players SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3 AND is_alive=true',
                [nextPhase, nextPhaseEndTime, code]
            );
        }

        await client.query(
            'UPDATE players SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3 AND is_alive=false',
            [nextPhase, nextPhaseEndTime, code]
        );
        await client.query(
            'UPDATE lobbies SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3',
            [nextPhase, nextPhaseEndTime, code]
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }

    await touchActivity(code);
    io.to(code).emit('update-data');
    console.log(`[advancePhase] ${code}: ${phase} → ${nextPhase}`);
}

// ---------------------------------------------------------------
// Tungi o'ldirish hisob-kitob (night_mafia bilan birgalikda)
// ---------------------------------------------------------------
async function _processNightKill(code, savedId, io) {
    const mafiaTargetQ = await pool.query(
        'SELECT id, username, role FROM players WHERE lobby_code=$1 AND pending_kill IS NOT NULL LIMIT 1',
        [code]
    );
    const killedPlayer = mafiaTargetQ.rows[0];
    let msg = "Xayrli tong! Tunda hech kim o'lmadi. ✨";

    if (killedPlayer) {
        if (savedId && killedPlayer.id === savedId) {
            msg = 'Xayrli tong! Mafiya nishonini Doktor davoladi! 🩺🛡️';
        } else {
            await pool.query('UPDATE players SET is_alive=false WHERE id=$1', [killedPlayer.id]);
            msg = `Xayrli tong! Tunda ${sanitizeString(killedPlayer.username)} (${sanitizeString(killedPlayer.role)}) o'ldirildi. 💀`;
            await checkAndTransferDonship(code);
            await checkAndTransferAdminship(code, io);
        }
    }
    return { msg, killedPlayer };
}

// ---------------------------------------------------------------
// Doktor fazasi hisob-kitob
// ---------------------------------------------------------------
async function _processNightDoctor(code, io) {
    const mafiaTargetQ = await pool.query(
        'SELECT id, username, role FROM players WHERE lobby_code=$1 AND pending_kill IS NOT NULL LIMIT 1',
        [code]
    );
    const doctorTargetQ = await pool.query(
        'SELECT id FROM players WHERE lobby_code=$1 AND pending_save IS NOT NULL LIMIT 1',
        [code]
    );
    const killedPlayer = mafiaTargetQ.rows[0];
    const savedPlayer  = doctorTargetQ.rows[0];
    let msg = "Xayrli tong! Tunda hech kim o'lmadi. ✨";

    if (killedPlayer) {
        if (savedPlayer && killedPlayer.id === savedPlayer.id) {
            msg = 'Xayrli tong! Mafiya nishonini Doktor davoladi! 🩺🛡️';
        } else {
            await pool.query('UPDATE players SET is_alive=false WHERE id=$1', [killedPlayer.id]);
            msg = `Xayrli tong! Tunda ${sanitizeString(killedPlayer.username)} (${sanitizeString(killedPlayer.role)}) o'ldirildi. 💀`;
            await checkAndTransferDonship(code);
            await checkAndTransferAdminship(code, io);
        }
    }
    await pool.query('UPDATE players SET pending_kill=NULL, pending_save=NULL WHERE lobby_code=$1', [code]);
    return { msg };
}

// ---------------------------------------------------------------
// Ovoz berish hisob-kitob
// ---------------------------------------------------------------
async function _processVoting(code, io) {
    const voteRes = await pool.query(
        'SELECT id, username, role, vote_count FROM players WHERE lobby_code=$1 AND is_alive=true AND vote_count>0',
        [code]
    );
    let maxVotes = 0, playerToKick = null, playerToKickId = null,
        playerToKickRole = null, isTie = false;
    for (const p of voteRes.rows) {
        if (p.vote_count > maxVotes) {
            maxVotes = p.vote_count; playerToKick = p.username;
            playerToKickId = p.id; playerToKickRole = p.role; isTie = false;
        } else if (p.vote_count === maxVotes) {
            isTie = true;
        }
    }

    const allVotesRes = await pool.query(
        'SELECT username, voted_for FROM players WHERE lobby_code=$1 AND is_alive=true AND voted_for IS NOT NULL',
        [code]
    );
    const voteDetails = allVotesRes.rows
        .map(p => `${sanitizeString(p.username)} → ${sanitizeString(p.voted_for || '')}`)
        .join('\n');

    if (isTie) {
        const tieMsg = "⚖️ Ovozlar teng! 3 daqiqa muhokama, keyin qayta ovoz berish...";
        const tieEnd = new Date(Date.now() + 180 * 1000);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'UPDATE players SET current_phase=$1, phase_end_time=$2, vote_count=0, voted_for=NULL WHERE lobby_code=$3 AND is_alive=true',
                ['discussion', tieEnd, code]
            );
            await client.query(
                'UPDATE players SET current_phase=$1, phase_end_time=$2 WHERE lobby_code=$3 AND is_alive=false',
                ['discussion', tieEnd, code]
            );
            await client.query(
                'UPDATE lobbies SET current_phase=$1, phase_end_time=$2, last_vote_summary=$3, last_vote_details=$4 WHERE lobby_code=$5',
                ['discussion', tieEnd, tieMsg, voteDetails, code]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        io.to(code).emit('vote-results', { summary: tieMsg, details: voteDetails });
        io.to(code).emit('update-data');
        return { isTie: true };
    }

    let kickedMsg = "Hech kim ovoz bermadi. ⚡";
    if (playerToKick) {
        await pool.query('UPDATE players SET is_alive=false WHERE id=$1', [playerToKickId]);
        kickedMsg = `${sanitizeString(playerToKick)} o'yindan chetlatildi! Roli: [${sanitizeString(playerToKickRole)}]`;
        await checkAndTransferDonship(code);
        await checkAndTransferAdminship(code, io);
    }

    await pool.query(
        'UPDATE lobbies SET last_vote_summary=$1, last_vote_details=$2 WHERE lobby_code=$3',
        [kickedMsg, voteDetails, code]
    );
    io.to(code).emit('vote-results', { summary: kickedMsg, details: voteDetails });
    return { isTie: false, kickedMsg };
}

// ---------------------------------------------------------------
// G'olib tekshirish
// ---------------------------------------------------------------
async function checkWinnerInternal(code) {
    const alive   = await pool.query(
        'SELECT role FROM players WHERE lobby_code=$1 AND is_alive=true', [code]
    );
    const mafias   = alive.rows.filter(p => p.role.includes('Mafia')).length;
    const citizens = alive.rows.length - mafias;

    let winner = null, message = '';
    if (mafias === 0)       { winner = 'CITIZEN'; message = "Tinch aholi g'alaba qozondi! 🎉"; }
    else if (mafias >= citizens) { winner = 'MAFIA'; message = "Mafiya g'alaba qozondi! 🎭"; }
    else return { winner: null, message: '' };

    // O'yin tugagach, sir saqlashning hojati yo'q —
    // barcha o'yinchilarning haqiqiy rollarini (tirik/o'lik) qaytaramiz,
    // shunda frontend g'olib bo'lgan jamoa a'zolarini ko'rsata oladi.
    const all = await pool.query(
        'SELECT username, role, is_alive FROM players WHERE lobby_code=$1 ORDER BY id ASC', [code]
    );

    return { winner, message, players: all.rows };
}

// ---------------------------------------------------------------
// DON o'lganda boshqa Mafiyaga o'tkazish
// ---------------------------------------------------------------
async function checkAndTransferDonship(code) {
    const donQ = await pool.query(
        "SELECT id FROM players WHERE lobby_code=$1 AND role='Mafia (DON)' AND is_alive=true", [code]
    );
    if (donQ.rowCount === 0) {
        const backupQ = await pool.query(
            "SELECT id FROM players WHERE lobby_code=$1 AND role='Mafia' AND is_alive=true LIMIT 1", [code]
        );
        if (backupQ.rowCount > 0) {
            await pool.query("UPDATE players SET role='Mafia (DON)' WHERE id=$1", [backupQ.rows[0].id]);
        }
    }
}

// ---------------------------------------------------------------
// Admin o'lganda yangi admin tayinlash
// ---------------------------------------------------------------
async function checkAndTransferAdminship(code, io) {
    const lobbyRes = await pool.query(
        "SELECT admin_username, current_phase FROM lobbies WHERE lobby_code=$1", [code]
    );
    if (lobbyRes.rowCount === 0) return;
    const { admin_username, current_phase } = lobbyRes.rows[0];

    const adminAlive = await pool.query(
        "SELECT id FROM players WHERE lobby_code=$1 AND username=$2 AND is_alive=true",
        [code, admin_username]
    );
    if (adminAlive.rowCount > 0) return;

    const newAdminQ = await pool.query(
        "SELECT username FROM players WHERE lobby_code=$1 AND is_alive=true ORDER BY id ASC LIMIT 1",
        [code]
    );
    if (newAdminQ.rowCount === 0) return;
    const newAdmin = newAdminQ.rows[0].username;
    await pool.query("UPDATE lobbies SET admin_username=$1 WHERE lobby_code=$2", [newAdmin, code]);
    console.log(`[adminship] ${code}: Admin ${admin_username} o'ldi. Yangi: ${newAdmin}`);
    io.to(code).emit("admin-changed", { newAdmin, currentPhase: current_phase });
}

// ---------------------------------------------------------------
// Lobbi tozalash — transaction bilan
// ---------------------------------------------------------------
async function cleanupLobby(code) {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM players WHERE lobby_code=$1', [code]);
            await client.query('DELETE FROM lobbies WHERE lobby_code=$1', [code]);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
        console.log(`[cleanupLobby] ${code} bazadan o'chirildi.`);
    } catch (e) {
        console.error(`[cleanupLobby] ${code} xato:`, e.message);
    }
}

export const nightSummary = async (req, res) => res.json({ message: 'OK' });
export const voteSummary  = async (req, res) => res.json({ message: 'OK' });

// ===============================================================
// ONLINE LOBBILAR RO'YXATI
// ===============================================================
export const getPublicLobbies = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                l.lobby_code, l.admin_username, l.min_players, l.max_players,
                l.is_private, l.last_activity,
                COUNT(p.id)::int AS player_count
            FROM lobbies l
            LEFT JOIN players p ON p.lobby_code = l.lobby_code
            WHERE l.is_active = true
              AND l.current_phase = 'waiting'
              AND l.is_online = true
              AND l.last_activity > NOW() - INTERVAL '60 minutes'
            GROUP BY l.lobby_code, l.admin_username, l.min_players, l.max_players, l.is_private, l.last_activity
            ORDER BY l.last_activity DESC
            LIMIT 50
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('getPublicLobbies xato:', error.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ===============================================================
// ONLINE LOBBI YARATISH
// ===============================================================
export const createOnlineLobby = async (req, res) => {
    try {
        const { username, minPlayers, maxPlayers, isPrivate, password } = req.body;
        if (!username || typeof username !== 'string' || !username.trim())
            return res.status(400).json({ message: 'Ism kiriting!' });

        const trimmed = sanitizeString(username);
        if (trimmed.length < 2)
            return res.status(400).json({ message: "Ism kamida 2 ta harf bo'lishi kerak!" });

        const min = parseInt(minPlayers) || 5;
        const max = parseInt(maxPlayers) || 10;
        if (min < 5 || min > 20 || max < 5 || max > 20 || min > max)
            return res.status(400).json({ message: "Noto'g'ri o'yinchi soni!" });

        const priv = isPrivate === true || isPrivate === 'true';
        let pass = null;
        if (priv) {
            if (!password || typeof password !== 'string' || !password.trim())
                return res.status(400).json({ message: 'Yopiq lobbi uchun parol kiriting!' });
            pass = password.trim().slice(0, 30);
        }

        let lobbyCode;
        while (true) {
            const candidate = String(Math.floor(10000 + Math.random() * 90000));
            const check = await pool.query('SELECT id FROM lobbies WHERE lobby_code=$1', [candidate]);
            if (check.rowCount === 0) { lobbyCode = candidate; break; }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO lobbies
                    (lobby_code, admin_username, is_active, current_phase, min_players, max_players, is_private, lobby_password, is_online)
                 VALUES ($1,$2,true,'waiting',$3,$4,$5,$6,true)`,
                [lobbyCode, trimmed, min, max, priv, pass]
            );
            const color  = await pickColor(lobbyCode);
            const userId = req.userId || null;
            await client.query(
                'INSERT INTO players (lobby_code, username, role, is_alive, player_color, user_id) VALUES ($1,$2,$3,true,$4,$5)',
                [lobbyCode, trimmed, 'unassigned', color, userId]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        req.app.get('io').emit('lobbies-updated');
        res.status(201).json({ message: 'Online lobbi yaratildi!', lobbyCode, adminUsername: trimmed });
    } catch (error) {
        console.error('createOnlineLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};

// ===============================================================
// ONLINE LOBBIGA KIRISH
// ===============================================================
export const joinOnlineLobby = async (req, res) => {
    try {
        const { username, lobbyCode, password } = req.body;
        if (!username || typeof username !== 'string' || !username.trim())
            return res.status(400).json({ message: 'Ism kiriting!' });
        if (!lobbyCode || typeof lobbyCode !== 'string' || !lobbyCode.trim())
            return res.status(400).json({ message: 'Lobbi kodini kiriting!' });

        const trimmed = sanitizeString(username);
        const code    = lobbyCode.trim().slice(0, 10);
        if (trimmed.length < 2)
            return res.status(400).json({ message: "Ism kamida 2 ta harf bo'lishi kerak!" });
        if (!/^\d{5}$/.test(code))
            return res.status(400).json({ message: "Lobbi kodi 5 xonali raqam bo'lishi kerak!" });

        const lobbyRes = await pool.query(
            'SELECT * FROM lobbies WHERE lobby_code=$1 AND is_active=true', [code]
        );
        if (lobbyRes.rowCount === 0)
            return res.status(404).json({ message: 'Bunday lobbi topilmadi yoki yakunlangan!' });

        const lobby = lobbyRes.rows[0];
        if (lobby.current_phase !== 'waiting')
            return res.status(400).json({ message: "O'yin allaqachon boshlangan!" });

        if (lobby.is_private) {
            if (!password || password.trim() !== lobby.lobby_password)
                return res.status(403).json({ message: "Noto'g'ri parol!" });
        }

        const finalUsername = await uniqueUsername(code, trimmed);

        const countRes = await pool.query('SELECT COUNT(*) FROM players WHERE lobby_code=$1', [code]);
        const maxAllowed = lobby.max_players || 20;
        if (parseInt(countRes.rows[0].count) >= maxAllowed)
            return res.status(400).json({ message: `Lobbi to'lib qoldi! (max ${maxAllowed} kishi)` });

        const color  = await pickColor(code);
        const userId = req.userId || null;
        await pool.query(
            'INSERT INTO players (lobby_code, username, role, is_alive, player_color, user_id) VALUES ($1,$2,$3,true,$4,$5)',
            [code, finalUsername, 'unassigned', color, userId]
        );
        await touchActivity(code);

        const io = req.app.get('io');
        io.to(code).emit('update-data');
        io.emit('lobbies-updated');
        res.status(201).json({
            message: "Lobbiga qo'shildingiz!",
            lobbyCode: code,
            adminUsername: lobby.admin_username,
            username: finalUsername,
        });
    } catch (error) {
        console.error('joinOnlineLobby xato:', error.message);
        res.status(500).json({ message: 'Server xatosi yuz berdi.' });
    }
};
