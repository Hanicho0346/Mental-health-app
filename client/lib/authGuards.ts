import type { AuthUser } from '@/stores/authStore';

const APPROVED = 'approved';

export function isApprovedPsychiatrist(user: AuthUser | null | undefined): boolean {
  return user?.role === 'psychiatrist' && user.verification_status === APPROVED;
}

export function isAdmin(user: AuthUser | null | undefined): boolean {
  return user?.role === 'admin';
}
