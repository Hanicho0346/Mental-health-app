"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMeProfile = getMeProfile;
exports.getPeerPublicProfile = getPeerPublicProfile;
exports.patchMeProfile = patchMeProfile;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../../models/User.js");
const AppError_js_1 = require("../../utils/AppError.js");
async function getMeProfile(userId) {
    const user = await User_js_1.User.findById(userId).lean();
    if (!user) {
        throw new AppError_js_1.AppError(404, 'User not found');
    }
    return {
        id: user._id.toString(),
        full_name: user.full_name,
        email: user.email,
        national_id: user.national_id ?? '',
        avatar_url: user.avatar_url ?? '',
        mood_status: user.mood_status ?? '',
        createdAt: user.createdAt,
        role: user.role ?? 'user',
        email_verified: user.email_verified ?? true,
        verification_status: user.verification_status ?? null,
        is_approved: user.is_approved ??
            (user.role === 'psychiatrist' ? user.verification_status === 'approved' : true),
        admin_feedback: user.admin_feedback ?? '',
        hospital_or_clinic: user.hospital_or_clinic ?? '',
    };
}
async function getPeerPublicProfile(peerId, requestUserId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(peerId)) {
        throw new AppError_js_1.AppError(400, 'Invalid peer id');
    }
    if (peerId === requestUserId) {
        throw new AppError_js_1.AppError(400, 'Use GET /api/users/me for your own profile');
    }
    const user = await User_js_1.User.findById(peerId).select('full_name avatar_url mood_status').lean();
    if (!user) {
        throw new AppError_js_1.AppError(404, 'User not found');
    }
    return {
        id: user._id.toString(),
        full_name: user.full_name,
        avatar_url: user.avatar_url ?? '',
        mood_status: user.mood_status ?? '',
    };
}
async function patchMeProfile(userId, body) {
    const allowed = ['full_name', 'avatar_url', 'mood_status'];
    const updates = {};
    for (const key of allowed) {
        const v = body[key];
        if (typeof v === 'string') {
            updates[key] = v.trim();
        }
    }
    if (Object.keys(updates).length === 0) {
        throw new AppError_js_1.AppError(400, 'No valid fields to update');
    }
    const user = await User_js_1.User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).lean();
    if (!user) {
        throw new AppError_js_1.AppError(404, 'User not found');
    }
    return {
        id: user._id.toString(),
        full_name: user.full_name,
        email: user.email,
        national_id: user.national_id ?? '',
        avatar_url: user.avatar_url ?? '',
        mood_status: user.mood_status ?? '',
        createdAt: user.createdAt,
        role: user.role ?? 'user',
        email_verified: user.email_verified ?? true,
        verification_status: user.verification_status ?? null,
        is_approved: user.is_approved ??
            (user.role === 'psychiatrist' ? user.verification_status === 'approved' : true),
        admin_feedback: user.admin_feedback ?? '',
        hospital_or_clinic: user.hospital_or_clinic ?? '',
    };
}
