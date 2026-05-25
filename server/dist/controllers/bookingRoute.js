"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authenticate_js_1 = require("../middleware/authenticate.js");
const authorize_js_1 = require("../middleware/authorize.js");
const bookingController_js_1 = require("./bookingController.js");
const router = (0, express_1.Router)();
// ── Public — Chapa webhook (no auth, Chapa calls this) ────────────────────────
router.get('/chapa/callback', bookingController_js_1.chapaCallbackHandler);
router.post('/chapa/callback', bookingController_js_1.chapaCallbackHandler);
// ── Authenticated user routes ─────────────────────────────────────────────────
router.post('/initiate', authenticate_js_1.requireAuth, bookingController_js_1.initiateBookingHandler);
router.get('/verify/:tx_ref', authenticate_js_1.requireAuth, bookingController_js_1.verifyPaymentHandler);
router.get('/my-psychiatrists', authenticate_js_1.requireAuth, bookingController_js_1.myPsychiatristsHandler);
router.get('/check/:psychiatristId', authenticate_js_1.requireAuth, bookingController_js_1.checkBookingHandler);
router.get('/wallet', authenticate_js_1.requireAuth, bookingController_js_1.walletHandler);
// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/admin/all', authenticate_js_1.requireAuth, (0, authorize_js_1.requireRole)('admin'), bookingController_js_1.adminListBookingsHandler);
router.get('/admin/revenue', authenticate_js_1.requireAuth, (0, authorize_js_1.requireRole)('admin'), bookingController_js_1.adminRevenueHandler);
router.get('/admin/transactions', authenticate_js_1.requireAuth, (0, authorize_js_1.requireRole)('admin'), bookingController_js_1.adminTransactionsHandler);
exports.default = router;
