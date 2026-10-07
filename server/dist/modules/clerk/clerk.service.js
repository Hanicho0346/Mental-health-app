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
const logger_js_1 = require("../../utils/logger.js");
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
    (0, logger_js_1.logServerInfo)('clerk.sync.start', { requestedRole: body.role ?? 'user' });
    const bootstrapRole = resolveBootstrapRole(session.email);
    let user = await User_js_1.User.findOne({
        clerk_id: session.clerkId,
    });
    // find by email if clerk_id missing
    if (!user) {
        const byEmail = await User_js_1.User.findOne({
            email: session.email,
        });
        if (byEmail) {
            // relink existing account
            if (byEmail.clerk_id &&
                byEmail.clerk_id !== session.clerkId) {
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
                    avatar_url: session.profileImage ||
                        byEmail.avatar_url,
                    email_verified: true,
                },
            }, { new: true });
        }
    }
    // determine requested role
    const requestedRole = bootstrapRole ||
        (body.role === 'psychiatrist'
            ? 'psychiatrist'
            : 'user');
    const isNewPsychiatrist = requestedRole === 'psychiatrist';
    // CREATE NEW USER
    if (!user) {
        const passwordHash = await ensureUnusedPassword();
        const verificationStatus = isNewPsychiatrist
            ? 'pending'
            : undefined;
        const isApproved = (0, User_js_1.computeIsApproved)(requestedRole, verificationStatus);
        // validate psychiatrist fields
        if (isNewPsychiatrist) {
            if (!body.national_id ||
                !body.medical_license ||
                !body.specialization) {
                throw new AppError_js_1.AppError(400, 'Missing psychiatrist registration fields');
            }
            const nationalId = body.national_id.trim();
            const license = body.medical_license.trim();
            const conflict = await User_js_1.User.findOne({
                $or: [
                    { national_id: nationalId },
                    { medical_license: license },
                ],
            }).lean();
            if (conflict) {
                throw new AppError_js_1.AppError(409, 'National ID or medical license already exists');
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
                    national_id: body.national_id?.trim(),
                    medical_license: body.medical_license?.trim(),
                    specialization: body.specialization?.trim(),
                    experience_years: body.experience_years ?? 0,
                    hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
                }
                : {}),
        });
        // create psychiatrist profile
        if (isNewPsychiatrist) {
            await PsychiatristProfile_js_1.PsychiatristProfile.create({
                user_id: user._id,
                specialization: body.specialization?.trim() ?? '',
                license_number: body.medical_license?.trim() ?? '',
                years_of_experience: body.experience_years ?? 0,
                hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
                approval_status: 'pending',
            });
        }
    }
    else {
        // UPDATE EXISTING USER
        const updates = {
            full_name: session.fullName,
            avatar_url: session.profileImage ||
                user.avatar_url,
            email_verified: true,
        };
        // admin bootstrap
        if (bootstrapRole) {
            updates.role = bootstrapRole;
            updates.is_approved = true;
            updates.verification_status = undefined;
        }
        // upgrade user -> psychiatrist
        else if (body.role === 'psychiatrist' &&
            user.role === 'user') {
            updates.role = 'psychiatrist';
            updates.verification_status = 'pending';
            updates.is_approved = false;
            updates.national_id =
                body.national_id?.trim();
            updates.medical_license =
                body.medical_license?.trim();
            updates.specialization =
                body.specialization?.trim();
            updates.experience_years =
                body.experience_years ?? 0;
            updates.hospital_or_clinic =
                body.hospital_or_clinic?.trim() ?? '';
            const existingProfile = await PsychiatristProfile_js_1.PsychiatristProfile.findOne({
                user_id: user._id,
            });
            if (!existingProfile) {
                await PsychiatristProfile_js_1.PsychiatristProfile.create({
                    user_id: user._id,
                    specialization: body.specialization?.trim() ?? '',
                    license_number: body.medical_license?.trim() ?? '',
                    years_of_experience: body.experience_years ?? 0,
                    hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
                    approval_status: 'pending',
                });
            }
        }
        user = await User_js_1.User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
        if (!user) {
            throw new AppError_js_1.AppError(500, 'User sync failed');
        }
    }
    const auth = await (0, auth_service_js_1.issueAuthResponse)(user._id.toString(), req);
    const profile = user.role === 'psychiatrist'
        ? await PsychiatristProfile_js_1.PsychiatristProfile.findOne({
            user_id: user._id,
        }).lean()
        : null;
    (0, logger_js_1.logServerInfo)('clerk.sync.success', { userId: user._id.toString(), role: user.role });
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
