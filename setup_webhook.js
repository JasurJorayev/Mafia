// ================================================================
// Telegram Bot Webhook o'rnatish scripti
// Bir marta ishlatiladi: node setup_webhook.js
// ================================================================

import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const APP_URL   = process.env.APP_URL;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('❌ .env faylida BOT_TOKEN o\'rnatilmagan!');
    process.exit(1);
}

if (!APP_URL) {
    console.error('❌ .env faylida APP_URL o\'rnatilmagan!');
    process.exit(1);
}

const webhookUrl = `${APP_URL}/api/payment/stars/webhook`;

async function setWebhook() {
    console.log(`🔗 Webhook o'rnatilmoqda: ${webhookUrl}`);

    const res  = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
        {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url:             webhookUrl,
                allowed_updates: ['message', 'pre_checkout_query'],
            }),
        }
    );
    const data = await res.json();

    if (data.ok) {
        console.log('✅ Webhook muvaffaqiyatli o\'rnatildi!');
        console.log(`   URL: ${webhookUrl}`);
    } else {
        console.error('❌ Webhook o\'rnatishda xato:', data.description);
    }
}

setWebhook().catch(console.error);
