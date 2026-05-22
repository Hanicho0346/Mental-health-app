import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { USER_ROLES, VERIFICATION_STATUSES } from '../types/roles.js';

const uploadedDocSchema = new Schema(
  {
    url: { type: String, required: true },
    public_id: { type: String, default: '' },
    kind: { type: String, enum: ['profile', 'psychiatrist_doc', 'wellness_video'], required: true },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    
    // Updated: required: false & sparse: true so standard users can register without it
    national_id: { type: String, required: false, unique: true, sparse: true, trim: true },
    
    avatar_url: { type: String, default: '' },
    mood_status: { type: String, default: '' },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'user' },
    
    // --- NEW PSYCHIATRIST FIELDS ---
    medical_license: { type: String, required: false, unique: true, sparse: true, trim: true },
    specialization: { type: String, required: false, trim: true },
    experience_years: { type: Number, required: false },
    // -------------------------------
    
    email_verified: { type: Boolean, default: true },
    email_verification_otp_hash: { type: String, select: false },
    email_verification_otp_expires_at: { type: Date, select: false },
    password_reset_otp_hash: { type: String, select: false },
    password_reset_otp_expires_at: { type: Date, select: false },
    verification_status: { type: String, enum: VERIFICATION_STATUSES, required: false },
    uploaded_documents: { type: [uploadedDocSchema], default: [] },
    approved_by: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    approved_at: { type: Date, required: false },

    // ── Chat fields ──────────────────────────────────────────────────────────
    clerk_id:       { type: String, default: '', sparse: true },
    chat_username:  { type: String, default: '' },
    is_online:      { type: Boolean, default: false },
    socket_id:      { type: String, default: '' },
    // ────────────────────────────────────────────────────────────────────────
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
  }
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

export const User = mongoose.model('User', userSchema);