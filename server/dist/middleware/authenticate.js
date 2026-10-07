"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuth = exports.requireAuth = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_js_1 = require("../utils/logger.js");
const bearerAuth_js_1 = require("../utils/bearerAuth.js");
async function attachUserFromBearerToken(req) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token)
        return false;
    const resolved = await (0, bearerAuth_js_1.resolveUserIdFromBearerToken)(token);
    if (!resolved)
        return false;
    req.userId = resolved.userId;
    req.userObjectId = new mongoose_1.default.Types.ObjectId(resolved.userId);
    req.auth = {
        id: resolved.userId,
        role: resolved.role,
        emailVerified: resolved.emailVerified,
    };
    return true;
}
/** Bearer access JWT → req.userId, req.auth */
const requireAuth = async (req, res, next) => {
    const attached = await attachUserFromBearerToken(req);
    if (!attached) {
        (0, logger_js_1.logServerWarn)('requireAuth: token verify failed', {
            method: req.method,
            path: req.originalUrl,
        });
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    next();
};
exports.requireAuth = requireAuth;
/** Optional auth for pre-registration flows. */
const optionalAuth = async (req, _res, next) => {
    await attachUserFromBearerToken(req);
    next();
};
exports.optionalAuth = optionalAuth;
