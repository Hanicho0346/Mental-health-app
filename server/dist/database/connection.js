"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = connectDb;
exports.disconnectDb = disconnectDb;
exports.pingDb = pingDb;
const mongoose_1 = __importDefault(require("mongoose"));
const env_js_1 = require("../config/env.js");
const logger_js_1 = require("../utils/logger.js");
async function connectDb() {
    mongoose_1.default.set('strictQuery', true);
    await mongoose_1.default.connect(env_js_1.env.mongoUri);
    (0, logger_js_1.logServerInfo)('mongodb.connected', {});
}
async function disconnectDb() {
    await mongoose_1.default.disconnect();
    (0, logger_js_1.logServerInfo)('mongodb.disconnected', {});
}
async function pingDb() {
    if (mongoose_1.default.connection.readyState !== 1)
        return false;
    try {
        await mongoose_1.default.connection.db?.admin().ping();
        return true;
    }
    catch {
        return false;
    }
}
