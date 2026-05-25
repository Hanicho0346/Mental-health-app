"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireClerkSession = exports.requireAuth = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_js_1 = require("../utils/logger.js");
const jwt_js_1 = require("../utils/jwt.js");
const clerk_js_1 = require("../utils/clerk.js");
const User_js_1 = require("../models/User.js");
const AppError_js_1 = require("../utils/AppError.js");
function bearerToken(req) {
    const header = req.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}
/**
 * Bearer token: internal JWT (Mongo user id) or Clerk session JWT.
 * Sets `req.userId`, `req.userObjectId`, `req.auth`.
 */
const requireAuth = async (req, res, next) => {
    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'Missing bearer token' });
        return;
    }
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
        return;
    }
    catch {
        /* try Clerk below */
    }
    if (!(0, clerk_js_1.isClerkConfigured)()) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    try {
        const clerk = await (0, clerk_js_1.verifyClerkSessionToken)(token);
        const user = await User_js_1.User.findOne({ clerk_id: clerk.clerkId }).lean();
        if (!user) {
            res.status(401).json({ error: 'Account not synced. Complete registration first.' });
            return;
        }
        const dbRole = (user.role ?? 'user');
        req.userId = user._id.toString();
        req.userObjectId = user._id;
        req.auth = {
            id: user._id.toString(),
            role: dbRole,
            emailVerified: user.email_verified ?? true,
        };
        next();
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        (0, logger_js_1.logServerWarn)('requireAuth: clerk verify failed', {
            method: req.method,
            path: req.originalUrl,
            reason: (0, logger_js_1.formatUnknownError)(err).message,
        });
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};
exports.requireAuth = requireAuth;
/** Requires Clerk bearer only (for sync / bootstrap before internal JWT exists). */
const requireClerkSession = async (req, res, next) => {
    console.log('[requireClerkSession] hit, token present:', !!bearerToken(req));
    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'Missing Clerk session token' });
        return;
    }
    try {
        req.clerkSession = await (0, clerk_js_1.verifyClerkSessionToken)(token);
        next();
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError) {
            res.status(err.status).json({ error: err.message });
            return;
        }
        (0, logger_js_1.logServerWarn)('requireClerkSession: clerk verify failed', {
            method: req.method,
            path: req.originalUrl,
            reason: (0, logger_js_1.formatUnknownError)(err).message,
        });
        res.status(401).json({ error: 'Invalid Clerk session' });
    }
};
exports.requireClerkSession = requireClerkSession;
