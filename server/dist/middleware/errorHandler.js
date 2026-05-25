"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const zod_1 = require("zod");
const AppError_js_1 = require("../utils/AppError.js");
const logger_js_1 = require("../utils/logger.js");
const errorHandler = (err, req, res, _next) => {
    if (err instanceof AppError_js_1.AppError) {
        if (err.status >= 500) {
            (0, logger_js_1.logServerError)('AppError', err, { method: req.method, path: req.originalUrl, status: err.status });
        }
        else {
            (0, logger_js_1.logServerWarn)('AppError', { method: req.method, path: req.originalUrl, status: err.status, message: err.message });
        }
        res.status(err.status).json({ error: err.message });
        return;
    }
    if (err instanceof zod_1.ZodError) {
        res.status(400).json({ error: 'Validation failed', issues: err.flatten() });
        return;
    }
    (0, logger_js_1.logServerError)('Unhandled route error', err, {
        method: req.method,
        path: req.originalUrl,
    });
    const status = typeof err.status === 'number' ? err.status : 500;
    const body = {
        error: status === 500 ? 'Internal server error' : err.message || 'Request failed',
    };
    if ((0, logger_js_1.exposeErrorDetailsToClient)() && err instanceof Error) {
        body.detail = err.message;
        if (err.stack)
            body.stack = err.stack;
    }
    res.status(status >= 400 && status < 600 ? status : 500).json(body);
};
exports.errorHandler = errorHandler;
