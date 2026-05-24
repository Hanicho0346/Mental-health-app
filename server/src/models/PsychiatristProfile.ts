import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { VERIFICATION_STATUSES } from '../types/roles.js';

const psychiatristDocSchema = new Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: '' },
    document_type: {
      type: String,
      enum: ['license', 'national_id', 'certificate', 'other'],
      default: 'other',
    },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const psychiatristProfileSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    specialization: { type: String, trim: true, default: '' },
    license_number: { type: String, trim: true, default: '' },
    years_of_experience: { type: Number, min: 0, max: 80 },
    hospital_or_clinic: { type: String, trim: true, default: '' },
    uploaded_documents: { type: [psychiatristDocSchema], default: [] },
    approval_status: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'pending',
      index: true,
    },
    admin_feedback: { type: String, trim: true, default: '' },
    reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewed_at: { type: Date },
  },
  { timestamps: true }
);

export type PsychiatristProfileDocument = InferSchemaType<typeof psychiatristProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const PsychiatristProfile = mongoose.model('PsychiatristProfile', psychiatristProfileSchema);
