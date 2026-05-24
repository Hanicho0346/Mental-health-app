import mongoose, { Schema } from 'mongoose';

const callLogSchema = new Schema({
  caller:    { type: String, required: true },
  recipient: { type: String, required: true },
  status:    { type: String, enum: ['completed', 'missed', 'declined'], default: 'completed' },
  duration:  { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  endedAt:   { type: Date },
});

export const CallLog = mongoose.model('CallLog', callLogSchema);
