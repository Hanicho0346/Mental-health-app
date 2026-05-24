import { Router } from 'express';
import { requireAuth } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import {
  initiateBookingHandler,
  verifyPaymentHandler,
  chapaCallbackHandler,
  myPsychiatristsHandler,
  checkBookingHandler,
  walletHandler,
  adminListBookingsHandler,
  adminRevenueHandler,
  adminTransactionsHandler,
} from './bookingController.js';

const router = Router();

// ── Public — Chapa webhook (no auth, Chapa calls this) ────────────────────────
router.get('/chapa/callback',  chapaCallbackHandler);
router.post('/chapa/callback', chapaCallbackHandler);

// ── Authenticated user routes ─────────────────────────────────────────────────
router.post('/initiate',             requireAuth, initiateBookingHandler);
router.get('/verify/:tx_ref',        requireAuth, verifyPaymentHandler);
router.get('/my-psychiatrists',      requireAuth, myPsychiatristsHandler);
router.get('/check/:psychiatristId', requireAuth, checkBookingHandler);
router.get('/wallet',                requireAuth, walletHandler);

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get('/admin/all',          requireAuth, requireRole('admin'), adminListBookingsHandler);
router.get('/admin/revenue',      requireAuth, requireRole('admin'), adminRevenueHandler);
router.get('/admin/transactions', requireAuth, requireRole('admin'), adminTransactionsHandler);

export default router;
