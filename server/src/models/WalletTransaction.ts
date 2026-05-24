import mongoose, { Schema, Document } from 'mongoose';

export type TransactionType =
  | 'session_earning'      // psychiatrist receives 70%
  | 'platform_commission'  // admin receives 30%
  | 'payment_received'     // user paid
  | 'withdrawal'
  | 'refund';

export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

export interface IWalletTransaction extends Document {
  user_id:           mongoose.Types.ObjectId;
  booking_id?:       mongoose.Types.ObjectId;
  amount:            number;
  transaction_type:  TransactionType;
  payment_reference: string;          // chapa tx_ref or internal ref
  status:            TransactionStatus;
  description:       string;
  created_at:        Date;
  updated_at:        Date;
}

const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    booking_id: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: false,
    },
    amount: {
      type: Number,
      required: true,
    },
    transaction_type: {
      type: String,
      enum: ['session_earning', 'platform_commission', 'payment_received', 'withdrawal', 'refund'],
      required: true,
    },
    payment_reference: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'completed',
    },
    description: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes per spec
WalletTransactionSchema.index({ payment_reference: 1 });
WalletTransactionSchema.index({ booking_id: 1 });
WalletTransactionSchema.index({ transaction_type: 1 });
WalletTransactionSchema.index({ user_id: 1, created_at: -1 });
WalletTransactionSchema.index({ status: 1 });

export const WalletTransaction = mongoose.model<IWalletTransaction>(
  'WalletTransaction',
  WalletTransactionSchema
);
