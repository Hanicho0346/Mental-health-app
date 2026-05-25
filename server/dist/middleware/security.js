"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.helmetMiddleware = helmetMiddleware;
exports.compressionMiddleware = compressionMiddleware;
exports.mongoSanitizeMiddleware = mongoSanitizeMiddleware;
const compression_1 = __importDefault(require("compression"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const helmet_1 = __importDefault(require("helmet"));
function helmetMiddleware() {
    return (0, helmet_1.default)({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    });
}
function compressionMiddleware() {
    return (0, compression_1.default)();
}
function mongoSanitizeMiddleware() {
    return (0, express_mongo_sanitize_1.default)({ replaceWith: '_' });
}
