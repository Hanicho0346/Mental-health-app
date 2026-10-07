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
function useDevPaymentMock() {
    return !CHAPA_SECRET && process.env.NODE_ENV !== 'production';
}
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
    if (useDevPaymentMock()) {
        // Build return URL manually to support both http:// and deep-link schemes
        // (e.g. mental-health-mobile://) — node's URL constructor only accepts http/https
        const base = params.return_url;
        const sep = base.includes('?') ? '&' : '?';
        const mockUrl = `${base}${sep}tx_ref=${encodeURIComponent(params.tx_ref)}&trx_ref=${encodeURIComponent(params.tx_ref)}&status=success`;
        console.warn('[Chapa] DEV mock checkout (CHAPA_SECRET_KEY unset). Set a real key for live payments.');
        return { checkout_url: mockUrl };
    }
    if (!CHAPA_SECRET) {
        throw new AppError_js_1.AppError(503, 'Payment service not configured. Set CHAPA_SECRET_KEY in the server environment.');
    }
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
    if (useDevPaymentMock()) {
        console.warn('[Chapa] DEV mock verify for', tx_ref);
        return { success: true, status: 'success', amount: 0 };
    }
    if (!CHAPA_SECRET) {
        throw new AppError_js_1.AppError(503, 'Payment service not configured. Set CHAPA_SECRET_KEY in the server environment.');
    }
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
