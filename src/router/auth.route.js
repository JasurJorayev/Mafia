// ===============================================================
// MAFIA — AUTH ROUTER
// ===============================================================

import { Router }        from 'express';
import { requireAuth }   from '../middleware/auth.middleware.js';
import {
    register,
    login,
    googleAuth,
    getMe,
    getProfile,
    updateProfile,
    changePassword,
} from '../controller/auth.controller.js';

const authRouter = Router();

// --- Ochiq (token kerak emas) ---
authRouter.post('/auth/register',         register);
authRouter.post('/auth/login',            login);
authRouter.post('/auth/google',           googleAuth);
authRouter.get('/profile/:username',      getProfile);

// --- Himoyalangan (token kerak) ---
authRouter.get('/auth/me',                requireAuth, getMe);
authRouter.patch('/profile/update',       requireAuth, updateProfile);
authRouter.patch('/auth/change-password', requireAuth, changePassword);

export default authRouter;
