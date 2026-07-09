// ===============================================================
// MAFIA — TELEGRAM STARS TO'LOV CONTROLLER
// ===============================================================

import pool from '../config/db.js';

const BOT_TOKEN = process.env.BOT_TOKEN;

// Tanga paketlari (Stars narxi bilan)
// Tanga paketlari (Stars narxi bilan)
export const COIN_PACKAGES = [
    {
        id:          'pack_150',
        coins:       150,
        stars:       100,         // 👈 shu raqamni o'zgartiring (150 tanga narxi, Stars)
        title:       '💰 150 Tanga',
        description: 'Mafia Online uchun 150 tanga to\'plami',
    },
    {
        id:          'pack_300',
        coins:       300,
        stars:       200,         // 👈 shu raqamni o'zgartiring (300 tanga narxi, Stars)
        title:       '💰 300 Tanga',
        description: 'Mafia Online uchun 300 tanga to\'plami (Mashhur!)',
    },
    {
        id:          'pack_500',
        coins:       500,
        stars:       300,         // 👈 shu raqamni o'zgartiring (500 tanga narxi, Stars)
        title:       '💰 500 Tanga',
        description: 'Mafia Online uchun 500 tanga to\'plami (Katta to\'plam)',
    },
];

// ---------------------------------------------------------------
// Stars invoice link yaratish (Mini App ichida openInvoice uchun)
// POST /api/payment/stars/create
// Body: { package_id }
// ---------------------------------------------------------------
export const createStarsInvoice = async (req, res) => {
    try {
        const { package_id } = req.body;
        const userId = req.userId;

        const pkg = COIN_PACKAGES.find(p => p.id === package_id);
        if (!pkg) {
            return res.status(404).json({ message: "Bunday paket yo'q!" });
        }

        if (!BOT_TOKEN) {
            return res.status(503).json({ message: "Bot token sozlanmagan!" });
        }

        const invoicePayload = JSON.stringify({
            user_id:    userId,
            package_id: package_id,
            coins:      pkg.coins,
        });

        // createInvoiceLink — sendInvoice emas!
        // Mini App ichida tgApp.openInvoice(link) bilan ochiladi
        const tgRes = await fetch(
            `https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`,
            {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title:          pkg.title,
                    description:    pkg.description,
                    payload:        invoicePayload,
                    provider_token: '',      // Stars uchun bo'sh string
                    currency:       'XTR',  // Telegram Stars valyutasi
                    prices: [
                        {
                            label:  pkg.title,
                            amount: pkg.stars,
                        }
                    ],
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

        const invoiceLink = tgData.result; // string link

        // DB ga pending yozuv qo'shamiz
        await pool.query(
            `INSERT INTO payment_logs (user_id, package_id, coins, stars, status)
             VALUES ($1, $2, $3, $4, 'pending')`,
            [userId, package_id, pkg.coins, pkg.stars]
        );

        res.json({
            ok:           true,
            invoice_link: invoiceLink,
            package:      pkg,
        });

    } catch (err) {
        console.error('[payment] createStarsInvoice xato:', err.message);
        res.status(500).json({ message: 'Server xatosi.' });
    }
};

// ---------------------------------------------------------------
// Telegram webhook — Stars to'lovi tasdiqlanganda
// POST /api/payment/stars/webhook
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

            const client = await pool.connect();
            try {
                await client.query('BEGIN');

                // Log ni yangilaymiz
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

                // Allaqachon ishlangan bo'lsa — o'tkazib yuboramiz
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