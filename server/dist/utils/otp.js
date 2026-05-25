"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNumericOtp = generateNumericOtp;
exports.hashOtp = hashOtp;
exports.verifyOtpHash = verifyOtpHash;
const node_crypto_1 = require("node:crypto");
function generateNumericOtp(length = 6) {
    const min = 10 ** (length - 1);
    const max = 10 ** length - 1;
    return String((0, node_crypto_1.randomInt)(min, max + 1));
}
function hashOtp(pepper, code) {
    return (0, node_crypto_1.createHmac)('sha256', pepper).update(code.trim(), 'utf8').digest('hex');
}
function verifyOtpHash(pepper, code, storedHash) {
    const computed = hashOtp(pepper, code);
    try {
        const a = Buffer.from(computed, 'hex');
        const b = Buffer.from(storedHash, 'hex');
        if (a.length !== b.length)
            return false;
        return (0, node_crypto_1.timingSafeEqual)(a, b);
    }
    catch {
        return false;
    }
}
