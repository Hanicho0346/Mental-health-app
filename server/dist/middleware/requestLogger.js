"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        const line = `${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`;
        if (res.statusCode >= 500) {
            console.error(`[${new Date().toISOString()}] [HTTP] ${line}`);
        }
        else if (res.statusCode >= 400) {
            console.warn(`[${new Date().toISOString()}] [HTTP] ${line}`);
        }
        else {
            console.log(`[${new Date().toISOString()}] [HTTP] ${line}`);
        }
    });
    next();
};
exports.requestLogger = requestLogger;
