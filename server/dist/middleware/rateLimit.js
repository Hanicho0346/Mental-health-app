"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRateLimiter = globalRateLimiter;
exports.authRateLimiter = authRateLimiter;
exports.otpRateLimiter = otpRateLimiter;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_js_1 = require("../config/env.js");
const redis_client_js_1 = require("../integrations/redis/redis.client.js");
class RedisRateLimitStore {
    prefix;
    windowMs;
    constructor(prefix, windowMs) {
        this.prefix = `rl:${prefix}`;
        this.windowMs = windowMs;
    }
    client() {
        const c = (0, redis_client_js_1.getRedisClient)();
        return c && c.status === 'ready' ? c : null;
    }
    async increment(key) {
        const client = this.client();
        const resetTime = new Date(Date.now() + this.windowMs);
        if (!client) {
            return { totalHits: 1, resetTime };
        }
        const redisKey = `${this.prefix}:${key}`;
        const hits = await client.incr(redisKey);
        if (hits === 1) {
            await client.pexpire(redisKey, this.windowMs);
        }
        return { totalHits: hits, resetTime };
    }
    async decrement(key) {
        const client = this.client();
        if (!client)
            return;
        await client.decr(`${this.prefix}:${key}`);
    }
    async resetKey(key) {
        const client = this.client();
        if (!client)
            return;
        await client.del(`${this.prefix}:${key}`);
    }
}
function limiterOptions(prefix, windowMs, max) {
    const store = new RedisRateLimitStore(prefix, windowMs);
    return {
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        store,
        keyGenerator: (req) => {
            const ip = (typeof req.headers['x-forwarded-for'] === 'string'
                ? req.headers['x-forwarded-for'].split(',')[0]?.trim()
                : undefined) ?? req.socket.remoteAddress ?? 'unknown';
            return ip;
        },
    };
}
function globalRateLimiter() {
    return (0, express_rate_limit_1.default)(limiterOptions('global', env_js_1.env.rateLimitWindowMs, env_js_1.env.rateLimitMax));
}
function authRateLimiter() {
    return (0, express_rate_limit_1.default)(limiterOptions('auth', env_js_1.env.authRateLimitWindowMs, env_js_1.env.authRateLimitMax));
}
function otpRateLimiter() {
    return (0, express_rate_limit_1.default)(limiterOptions('otp', env_js_1.env.otpRateLimitWindowMs, env_js_1.env.otpRateLimitMax));
}
