"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicConfig = void 0;
const env_js_1 = require("../config/env.js");
/** Non-sensitive client configuration (hotlines, etc.). */
const getPublicConfig = (_req, res) => {
    res.json({
        emergency_phone: env_js_1.env.emergencyPhone,
        support_message: 'If you are in immediate danger, contact local emergency services.',
    });
};
exports.getPublicConfig = getPublicConfig;
