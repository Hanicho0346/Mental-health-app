"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const backend_1 = require("@clerk/backend");
const logger_js_1 = require("../utils/logger.js");
const jwt_js_1 = require("../utils/jwt.js");
const User_js_1 = require("../models/User.js");
const clerkClient = (0, backend_1.createClerkClient)({
    secretKey: process.env.CLERK_SECRET_KEY ?? '',
});
/** Bearer JWT (Clerk or legacy) → req.userId, req.auth */
const requireAuth = async (req, res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
    }
    // ── Try Clerk token first ──────────────────────────────────────────────────
    try {
        const { verifyToken } = await import('@clerk/backend');
        const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY ?? '' });
        const clerkId = payload.sub;
        // Find or create user in MongoDB by clerkId
        let user = await User_js_1.User.findOne({ clerk_id: clerkId });
        if (!user) {
            // Try by email if Clerk token has it
            const clerkUser = await clerkClient.users.getUser(clerkId).catch(() => null);
            const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? '';
            const fullName = `${clerkUser?.firstName ?? ''} ${clerkUser?.lastName ?? ''}`.trim() || email.split('@')[0];
            const username = email.split('@')[0] || clerkId.slice(0, 8);
            user = await User_js_1.User.findOne({ email }).catch(() => null);
            if (user) {
                // Link existing user to Clerk
                user.clerk_id = clerkId;
                user.chat_username = username;
                await user.save();
            }
            else {
                // Create new user from Clerk identity
                user = await User_js_1.User.create({
                    clerk_id: clerkId,
                    full_name: fullName,
                    email,
                    password: clerkId, // placeholder
                    chat_username: username,
                    email_verified: true,
                    role: 'user',
                });
            }
        }
        req.userId = user._id.toString();
        req.userObjectId = user._id;
        req.auth = { id: user._id.toString(), role: user.role, emailVerified: true };
        next();
        return;
    }
    catch {
        // Not a Clerk token — fall through to legacy JWT
    }
    // ── Legacy JWT fallback ────────────────────────────────────────────────────
    try {
        const { sub, role, ev } = (0, jwt_js_1.verifyAccessToken)(token);
        if (!mongoose_1.default.Types.ObjectId.isValid(sub)) {
            (0, logger_js_1.logServerWarn)('requireAuth: invalid token subject', { method: req.method, path: req.originalUrl });
            res.status(401).json({ error: 'Invalid token subject' });
            return;
        }
        req.userId = sub;
        req.userObjectId = new mongoose_1.default.Types.ObjectId(sub);
        req.auth = { id: sub, role, emailVerified: ev };
        next();
    }
    catch (err) {
        (0, logger_js_1.logServerWarn)('requireAuth: token verify failed', {
            method: req.method,
            path: req.originalUrl,
            reason: (0, logger_js_1.formatUnknownError)(err).message,
        });
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
exports.requireAuth = requireAuth;
/** Re-export unified auth (internal JWT + Clerk session). */
