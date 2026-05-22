import mongoose, { Schema } from 'mongoose';

const chatMessageSchema = new Schema({
  from:      { type: String, required: true },
  to:        { type: String, required: true },
  type:      { type: String, enum: ['text', 'voice'], default: 'text' },
  content:   { type: String, default: '' },
  fileUrl:   { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
  read:      { type: Boolean, default: false },
});

// Named differently from main Message model to avoid conflicts
export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
