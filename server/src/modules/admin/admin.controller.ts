import type { RequestHandler } from 'express';
import { z } from 'zod';
import { User } from '../../models/User.js';
import { PsychiatristProfile } from '../../models/PsychiatristProfile.js';
import {
  listPendingPsychiatristsForAdmin,
  reviewPsychiatrist,
} from '../psychiatrist/psychiatrist.service.js';

const reviewSchema = z.object({
  feedback: z.string().max(1000).optional(),
});

// ── existing (unchanged) ───────────────────────────────────────────────────────

export const listPendingPsychiatrists: RequestHandler = async (_req, res, next) => {
  try {
    const rows = await listPendingPsychiatristsForAdmin();
    res.json({ pending: rows });
  } catch (err) { next(err); }
};

export const approvePsychiatrist: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { feedback } = reviewSchema.parse(req.body);
    const result = await reviewPsychiatrist(req.userId, req.params.id!, 'approved', feedback);
    res.json(result);
  } catch (err) { next(err); }
};

export const rejectPsychiatrist: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { feedback } = reviewSchema.parse(req.body);
    if (!feedback?.trim()) {
      res.status(400).json({ error: 'Feedback is required when rejecting' });
      return;
    }
    const result = await reviewPsychiatrist(req.userId, req.params.id!, 'rejected', feedback);
    res.json(result);
  } catch (err) { next(err); }
};

// ── new ────────────────────────────────────────────────────────────────────────

export const listApprovedPsychiatrists: RequestHandler = async (_req, res, next) => {
  try {
    const profiles = await PsychiatristProfile.find({ approval_status: 'approved' })
      .sort({ reviewed_at: -1 })
      .limit(100)
      .lean();

    const userIds = profiles.map((p) => p.user_id);
    const users = await User.find({ _id: { $in: userIds }, role: 'psychiatrist' })
      .select('full_name email avatar_url verification_status')
      .lean();

    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    const approved = profiles
      .map((p) => {
        const u = userMap.get(p.user_id.toString());
        if (!u) return null;
        return {
          id: u._id.toString(),
          full_name: u.full_name,
          email: u.email,
          status: 'approved' as const,
          profile: {
            specialization: p.specialization,
            license_number: p.license_number,
            years_of_experience: p.years_of_experience,
          },
        };
      })
      .filter(Boolean);

    res.json({ approved });
  } catch (err) { next(err); }
};

export const getAdminStats: RequestHandler = async (_req, res, next) => {
  try {
    const [total_users, total_psychiatrists, pending_count] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      // approved psychiatrists — matches your reviewPsychiatrist() which sets is_approved
      User.countDocuments({ role: 'psychiatrist', is_approved: true }),
      // pending — matches listPendingPsychiatristsForAdmin() which queries PsychiatristProfile
      PsychiatristProfile.countDocuments({ approval_status: 'pending' }),
    ]);
    res.json({ total_users, total_psychiatrists, pending_count });
  } catch (err) { next(err); }
};

export const listAllUsers: RequestHandler = async (_req, res, next) => {
  try {
    const users = await User.find({ role: { $in: ['user', 'psychiatrist'] } })
      .select('full_name email role is_approved verification_status createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        created_at: u.createdAt,
        is_active: true,
      })),
    });
  } catch (err) { next(err); }
};
export const listAllPsychiatrists: RequestHandler = async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'psychiatrist' })
      .select('full_name email avatar_url verification_status is_approved admin_feedback specialization medical_license experience_years hospital_or_clinic createdAt is_suspended')
      .sort({ createdAt: -1 })
      .lean();

    const userIds = users.map((u) => u._id);
    const profiles = await PsychiatristProfile.find({ user_id: { $in: userIds } }).lean();
    const profileMap = new Map(profiles.map((p) => [p.user_id.toString(), p]));

    const psychiatrists = users.map((u) => {
      const p = profileMap.get(u._id.toString());
      return {
        id: u._id.toString(),
        full_name: u.full_name,
        email: u.email,
        avatar_url: u.avatar_url ?? '',
        verification_status: (u as any).verification_status ?? p?.approval_status ?? 'pending',
        is_approved: u.is_approved ?? false,
        admin_feedback: u.admin_feedback ?? '',
        createdAt: (u as any).createdAt,
        profile: {
          specialization:      p?.specialization      ?? (u as any).specialization   ?? '',
          license_number:      p?.license_number      ?? (u as any).medical_license  ?? '',
          years_of_experience: p?.years_of_experience ?? (u as any).experience_years ?? 0,
          hospital_or_clinic:  p?.hospital_or_clinic  ?? (u as any).hospital_or_clinic ?? '',
          uploaded_documents:  p?.uploaded_documents  ?? [],
        },
      };
    });

    res.json({ psychiatrists });
  } catch (err) { next(err); }
};

export const getWallet: RequestHandler = async (_req, res, next) => {
  try {
    // Stub until you add a Wallet/Transaction model
    res.json({ balance: 0, transactions: [] });
  } catch (err) { next(err); }
};