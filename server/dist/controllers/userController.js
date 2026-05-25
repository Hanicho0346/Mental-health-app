"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchMe = exports.getPeerPublic = exports.getMe = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../models/User.js");
const logger_js_1 = require("../utils/logger.js");
/** Only the authenticated user can read their own profile. */
const getMe = async (req, res) => {
    try {
        const user = await User_js_1.User.findById(req.userId).lean();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user._id.toString(),
            full_name: user.full_name,
            email: user.email,
            national_id: user.national_id,
            avatar_url: user.avatar_url,
            mood_status: user.mood_status,
            createdAt: user.createdAt,
            role: user.role ?? 'user',
            email_verified: user.email_verified ?? true,
            verification_status: user.verification_status ?? null,
        });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('getMe', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to load profile' });
    }
};
exports.getMe = getMe;
/** Minimal public profile for another user (e.g. chat header). Authenticated clients only. */
const getPeerPublic = async (req, res) => {
    try {
        const peerId = req.params.peerId;
        if (typeof peerId !== 'string' || !mongoose_1.default.Types.ObjectId.isValid(peerId)) {
            res.status(400).json({ error: 'Invalid peer id' });
            return;
        }
        if (peerId === req.userId) {
            res.status(400).json({ error: 'Use GET /api/users/me for your own profile' });
            return;
        }
        const user = await User_js_1.User.findById(peerId).select('full_name avatar_url mood_status').lean();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user._id.toString(),
            full_name: user.full_name,
            avatar_url: user.avatar_url ?? '',
            mood_status: user.mood_status ?? '',
        });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('getPeerPublic', err, { peerId: req.params.peerId, userId: req.userId });
        res.status(500).json({ error: 'Failed to load user' });
    }
};
exports.getPeerPublic = getPeerPublic;
/** Only the authenticated user can update their own profile. */
const patchMe = async (req, res) => {
    try {
        const allowed = ['full_name', 'avatar_url', 'mood_status'];
        const updates = {};
        for (const key of allowed) {
            const v = req.body?.[key];
            if (typeof v === 'string') {
                updates[key] = v.trim();
            }
        }
        if (Object.keys(updates).length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }
        const user = await User_js_1.User.findByIdAndUpdate(req.userId, { $set: updates }, { new: true }).lean();
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({
            id: user._id.toString(),
            full_name: user.full_name,
            email: user.email,
            national_id: user.national_id,
            avatar_url: user.avatar_url,
            mood_status: user.mood_status,
            createdAt: user.createdAt,
            role: user.role ?? 'user',
            email_verified: user.email_verified ?? true,
            verification_status: user.verification_status ?? null,
        });
    }
    catch (err) {
        (0, logger_js_1.logServerError)('patchMe', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to update profile' });
    }
};
exports.patchMe = patchMe;
