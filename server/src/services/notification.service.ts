// services/notificationService.ts
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';
import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { logServerError } from '../utils/logger.js';

const expo = new Expo();

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationPayload {
  recipient_id: string | mongoose.Types.ObjectId;
  recipient_role: 'user' | 'psychiatrist' | 'admin';
  type: string;
  title: string;
  body: string;
  data?: {
    booking_id?: string | null;
    chat_id?: string | null;
    psychiatrist_id?: string | null;
    tx_ref?: string | null;
  };
}

// ─── Core: create DB record + send push ──────────────────────────────────────

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  try {
    const recipientIdStr = payload.recipient_id.toString();

    // 1. Save notification to DB
    const notification = await Notification.create({
      recipient_id:   new mongoose.Types.ObjectId(recipientIdStr),
      recipient_role: payload.recipient_role,
      type:           payload.type,
      title:          payload.title,
      body:           payload.body,
      data:           payload.data ?? {},
      push_status:    'pending',
    });

    // 2. Fetch push token from User model
    const user = await User.findById(recipientIdStr)
      .select('push_token')
      .lean();

    const pushToken = (user as any)?.push_token as string | undefined;

    if (!pushToken) {
      await Notification.findByIdAndUpdate(notification._id, { push_status: 'skipped' });
      return;
    }

    if (!Expo.isExpoPushToken(pushToken)) {
      console.warn(`[notify] Invalid Expo token for user ${recipientIdStr}`);
      await Notification.findByIdAndUpdate(notification._id, { push_status: 'skipped' });
      return;
    }

    // 3. Send via Expo
    const message: ExpoPushMessage = {
      to:    pushToken,
      sound: 'default',
      title: payload.title,
      body:  payload.body,
      data:  payload.data ?? {},
    };

    const [ticket] = await expo.sendPushNotificationsAsync([message]);

    // 4. Update push status
    if (ticket.status === 'ok') {
      await Notification.findByIdAndUpdate(notification._id, {
        push_status:    'sent',
        expo_ticket_id: ticket.id,
      });
    } else {
      await Notification.findByIdAndUpdate(notification._id, {
        push_status: 'failed',
      });
      console.warn(`[notify] Push failed for user ${recipientIdStr}:`, (ticket as any).message);
    }
  } catch (err) {
    logServerError('sendNotification', err, { payload });
  }
}

/**
 * Send to multiple recipients (e.g. all admins).
 * Runs in parallel, non-blocking.
 */
export async function sendNotificationToMany(
  recipientIds: (string | mongoose.Types.ObjectId)[],
  payload: Omit<NotificationPayload, 'recipient_id'>
): Promise<void> {
  await Promise.allSettled(
    recipientIds.map((id) => sendNotification({ ...payload, recipient_id: id }))
  );
}

// ─── Domain-specific helpers ──────────────────────────────────────────────────

/** User booked a session → notify user + notify psychiatrist */
export async function notifyBookingConfirmed(opts: {
  userId: string;
  psychiatristId: string;
  psychiatristName: string;
  dateLabel: string;
  timeLabel: string;
  bookingId: string;
}): Promise<void> {
  const { userId, psychiatristId, psychiatristName, dateLabel, timeLabel, bookingId } = opts;

  await Promise.allSettled([
    // → User: your booking is confirmed
    sendNotification({
      recipient_id:   userId,
      recipient_role: 'user',
      type:  'booking_confirmed',
      title: '✅ Session Confirmed!',
      body:  `Your session with ${psychiatristName} on ${dateLabel} at ${timeLabel} is booked.`,
      data:  { booking_id: bookingId, psychiatrist_id: psychiatristId },
    }),

    // → Psychiatrist: new booking received
    sendNotification({
      recipient_id:   psychiatristId,
      recipient_role: 'psychiatrist',
      type:  'new_booking',
      title: '📅 New Session Booked',
      body:  `A user has booked a session on ${dateLabel} at ${timeLabel}.`,
      data:  { booking_id: bookingId },
    }),

    // → Psychiatrist: payment credited
    sendNotification({
      recipient_id:   psychiatristId,
      recipient_role: 'psychiatrist',
      type:  'payment_received',
      title: '💰 Payment Received',
      body:  `ETB 210 has been credited to your wallet for the session on ${dateLabel}.`,
      data:  { booking_id: bookingId },
    }),
  ]);
}

/** New psychiatrist registered → notify all admins */
export async function notifyAdminsNewPsychiatrist(opts: {
  psychiatristId: string;
  psychiatristName: string;
}): Promise<void> {
  const { psychiatristId, psychiatristName } = opts;

  // Find all admin user IDs
  const admins = await User.find({ role: 'admin', account_status: 'active' })
    .select('_id')
    .lean();

  const adminIds = admins.map((a) => a._id.toString());
  if (adminIds.length === 0) return;

  await sendNotificationToMany(adminIds, {
    recipient_role: 'admin',
    type:  'psychiatrist_registered',
    title: '🩺 New Psychiatrist Application',
    body:  `${psychiatristName} has applied and is pending your approval.`,
    data:  { psychiatrist_id: psychiatristId },
  });
}

/** Admin approved a psychiatrist */
export async function notifyPsychiatristApproved(opts: {
  psychiatristId: string;
  psychiatristName: string;
}): Promise<void> {
  await sendNotification({
    recipient_id:   opts.psychiatristId,
    recipient_role: 'psychiatrist',
    type:  'account_approved',
    title: '🎉 Account Approved!',
    body:  `Congratulations ${opts.psychiatristName}! Your account is approved. You can now receive bookings.`,
    data:  { psychiatrist_id: opts.psychiatristId },
  });
}

/** Admin rejected a psychiatrist */
export async function notifyPsychiatristRejected(opts: {
  psychiatristId: string;
  psychiatristName: string;
  reason?: string;
}): Promise<void> {
  await sendNotification({
    recipient_id:   opts.psychiatristId,
    recipient_role: 'psychiatrist',
    type:  'account_rejected',
    title: '❌ Application Not Approved',
    body:  opts.reason
      ? `Your application was not approved: ${opts.reason}`
      : 'Your application was reviewed and was not approved at this time.',
    data:  { psychiatrist_id: opts.psychiatristId },
  });
}

/** New chat message */
export async function notifyNewMessage(opts: {
  recipientId: string;
  recipientRole: 'user' | 'psychiatrist';
  senderName: string;
  messagePreview: string;
  chatId?: string;
}): Promise<void> {
  await sendNotification({
    recipient_id:   opts.recipientId,
    recipient_role: opts.recipientRole,
    type:  'new_message',
    title: `💬 ${opts.senderName}`,
    body:  opts.messagePreview.slice(0, 100),
    data:  { chat_id: opts.chatId ?? null },
  });
}

/** Emit notification to user via socket */
export async function emitNotificationToUser(
  io: unknown,
  recipientId: string,
  notification: { id: string; type: string; title: string; body: string; is_read: boolean; created_at: Date; data?: Record<string, unknown> }
): Promise<void> {
  const ioAny = io as { to: (room: string) => { emit: (event: string, data: unknown) => void } };
  ioAny?.to(`user:${recipientId}`)?.emit('notification:new', notification);
}