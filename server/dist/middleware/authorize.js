"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = void 0;
/** Requires `requireAuth` first. */
const requireRole = (...roles) => (req, res, next) => {
    const a = req.auth;
    if (!a) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    if (!roles.includes(a.role)) {
        res.status(403).json({ error: 'Forbidden' });
        return;
    }
    next();
};
exports.requireRole = requireRole;
