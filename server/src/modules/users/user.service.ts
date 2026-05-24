import mongoose from 'mongoose';
import { User } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';

export type MeProfileDto = {
  id: string;
  full_name: string;
  email: string;
  national_id: string;
  avatar_url: string;
  mood_status: string;
  createdAt?: Date;
  role: string;
  email_verified: boolean;
  verification_status: string | null;
  is_approved: boolean;
  admin_feedback: string;
  hospital_or_clinic: string;
};

export async function getMeProfile(userId: string): Promise<MeProfileDto> {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError(404, 'User not found');
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
    is_approved:
      user.is_approved ??
      (user.role === 'psychiatrist' ? user.verification_status === 'approved' : true),
    admin_feedback: user.admin_feedback ?? '',
    hospital_or_clinic: user.hospital_or_clinic ?? '',
  };
}

export type PeerPublicDto = {
  id: string;
  full_name: string;
  avatar_url: string;
  mood_status: string;
};

export async function getPeerPublicProfile(peerId: string, requestUserId: string): Promise<PeerPublicDto> {
  if (!mongoose.Types.ObjectId.isValid(peerId)) {
    throw new AppError(400, 'Invalid peer id');
  }
  if (peerId === requestUserId) {
    throw new AppError(400, 'Use GET /api/users/me for your own profile');
  }
  const user = await User.findById(peerId).select('full_name avatar_url mood_status').lean();
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return {
    id: user._id.toString(),
    full_name: user.full_name,
    avatar_url: user.avatar_url ?? '',
    mood_status: user.mood_status ?? '',
  };
}

export async function patchMeProfile(
  userId: string,
  body: Record<string, unknown>
): Promise<MeProfileDto> {
  const allowed = ['full_name', 'avatar_url', 'mood_status'] as const;
  const updates: Partial<Record<(typeof allowed)[number], string>> = {};
  for (const key of allowed) {
    const v = body[key];
    if (typeof v === 'string') {
      updates[key] = v.trim();
    }
  }
  if (Object.keys(updates).length === 0) {
    throw new AppError(400, 'No valid fields to update');
  }
  const user = await User.findByIdAndUpdate(userId, { $set: updates }, { new: true }).lean();
  if (!user) {
    throw new AppError(404, 'User not found');
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
    is_approved:
      user.is_approved ??
      (user.role === 'psychiatrist' ? user.verification_status === 'approved' : true),
    admin_feedback: user.admin_feedback ?? '',
    hospital_or_clinic: user.hospital_or_clinic ?? '',
  };
}
