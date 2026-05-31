// models/ChatMessage.ts

import mongoose, { Schema } from "mongoose";

const chatMessageSchema = new Schema({
  conversation_id: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true,
    index: true,
  },

  from: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  to: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },

  type: {
    type: String,
    enum: ["text", "voice"],
    default: "text",
  },

  content: {
    type: String,
    default: "",
  },

  fileUrl: {
    type: String,
    default: "",
  },

  timestamp: {
    type: Date,
    default: Date.now,
  },

  is_read: {
    type: Boolean,
    default: false,
    index: true,
  },

  clientId: {
    type: String,
    default: null,
  },
});

chatMessageSchema.index({
  conversation_id: 1,
  timestamp: -1,
});

export const ChatMessage = mongoose.model(
  "ChatMessage",
  chatMessageSchema
);