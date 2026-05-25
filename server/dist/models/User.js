"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
exports.computeIsApproved = computeIsApproved;
const mongoose_1 = __importStar(require("mongoose"));
const roles_js_1 = require("../types/roles.js");
const uploadedDocSchema = new mongoose_1.Schema({
    url: { type: String, required: true },
    public_id: { type: String, default: '' },
    kind: { type: String, enum: ['profile', 'psychiatrist_doc', 'wellness_video'], required: true },
    uploaded_at: { type: Date, default: Date.now },
}, { _id: false });
const walletTransactionRefSchema = new mongoose_1.Schema({
    transaction_id: { type: mongoose_1.Schema.Types.ObjectId, ref: 'WalletTransaction', required: true },
}, { _id: false });
const userSchema = new mongoose_1.Schema({
    // ── Identity ────────────────────────────────────────────────────────────
    clerk_id: { type: String, required: false, trim: true },
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    // ── Auth ────────────────────────────────────────────────────────────────
    password: { type: String, required: false, select: false },
    email_verified: { type: Boolean, default: true },
    email_verification_otp_hash: { type: String, select: false },
    email_verification_otp_expires_at: { type: Date, select: false },
    password_reset_otp_hash: { type: String, select: false },
    password_reset_otp_expires_at: { type: Date, select: false },
    // ── Profile ─────────────────────────────────────────────────────────────
    avatar_url: { type: String, default: '' },
    mood_status: { type: String, default: '' },
    role: { type: String, enum: roles_js_1.USER_ROLES, default: 'user' },
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
    medical_license: { type: String, required: false, trim: true },
    specialization: { type: String, required: false, trim: true },
    experience_years: { type: Number, required: false },
    hospital_or_clinic: { type: String, required: false, trim: true },
    // ── Verification / Approval ──────────────────────────────────────────────
    verification_status: { type: String, enum: roles_js_1.VERIFICATION_STATUSES, required: false },
    is_approved: { type: Boolean, default: true },
    approved_by: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false },
    approved_at: { type: Date, required: false },
    admin_feedback: { type: String, required: false, trim: true, default: '' },
    // ── Document management ──────────────────────────────────────────────────
    uploaded_documents: { type: [uploadedDocSchema], default: [] },
    documents_reviewed: { type: Boolean, default: false },
    documents_reviewed_by: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    documents_reviewed_at: { type: Date },
    // ── Profile update workflow ──────────────────────────────────────────────
    profile_update_status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved',
    },
    profile_update_feedback: { type: String, default: '' },
    // ── Wallet ───────────────────────────────────────────────────────────────
    wallet_balance: { type: Number, default: 0 },
    wallet_transactions: { type: [walletTransactionRefSchema], default: [] },
    // ── Presence / Chat ──────────────────────────────────────────────────────
    last_seen_at: { type: Date },
    last_login_at: { type: Date },
    chat_username: { type: String, default: '' },
    is_online: { type: Boolean, default: false },
    socket_id: { type: String, default: '' },
}, {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
});
// ── Indexes ────────────────────────────────────────────────────────────────────
// Rule: declare ONCE — either inline OR here, never both.
// All unique/sparse indexes live here for clarity.
userSchema.index({ clerk_id: 1 }, { unique: true, sparse: true }); // null allowed for non-Clerk users
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ national_id: 1 }, { unique: true, sparse: true }); // null for regular users
userSchema.index({ medical_license: 1 }, { unique: true, sparse: true }); // null for regular users
userSchema.index({ account_status: 1 });
userSchema.index({ profile_update_status: 1 });
userSchema.index({ role: 1, verification_status: 1 });
/** Derive approval flag from role + verification state. */
function computeIsApproved(role, verificationStatus) {
    if (role === 'psychiatrist')
        return verificationStatus === 'approved';
    return true;
}
exports.User = mongoose_1.default.model('User', userSchema);
