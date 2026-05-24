import type { RequestHandler } from 'express';
import {
  initiateBooking,
  verifyAndCompleteBooking,
  getPaidPsychiatristsForUser,
  hasActivePaidBooking,
  listAllBookings,
  getRevenueSummary,
  getWalletForUser,
  listAllWalletTransactions,
} from './booking.service.js';

const BASE_URL   = process.env.API_BASE_URL ?? 'http://localhost:4000';
// Chapa requires a valid HTTP/HTTPS return_url — deep links (exp://) are rejected.
// After payment, Chapa redirects here; the page can show a "return to app" button.
const RETURN_URL = process.env.CHAPA_RETURN_URL ?? `${BASE_URL}/payment-return`;

// POST /api/bookings/initiate
export const initiateBookingHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { psychiatrist_id, scheduled_at, time_label } = req.body;
    if (!psychiatrist_id) { res.status(400).json({ error: 'psychiatrist_id required' }); return; }

    const result = await initiateBooking({
      userId:         req.userId,
      psychiatristId: psychiatrist_id,
      scheduledAt:    scheduled_at,
      timeLabel:      time_label,
      callbackUrl:    `${BASE_URL}/api/bookings/chapa/callback`,
      returnUrl:      RETURN_URL,
    });

    res.json(result);
  } catch (err) { next(err); }
};

// GET /api/bookings/verify/:tx_ref
export const verifyPaymentHandler: RequestHandler = async (req, res, next) => {
  try {
    const { tx_ref } = req.params;
    if (!tx_ref) { res.status(400).json({ error: 'tx_ref required' }); return; }
    const result = await verifyAndCompleteBooking(tx_ref);
    res.json({ success: true, already_paid: result.already_paid, booking: result.booking });
  } catch (err) { next(err); }
};

// Chapa server-to-server webhook (no auth — Chapa calls this)
export const chapaCallbackHandler: RequestHandler = async (req, res, next) => {
  try {
    const tx_ref = (req.query['trx_ref'] as string) ?? req.body?.trx_ref ?? req.body?.tx_ref;
    if (!tx_ref) { res.status(400).json({ error: 'trx_ref missing' }); return; }
    await verifyAndCompleteBooking(tx_ref);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

// GET /api/bookings/my-psychiatrists
export const myPsychiatristsHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const psychiatrists = await getPaidPsychiatristsForUser(req.userId);
    res.json({ psychiatrists });
  } catch (err) { next(err); }
};

// GET /api/bookings/check/:psychiatristId
export const checkBookingHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const has = await hasActivePaidBooking(req.userId, req.params.psychiatristId!);
    res.json({ has_access: has });
  } catch (err) { next(err); }
};

// GET /api/bookings/wallet  — user/psychiatrist wallet balance + history
export const walletHandler: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const wallet = await getWalletForUser(req.userId);
    res.json(wallet);
  } catch (err) { next(err); }
};

// Admin: GET /api/bookings/admin/all
export const adminListBookingsHandler: RequestHandler = async (req, res, next) => {
  try {
    const { payment_status } = req.query as { payment_status?: string };
    const bookings = await listAllBookings({ payment_status, limit: 200 });
    res.json({ bookings });
  } catch (err) { next(err); }
};

// Admin: GET /api/bookings/admin/revenue
export const adminRevenueHandler: RequestHandler = async (req, res, next) => {
  try {
    const summary = await getRevenueSummary();
    res.json(summary);
  } catch (err) { next(err); }
};

// Admin: GET /api/bookings/admin/transactions
export const adminTransactionsHandler: RequestHandler = async (req, res, next) => {
  try {
    const { transaction_type, status } = req.query as {
      transaction_type?: string;
      status?: string;
    };
    const transactions = await listAllWalletTransactions({ transaction_type, status, limit: 200 });
    res.json({ transactions });
  } catch (err) { next(err); }
};
