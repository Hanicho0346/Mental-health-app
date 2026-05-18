import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type AuthUser = {
  id: string;
  full_name: string;
  email: string;
  national_id: string;
  avatar_url: string;
  mood_status: string;
  createdAt?: string;
  role?: string;
  email_verified?: boolean;
  verification_status?: string | null;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (p: { accessToken: string; refreshToken: string; user?: AuthUser | null }) => void;
  clearSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken ?? '',
          user: user === undefined ? state.user : user,
        })),
      clearSession: async () => {
        set({ accessToken: null, refreshToken: null, user: null });
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('refresh_token');
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
    }
  )
);

export function pickAuthUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id ?? ''),
    full_name: String(raw.full_name ?? ''),
    email: String(raw.email ?? ''),
    national_id: String(raw.national_id ?? ''),
    avatar_url: String(raw.avatar_url ?? ''),
    mood_status: String(raw.mood_status ?? ''),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : undefined,
    role: raw.role != null ? String(raw.role) : undefined,
    email_verified: typeof raw.email_verified === 'boolean' ? raw.email_verified : undefined,
    verification_status:
      raw.verification_status === null || raw.verification_status === undefined
        ? null
        : String(raw.verification_status),
  };
}
