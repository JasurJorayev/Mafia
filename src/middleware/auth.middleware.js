// ===============================================================
// MAFIA — JWT AUTH MIDDLEWARE
// ===============================================================

import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------
// requireAuth — token majburiy
// ---------------------------------------------------------------
export function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer '))
        return res.status(401).json({ message: "Kirish uchun tizimga kiring!" });

    const token = header.slice(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch {
        return res.status(401).json({ message: "Token yaroqsiz yoki muddati o'tgan!" });
    }
}

// ---------------------------------------------------------------
// optionalAuth — token bo'lsa userId qo'yadi, bo'lmasa o'tkazadi
// ---------------------------------------------------------------
export function optionalAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
            req.userId = decoded.userId;
        } catch {
            // yaroqsiz token — shunchaki o'tkazamiz
        }
    }
    next();
}
