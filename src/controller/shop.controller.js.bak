// ===============================================================
// MAFIA — SHOP (DO'KON) CONTROLLER
// Tangalar, ismlar sotib olish
// ===============================================================

import pool from '../config/db.js';

// ---------------------------------------------------------------
// Do'kondagi ismlar ro'yxati (keyinroq DB ga ko'chirish mumkin)
// ---------------------------------------------------------------
const SHOP_NAMES = [
    //---------------------------Epic-----------------------------------

    // {
    //     id:       'water',
    //     label:    'Suv Tomchi',
    //     price:    100,
    //     rarity:   'Epic',
    //     gradient: 'linear-gradient(90deg,#38bdf8,#0ea5e9,#0284c7)',
    //     icon:     '💧',
    //     iconBg:   'linear-gradient(135deg,#0c4a6e,#0ea5e9)',
    //     border:   '#0ea5e9',
    //     desc:     'Epic isim • Moviy gradient',
    // },
    {
        
        id:       'fire_boss',
        label:    ' Olov',
        price:    120,
        rarity:   'Epic',
        gradient: 'linear-gradient(90deg,#f97316,#ef4444)',
        icon:     '🔥',
        iconBg:   'linear-gradient(135deg,#dc2626,#f97316)',
        border:   '#f97316',
        desc:     'Rare isim • Qizil gradient',
    },
    {
        id:       'ninja',
        label:    'Ninja',
        price:    150,
        rarity:   'Epic',
        gradient: 'linear-gradient(90deg,#6366f1,#8b5cf6)',
        icon:     '🥷',
        iconBg:   'linear-gradient(135deg,#1e1b4b,#6366f1)',
        border:   '#6366f1',
        desc:     'Epic isim • Binafsha gradient',
    },
    {
        id:       'ghost',
        label:    'Arvoh',
        price:    200,
        rarity:   'Epic',
        gradient: 'linear-gradient(90deg,#a855f7,#ec4899)',
        icon:     '👻',
        iconBg:   'linear-gradient(135deg,#4c1d95,#a855f7)',
        border:   '#a855f7',
        desc:     'Epic isim • Binafsha gradient',
    },
    
    
    //----------------------------Legendary-------------------------------------
    {
        id:       'king',
        label:    'Qirol',
        price:    250,
        rarity:   'Legendary',
        gradient: 'linear-gradient(90deg,#f59e0b,#fbbf24,#f59e0b)',
        icon:     '👑',
        iconBg:   'linear-gradient(135deg,#92400e,#f59e0b)',
        border:   '#b45309',
        desc:     'Legendary isim • Oltin gradient',
    },
    {
        id:       'cosmic_nebula',
        label:    'Galaktika',
        price:    280,
        rarity:   'Legendary',
        gradient: 'linear-gradient(90deg, #d946ef, #8b5cf6)',
        icon:     '🌌',
        iconBg:   'linear-gradient(135deg, #6d28d9, #ec4899)',
        border:   '#d946ef',
        desc:     'Legendary ism • Kosmik binafsha',
    },
    
    //-----------------------------Mythic-----------------------------------------
    {
        id:       'dragon',
        label:    'Ajdaho',
        price:    300,
        rarity:   'Mythic',
        gradient: 'linear-gradient(90deg,#22d3ee,#10b981,#22d3ee)',
        icon:     '🐉',
        iconBg:   'linear-gradient(135deg,#064e3b,#10b981)',
        border:   '#10b981',
        desc:     'Mythic isim • Zangori-yashil gradient',
    },
    {
        id:       'lightning_storm',
        label:    'Chaqmoq',
        price:    450,
        rarity:   'Mythic',
        gradient: 'linear-gradient(90deg, #00d2ff, #0066ff)',
        icon:     '⚡',
        iconBg:   'linear-gradient(135deg, #0f172a, #1d4ed8)',
        border:   '#00d2ff',
        desc:     'Mythic ism • Toʻq koʻk gradient va yorqin moviy chiroq',
    },
    
];

// Tanga paketlari
const COIN_PACKAGES = [
    { id: 'pack_150', price_uzs: 12999, coins: 150 },
    { id: 'pack_200', price_uzs: 16999, coins: 200 },
    { id: 'pack_300', price_uzs: 19999, coins: 300 },
];

// ---------------------------------------------------------------
// Foydalanuvchi tanga balansini olish
// GET /api/shop/balance
// ---------------------------------------------------------------
export const getBalance = async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT coins FROM users WHERE id=$1',
            [req.userId]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Foydalanuvchi topilmadi!' });

        res.json({ coins: result.rows[0].coins || 0 });
    } catch (err) {
        console.error('getBalance xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Do'kon ro'yxatini olish (auth siz ham ishlaydi)
// GET /api/shop/items
// ---------------------------------------------------------------
export const getShopItems = async (req, res) => {
    try {
        let purchased = new Set();
        let coins = 0;

        // Agar login bo'lgan bo'lsa — sotib olinganlar va tangani yuklaymiz
        if (req.userId) {
            const [purchasedRes, balRes] = await Promise.all([
                pool.query('SELECT item_id FROM user_purchases WHERE user_id=$1', [req.userId]),
                pool.query('SELECT coins FROM users WHERE id=$1', [req.userId]),
            ]);
            purchased = new Set(purchasedRes.rows.map(r => r.item_id));
            coins = balRes.rows[0]?.coins || 0;
        }

        const items = SHOP_NAMES.map(item => ({
            ...item,
            owned: purchased.has(item.id),
        }));

        res.json({ coins, items, coin_packages: COIN_PACKAGES });
    } catch (err) {
        console.error('getShopItems xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Ism sotib olish
// POST /api/shop/buy
// Body: { item_id }
// ---------------------------------------------------------------
export const buyItem = async (req, res) => {
    try {
        const { item_id } = req.body;
        const userId = req.userId;

        const item = SHOP_NAMES.find(i => i.id === item_id);
        if (!item)
            return res.status(404).json({ message: "Bunday mahsulot yo'q!" });

        // Avval sotib olinganmi?
        const alreadyRes = await pool.query(
            'SELECT id FROM user_purchases WHERE user_id=$1 AND item_id=$2',
            [userId, item_id]
        );
        if (alreadyRes.rowCount > 0)
            return res.status(409).json({ message: "Bu ism allaqachon sizda bor!" });

        // Tangalar yetarlimi?
        const userRes = await pool.query(
            'SELECT coins FROM users WHERE id=$1',
            [userId]
        );
        const coins = userRes.rows[0]?.coins || 0;
        if (coins < item.price)
            return res.status(400).json({
                message: `Tangalar yetarli emas! Kerak: ${item.price} 💰, Sizda: ${coins} 💰`
            });

        // Transaction: tangani ayiramiz + xaridni yozamiz
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                'UPDATE users SET coins = coins - $1 WHERE id = $2',
                [item.price, userId]
            );
            await client.query(
                'INSERT INTO user_purchases (user_id, item_id, item_type, price_paid) VALUES ($1,$2,$3,$4)',
                [userId, item_id, 'name', item.price]
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        // Yangi balansni qaytaramiz
        const newBalRes = await pool.query(
            'SELECT coins FROM users WHERE id=$1', [userId]
        );
        res.json({
            message: `✅ "${item.label}" muvaffaqiyatli sotib olindi!`,
            coins: newBalRes.rows[0].coins,
            item,
        });

    } catch (err) {
        console.error('buyItem xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Tanga paketi sotib olish (hozircha "tez kunda")
// POST /api/shop/buy-coins
// Body: { package_id }
// ---------------------------------------------------------------
export const buyCoins = async (req, res) => {
    // To'lov tizimi ulanganda bu yerga Click/Payme webhook keladi
    res.status(503).json({
        message: "To'lov tizimi tez kunda ishga tushadi! 🚀",
        coming_soon: true,
    });
};

// ---------------------------------------------------------------
// O'yin yutganda tanga berish (ichki funksiya — player.controller dan chaqiriladi)
// ---------------------------------------------------------------
// Ikki marta ishlamasligi uchun — kod bazaga "rewarded" belgisi qo'yiladi
const rewardedLobbies = new Set();

export async function rewardWinners(lobbyCode, winnerTeam) {
    // Agar bu lobby uchun allaqachon tanga berilgan bo'lsa — o'tkazib yuboramiz
    if (rewardedLobbies.has(lobbyCode)) {
        console.log(`[shop] ${lobbyCode} uchun tanga allaqachon berilgan, o'tkazildi.`);
        return;
    }
    rewardedLobbies.add(lobbyCode);
    // 10 daqiqadan keyin xotirani tozalaymiz
    setTimeout(() => rewardedLobbies.delete(lobbyCode), 10 * 60 * 1000);

    try {
        let roleFilter;
        if (winnerTeam === 'MAFIA') {
            roleFilter = "role IN ('Mafia', 'Mafia (DON)')";
        } else {
            roleFilter = "role IN ('Citizen', 'Doctor')";
        }

        // Faqat ro'yxatdan o'tgan (user_id bor) g'oliblarga tanga beramiz
        const winnersRes = await pool.query(
            `SELECT p.user_id FROM players p
             WHERE p.lobby_code=$1 AND ${roleFilter} AND p.user_id IS NOT NULL`,
            [lobbyCode]
        );

        // Barcha ro'yxatdan o'tgan o'yinchilarning games_played ni oshiramiz
        const allPlayersRes = await pool.query(
            `SELECT p.user_id FROM players p
             WHERE p.lobby_code=$1 AND p.user_id IS NOT NULL`,
            [lobbyCode]
        );

        const allUserIds  = allPlayersRes.rows.map(r => r.user_id);
        const winnerIds   = winnersRes.rows.map(r => r.user_id);

        if (allUserIds.length > 0) {
            await pool.query(
                `UPDATE users SET games_played = games_played + 1
                 WHERE id = ANY($1::int[])`,
                [allUserIds]
            );
        }

        if (winnerIds.length > 0) {
            await pool.query(
                `UPDATE users SET coins = coins + 20, games_won = games_won + 1
                 WHERE id = ANY($1::int[])`,
                [winnerIds]
            );
        }

        console.log(`[shop] ${winnerTeam} g'aliblari (user_id): ${winnerIds.join(', ')} — +20 tanga, +1 g'alaba`);
        console.log(`[shop] Barcha ro'yxatdan o'tganlar (user_id): ${allUserIds.join(', ')} — +1 o'yin`);
    } catch (err) {
        console.error('[shop] rewardWinners xato:', err.message);
        // Xato bo'lsa o'yin to'xtamasin
    }
}

// ---------------------------------------------------------------
// Aktiv skinni o'rnatish
// POST /api/shop/set-skin
// Body: { skin_id } — null bo'lsa default ko'rinish
// ---------------------------------------------------------------
export const setSkin = async (req, res) => {
    try {
        const { skin_id } = req.body;
        const userId = req.userId;

        // null = default ko'rinish (skin yo'q)
        if (skin_id !== null && skin_id !== undefined && skin_id !== '') {
            // Sotib olinganini tekshiramiz
            const purchasedRes = await pool.query(
                'SELECT id FROM user_purchases WHERE user_id=$1 AND item_id=$2',
                [userId, skin_id]
            );
            if (purchasedRes.rowCount === 0)
                return res.status(403).json({ message: "Bu skin sizda yo'q!" });
        }

        const finalSkin = (skin_id === null || skin_id === '' || skin_id === undefined) ? null : skin_id;

        await pool.query(
            'UPDATE users SET active_skin=$1 WHERE id=$2',
            [finalSkin, userId]
        );

        // Skin ma'lumotlarini qaytaramiz
        const skinData = finalSkin ? SHOP_NAMES.find(s => s.id === finalSkin) : null;

        res.json({
            message: finalSkin ? `✅ Ko'rinish o'rnatildi!` : '✅ Standart ko\'rinishga qaytildi',
            active_skin: finalSkin,
            skin_data: skinData || null,
        });
    } catch (err) {
        console.error('setSkin xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Foydalanuvchi skin ma'lumotlarini olish (ochiq endpoint)
// GET /api/skin/:username
// Faqat ro'yxatdan o'tgan (user_id bor) o'yinchilar uchun skin qaytaradi.
// Mehmon o'yinchi xuddi shu username bilan kirsa skin ko'rsatilmaydi.
// ---------------------------------------------------------------
export const getUserSkin = async (req, res) => {
    try {
        const username = req.params.username?.trim().slice(0, 30);
        if (!username) return res.status(400).json({ message: 'Username kerak!' });

        // lobby_code berilsa — o'sha lobbydagi player user_id bor-yo'qligini tekshiramiz
        // Aks holda shunchaki users jadvalidan olamiz (profil sahifasi uchun)
        const lobbyCode = req.query.lobby;

        if (lobbyCode) {
            // Lobbydagi o'yinchi ro'yxatdan o'tganmi?
            const playerRes = await pool.query(
                `SELECT p.user_id, u.active_skin
                 FROM players p
                 LEFT JOIN users u ON u.id = p.user_id
                 WHERE p.lobby_code=$1 AND LOWER(p.username)=LOWER($2)
                 LIMIT 1`,
                [lobbyCode, username]
            );
            if (playerRes.rowCount === 0 || !playerRes.rows[0].user_id) {
                // Mehmon yoki topilmadi — skin yo'q
                return res.json({ active_skin: null, skin_data: null });
            }
            const activeSkin = playerRes.rows[0].active_skin;
            const skinData   = activeSkin ? SHOP_NAMES.find(s => s.id === activeSkin) : null;
            return res.json({ active_skin: activeSkin, skin_data: skinData || null });
        }

        // lobby_code berilmagan — oddiy profil so'rovi
        const result = await pool.query(
            'SELECT active_skin FROM users WHERE LOWER(username)=LOWER($1) AND is_active=true',
            [username]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ skin: null });

        const activeSkin = result.rows[0].active_skin;
        const skinData   = activeSkin ? SHOP_NAMES.find(s => s.id === activeSkin) : null;

        res.json({ active_skin: activeSkin, skin_data: skinData || null });
    } catch (err) {
        console.error('getUserSkin xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// Skin ma'lumotlarini ID bo'yicha olish (ichki ishlatish uchun)
export function getSkinById(skinId) {
    return SHOP_NAMES.find(s => s.id === skinId) || null;
}

// Barcha skinlar ro'yxati (ichki)
export { SHOP_NAMES };
