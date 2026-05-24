import mongoose, { Schema, Document } from 'mongoose';

export interface IBooking extends Document {
  user_id:            mongoose.Types.ObjectId;
  psychiatrist_id:    mongoose.Types.ObjectId;
  amount:             number;
  platform_fee:       number;   // 30% = ETB 90
  psychiatrist_share: number;   // 70% = ETB 210
  payment_status:     'pending_payment' | 'paid' | 'failed' | 'refunded';
  booking_status:     'pending' | 'confirmed' | 'cancelled' | 'completed';
  chapa_tx_ref:       string;
  chapa_checkout_url?: string;
  scheduled_at?:      Date;
  time_label?:        string;
  already_processed:  boolean;  // idempotency guard — prevents double wallet crediting
  createdAt:          Date;
  updatedAt:          Date;
}

const BookingSchema = new Schema<IBooking>(
  {
    user_id:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    psychiatrist_id:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount:             { type: Number, required: true, default: 300 },
    platform_fee:       { type: Number, required: true, default: 90  }, // 30%
    psychiatrist_share: { type: Number, required: true, default: 210 }, // 70%
    payment_status:     {
      type: String,
      enum: ['pending_payment', 'paid', 'failed', 'refunded'],
      default: 'pending_payment',
    },
    booking_status: {
      type: String,
      enum: ['pending', 'confirmed', 'cancelled', 'completed'],
      default: 'pending',
    },
    chapa_tx_ref:       { type: String, required: true, unique: true },
    chapa_checkout_url: { type: String },
    scheduled_at:       { type: Date },
    time_label:         { type: String },
    already_processed:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

BookingSchema.index({ user_id: 1 });
BookingSchema.index({ psychiatrist_id: 1 });
BookingSchema.index({ payment_status: 1 });
BookingSchema.index({ user_id: 1, psychiatrist_id: 1, payment_status: 1 });

export const Booking = mongoose.model<IBooking>('Booking', BookingSchema);
