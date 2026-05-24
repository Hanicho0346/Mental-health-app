import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { User, computeIsApproved } from '../../models/User.js';
import { PsychiatristProfile } from '../../models/PsychiatristProfile.js';
import { issueAuthResponse, publicUser } from '../auth/auth.service.js';
import type { VerifiedClerkSession } from '../../utils/clerk.js';
import { AppError } from '../../utils/AppError.js';
import type { UserRole } from '../../types/roles.js';

const SALT_ROUNDS = 12;

function resolveBootstrapRole(email: string): UserRole | null {
  if (env.adminBootstrapEmails.includes(email.toLowerCase())) {
    return 'admin';
  }
  return null;
}

async function ensureUnusedPassword(): Promise<string> {
  return bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);
}

export async function syncClerkAccount(
  session: VerifiedClerkSession,
  body: {
    role?: 'user' | 'psychiatrist';
    national_id?: string;
    medical_license?: string;
    specialization?: string;
    experience_years?: number;
    hospital_or_clinic?: string;
  },
  req: Request
) {
  const bootstrapRole = resolveBootstrapRole(session.email);
  let user = await User.findOne({ clerk_id: session.clerkId });
  if (!user) {
    const byEmail = await User.findOne({ email: session.email });
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
      user = await User.findByIdAndUpdate(
        byEmail._id,
        {
          $set: {
            clerk_id: session.clerkId,
            full_name: session.fullName,
            avatar_url: session.profileImage || byEmail.avatar_url,
            email_verified: true,
          },
        },
        { new: true }
      );
    }
  }

  const requestedRole = bootstrapRole ?? (body.role === 'psychiatrist' ? 'psychiatrist' : 'user');
  const isNewPsychiatrist = requestedRole === 'psychiatrist';

  if (!user) {
    const passwordHash = await ensureUnusedPassword();
    const verificationStatus = isNewPsychiatrist ? ('pending' as const) : undefined;
    const isApproved = computeIsApproved(requestedRole, verificationStatus);

    if (isNewPsychiatrist) {
      const nationalId = body.national_id!.trim();
      const license = body.medical_license!.trim();
      const conflict = await User.findOne({
        $or: [{ national_id: nationalId }, { medical_license: license }],
      }).lean();
      if (conflict) {
        throw new AppError(409, 'National ID or medical license is already registered');
      }
    }

    user = await User.create({
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
            verification_status: 'pending' as const,
            national_id: body.national_id!.trim(),
            medical_license: body.medical_license!.trim(),
            specialization: body.specialization!.trim(),
            experience_years: body.experience_years,
            hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
          }
        : {}),
    });

    if (isNewPsychiatrist) {
      await PsychiatristProfile.create({
        user_id: user._id,
        specialization: body.specialization!.trim(),
        license_number: body.medical_license!.trim(),
        years_of_experience: body.experience_years,
        hospital_or_clinic: body.hospital_or_clinic?.trim() ?? '',
        approval_status: 'pending',
      });
    }
  } else {
    const updates: Record<string, unknown> = {
      full_name: session.fullName,
      avatar_url: session.profileImage || user.avatar_url,
      email_verified: true,
    };
    if (bootstrapRole) {
      updates.role = bootstrapRole;
      updates.is_approved = true;
      updates.verification_status = undefined;
    } else if (body.role === 'psychiatrist' && user.role === 'user') {
      throw new AppError(400, 'Cannot upgrade to psychiatrist via sync; contact support');
    }
    user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
    if (!user) {
      throw new AppError(500, 'User sync failed');
    }
  }

  const auth = await issueAuthResponse(user._id.toString(), req);
  const profile =
    user.role === 'psychiatrist'
      ? await PsychiatristProfile.findOne({ user_id: user._id }).lean()
      : null;

  return {
    ...auth,
    user: {
      ...publicUser(user),
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
