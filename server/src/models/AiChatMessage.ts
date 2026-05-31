import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const aiChatMessageSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: false,
    },
  }
);

aiChatMessageSchema.index({
  user_id: 1,
  created_at: 1,
});

export type AiChatMessageDocument =
  InferSchemaType<typeof aiChatMessageSchema>;

export const AiChatMessage =
  mongoose.models.AiChatMessage ||
  mongoose.model('AiChatMessage', aiChatMessageSchema);