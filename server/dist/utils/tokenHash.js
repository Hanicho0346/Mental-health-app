"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashRefreshToken = hashRefreshToken;
const node_crypto_1 = require("node:crypto");
function hashRefreshToken(raw) {
    return (0, node_crypto_1.createHash)('sha256').update(raw, 'utf8').digest('hex');
}
