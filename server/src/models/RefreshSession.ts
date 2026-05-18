import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const refreshSessionSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token_hash: { type: String, required: true, unique: true },
    user_agent: { type: String, default: '' },
    ip: { type: String, default: '' },
    expires_at: { type: Date, required: true },
    last_active_at: { type: Date, default: () => new Date() },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

refreshSessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export type RefreshSessionDocument = InferSchemaType<typeof refreshSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RefreshSession = mongoose.model('RefreshSession', refreshSessionSchema);
