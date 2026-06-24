// ===============================================================
// MAFIA — TELEGRAM STARS TO'LOV CONTROLLER
// ===============================================================

import pool from '../config/db.js';

const BOT_TOKEN = process.env.BOT_TOKEN;

// Tanga paketlari (Stars narxi bilan)
export const COIN_PACKAGES = [
    {
        id:          'pack_150',
        coins:       150,
        stars:       75,          // 75 Telegram Star ≈ ~1.5$
        title:       '💰 150 Tanga',
        description: 'Mafia Online uchun 150 tanga to\'plami',
    },
    {
        id:          'pack_300',
        coins:       300,
        stars:       140,         // 140 Telegram Star ≈ ~2.8$
        title:       '💰 300 Tanga',
        description: 'Mafia Online uchun 300 tanga to\'plami (Mashhur!)',
    },
    {
        id:          'pack_500',
        coins:       500,
        stars:       220,         // 220 Telegram Star ≈ ~4.4$
        title:       '💰 500 Tanga',
        description: 'Mafia Online uchun 500 tanga to\'plami (Katta to\'plam)',
    },
];

// ---------------------------------------------------------------
// Stars invoice yaratish
// POST /api/payment/stars/create
// Body: { package_id, telegram_user_id }
// ---------------------------------------------------------------
export const createStarsInvoice = async (req, res) => {
    try {
        const { package_id, telegram_user_id } = req.body;
        const userId = req.userId;

        const pkg = COIN_PACKAGES.find(p => p.id === package_id);
        if (!pkg) {
            return res.status(404).json({ message: "Bunday paket yo'q!" });
        }

        if (!BOT_TOKEN) {
            return res.status(503).json({ message: "Bot token sozlanmagan!" });
        }

        if (!telegram_user_id) {
            return res.status(400).json({ message: "Telegram foydalanuvchi ID kerak!" });
        }

        // Telegram Bot API orqali invoice yuborish
        const invoicePayload = JSON.stringify({
            user_id:    userId,
            package_id: package_id,
            coins:      pkg.coins,
        });

        const tgRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendInvoice`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id:         telegram_user_id,
                    title:           pkg.title,
                    description:     pkg.description,
                    payload:         invoicePayload,
                    provider_token:  '',           // Stars uchun bo'sh string
                    currency:        'XTR',        // Telegram Stars valyutasi
                    prices: [
                        {
                            label:  pkg.title,
                            amount: pkg.stars,     // Stars soni
                        }
                    ],
                    photo_url:   'https://i.imgur.com/placeholder.png',
                    need_name:   false,
                    need_email:  false,
                    need_phone:  false,
                    is_flexible: false,
                }),
            }
        );

        const tgData = await tgRes.json();

        if (!tgData.ok) {
            console.error('[payment] Telegram xato:', tgData);
            return res.status(500).json({
                message: "To'lov yaratishda xato: " + (tgData.description || 'Noma\'lum xato'),
            });
        }

        // To'lov yozuvini DB ga saqlaymiz
        await pool.query(
            `INSERT INTO payment_logs (user_id, package_id, coins, stars, status, telegram_message_id)
             VALUES ($1, $2, $3, $4, 'pending', $5)`,
            [userId, package_id, pkg.coins, pkg.stars, tgData.result?.message_id || null]
        );

        res.json({
            ok:      true,
            message: "To'lov so'rovi yuborildi! Telegram ilovangizni tekshiring.",
            package: pkg,
        });

    } catch (err) {
        console.error('[payment] createStarsInvoice xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Telegram webhook — Stars to'lovi tasdiqlanganda
// POST /api/payment/stars/webhook
// (Telegram bot webhook dan keladi)
// ---------------------------------------------------------------
export const handleStarsWebhook = async (req, res) => {
    try {
        const update = req.body;

        // pre_checkout_query — to'lovni tasdiqlash
        if (update.pre_checkout_query) {
            const pcq = update.pre_checkout_query;
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerPreCheckoutQuery`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pre_checkout_query_id: pcq.id,
                    ok:                    true,
                }),
            });
            return res.json({ ok: true });
        }

        // successful_payment — to'lov muvaffaqiyatli bo'ldi
        if (update.message?.successful_payment) {
            const payment = update.message.successful_payment;
            const payload = JSON.parse(payment.invoice_payload);

            const { user_id, package_id, coins } = payload;

            // Foydalanuvchiga tanga beramiz (bir marta)
            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Avval log ni yangilaymiz
                const logRes = await client.query(
                    `UPDATE payment_logs
                     SET status = 'completed',
                         telegram_charge_id = $1,
                         completed_at = NOW()
                     WHERE user_id = $2
                       AND package_id = $3
                       AND status = 'pending'
                     RETURNING id`,
                    [payment.telegram_payment_charge_id, user_id, package_id]
                );

                // Agar allaqachon ishlangan bo'lsa — o'tkazib yuboramiz (idempotency)
                if (logRes.rowCount === 0) {
                    await client.query('ROLLBACK');
                    console.log('[payment] Allaqachon ishlangan to\'lov:', payment.telegram_payment_charge_id);
                    return res.json({ ok: true });
                }

                // Tangalarni qo'shamiz
                await client.query(
                    'UPDATE users SET coins = coins + $1 WHERE id = $2',
                    [coins, user_id]
                );

                await client.query('COMMIT');
                console.log(`[payment] ✅ User ${user_id} ga ${coins} tanga berildi`);

            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            } finally {
                client.release();
            }

            return res.json({ ok: true });
        }

        res.json({ ok: true });

    } catch (err) {
        console.error('[payment] webhook xato:', err.message);
        res.status(500).json({ ok: false });
    }
};

// ---------------------------------------------------------------
// To'lov tarixi
// GET /api/payment/history
// ---------------------------------------------------------------
export const getPaymentHistory = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT package_id, coins, stars, status, created_at, completed_at
             FROM payment_logs
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [req.userId]
        );
        res.json({ history: result.rows });
    } catch (err) {
        console.error('[payment] getPaymentHistory xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};
