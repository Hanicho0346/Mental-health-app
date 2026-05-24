import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const walletTransactionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['credit', 'debit'],
      required: true,
    },
    category: {
      type: String,
      enum: ['consultation', 'refund', 'admin_adjustment', 'withdrawal', 'deposit'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'cancelled'],
      default: 'pending',
    },
    description: {
      type: String,
      default: '',
    },
    reference_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {},
    },
    payment_method: {
      type: String,
      enum: ['stripe', 'paypal', 'bank_transfer', 'system'],
      required: false,
    },
    payment_intent_id: {
      type: String,
      sparse: true,
    },
    completed_at: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Indexes for faster queries
walletTransactionSchema.index({ user_id: 1, created_at: -1 });
walletTransactionSchema.index({ status: 1 });
walletTransactionSchema.index({ reference_id: 1 });
walletTransactionSchema.index({ payment_intent_id: 1 });

export type WalletTransactionDocument = InferSchemaType<typeof walletTransactionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);