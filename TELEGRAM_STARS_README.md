# 🌟 Telegram Stars To'lov Tizimi — O'rnatish Qo'llanmasi

## 1-qadam: .env faylini to'ldiring

```env
BOT_TOKEN=1234567890:AABBCCDDeeffGGHH...   # @BotFather dan
APP_URL=https://your-server.com             # Serveringiz manzili
```

## 2-qadam: Ma'lumotlar bazasini yangilang

```bash
psql -U postgres -d mafia -f migrate_payments.sql
```

## 3-qadam: Telegram Stars ni yoqing

@BotFather ga yozing:
```
/mybots → Botingizni tanlang → Bot Settings → Payments → Stars
```

## 4-qadam: Webhook o'rnating (server ishga tushgandan keyin)

```bash
node setup_webhook.js
```

## 5-qadam: Mini App ni Telegram ga ulang

@BotFather ga yozing:
```
/mybots → Botingizni tanlang → Bot Settings → Menu Button → Edit Menu Button URL
```
Serveringiz URL sini kiriting.

## To'lov oqimi

```
Foydalanuvchi "⭐ 75 Stars" tugmasini bosadi
    ↓
Server Telegram Bot API ga sendInvoice yuboradi
    ↓
Telegram foydalanuvchiga Stars to'lov oynasini ko'rsatadi
    ↓
Foydalanuvchi to'laydi
    ↓
Telegram /api/payment/stars/webhook ga xabar yuboradi
    ↓
Server foydalanuvchi hisobiga tanga qo'shadi ✅
```

## Tanga paketlari

| Paket | Tanga | Stars | Taxminiy narx |
|-------|-------|-------|--------------|
| pack_150 | 150 | 75 ⭐ | ~1.5$ |
| pack_300 | 300 | 140 ⭐ | ~2.8$ |
| pack_500 | 500 | 220 ⭐ | ~4.4$ |
