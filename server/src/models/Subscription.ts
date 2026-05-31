import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const subscriptionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    tx_ref: {
      type: String,
      required: true,
      unique: true,
    },

    tier: {
      type: String,
      enum: ['free', 'student', 'premier'],
      default: 'free',
    },

    amount: {
      type: Number,
      default: 299,
    },

    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ tx_ref: 1 });
subscriptionSchema.index({ user_id: 1, tier: 1 });

export type SubscriptionDocument = InferSchemaType<typeof subscriptionSchema> & { _id: mongoose.Types.ObjectId };

export const Subscription = mongoose.model('Subscription', subscriptionSchema);