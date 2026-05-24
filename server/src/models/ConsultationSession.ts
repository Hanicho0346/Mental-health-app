import mongoose, { Schema, type InferSchemaType } from 'mongoose';

/**
 * Placeholder for future react-native-webrtc consultation rooms.
 * Links an appointment to a signaling room without implementing WebRTC yet.
 */
const consultationSessionSchema = new Schema(
  {
    appointment_id: { type: Schema.Types.ObjectId, ref: 'Appointment', required: true, index: true },
    psychiatrist_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    patient_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    room_id: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['scheduled', 'ready', 'active', 'ended', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    scheduled_at: { type: Date, required: true },
    webrtc_config: {
      type: Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

export type ConsultationSessionDocument = InferSchemaType<typeof consultationSessionSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ConsultationSession = mongoose.model('ConsultationSession', consultationSessionSchema);
