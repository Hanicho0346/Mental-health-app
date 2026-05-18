import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const messageSchema = new Schema(
  {
    sender_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    receiver_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 8000 },
    created_at: { type: Date, default: () => new Date() },
    /** When false / missing, counted as unread for receivers (e.g. doctor inbox). */
    is_read: { type: Boolean, default: false, index: true },
  },
  { versionKey: false }
);

messageSchema.index({ sender_id: 1, receiver_id: 1, created_at: -1 });

export type MessageDocument = InferSchemaType<typeof messageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Message = mongoose.model('Message', messageSchema);
