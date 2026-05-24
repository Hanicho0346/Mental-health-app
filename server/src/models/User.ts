import mongoose, { Schema, type InferSchemaType } from 'mongoose';
import { USER_ROLES, VERIFICATION_STATUSES } from '../types/roles.js';

const uploadedDocSchema = new Schema(
  {
    url:         { type: String, required: true },
    public_id:   { type: String, default: '' },
    kind:        { type: String, enum: ['profile', 'psychiatrist_doc', 'wellness_video'], required: true },
    uploaded_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const walletTransactionRefSchema = new Schema(
  {
    transaction_id: { type: Schema.Types.ObjectId, ref: 'WalletTransaction', required: true },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    clerk_id:  { type: String, required: false, trim: true },
    full_name: { type: String, required: true,  trim: true },
    email:     { type: String, required: true,  lowercase: true, trim: true },

    // ── Auth ────────────────────────────────────────────────────────────────
    password:                        { type: String, required: false, select: false },
    email_verified:                  { type: Boolean, default: true },
    email_verification_otp_hash:     { type: String, select: false },
    email_verification_otp_expires_at: { type: Date, select: false },
    password_reset_otp_hash:         { type: String, select: false },
    password_reset_otp_expires_at:   { type: Date, select: false },

    // ── Profile ─────────────────────────────────────────────────────────────
    avatar_url:   { type: String, default: '' },
    mood_status:  { type: String, default: '' },
    role:         { type: String, enum: USER_ROLES, default: 'user' },
    account_status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
    },

    // ── Psychiatrist-only fields ─────────────────────────────────────────────
    // sparse: true → unique only among non-null values, so regular users (null) don't clash
    national_id: {
      type: String,
      default: undefined,
    },
    medical_license:  { type: String, required: false, trim: true },
    specialization:   { type: String, required: false, trim: true },
    experience_years: { type: Number, required: false },
    hospital_or_clinic: { type: String, required: false, trim: true },

    // ── Verification / Approval ──────────────────────────────────────────────
    verification_status: { type: String, enum: VERIFICATION_STATUSES, required: false },
    is_approved:         { type: Boolean, default: true },
    approved_by:         { type: Schema.Types.ObjectId, ref: 'User', required: false },
    approved_at:         { type: Date, required: false },
    admin_feedback:      { type: String, required: false, trim: true, default: '' },

    // ── Document management ──────────────────────────────────────────────────
    uploaded_documents:   { type: [uploadedDocSchema], default: [] },
    documents_reviewed:   { type: Boolean, default: false },
    documents_reviewed_by: { type: Schema.Types.ObjectId, ref: 'User' },
    documents_reviewed_at: { type: Date },

    // ── Profile update workflow ──────────────────────────────────────────────
    profile_update_status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    profile_update_feedback: { type: String, default: '' },

    // ── Wallet ───────────────────────────────────────────────────────────────
    wallet_balance:      { type: Number, default: 0 },
    wallet_transactions: { type: [walletTransactionRefSchema], default: [] },

    // ── Presence / Chat ──────────────────────────────────────────────────────
    last_seen_at:  { type: Date },
    last_login_at: { type: Date },
    chat_username: { type: String, default: '' },
    is_online:     { type: Boolean, default: false },
    socket_id:     { type: String, default: '' },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

// ── Indexes ────────────────────────────────────────────────────────────────────
// Rule: declare ONCE — either inline OR here, never both.
// All unique/sparse indexes live here for clarity.

userSchema.index({ clerk_id: 1 },       { unique: true, sparse: true }); // null allowed for non-Clerk users
userSchema.index({ email: 1 },          { unique: true });
userSchema.index({ national_id: 1 },    { unique: true, sparse: true }); // null for regular users
userSchema.index({ medical_license: 1 },{ unique: true, sparse: true }); // null for regular users
userSchema.index({ account_status: 1 });
userSchema.index({ profile_update_status: 1 });
userSchema.index({ role: 1, verification_status: 1 });

// ── Types & Helpers ────────────────────────────────────────────────────────────

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };

/** Derive approval flag from role + verification state. */
export function computeIsApproved(
  role: string | undefined,
  verificationStatus: string | null | undefined
): boolean {
  if (role === 'psychiatrist') return verificationStatus === 'approved';
  return true;
}

export const User = mongoose.model('User', userSchema);