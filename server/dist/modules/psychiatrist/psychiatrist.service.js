"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPsychiatristVerificationStatus = getPsychiatristVerificationStatus;
exports.submitPsychiatristProfile = submitPsychiatristProfile;
exports.uploadPsychiatristDocument = uploadPsychiatristDocument;
exports.listPendingPsychiatristsForAdmin = listPendingPsychiatristsForAdmin;
exports.reviewPsychiatrist = reviewPsychiatrist;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../../models/User.js");
const PsychiatristProfile_js_1 = require("../../models/PsychiatristProfile.js");
const cloudinary_service_js_1 = require("../../services/cloudinary.service.js");
const AppError_js_1 = require("../../utils/AppError.js");
async function getPsychiatristVerificationStatus(userId) {
    const user = await User_js_1.User.findById(userId)
        .select('role verification_status is_approved admin_feedback full_name email specialization medical_license experience_years hospital_or_clinic createdAt wallet_balance wallet_currency is_suspended suspension_reason')
        .lean();
    if (!user || user.role !== 'psychiatrist') {
        throw new AppError_js_1.AppError(403, 'Psychiatrist account required');
    }
    const profile = await PsychiatristProfile_js_1.PsychiatristProfile.findOne({ user_id: user._id }).lean();
    return {
        id: user._id.toString(),
        full_name: user.full_name,
        email: user.email,
        created_at: user.createdAt,
        // Profile fields: prefer PsychiatristProfile, fall back to User
        specialization: profile?.specialization ?? user.specialization ?? '',
        license_number: profile?.license_number ?? user.medical_license ?? '',
        years_of_experience: profile?.years_of_experience ?? user.experience_years ?? 0,
        hospital_or_clinic: profile?.hospital_or_clinic ?? user.hospital_or_clinic ?? '',
        uploaded_documents: profile?.uploaded_documents ?? [],
        // Verification
        verification_status: user.verification_status ?? profile?.approval_status ?? 'pending',
        is_approved: user.is_approved ?? false,
        admin_feedback: user.admin_feedback ?? profile?.admin_feedback ?? '',
        is_suspended: user.is_suspended ?? false,
        suspension_reason: user.suspension_reason ?? '',
        // Wallet
        wallet_balance: user.wallet_balance ?? 0,
        wallet_currency: user.wallet_currency ?? 'USD',
    };
}
async function submitPsychiatristProfile(userId, input) {
    const user = await User_js_1.User.findById(userId);
    if (!user || user.role !== 'psychiatrist') {
        throw new AppError_js_1.AppError(403, 'Psychiatrist account required');
    }
    if (user.verification_status === 'approved' && user.is_approved) {
        throw new AppError_js_1.AppError(400, 'Profile already approved');
    }
    const license = input.license_number.trim();
    const conflict = await User_js_1.User.findOne({
        medical_license: license,
        _id: { $ne: user._id },
    }).lean();
    if (conflict) {
        throw new AppError_js_1.AppError(409, 'Medical license is already registered');
    }
    await User_js_1.User.updateOne({ _id: user._id }, {
        $set: {
            specialization: input.specialization.trim(),
            medical_license: license,
            experience_years: input.years_of_experience,
            hospital_or_clinic: input.hospital_or_clinic?.trim() ?? '',
            verification_status: 'pending',
            is_approved: false,
            admin_feedback: '',
        },
    });
    await PsychiatristProfile_js_1.PsychiatristProfile.findOneAndUpdate({ user_id: user._id }, {
        $set: {
            specialization: input.specialization.trim(),
            license_number: license,
            years_of_experience: input.years_of_experience,
            hospital_or_clinic: input.hospital_or_clinic?.trim() ?? '',
            approval_status: 'pending',
            admin_feedback: '',
        },
    }, { upsert: true, new: true });
    return getPsychiatristVerificationStatus(userId);
}
async function uploadPsychiatristDocument(userId, file, documentType) {
    if (!(0, cloudinary_service_js_1.isCloudinaryConfigured)()) {
        throw new AppError_js_1.AppError(503, 'Document upload is not configured');
    }
    const user = await User_js_1.User.findById(userId);
    if (!user || user.role !== 'psychiatrist') {
        throw new AppError_js_1.AppError(403, 'Psychiatrist account required');
    }
    const uploaded = await (0, cloudinary_service_js_1.uploadBuffer)(file.buffer, 'psychiatrist_verification', {
        resourceType: file.mimetype?.startsWith('image/') ? 'image' : 'raw',
    });
    const docEntry = {
        url: uploaded.url,
        public_id: uploaded.public_id,
        document_type: documentType,
        uploaded_at: new Date(),
    };
    await PsychiatristProfile_js_1.PsychiatristProfile.findOneAndUpdate({ user_id: user._id }, { $push: { uploaded_documents: docEntry } }, { upsert: true });
    await User_js_1.User.updateOne({ _id: user._id }, {
        $push: {
            uploaded_documents: {
                url: uploaded.url,
                public_id: uploaded.public_id,
                kind: 'psychiatrist_doc',
                uploaded_at: new Date(),
            },
        },
        $set: { verification_status: 'pending', is_approved: false },
    });
    return docEntry;
}
async function listPendingPsychiatristsForAdmin() {
    const profiles = await PsychiatristProfile_js_1.PsychiatristProfile.find({ approval_status: 'pending' })
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean();
    const userIds = profiles.map((p) => p.user_id);
    const users = await User_js_1.User.find({ _id: { $in: userIds }, role: 'psychiatrist' })
        .select('full_name email avatar_url verification_status createdAt national_id medical_license specialization experience_years hospital_or_clinic')
        .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    return profiles
        .map((p) => {
        const u = userMap.get(p.user_id.toString());
        if (!u)
            return null;
        return {
            id: u._id.toString(),
            full_name: u.full_name,
            email: u.email,
            avatar_url: u.avatar_url ?? '',
            verification_status: u.verification_status ?? p.approval_status,
            createdAt: u.createdAt,
            profile: {
                specialization: p.specialization || u.specialization,
                license_number: p.license_number || u.medical_license,
                years_of_experience: p.years_of_experience ?? u.experience_years,
                hospital_or_clinic: p.hospital_or_clinic || u.hospital_or_clinic,
                uploaded_documents: p.uploaded_documents,
            },
        };
    })
        .filter(Boolean);
}
async function reviewPsychiatrist(adminId, psychiatristUserId, decision, feedback) {
    if (!mongoose_1.default.Types.ObjectId.isValid(psychiatristUserId)) {
        throw new AppError_js_1.AppError(400, 'Invalid psychiatrist id');
    }
    const user = await User_js_1.User.findById(psychiatristUserId);
    if (!user || user.role !== 'psychiatrist') {
        throw new AppError_js_1.AppError(404, 'Psychiatrist not found');
    }
    const now = new Date();
    const adminOid = new mongoose_1.default.Types.ObjectId(adminId);
    const feedbackText = feedback?.trim() ?? '';
    await User_js_1.User.updateOne({ _id: user._id }, {
        $set: {
            verification_status: decision,
            is_approved: decision === 'approved',
            admin_feedback: feedbackText,
            approved_by: decision === 'approved' ? adminOid : undefined,
            approved_at: decision === 'approved' ? now : undefined,
        },
    });
    await PsychiatristProfile_js_1.PsychiatristProfile.findOneAndUpdate({ user_id: user._id }, {
        $set: {
            approval_status: decision,
            admin_feedback: feedbackText,
            reviewed_by: adminOid,
            reviewed_at: now,
        },
    }, { upsert: true });
    return {
        id: user._id.toString(),
        verification_status: decision,
        is_approved: decision === 'approved',
        admin_feedback: feedbackText,
    };
}
