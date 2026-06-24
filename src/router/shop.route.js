// ===============================================================
// MAFIA — SHOP ROUTER
// ===============================================================

import { Router }      from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware.js';
import {
    getBalance,
    getShopItems,
    buyItem,
    buyCoins,
    setSkin,
    getUserSkin,
} from '../controller/shop.controller.js';

const shopRouter = Router();

// Himoyalangan
shopRouter.get('/shop/balance',    requireAuth, getBalance);
// items — login bo'lmaganlar ham ko'ra oladi, login bo'lganlar uchun owned/coins ham keladi
shopRouter.get('/shop/items',      optionalAuth, getShopItems);
shopRouter.post('/shop/buy',       requireAuth, buyItem);
shopRouter.post('/shop/buy-coins', requireAuth, buyCoins);
shopRouter.post('/shop/set-skin',  requireAuth, setSkin);

// Ochiq — o'yin ichida boshqalarning skinini ko'rish uchun
shopRouter.get('/skin/:username',  getUserSkin);

export default shopRouter;
