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
  is_premier?: boolean;
  subscription_tier?: string;
};

type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isPremier: boolean;
  setIsPremier: (val: boolean) => void;
  setSession: (p: { accessToken: string; refreshToken: string; user?: AuthUser | null }) => void;
  clearSession: () => Promise<void>;
};

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function parseJwtPayload(token: string): { exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
    if (typeof atob === 'function') {
      return JSON.parse(atob(padded));
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = '';
    for (let i = 0; i < padded.length; i += 4) {
      const enc1 = chars.indexOf(padded.charAt(i));
      const enc2 = chars.indexOf(padded.charAt(i + 1));
      const enc3 = chars.indexOf(padded.charAt(i + 2));
      const enc4 = chars.indexOf(padded.charAt(i + 3));
      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;
      str += String.fromCharCode(chr1);
      if (enc3 !== 64) str += String.fromCharCode(chr2);
      if (enc4 !== 64) str += String.fromCharCode(chr3);
    }
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function scheduleTokenRefresh(token: string) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  try {
    const payload = parseJwtPayload(token);
    if (!payload?.exp) return;
    const msUntilExpiry = payload.exp * 1000 - Date.now();
    // Only schedule if expiry is more than 60s in the future; trigger 60s before expiry
    const refreshAt = msUntilExpiry - 60_000;
    if (refreshAt > 30_000) {
      refreshTimer = setTimeout(() => {
        import('@/lib/api').then(({ refreshAccessToken }) => {
          void refreshAccessToken();
        });
      }, refreshAt);
    }
  } catch {}
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isPremier: false,
      setIsPremier: (val) => set({ isPremier: val }),
      setSession: ({ accessToken, refreshToken, user }) => {
        set((state) => {
          const nextUser = user === undefined ? state.user : user;
          return {
            accessToken,
            refreshToken: refreshToken ?? state.refreshToken ?? '',
            user: nextUser,
            isPremier: nextUser?.is_premier ?? state.isPremier,
          };
        });
        if (accessToken) {
          scheduleTokenRefresh(accessToken);
          void AsyncStorage.multiSet([
            ['token', accessToken],
            ['refreshToken', refreshToken ?? ''],
          ]).catch(() => {});
        }
      },

      clearSession: async () => {
        if (refreshTimer) {
          clearTimeout(refreshTimer);
          refreshTimer = null;
        }
        set({ accessToken: null, refreshToken: null, user: null, isPremier: false });
        await AsyncStorage.multiRemove(['token', 'refreshToken']);
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
        isPremier: s.isPremier,
      }),
    }
  )
);

export function pickAuthUser(raw: Record<string, unknown>): AuthUser {
  return {
    id: String(raw.id ?? raw._id ?? ''),
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
    is_premier: typeof raw.is_premier === 'boolean' ? raw.is_premier : undefined,
    subscription_tier: raw.subscription_tier != null ? String(raw.subscription_tier) : undefined,
  };
}