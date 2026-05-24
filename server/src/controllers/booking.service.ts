import mongoose from 'mongoose';
import { Booking } from '../models/booking.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { User } from '../models/User.js';
import { initiateChapaPayment, verifyChapaPayment } from '../services/chapa.service.js';
import { AppError } from '../utils/AppError.js';

const BOOKING_AMOUNT    = 300;
const PSYCHIATRIST_PCT  = 0.70; // ETB 210
const PLATFORM_PCT      = 0.30; // ETB 90

function generateTxRef(userId: string): string {
  return `SELAM-${userId.slice(-6)}-${Date.now()}`;
}

// ── Initiate booking + Chapa checkout ─────────────────────────────────────────
export async function initiateBooking(params: {
  userId: string;
  psychiatristId: string;
  scheduledAt?: string;
  timeLabel?: string;
  callbackUrl: string;
  returnUrl: string;
}) {
  const { userId, psychiatristId, scheduledAt, timeLabel, callbackUrl, returnUrl } = params;

  const psychiatrist = await User.findById(psychiatristId).lean();
  if (!psychiatrist || psychiatrist.role !== 'psychiatrist' || !psychiatrist.is_approved) {
    throw new AppError(404, 'Psychiatrist not found or not approved');
  }

  // Block duplicate active paid bookings
  const existing = await Booking.findOne({
    user_id:         new mongoose.Types.ObjectId(userId),
    psychiatrist_id: new mongoose.Types.ObjectId(psychiatristId),
    payment_status:  'paid',
    booking_status:  { $in: ['confirmed', 'pending'] },
  }).lean();
  if (existing) throw new AppError(409, 'You already have an active booking with this psychiatrist');

  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(404, 'User not found');

  const tx_ref = generateTxRef(userId);
  const nameParts = (user.full_name ?? '').split(' ');

  const { checkout_url } = await initiateChapaPayment({
    tx_ref,
    amount:       BOOKING_AMOUNT,
    email:        user.email,
    first_name:   nameParts[0] ?? 'User',
    last_name:    nameParts.slice(1).join(' ') || 'SelamMind',
    callback_url: callbackUrl,
    return_url:   returnUrl,
    description:  `Session with Dr. ${psychiatrist.full_name}`,
  });

  const psychiatristShare = Math.round(BOOKING_AMOUNT * PSYCHIATRIST_PCT); // 210
  const platformFee       = BOOKING_AMOUNT - psychiatristShare;             // 90

  const booking = await Booking.create({
    user_id:            new mongoose.Types.ObjectId(userId),
    psychiatrist_id:    new mongoose.Types.ObjectId(psychiatristId),
    amount:             BOOKING_AMOUNT,
    platform_fee:       platformFee,
    psychiatrist_share: psychiatristShare,
    payment_status:     'pending_payment',
    booking_status:     'pending',
    chapa_tx_ref:       tx_ref,
    chapa_checkout_url: checkout_url,
    scheduled_at:       scheduledAt ? new Date(scheduledAt) : undefined,
    time_label:         timeLabel,
    already_processed:  false,
  });

  return { booking_id: booking._id.toString(), checkout_url, tx_ref };
}

// ── Verify payment + distribute wallets (idempotent, no replica set required) ─
export async function verifyAndCompleteBooking(tx_ref: string) {
  // Step 1: find booking
  const booking = await Booking.findOne({ chapa_tx_ref: tx_ref }).lean();
  if (!booking) throw new AppError(404, 'Booking not found');

  // Step 2: idempotency — already fully processed, return early
  if (booking.already_processed && booking.payment_status === 'paid') {
    return { already_paid: true, booking };
  }

  // Step 3: verify with Chapa
  const { success, status } = await verifyChapaPayment(tx_ref);

  if (!success) {
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { payment_status: 'failed' } }
    );
    throw new AppError(402, `Payment not successful (status: ${status})`);
  }

  // Step 4: atomic idempotency guard — only one process can flip already_processed from false→true.
  //         findOneAndUpdate returns null if already_processed was already true (another process won).
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, already_processed: false },
    {
      $set: {
        payment_status:    'paid',
        booking_status:    'confirmed',
        already_processed: true,
      },
    },
    { new: true }
  ).lean();

  // Another process already completed this — return safely
  if (!updated) {
    const current = await Booking.findById(booking._id).lean();
    return { already_paid: true, booking: current ?? booking };
  }

  const bookingId = updated._id as mongoose.Types.ObjectId;

  // Step 5: find admin for platform commission
  const admin = await User.findOne({ role: 'admin' }).lean();

  // Step 6: credit wallets with atomic $inc — no session/transaction needed.
  //         already_processed flag above guarantees these run exactly once.

  // 6a. Psychiatrist wallet — 70% (ETB 210)
  await User.updateOne(
    { _id: updated.psychiatrist_id },
    { $inc: { wallet_balance: updated.psychiatrist_share } }
  );
  await WalletTransaction.create({
    user_id:           updated.psychiatrist_id,
    booking_id:        bookingId,
    amount:            updated.psychiatrist_share,
    transaction_type:  'session_earning',
    payment_reference: tx_ref,
    status:            'completed',
    description:       `Session earning (70%) from booking ${bookingId}`,
  });

  // 6b. Admin wallet — 30% (ETB 90)
  if (admin) {
    await User.updateOne(
      { _id: admin._id },
      { $inc: { wallet_balance: updated.platform_fee } }
    );
    await WalletTransaction.create({
      user_id:           admin._id,
      booking_id:        bookingId,
      amount:            updated.platform_fee,
      transaction_type:  'platform_commission',
      payment_reference: `${tx_ref}-platform`,
      status:            'completed',
      description:       `Platform commission (30%) from booking ${bookingId}`,
    });
  }

  // 6c. Payment record for the user
  await WalletTransaction.create({
    user_id:           updated.user_id,
    booking_id:        bookingId,
    amount:            updated.amount,
    transaction_type:  'payment_received',
    payment_reference: `${tx_ref}-user`,
    status:            'completed',
    description:       `Payment of ETB ${updated.amount} for session booking ${bookingId}`,
  });

  return { already_paid: false, booking: updated };
}

// ── Check if user has paid access to a psychiatrist ───────────────────────────
export async function hasActivePaidBooking(
  userId: string,
  psychiatristId: string
): Promise<boolean> {
  const booking = await Booking.findOne({
    user_id:         new mongoose.Types.ObjectId(userId),
    psychiatrist_id: new mongoose.Types.ObjectId(psychiatristId),
    payment_status:  'paid',
    booking_status:  { $in: ['confirmed', 'completed'] },
  }).lean();
  return !!booking;
}

// ── Get user's paid psychiatrists (for chat list) ─────────────────────────────
export async function getPaidPsychiatristsForUser(userId: string) {
  const bookings = await Booking.find({
    user_id:        new mongoose.Types.ObjectId(userId),
    payment_status: 'paid',
    booking_status: { $in: ['confirmed', 'completed'] },
  }).lean();

  const psychiatristIds = bookings.map((b) => b.psychiatrist_id);
  const psychiatrists = await User.find({ _id: { $in: psychiatristIds } })
    .select('full_name email avatar_url specialization is_online')
    .lean();

  return psychiatrists.map((p) => ({
    id:             p._id.toString(),
    full_name:      p.full_name,
    email:          p.email,
    avatar_url:     p.avatar_url ?? '',
    specialization: (p as any).specialization ?? '',
    is_online:      p.is_online ?? false,
    booking:        bookings.find((b) => b.psychiatrist_id.toString() === p._id.toString()),
  }));
}

// ── Get wallet balance + transaction history for a user ───────────────────────
export async function getWalletForUser(userId: string) {
  const user = await User.findById(userId).select('wallet_balance').lean();
  const balance = (user as any)?.wallet_balance ?? 0;

  const transactions = await WalletTransaction.find({ user_id: new mongoose.Types.ObjectId(userId) })
    .sort({ created_at: -1 })
    .limit(50)
    .lean();

  return {
    balance,
    transactions: transactions.map((t) => ({
      id:                t._id.toString(),
      amount:            t.amount,
      transaction_type:  t.transaction_type,
      payment_reference: t.payment_reference,
      status:            t.status,
      description:       t.description,
      booking_id:        t.booking_id?.toString() ?? null,
      created_at:        t.created_at,
    })),
  };
}

// ── Admin: list all bookings ───────────────────────────────────────────────────
export async function listAllBookings(filters?: {
  payment_status?: string;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};
  if (filters?.payment_status) query.payment_status = filters.payment_status;

  const bookings = await Booking.find(query)
    .sort({ createdAt: -1 })
    .limit(filters?.limit ?? 100)
    .lean();

  const userIds = [...new Set([
    ...bookings.map((b) => b.user_id.toString()),
    ...bookings.map((b) => b.psychiatrist_id.toString()),
  ])];
  const users = await User.find({ _id: { $in: userIds } })
    .select('full_name email role')
    .lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return bookings.map((b) => ({
    id:                 b._id.toString(),
    user:               userMap.get(b.user_id.toString()),
    psychiatrist:       userMap.get(b.psychiatrist_id.toString()),
    amount:             b.amount,
    platform_fee:       b.platform_fee,
    psychiatrist_share: b.psychiatrist_share,
    payment_status:     b.payment_status,
    booking_status:     b.booking_status,
    chapa_tx_ref:       b.chapa_tx_ref,
    scheduled_at:       b.scheduled_at,
    time_label:         b.time_label,
    already_processed:  b.already_processed,
    createdAt:          b.createdAt,
  }));
}

// ── Admin: revenue summary ─────────────────────────────────────────────────────
export async function getRevenueSummary() {
  const [result] = await Booking.aggregate([
    { $match: { payment_status: 'paid' } },
    {
      $group: {
        _id:                  null,
        total_revenue:        { $sum: '$amount' },
        platform_revenue:     { $sum: '$platform_fee' },
        psychiatrist_revenue: { $sum: '$psychiatrist_share' },
        total_bookings:       { $sum: 1 },
      },
    },
  ]);
  return result ?? {
    total_revenue: 0,
    platform_revenue: 0,
    psychiatrist_revenue: 0,
    total_bookings: 0,
  };
}

// ── Admin: all wallet transactions ────────────────────────────────────────────
export async function listAllWalletTransactions(filters?: {
  transaction_type?: string;
  status?: string;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};
  if (filters?.transaction_type) query.transaction_type = filters.transaction_type;
  if (filters?.status) query.status = filters.status;

  const txns = await WalletTransaction.find(query)
    .sort({ created_at: -1 })
    .limit(filters?.limit ?? 200)
    .populate('user_id', 'full_name email role')
    .lean();

  return txns.map((t) => ({
    id:                t._id.toString(),
    user:              t.user_id,
    booking_id:        t.booking_id?.toString() ?? null,
    amount:            t.amount,
    transaction_type:  t.transaction_type,
    payment_reference: t.payment_reference,
    status:            t.status,
    description:       t.description,
    created_at:        t.created_at,
  }));
}
