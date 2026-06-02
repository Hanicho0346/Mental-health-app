import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { RefreshSession } from '../../models/RefreshSession.js';
import { User, computeIsApproved } from '../../models/User.js';
import { PsychiatristProfile } from '../../models/PsychiatristProfile.js';
import { sendMail, sendVerificationCodeToRegisteredEmail } from '../../services/email.service.js';
import { signAccessToken } from '../../utils/jwt.js';
import { AppError } from '../../utils/AppError.js';
import { generateNumericOtp, hashOtp, verifyOtpHash } from '../../utils/otp.js';
import { hashRefreshToken } from '../../utils/tokenHash.js';
import { logServerError } from '../../utils/logger.js';
import type { UserRole } from '../../types/roles.js';
import { uploadBuffer } from '../../services/cloudinary.service.js';
const SALT_ROUNDS = 12;

function pickRole(r: unknown): UserRole {
  if (r === 'psychiatrist' || r === 'admin') return r;
  return 'user';
}

export function clientIp(req: Request): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0]!.trim();
  return req.socket.remoteAddress ?? '';
}

export function publicUser(user: {
  _id: mongoose.Types.ObjectId;
  full_name: string;
  email: string;
  national_id?: string | null;
  avatar_url?: string;
  mood_status?: string;
  createdAt?: Date;
  updatedAt?: Date;
  role?: UserRole;
  email_verified?: boolean;
  verification_status?: string | null | undefined;
  is_approved?: boolean;
  admin_feedback?: string | null;
  hospital_or_clinic?: string | null;
}) {
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
    is_approved:
      user.is_approved ??
      (role === 'psychiatrist' ? verification_status === 'approved' : true),
    admin_feedback: user.admin_feedback ?? '',
    hospital_or_clinic: user.hospital_or_clinic ?? '',
  };
}

export async function issueAuthResponse(
  userId: string,
  req: Request
): Promise<{
  token: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ReturnType<typeof publicUser>;
}> {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError(500, 'User not found');
  }
  const role = pickRole(user.role);
  const emailVerified = user.email_verified ?? true;
  const accessToken = signAccessToken({ sub: userId, role, emailVerified });
  const rawRefresh = randomBytes(48).toString('hex');
  const token_hash = hashRefreshToken(rawRefresh);
  const expires_at = new Date(Date.now() + env.jwtRefreshExpiresDays * 86_400_000);
  await RefreshSession.create({
    user_id: new mongoose.Types.ObjectId(userId),
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
    expiresIn: env.jwtAccessExpiresSec,
    user: publicUser(user),
  };
}

export type RegisterPendingVerification = {
  needsVerification: true;
  email: string;
  verificationResent?: boolean;
};

export type RegisterAuthPayload = Awaited<ReturnType<typeof issueAuthResponse>>;

async function resumeUnverifiedRegistration(
  existing: { _id: mongoose.Types.ObjectId; email_verified?: boolean },
  updates: { full_name: string; passwordHash: string; registeredEmail: string }
): Promise<RegisterPendingVerification | null> {
  if (!env.emailVerificationEnabled || existing.email_verified === true) {
    return null;
  }
  await User.updateOne(
    { _id: existing._id },
    {
      $set: {
        full_name: updates.full_name,
        password: updates.passwordHash,
        email_verified: false,
      },
    }
  );
  await issueEmailVerificationOtp(existing._id, updates.registeredEmail);
  return {
    needsVerification: true,
    email: updates.registeredEmail,
    verificationResent: true,
  };
}

/** Used when register hits a duplicate-key race or legacy DB state. */
export async function resumeRegistrationIfUnverified(input: {
  full_name: string;
  email: string;
  password: string;
}): Promise<RegisterPendingVerification | null> {
  const registeredEmail = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email: registeredEmail });
  if (!existing) return null;
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  return resumeUnverifiedRegistration(existing, {
    full_name: input.full_name.trim(),
    passwordHash: hashed,
    registeredEmail,
  });
}

async function issueEmailVerificationOtp(
  userId: mongoose.Types.ObjectId,
  registeredEmail: string
): Promise<void> {
  const code = generateNumericOtp(6);
  const hash = hashOtp(env.otpPepper, code);
  const exp = new Date(Date.now() + 15 * 60_000);
  await User.updateOne(
    { _id: userId },
    { $set: { email_verification_otp_hash: hash, email_verification_otp_expires_at: exp } }
  );
  console.log(`[OTP] Verification code for ${registeredEmail}: ${code}`);
  await sendVerificationCodeToRegisteredEmail(registeredEmail, code);
}

export async function registerWithPassword(
  input: { 
    full_name: string; 
    email: string; 
    password: string;
    role?: string;
    national_id?: string;
    medical_license?: string;
    specialization?: string;
    experience_years?: number;
    hospital_or_clinic?: string;  // ← ADD
    certificate_url?: string;     // ← ADD
  },
  req: Request
): Promise<RegisterPendingVerification | RegisterAuthPayload> {
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  const emailVerified = !env.emailVerificationEnabled;
  const registeredEmail = input.email.trim().toLowerCase();

  const assignedRole = input.role === 'psychiatrist' ? 'psychiatrist' : 'user';

  const existingByEmail = await User.findOne({ email: registeredEmail });
  if (existingByEmail) {
    const resumed = await resumeUnverifiedRegistration(existingByEmail, {
      full_name: input.full_name.trim(),
      passwordHash: hashed,
      registeredEmail,
    });
    if (resumed) return resumed;
    throw new AppError(409, 'This email is already registered. Please log in instead.');
  }

  if (assignedRole === 'psychiatrist') {
    const nationalId = input.national_id!.trim();
    const license = input.medical_license?.trim();
    const idConflict = await User.findOne({
      $or: [
        { national_id: nationalId },
        ...(license ? [{ medical_license: license }] : []),
      ],
    }).lean();
    if (idConflict) {
      throw new AppError(409, 'National ID or medical license is already registered.');
    }
  } else if (input.national_id?.trim()) {
    const idConflict = await User.findOne({ national_id: input.national_id.trim() }).lean();
    if (idConflict) {
      throw new AppError(409, 'National ID is already registered.');
    }
  }

  const verificationStatus = assignedRole === 'psychiatrist' ? ('pending' as const) : undefined;

  const user = await User.create({
    full_name: input.full_name.trim(),
    email: registeredEmail,
    password: hashed,
    role: assignedRole,
    email_verified: emailVerified,
    is_approved: computeIsApproved(assignedRole, verificationStatus),
    avatar_url: '',
    mood_status: '',
    ...(assignedRole === 'psychiatrist'
      ? {
          verification_status: verificationStatus,
          national_id: input.national_id!.trim(),
          medical_license: input.medical_license?.trim(),
          specialization: input.specialization?.trim(),
          experience_years: input.experience_years,
          hospital_or_clinic: input.hospital_or_clinic?.trim() || '',
          // ── Store uploaded certificate in uploaded_documents ──
          uploaded_documents: input.certificate_url
            ? [
                {
                  url: input.certificate_url,
                  public_id: '',
                  kind: 'psychiatrist_doc' as const,
                  uploaded_at: new Date(),
                },
              ]
            : [],
        }
      : input.national_id?.trim()
        ? { national_id: input.national_id.trim() }
        : {}),
  });

  if (assignedRole === 'psychiatrist') {
    await PsychiatristProfile.create({
      user_id: user._id,
      specialization: input.specialization!.trim(),
      license_number: input.medical_license!.trim(),
      years_of_experience: input.experience_years,
      approval_status: 'pending',
    });
  }

  if (env.emailVerificationEnabled) {
    await issueEmailVerificationOtp(user._id, registeredEmail);
    return { needsVerification: true, email: registeredEmail };
  }
  return issueAuthResponse(user._id.toString(), req);
}

export async function loginWithPassword(input: { email: string; password: string }, req: Request) {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() }).select('+password');
  if (!user?.password || !(await bcrypt.compare(input.password, user.password))) {
    throw new AppError(401, 'Invalid email or password');
  }
  if ((env.emailVerificationEnabled || env.blockUnverifiedLogin) && !user.email_verified) {
    throw new AppError(403, 'Email not verified');
  }
  return issueAuthResponse(user._id.toString(), req);
}

export async function refreshTokens(refreshToken: string, req: Request) {
  const token_hash = hashRefreshToken(refreshToken);
  const session = await RefreshSession.findOne({ token_hash }).exec();
  if (!session || session.expires_at.getTime() < Date.now()) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }
  const user = await User.findById(session.user_id).exec();
  if (!user) {
    await RefreshSession.deleteOne({ _id: session._id });
    throw new AppError(401, 'User no longer exists');
  }
  await RefreshSession.deleteOne({ _id: session._id });
  return issueAuthResponse(user._id.toString(), req);
}

export async function logoutRefresh(refreshToken: string): Promise<void> {
  const token_hash = hashRefreshToken(refreshToken);
  await RefreshSession.deleteOne({ token_hash });
}

export async function verifyEmailCode(input: { email: string; code: string }): Promise<{ ok: boolean }> {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() })
    .select('+email_verification_otp_hash +email_verification_otp_expires_at')
    .exec();
  if (!user || !user.email_verification_otp_hash || !user.email_verification_otp_expires_at) {
    throw new AppError(400, 'No pending verification for this email');
  }
  if (user.email_verification_otp_expires_at.getTime() < Date.now()) {
    throw new AppError(400, 'Code expired');
  }
  if (!verifyOtpHash(env.otpPepper, input.code, user.email_verification_otp_hash)) {
    throw new AppError(400, 'Invalid code');
  }
  await User.updateOne(
    { _id: user._id },
    {
      $set: { email_verified: true },
      $unset: { email_verification_otp_hash: '', email_verification_otp_expires_at: '' },
    }
  );
  return { ok: true };
}

export async function resendVerificationEmail(input: { email: string }): Promise<{ ok: boolean }> {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() }).exec();
  if (!user || user.email_verified) {
    return { ok: true };
  }
  await issueEmailVerificationOtp(user._id, user.email);
  return { ok: true };
}

export async function forgotPasswordRequest(input: { email: string }): Promise<{ ok: boolean }> {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() }).exec();
  if (!user) {
    return { ok: true };
  }
  const code = generateNumericOtp(6);
  const hash = hashOtp(env.otpPepper, code);
  const exp = new Date(Date.now() + 60 * 60_000);
  await User.updateOne(
    { _id: user._id },
    { $set: { password_reset_otp_hash: hash, password_reset_otp_expires_at: exp } }
  );
  await sendMail({
    to: user.email,
    subject: 'Password reset',
    text: `Your password reset code is: ${code}. It expires in one hour.`,
  });
  return { ok: true };
}



export async function uploadDocument(input: {
  email: string;
  fileBuffer: Buffer;
  mimeType: string;
}): Promise<{ ok: boolean; url: string }> {
  const safeEmail = input.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');

  const { url, public_id } = await uploadBuffer(
    input.fileBuffer,
    'psychiatrist_certificates',
    {
      publicId: `cert_pending_${safeEmail}`,
      resourceType: input.mimeType === 'application/pdf' ? 'raw' : 'image',
    },
  );

  // If user already exists (re-upload case), save immediately
  const existing = await User.findOne({
    email: input.email.trim().toLowerCase(),
  }).exec();

  if (existing) {
    // Remove any previous certificate doc, then push the new one
    await User.updateOne(
      { _id: existing._id },
      {
        $pull: { uploaded_documents: { kind: 'psychiatrist_doc' } },
      },
    );
    await User.updateOne(
      { _id: existing._id },
      {
        $push: {
          uploaded_documents: {
            url,
            public_id,
            kind: 'psychiatrist_doc',
            uploaded_at: new Date(),
          },
        },
      },
    );
  }

  return { ok: true, url };
}

export async function resetPasswordWithCode(input: { email: string; code: string; password: string }): Promise<{ ok: boolean }> {
  const user = await User.findOne({ email: input.email.trim().toLowerCase() })
    .select('+password_reset_otp_hash +password_reset_otp_expires_at')
    .exec();
  if (!user || !user.password_reset_otp_hash || !user.password_reset_otp_expires_at) {
    throw new AppError(400, 'Invalid reset request');
  }
  if (user.password_reset_otp_expires_at.getTime() < Date.now()) {
    throw new AppError(400, 'Code expired');
  }
  if (!verifyOtpHash(env.otpPepper, input.code, user.password_reset_otp_hash)) {
    throw new AppError(400, 'Invalid code');
  }
  if (input.password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters');
  }
  const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
  await User.updateOne(
    { _id: user._id },
    {
      $set: { password: hashed },
      $unset: { password_reset_otp_hash: '', password_reset_otp_expires_at: '' },
    }
  );
  await RefreshSession.deleteMany({ user_id: user._id });
  return { ok: true };
}

export function logAuthError(context: string, err: unknown, extra?: Record<string, unknown>): void {
  logServerError(context, err, extra);
}
