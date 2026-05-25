"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncClerkAccount = syncClerkAccount;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = require("node:crypto");
const env_js_1 = require("../../config/env.js");
const User_js_1 = require("../../models/User.js");
const PsychiatristProfile_js_1 = require("../../models/PsychiatristProfile.js");
const auth_service_js_1 = require("../auth/auth.service.js");
const AppError_js_1 = require("../../utils/AppError.js");
const SALT_ROUNDS = 12;
function resolveBootstrapRole(email) {
    if (env_js_1.env.adminBootstrapEmails.includes(email.toLowerCase())) {
        return 'admin';
    }
    return null;
}
async function ensureUnusedPassword() {
    return bcryptjs_1.default.hash((0, node_crypto_1.randomBytes)(32).toString('hex'), SALT_ROUNDS);
}
async function syncClerkAccount(session, body, req) {
    const bootstrapRole = resolveBootstrapRole(session.email);
    let user = await User_js_1.User.findOne({ clerk_id: session.clerkId });
    if (!user) {
        const byEmail = await User_js_1.User.findOne({ email: session.email });
        if (byEmail) {
            if (byEmail.clerk_id && byEmail.clerk_id !== session.clerkId) {
                // Development-safe auto relink
                byEmail.clerk_id = session.clerkId;
                byEmail.email_verified = true;
                byEmail.full_name = session.fullName;
                if (session.profileImage) {
                    byEmail.avatar_url = session.profileImage;
                }
                await byEmail.save();
                user = byEmail;
            }
            user = await User_js_1.User.findByIdAndUpdate(byEmail._id, {
                $set: {
                    clerk_id: session.clerkId,
                    full_name: session.fullName,
                    avatar_url: session.profileImage || byEmail.avatar_url,
                    email_verified: true,
                },
            }, { new: true });
        }
    }
    const requestedRole = bootstrapRole ?? (body.role === 'psychiatrist' ? 'psychiatrist' : 'user');
    const isNewPsychiatrist = requestedRole === 'psychiatrist';
    if (!user) {
        const passwordHash = await ensureUnusedPassword();
        const verificationStatus = isNewPsychiatrist ? 'pending' : undefined;
        const isApproved = (0, User_js_1.computeIsApproved)(requestedRole, verificationStatus);
        if (isNewPsychiatrist) {
            const nationalId = body.national_id.trim();
            const license = body.medical_license.trim();
            const conflict = await User_js_1.User.findOne({
                $or: [{ national_id: nationalId }, { medical_license: license }],
            }).lean();
            if (conflict) {
                throw new AppError_js_1.AppError(409, 'National ID or medical license is already registered');
            }
        }
        user = await User_js_1.User.create({
            clerk_id: session.clerkId,
            full_name: session.fullName,
            email: session.email,
            password: passwordHash,
            avatar_url: session.profileImage,
            role: requestedRole,
            email_verified: true,
            is_approved: isApproved,
            ...(isNewPsychiatrist
                ? {
                    verification_status: 'pending',
                    national_id: body.national_id.trim(),
                    medical_license: body.medical_license.trim(),
                    specialization: body.specialization.trim(),
                    experience_years: body.experience_years,
                    hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
                }
                : {}),
        });
        if (isNewPsychiatrist) {
            await PsychiatristProfile_js_1.PsychiatristProfile.create({
                user_id: user._id,
                specialization: body.specialization.trim(),
                license_number: body.medical_license.trim(),
                years_of_experience: body.experience_years,
                hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
                approval_status: 'pending',
            });
        }
    }
    else {
        const updates = {
            full_name: session.fullName,
            avatar_url: session.profileImage || user.avatar_url,
            email_verified: true,
        };
        if (bootstrapRole) {
            updates.role = bootstrapRole;
            updates.is_approved = true;
            updates.verification_status = undefined;
        }
        else if (body.role === 'psychiatrist' && user.role === 'user') {
            throw new AppError_js_1.AppError(400, 'Cannot upgrade to psychiatrist via sync; contact support');
        }
        user = await User_js_1.User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
        if (!user) {
            throw new AppError_js_1.AppError(500, 'User sync failed');
        }
    }
    const auth = await (0, auth_service_js_1.issueAuthResponse)(user._id.toString(), req);
    const profile = user.role === 'psychiatrist'
        ? await PsychiatristProfile_js_1.PsychiatristProfile.findOne({ user_id: user._id }).lean()
        : null;
    return {
        ...auth,
        user: {
            ...(0, auth_service_js_1.publicUser)(user),
            psychiatrist_profile: profile
                ? {
                    specialization: profile.specialization,
                    license_number: profile.license_number,
                    years_of_experience: profile.years_of_experience,
                    hospital_or_clinic: profile.hospital_or_clinic,
                    approval_status: profile.approval_status,
                    admin_feedback: profile.admin_feedback,
                    uploaded_documents: profile.uploaded_documents,
                }
                : null,
        },
    };
}
