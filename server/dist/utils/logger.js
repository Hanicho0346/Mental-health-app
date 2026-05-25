"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatUnknownError = formatUnknownError;
exports.logServerError = logServerError;
exports.logServerWarn = logServerWarn;
exports.logServerInfo = logServerInfo;
exports.exposeErrorDetailsToClient = exposeErrorDetailsToClient;
const isDev = process.env.NODE_ENV !== 'production';
function formatUnknownError(err) {
    if (err instanceof Error) {
        return { message: err.message, stack: err.stack };
    }
    if (typeof err === 'string') {
        return { message: err };
    }
    try {
        return { message: JSON.stringify(err) };
    }
    catch {
        return { message: '[unserializable error]' };
    }
}
function logServerError(context, err, extra) {
    const { message, stack } = formatUnknownError(err);
    console.error(`[${new Date().toISOString()}] [ERROR] ${context}`, {
        ...extra,
        errorMessage: message,
        ...(stack ? { stack } : {}),
    });
}
function logServerWarn(context, info) {
    console.warn(`[${new Date().toISOString()}] [WARN] ${context}`, info);
}
function logServerInfo(context, info) {
    console.log(`[${new Date().toISOString()}] [INFO] ${context}`, info);
}
function exposeErrorDetailsToClient() {
    return isDev;
}
