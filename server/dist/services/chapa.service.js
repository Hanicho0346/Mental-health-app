"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initiateChapaPayment = initiateChapaPayment;
exports.verifyChapaPayment = verifyChapaPayment;
const axios_1 = __importDefault(require("axios"));
const AppError_js_1 = require("../utils/AppError.js");
const CHAPA_BASE = 'https://api.chapa.co/v1';
const CHAPA_SECRET = process.env.CHAPA_SECRET_KEY ?? '';
function extractChapaMessage(err) {
    const data = err?.response?.data;
    if (!data)
        return err?.message ?? 'Chapa service error';
    // Chapa sometimes returns { message: string } or { message: { field: string } }
    const msg = data.message;
    if (typeof msg === 'string' && msg.length > 0)
        return msg;
    if (msg && typeof msg === 'object') {
        // flatten first string value found
        const first = Object.values(msg).find((v) => typeof v === 'string');
        if (first)
            return first;
        return JSON.stringify(msg);
    }
    if (typeof data.error === 'string')
        return data.error;
    return err?.message ?? 'Chapa service error';
}
async function initiateChapaPayment(params) {
    if (!CHAPA_SECRET)
        throw new AppError_js_1.AppError(503, 'Payment service not configured');
    try {
        const { data } = await axios_1.default.post(`${CHAPA_BASE}/transaction/initialize`, {
            ...params,
            currency: 'ETB',
            customization: {
                title: 'SelamMind',
                description: params.description,
            },
        }, { headers: { Authorization: `Bearer ${CHAPA_SECRET}` } });
        if (data.status !== 'success') {
            throw new AppError_js_1.AppError(400, data.message ?? 'Payment initialization failed');
        }
        return { checkout_url: data.data.checkout_url };
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError)
            throw err;
        if (process.env.NODE_ENV !== 'production') {
            console.error('[Chapa] initiate error:', JSON.stringify(err?.response?.data ?? err?.message));
        }
        throw new AppError_js_1.AppError(502, extractChapaMessage(err));
    }
}
async function verifyChapaPayment(tx_ref) {
    if (!CHAPA_SECRET)
        throw new AppError_js_1.AppError(503, 'Payment service not configured');
    try {
        const { data } = await axios_1.default.get(`${CHAPA_BASE}/transaction/verify/${tx_ref}`, { headers: { Authorization: `Bearer ${CHAPA_SECRET}` } });
        return {
            success: data.data.status === 'success',
            status: data.data.status,
            amount: data.data.amount,
        };
    }
    catch (err) {
        if (err instanceof AppError_js_1.AppError)
            throw err;
        throw new AppError_js_1.AppError(502, extractChapaMessage(err));
    }
}
