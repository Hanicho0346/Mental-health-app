"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_js_1 = require("../config/env.js");
function signAccessToken(parts) {
    const payload = {
        sub: parts.sub,
        role: parts.role,
        ev: parts.emailVerified,
        typ: 'access',
    };
    return jsonwebtoken_1.default.sign(payload, env_js_1.env.jwtSecret, { expiresIn: env_js_1.env.jwtAccessExpiresSec });
}
function verifyAccessToken(token) {
    const payload = jsonwebtoken_1.default.verify(token, env_js_1.env.jwtSecret);
    if (typeof payload === 'string' || !payload || typeof payload !== 'object') {
        throw new Error('Invalid token payload');
    }
    const p = payload;
    if (p.typ === 'access' && typeof p.sub === 'string' && typeof p.role === 'string' && typeof p.ev === 'boolean') {
        return { sub: p.sub, role: p.role, ev: p.ev, typ: 'access' };
    }
    /** Legacy tokens issued before RBAC payload (treat as verified end-user). */
    if (typeof p.sub === 'string' && p.typ === undefined) {
        return { sub: p.sub, role: 'user', ev: true, typ: 'access' };
    }
    throw new Error('Invalid access token shape');
}
