"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireApprovedPsychiatrist = exports.requireRole = void 0;
const User_js_1 = require("../models/User.js");
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
/** Psychiatrist-only routes that mutate bookings or clinical sessions should use this after `requireAuth`. */
const requireApprovedPsychiatrist = async (req, res, next) => {
    const a = req.auth;
    if (!a || a.role !== 'psychiatrist') {
        res.status(403).json({ error: 'Psychiatrist access only' });
        return;
    }
    const u = await User_js_1.User.findById(a.id).select('verification_status').lean();
    if (!u || u.verification_status !== 'approved') {
        res.status(403).json({ error: 'Psychiatrist verification required' });
        return;
    }
    next();
};
exports.requireApprovedPsychiatrist = requireApprovedPsychiatrist;
