"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminTransactionsHandler = exports.adminRevenueHandler = exports.adminListBookingsHandler = exports.walletHandler = exports.checkBookingHandler = exports.myPsychiatristsHandler = exports.chapaCallbackHandler = exports.verifyPaymentHandler = exports.initiateBookingHandler = void 0;
const booking_service_js_1 = require("./booking.service.js");
const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
// Chapa requires a valid HTTP/HTTPS return_url — deep links (exp://) are rejected.
// After payment, Chapa redirects here; the page can show a "return to app" button.
const RETURN_URL = process.env.CHAPA_RETURN_URL ?? `${BASE_URL}/payment-return`;
// POST /api/bookings/initiate
const initiateBookingHandler = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { psychiatrist_id, scheduled_at, time_label } = req.body;
        if (!psychiatrist_id) {
            res.status(400).json({ error: 'psychiatrist_id required' });
            return;
        }
        const result = await (0, booking_service_js_1.initiateBooking)({
            userId: req.userId,
            psychiatristId: psychiatrist_id,
            scheduledAt: scheduled_at,
            timeLabel: time_label,
            callbackUrl: `${BASE_URL}/api/bookings/chapa/callback`,
            returnUrl: RETURN_URL,
        });
        res.json(result);
    }
    catch (err) {
        next(err);
    }
};
exports.initiateBookingHandler = initiateBookingHandler;
// GET /api/bookings/verify/:tx_ref
const verifyPaymentHandler = async (req, res, next) => {
    try {
        const { tx_ref } = req.params;
        if (!tx_ref) {
            res.status(400).json({ error: 'tx_ref required' });
            return;
        }
        const result = await (0, booking_service_js_1.verifyAndCompleteBooking)(tx_ref);
        res.json({ success: true, already_paid: result.already_paid, booking: result.booking });
    }
    catch (err) {
        next(err);
    }
};
exports.verifyPaymentHandler = verifyPaymentHandler;
// Chapa server-to-server webhook (no auth — Chapa calls this)
const chapaCallbackHandler = async (req, res, next) => {
    try {
        const tx_ref = req.query['trx_ref'] ?? req.body?.trx_ref ?? req.body?.tx_ref;
        if (!tx_ref) {
            res.status(400).json({ error: 'trx_ref missing' });
            return;
        }
        await (0, booking_service_js_1.verifyAndCompleteBooking)(tx_ref);
        res.json({ ok: true });
    }
    catch (err) {
        next(err);
    }
};
exports.chapaCallbackHandler = chapaCallbackHandler;
// GET /api/bookings/my-psychiatrists
const myPsychiatristsHandler = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const psychiatrists = await (0, booking_service_js_1.getPaidPsychiatristsForUser)(req.userId);
        res.json({ psychiatrists });
    }
    catch (err) {
        next(err);
    }
};
exports.myPsychiatristsHandler = myPsychiatristsHandler;
// GET /api/bookings/check/:psychiatristId
const checkBookingHandler = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const has = await (0, booking_service_js_1.hasActivePaidBooking)(req.userId, req.params.psychiatristId);
        res.json({ has_access: has });
    }
    catch (err) {
        next(err);
    }
};
exports.checkBookingHandler = checkBookingHandler;
// GET /api/bookings/wallet  — user/psychiatrist wallet balance + history
const walletHandler = async (req, res, next) => {
    try {
        if (!req.userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const wallet = await (0, booking_service_js_1.getWalletForUser)(req.userId);
        res.json(wallet);
    }
    catch (err) {
        next(err);
    }
};
exports.walletHandler = walletHandler;
// Admin: GET /api/bookings/admin/all
const adminListBookingsHandler = async (req, res, next) => {
    try {
        const { payment_status } = req.query;
        const bookings = await (0, booking_service_js_1.listAllBookings)({ payment_status, limit: 200 });
        res.json({ bookings });
    }
    catch (err) {
        next(err);
    }
};
exports.adminListBookingsHandler = adminListBookingsHandler;
// Admin: GET /api/bookings/admin/revenue
const adminRevenueHandler = async (req, res, next) => {
    try {
        const summary = await (0, booking_service_js_1.getRevenueSummary)();
        res.json(summary);
    }
    catch (err) {
        next(err);
    }
};
exports.adminRevenueHandler = adminRevenueHandler;
// Admin: GET /api/bookings/admin/transactions
const adminTransactionsHandler = async (req, res, next) => {
    try {
        const { transaction_type, status } = req.query;
        const transactions = await (0, booking_service_js_1.listAllWalletTransactions)({ transaction_type, status, limit: 200 });
        res.json({ transactions });
    }
    catch (err) {
        next(err);
    }
};
exports.adminTransactionsHandler = adminTransactionsHandler;
