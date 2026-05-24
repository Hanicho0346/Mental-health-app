import type { AuthUser } from '@/stores/authStore';

const APPROVED = 'approved';

export function isApprovedPsychiatrist(user: AuthUser | null | undefined): boolean {
  if (user?.role !== 'psychiatrist') return false;
  return user.is_approved === true || user.verification_status === APPROVED;
}

export function isPendingPsychiatrist(user: AuthUser | null | undefined): boolean {
  if (user?.role !== 'psychiatrist') return false;
  return !isApprovedPsychiatrist(user) && user.verification_status !== 'rejected';
}

export function isRejectedPsychiatrist(user: AuthUser | null | undefined): boolean {
  return user?.role === 'psychiatrist' && user.verification_status === 'rejected';
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin';
}
