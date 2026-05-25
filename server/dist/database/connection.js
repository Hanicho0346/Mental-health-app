"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = connectDb;
const mongoose_1 = __importDefault(require("mongoose"));
const env_js_1 = require("../config/env.js");
async function connectDb() {
    mongoose_1.default.set('strictQuery', true);
    await mongoose_1.default.connect(env_js_1.env.mongoUri);
}
