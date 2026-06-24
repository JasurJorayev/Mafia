// ===============================================================
// MAFIA — TELEGRAM STARS TO'LOV ROUTER
// ===============================================================

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
    createStarsInvoice,
    handleStarsWebhook,
    getPaymentHistory,
} from '../controller/payment.controller.js';

const paymentRouter = Router();

// Stars invoice yaratish (foydalanuvchi to'lovni boshlaydi)
paymentRouter.post('/payment/stars/create', requireAuth, createStarsInvoice);

// Telegram bot webhook (Stars to'lovi tasdiqlanganda)
paymentRouter.post('/payment/stars/webhook', handleStarsWebhook);

// To'lov tarixi
paymentRouter.get('/payment/history', requireAuth, getPaymentHistory);

export default paymentRouter;
