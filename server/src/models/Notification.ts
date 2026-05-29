// models/Notification.ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    // ── Recipient ────────────────────────────────────────────────────────────
    recipient_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipient_role: {
      type: String,
      enum: ['user', 'psychiatrist', 'admin'],
      required: true,
    },

    // ── Content ───────────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: [
        'booking_confirmed',       // → user: your booking is confirmed
        'new_booking',             // → psychiatrist: you have a new booking
        'new_message',             // → user or psychiatrist: new chat message
        'account_approved',        // → psychiatrist: your account was approved
        'account_rejected',        // → psychiatrist: your account was rejected
        'psychiatrist_registered', // → admin: new psychiatrist pending approval
        'session_reminder',        // → user: upcoming session reminder
        'payment_received',        // → psychiatrist: payment credited to wallet
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body:  { type: String, required: true, trim: true },

    // ── State ─────────────────────────────────────────────────────────────────
    is_read: { type: Boolean, default: false },

    // ── Deep-link data (optional) ─────────────────────────────────────────────
    data: {
      booking_id:      { type: String, default: null },
      chat_id:         { type: String, default: null },
      psychiatrist_id: { type: String, default: null },
      tx_ref:          { type: String, default: null },
    },

    // ── Expo push receipt ─────────────────────────────────────────────────────
    expo_ticket_id: { type: String, default: null },
    push_status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
notificationSchema.index({ recipient_id: 1, is_read: 1, created_at: -1 });
notificationSchema.index({ recipient_id: 1, created_at: -1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Notification = mongoose.model('Notification', notificationSchema);