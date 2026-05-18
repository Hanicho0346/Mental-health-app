import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';
import { resolveApiBaseUrl } from '@/lib/resolveApiUrl';

export const TOKEN_KEY = 'token';

const apiOrigin = resolveApiBaseUrl();

export async function getAuthToken(): Promise<string | null> {
  const fromStore = useAuthStore.getState().accessToken;
  if (fromStore) return fromStore;
  return AsyncStorage.getItem(TOKEN_KEY);
}

/** @deprecated Prefer `useAuthStore.getState().setSession` after login. */
export async function setAuthToken(token: string): Promise<void> {
  useAuthStore.getState().setSession({ accessToken: token, refreshToken: '' });
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  const rt = useAuthStore.getState().refreshToken;
  try {
    if (rt) {
      await axios.post(`${apiOrigin}/api/auth/logout`, { refreshToken: rt }, { timeout: 15_000 });
    }
  } catch {
    /* best-effort */
  }
  await useAuthStore.getState().clearSession();
}
