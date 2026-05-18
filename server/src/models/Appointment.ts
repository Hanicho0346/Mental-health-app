import mongoose, { Schema, type InferSchemaType } from 'mongoose';

const appointmentSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    psychiatrist_user_id: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    counselor_id: { type: String, required: true, trim: true },
    counselor_name: { type: String, required: true, trim: true },
    scheduled_at: { type: Date, required: true },
    time_label: { type: String, default: '', trim: true },
    /** Session modality shown on doctor dashboard (e.g. Video Call). */
    appointment_type: { type: String, default: 'Video Call', trim: true },
    notes: { type: String, default: '', trim: true },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

export type AppointmentDocument = InferSchemaType<typeof appointmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Appointment = mongoose.model('Appointment', appointmentSchema);
