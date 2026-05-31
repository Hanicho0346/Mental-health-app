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
  is_approved?: boolean;
  admin_feedback?: string;
  hospital_or_clinic?: string;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isPremier: boolean;                          // ← NEW
  setIsPremier: (val: boolean) => void;        // ← NEW
  setSession: (p: { accessToken: string; refreshToken: string; user?: AuthUser | null }) => void;
  clearSession: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isPremier: false,                                      // ← NEW
      setIsPremier: (val) => set({ isPremier: val }),        // ← NEW
      setSession: ({ accessToken, refreshToken, user }) =>
        set((state) => ({
          accessToken,
          refreshToken: refreshToken ?? state.refreshToken ?? '',
          user: user === undefined ? state.user : user,
        })),
      clearSession: async () => {
        set({ accessToken: null, refreshToken: null, user: null, isPremier: false }); // ← reset on logout
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('refreshToken');
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        isPremier: s.isPremier,   // ← persist so tab survives app restarts
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
    is_approved: typeof raw.is_approved === 'boolean' ? raw.is_approved : undefined,
    admin_feedback: raw.admin_feedback != null ? String(raw.admin_feedback) : undefined,
    hospital_or_clinic:
      raw.hospital_or_clinic != null ? String(raw.hospital_or_clinic) : undefined,
  };
}