import type { AuthUser } from '@/stores/authStore';

export type AppRoute =
  | '/(tabs)/(user-tabs)/home'
  | '/(tabs)/(psychiatrist-tabs)/dashboard'
  | '/psychiatrist-pending'
  | '/psychiatrist-rejected'
  | '/(admin)';

export function resolvePostAuthRoute(
  user: AuthUser | null | undefined
): AppRoute {
  // fallback
  if (!user) {
    return '/(tabs)/(user-tabs)/home';
  }

  // admin
  if (user.role === 'admin') {
    return '/(admin)';
  }

  // psychiatrist
  if (user.role === 'psychiatrist') {
    if (user.verification_status === 'rejected') {
      return '/psychiatrist-rejected';
    }
    if (!user.is_approved && user.verification_status !== 'approved') {
      return '/psychiatrist-pending';
    }
    return '/(tabs)/(psychiatrist-tabs)/dashboard';
  }

  // normal user
  return '/(tabs)/(user-tabs)/home';
}