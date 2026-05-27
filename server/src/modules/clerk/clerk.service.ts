import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
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
  return bcrypt.hash(
    randomBytes(32).toString('hex'),
    SALT_ROUNDS
  );
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

  console.log('====================');
  console.log('CLERK SYNC START');
  console.log('BODY ROLE:', body.role);
  console.log('FULL BODY:', body);
  console.log('SESSION EMAIL:', session.email);
  console.log('====================');

  const bootstrapRole = resolveBootstrapRole(session.email);

  let user = await User.findOne({
    clerk_id: session.clerkId,
  });

  // find by email if clerk_id missing
  if (!user) {
    const byEmail = await User.findOne({
      email: session.email,
    });

    if (byEmail) {

      // relink existing account
      if (
        byEmail.clerk_id &&
        byEmail.clerk_id !== session.clerkId
      ) {
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
            avatar_url:
              session.profileImage ||
              byEmail.avatar_url,
            email_verified: true,
          },
        },
        { new: true }
      );
    }
  }

  // determine requested role
  const requestedRole: UserRole =
    bootstrapRole ||
    (
      body.role === 'psychiatrist'
        ? 'psychiatrist'
        : 'user'
    );

  const isNewPsychiatrist =
    requestedRole === 'psychiatrist';

  console.log('REQUESTED ROLE:', requestedRole);

  // CREATE NEW USER
  if (!user) {

    const passwordHash =
      await ensureUnusedPassword();

    const verificationStatus =
      isNewPsychiatrist
        ? ('pending' as const)
        : undefined;

    const isApproved =
      computeIsApproved(
        requestedRole,
        verificationStatus
      );

    // validate psychiatrist fields
    if (isNewPsychiatrist) {

      if (
        !body.national_id ||
        !body.medical_license ||
        !body.specialization
      ) {
        throw new AppError(
          400,
          'Missing psychiatrist registration fields'
        );
      }

      const nationalId =
        body.national_id.trim();

      const license =
        body.medical_license.trim();

      const conflict =
        await User.findOne({
          $or: [
            { national_id: nationalId },
            { medical_license: license },
          ],
        }).lean();

      if (conflict) {
        throw new AppError(
          409,
          'National ID or medical license already exists'
        );
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

            national_id:
              body.national_id?.trim(),

            medical_license:
              body.medical_license?.trim(),

            specialization:
              body.specialization?.trim(),

            experience_years:
              body.experience_years ?? 0,

            hospital_or_clinic:
              body.hospital_or_clinic?.trim() ?? '',
          }
        : {}),
    });

    console.log('USER CREATED:', user.role);

    // create psychiatrist profile
    if (isNewPsychiatrist) {

      await PsychiatristProfile.create({
        user_id: user._id,

        specialization:
          body.specialization?.trim() ?? '',

        license_number:
          body.medical_license?.trim() ?? '',

        years_of_experience:
          body.experience_years ?? 0,

        hospital_or_clinic:
          body.hospital_or_clinic?.trim() ?? '',

        approval_status: 'pending',
      });

      console.log('PSYCHIATRIST PROFILE CREATED');
    }

  } else {

    // UPDATE EXISTING USER
    const updates: Record<string, unknown> = {
      full_name: session.fullName,
      avatar_url:
        session.profileImage ||
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
    else if (
      body.role === 'psychiatrist' &&
      user.role === 'user'
    ) {

      console.log('UPGRADING USER TO PSYCHIATRIST');

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

      const existingProfile =
        await PsychiatristProfile.findOne({
          user_id: user._id,
        });

      if (!existingProfile) {

        await PsychiatristProfile.create({
          user_id: user._id,

          specialization:
            body.specialization?.trim() ?? '',

          license_number:
            body.medical_license?.trim() ?? '',

          years_of_experience:
            body.experience_years ?? 0,

          hospital_or_clinic:
            body.hospital_or_clinic?.trim() ?? '',

          approval_status: 'pending',
        });

        console.log(
          'PSYCHIATRIST PROFILE CREATED FOR EXISTING USER'
        );
      }
    }

    user = await User.findByIdAndUpdate(
      user._id,
      { $set: updates },
      { new: true }
    );

    if (!user) {
      throw new AppError(
        500,
        'User sync failed'
      );
    }

    console.log('USER UPDATED:', user.role);
  }

  const auth =
    await issueAuthResponse(
      user._id.toString(),
      req
    );

  const profile =
    user.role === 'psychiatrist'
      ? await PsychiatristProfile.findOne({
          user_id: user._id,
        }).lean()
      : null;

  console.log('FINAL USER ROLE:', user.role);
  console.log('SYNC SUCCESS');
  console.log('====================');

  return {
    ...auth,

    user: {
      ...publicUser(user),

      psychiatrist_profile: profile
        ? {
            specialization:
              profile.specialization,

            license_number:
              profile.license_number,

            years_of_experience:
              profile.years_of_experience,

            hospital_or_clinic:
              profile.hospital_or_clinic,

            approval_status:
              profile.approval_status,

            admin_feedback:
              profile.admin_feedback,

            uploaded_documents:
              profile.uploaded_documents,
          }
        : null,
    },
  };
}