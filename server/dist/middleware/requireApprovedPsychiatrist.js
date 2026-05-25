"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePsychiatristAccess = exports.requireApprovedPsychiatrist = void 0;
const User_js_1 = require("../models/User.js");
/**
 * After `requireAuth`. Ensures the account exists, is a psychiatrist, and is **approved**.
 * Does not apply to registration, profile, document upload, or verification submission routes.
 */
const requireApprovedPsychiatrist = async (req, res, next) => {
    const a = req.auth;
    if (!a) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const user = await User_js_1.User.findById(a.id).select('role verification_status is_approved').lean();
    if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
    }
    if (user.role !== 'psychiatrist') {
        res.status(403).json({ error: 'Psychiatrist access only' });
        return;
    }
    const vs = user.verification_status;
    if (user.is_approved === true || vs === 'approved') {
        next();
        return;
    }
    if (vs === 'rejected') {
        res.status(403).json({ error: 'Psychiatrist verification rejected' });
        return;
    }
    if (vs === 'suspended') {
        res.status(403).json({ error: 'Account suspended' });
        return;
    }
    res.status(403).json({ error: 'Psychiatrist verification pending' });
};
exports.requireApprovedPsychiatrist = requireApprovedPsychiatrist;
/**
 * After `requireAuth`. Psychiatrist role from DB; allows **pending** verification so the
 * provider dashboard works before approval. Still blocks rejected/suspended and non-psychiatrists.
 * Public booking continues to require approved providers in appointment/counselor logic.
 */
const requirePsychiatristAccess = async (req, res, next) => {
    const a = req.auth;
    if (!a) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const user = await User_js_1.User.findById(a.id).select('role verification_status is_approved').lean();
    if (!user) {
        res.status(401).json({ error: 'User not found' });
        return;
    }
    if (user.role !== 'psychiatrist') {
        res.status(403).json({ error: 'Psychiatrist access only' });
        return;
    }
    const vs = user.verification_status;
    if (vs === 'rejected') {
        res.status(403).json({ error: 'Psychiatrist verification rejected' });
        return;
    }
    if (vs === 'suspended') {
        res.status(403).json({ error: 'Account suspended' });
        return;
    }
    next();
};
exports.requirePsychiatristAccess = requirePsychiatristAccess;
