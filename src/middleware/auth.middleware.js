import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

// requireAuth — token majburiy + session tekshirish
export async function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer '))
        return res.status(401).json({ message: "Kirish uchun tizimga kiring!" });

    const token = header.slice(7);
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;

        // Session tekshirish
        const clientSession = req.headers['x-session-token'];
        if (clientSession) {
            const result = await pool.query(
                'SELECT session_token FROM users WHERE id = $1 AND is_active = true',
                [decoded.userId]
            );
            if (result.rowCount === 0)
                return res.status(401).json({ message: "Foydalanuvchi topilmadi!" });

            if (result.rows[0].session_token !== clientSession)
                return res.status(401).json({
                    message: "Boshqa qurilmadan kirildi. Qayta login qiling.",
                    code: 'SESSION_CONFLICT'
                });
        }

        next();
    } catch {
        return res.status(401).json({ message: "Token yaroqsiz yoki muddati o'tgan!" });
    }
}

// optionalAuth — token bo'lsa userId qo'yadi
export function optionalAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (header && header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
            req.userId = decoded.userId;
        } catch {
            // yaroqsiz token — o'tkazamiz
        }
    }
    next();
}