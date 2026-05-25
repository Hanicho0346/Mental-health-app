"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientIp = clientIp;
exports.publicUser = publicUser;
exports.issueAuthResponse = issueAuthResponse;
exports.resumeRegistrationIfUnverified = resumeRegistrationIfUnverified;
exports.registerWithPassword = registerWithPassword;
exports.loginWithPassword = loginWithPassword;
exports.refreshTokens = refreshTokens;
exports.logoutRefresh = logoutRefresh;
exports.verifyEmailCode = verifyEmailCode;
exports.resendVerificationEmail = resendVerificationEmail;
exports.forgotPasswordRequest = forgotPasswordRequest;
exports.resetPasswordWithCode = resetPasswordWithCode;
exports.logAuthError = logAuthError;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = require("node:crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const env_js_1 = require("../../config/env.js");
const RefreshSession_js_1 = require("../../models/RefreshSession.js");
const User_js_1 = require("../../models/User.js");
const PsychiatristProfile_js_1 = require("../../models/PsychiatristProfile.js");
const email_service_js_1 = require("../../services/email.service.js");
const jwt_js_1 = require("../../utils/jwt.js");
const AppError_js_1 = require("../../utils/AppError.js");
const otp_js_1 = require("../../utils/otp.js");
const tokenHash_js_1 = require("../../utils/tokenHash.js");
const logger_js_1 = require("../../utils/logger.js");
const SALT_ROUNDS = 12;
function pickRole(r) {
    if (r === 'psychiatrist' || r === 'admin')
        return r;
    return 'user';
}
function clientIp(req) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.length > 0)
        return xf.split(',')[0].trim();
    return req.socket.remoteAddress ?? '';
}
function publicUser(user) {
    const role = pickRole(user.role);
    const verification_status = user.verification_status ?? null;
    return {
        id: user._id.toString(),
        full_name: user.full_name,
        email: user.email,
        national_id: user.national_id ?? '',
        avatar_url: user.avatar_url ?? '',
        mood_status: user.mood_status ?? '',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        role,
        email_verified: user.email_verified ?? true,
        verification_status,
        is_approved: user.is_approved ??
            (role === 'psychiatrist' ? verification_status === 'approved' : true),
        admin_feedback: user.admin_feedback ?? '',
        hospital_or_clinic: user.hospital_or_clinic ?? '',
    };
}
async function issueAuthResponse(userId, req) {
    const user = await User_js_1.User.findById(userId).lean();
    if (!user) {
        throw new AppError_js_1.AppError(500, 'User not found');
    }
    const role = pickRole(user.role);
    const emailVerified = user.email_verified ?? true;
    const accessToken = (0, jwt_js_1.signAccessToken)({ sub: userId, role, emailVerified });
    const rawRefresh = (0, node_crypto_1.randomBytes)(48).toString('hex');
    const token_hash = (0, tokenHash_js_1.hashRefreshToken)(rawRefresh);
    const expires_at = new Date(Date.now() + env_js_1.env.jwtRefreshExpiresDays * 86_400_000);
    await RefreshSession_js_1.RefreshSession.create({
        user_id: new mongoose_1.default.Types.ObjectId(userId),
        token_hash,
        ip: clientIp(req),
        user_agent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '',
        expires_at,
        last_active_at: new Date(),
    });
    return {
        token: accessToken,
        accessToken,
        refreshToken: rawRefresh,
        expiresIn: env_js_1.env.jwtAccessExpiresSec,
        user: publicUser(user),
    };
}
async function resumeUnverifiedRegistration(existing, updates) {
    if (!env_js_1.env.emailVerificationEnabled || existing.email_verified === true) {
        return null;
    }
    await User_js_1.User.updateOne({ _id: existing._id }, {
        $set: {
            full_name: updates.full_name,
            password: updates.passwordHash,
            email_verified: false,
        },
    });
    await issueEmailVerificationOtp(existing._id, updates.registeredEmail);
    return {
        needsVerification: true,
        email: updates.registeredEmail,
        verificationResent: true,
    };
}
/** Used when register hits a duplicate-key race or legacy DB state. */
async function resumeRegistrationIfUnverified(input) {
    const registeredEmail = input.email.trim().toLowerCase();
    const existing = await User_js_1.User.findOne({ email: registeredEmail });
    if (!existing)
        return null;
    const hashed = await bcryptjs_1.default.hash(input.password, SALT_ROUNDS);
    return resumeUnverifiedRegistration(existing, {
        full_name: input.full_name.trim(),
        passwordHash: hashed,
        registeredEmail,
    });
}
async function issueEmailVerificationOtp(userId, registeredEmail) {
    const code = (0, otp_js_1.generateNumericOtp)(6);
    const hash = (0, otp_js_1.hashOtp)(env_js_1.env.otpPepper, code);
    const exp = new Date(Date.now() + 15 * 60_000);
    await User_js_1.User.updateOne({ _id: userId }, { $set: { email_verification_otp_hash: hash, email_verification_otp_expires_at: exp } });
    await (0, email_service_js_1.sendVerificationCodeToRegisteredEmail)(registeredEmail, code);
}
async function registerWithPassword(input, req) {
    const hashed = await bcryptjs_1.default.hash(input.password, SALT_ROUNDS);
    const emailVerified = !env_js_1.env.emailVerificationEnabled;
    const registeredEmail = input.email.trim().toLowerCase();
    const assignedRole = input.role === 'psychiatrist' ? 'psychiatrist' : 'user';
    const existingByEmail = await User_js_1.User.findOne({ email: registeredEmail });
    if (existingByEmail) {
        const resumed = await resumeUnverifiedRegistration(existingByEmail, {
            full_name: input.full_name.trim(),
            passwordHash: hashed,
            registeredEmail,
        });
        if (resumed)
            return resumed;
        throw new AppError_js_1.AppError(409, 'This email is already registered. Please log in instead.');
    }
    if (assignedRole === 'psychiatrist') {
        const nationalId = input.national_id.trim();
        const license = input.medical_license?.trim();
        const idConflict = await User_js_1.User.findOne({
            $or: [
                { national_id: nationalId },
                ...(license ? [{ medical_license: license }] : []),
            ],
        }).lean();
        if (idConflict) {
            throw new AppError_js_1.AppError(409, 'National ID or medical license is already registered.');
        }
    }
    else if (input.national_id?.trim()) {
        const idConflict = await User_js_1.User.findOne({ national_id: input.national_id.trim() }).lean();
        if (idConflict) {
            throw new AppError_js_1.AppError(409, 'National ID is already registered.');
        }
    }
    const verificationStatus = assignedRole === 'psychiatrist' ? 'pending' : undefined;
    const user = await User_js_1.User.create({
        full_name: input.full_name.trim(),
        email: registeredEmail,
        password: hashed,
        role: assignedRole,
        email_verified: emailVerified,
        is_approved: (0, User_js_1.computeIsApproved)(assignedRole, verificationStatus),
        avatar_url: '',
        mood_status: '',
        ...(assignedRole === 'psychiatrist'
            ? {
                verification_status: verificationStatus,
                national_id: input.national_id.trim(),
                medical_license: input.medical_license?.trim(),
                specialization: input.specialization?.trim(),
                experience_years: input.experience_years,
            }
            : input.national_id?.trim()
                ? { national_id: input.national_id.trim() }
                : {}),
    });
    if (assignedRole === 'psychiatrist') {
        await PsychiatristProfile_js_1.PsychiatristProfile.create({
            user_id: user._id,
            specialization: input.specialization.trim(),
            license_number: input.medical_license.trim(),
            years_of_experience: input.experience_years,
            approval_status: 'pending',
        });
    }
    if (env_js_1.env.emailVerificationEnabled) {
        await issueEmailVerificationOtp(user._id, registeredEmail);
        return { needsVerification: true, email: registeredEmail };
    }
    return issueAuthResponse(user._id.toString(), req);
}
async function loginWithPassword(input, req) {
    const user = await User_js_1.User.findOne({ email: input.email.trim().toLowerCase() }).select('+password');
    if (!user?.password || !(await bcryptjs_1.default.compare(input.password, user.password))) {
        throw new AppError_js_1.AppError(401, 'Invalid email or password');
    }
    if ((env_js_1.env.emailVerificationEnabled || env_js_1.env.blockUnverifiedLogin) && !user.email_verified) {
        throw new AppError_js_1.AppError(403, 'Email not verified');
    }
    return issueAuthResponse(user._id.toString(), req);
}
async function refreshTokens(refreshToken, req) {
    const token_hash = (0, tokenHash_js_1.hashRefreshToken)(refreshToken);
    const session = await RefreshSession_js_1.RefreshSession.findOne({ token_hash }).exec();
    if (!session || session.expires_at.getTime() < Date.now()) {
        throw new AppError_js_1.AppError(401, 'Invalid or expired refresh token');
    }
    const user = await User_js_1.User.findById(session.user_id).exec();
    if (!user) {
        await RefreshSession_js_1.RefreshSession.deleteOne({ _id: session._id });
        throw new AppError_js_1.AppError(401, 'User no longer exists');
    }
    await RefreshSession_js_1.RefreshSession.deleteOne({ _id: session._id });
    return issueAuthResponse(user._id.toString(), req);
}
async function logoutRefresh(refreshToken) {
    const token_hash = (0, tokenHash_js_1.hashRefreshToken)(refreshToken);
    await RefreshSession_js_1.RefreshSession.deleteOne({ token_hash });
}
async function verifyEmailCode(input) {
    const user = await User_js_1.User.findOne({ email: input.email.trim().toLowerCase() })
        .select('+email_verification_otp_hash +email_verification_otp_expires_at')
        .exec();
    if (!user || !user.email_verification_otp_hash || !user.email_verification_otp_expires_at) {
        throw new AppError_js_1.AppError(400, 'No pending verification for this email');
    }
    if (user.email_verification_otp_expires_at.getTime() < Date.now()) {
        throw new AppError_js_1.AppError(400, 'Code expired');
    }
    if (!(0, otp_js_1.verifyOtpHash)(env_js_1.env.otpPepper, input.code, user.email_verification_otp_hash)) {
        throw new AppError_js_1.AppError(400, 'Invalid code');
    }
    await User_js_1.User.updateOne({ _id: user._id }, {
        $set: { email_verified: true },
        $unset: { email_verification_otp_hash: '', email_verification_otp_expires_at: '' },
    });
    return { ok: true };
}
async function resendVerificationEmail(input) {
    const user = await User_js_1.User.findOne({ email: input.email.trim().toLowerCase() }).exec();
    if (!user || user.email_verified) {
        return { ok: true };
    }
    await issueEmailVerificationOtp(user._id, user.email);
    return { ok: true };
}
async function forgotPasswordRequest(input) {
    const user = await User_js_1.User.findOne({ email: input.email.trim().toLowerCase() }).exec();
    if (!user) {
        return { ok: true };
    }
    const code = (0, otp_js_1.generateNumericOtp)(6);
    const hash = (0, otp_js_1.hashOtp)(env_js_1.env.otpPepper, code);
    const exp = new Date(Date.now() + 60 * 60_000);
    await User_js_1.User.updateOne({ _id: user._id }, { $set: { password_reset_otp_hash: hash, password_reset_otp_expires_at: exp } });
    await (0, email_service_js_1.sendMail)({
        to: user.email,
        subject: 'Password reset',
        text: `Your password reset code is: ${code}. It expires in one hour.`,
    });
    return { ok: true };
}
async function resetPasswordWithCode(input) {
    const user = await User_js_1.User.findOne({ email: input.email.trim().toLowerCase() })
        .select('+password_reset_otp_hash +password_reset_otp_expires_at')
        .exec();
    if (!user || !user.password_reset_otp_hash || !user.password_reset_otp_expires_at) {
        throw new AppError_js_1.AppError(400, 'Invalid reset request');
    }
    if (user.password_reset_otp_expires_at.getTime() < Date.now()) {
        throw new AppError_js_1.AppError(400, 'Code expired');
    }
    if (!(0, otp_js_1.verifyOtpHash)(env_js_1.env.otpPepper, input.code, user.password_reset_otp_hash)) {
        throw new AppError_js_1.AppError(400, 'Invalid code');
    }
    if (input.password.length < 8) {
        throw new AppError_js_1.AppError(400, 'Password must be at least 8 characters');
    }
    const hashed = await bcryptjs_1.default.hash(input.password, SALT_ROUNDS);
    await User_js_1.User.updateOne({ _id: user._id }, {
        $set: { password: hashed },
        $unset: { password_reset_otp_hash: '', password_reset_otp_expires_at: '' },
    });
    await RefreshSession_js_1.RefreshSession.deleteMany({ user_id: user._id });
    return { ok: true };
}
function logAuthError(context, err, extra) {
    (0, logger_js_1.logServerError)(context, err, extra);
}
