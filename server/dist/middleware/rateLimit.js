"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalRateLimiter = globalRateLimiter;
exports.authRateLimiter = authRateLimiter;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_js_1 = require("../config/env.js");
function globalRateLimiter() {
    return (0, express_rate_limit_1.default)({
        windowMs: env_js_1.env.rateLimitWindowMs,
        max: env_js_1.env.rateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
    });
}
function authRateLimiter() {
    return (0, express_rate_limit_1.default)({
        windowMs: env_js_1.env.authRateLimitWindowMs,
        max: env_js_1.env.authRateLimitMax,
        standardHeaders: true,
        legacyHeaders: false,
    });
}
