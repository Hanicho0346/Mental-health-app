import AsyncStorage from '@react-native-async-storage/async-storage';
import { logClientError } from '@/lib/log';
import { resolveApiBaseUrl } from '@/lib/resolveApiUrl';
import { pickAuthUser, useAuthStore, type AuthUser } from '@/stores/authStore';

const API_BASE = resolveApiBaseUrl();

export type ClerkSyncPayload = {
  role?: 'user' | 'psychiatrist';
  national_id?: string;
  medical_license?: string;
  specialization?: string;
  experience_years?: number;
  hospital_or_clinic?: string;
};

export type ClerkSyncResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export async function syncClerkWithBackend(
  clerkSessionToken: string,
  payload?: ClerkSyncPayload
): Promise<ClerkSyncResult> {
  if (!clerkSessionToken?.trim()) {
    throw new Error('Missing Clerk session token for backend sync.');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/auth/clerk/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${clerkSessionToken}`,
      },
      body: JSON.stringify(payload ?? {}),
    });
  } catch (err) {
    logClientError('clerk.sync', err, { apiBase: API_BASE });
    throw new Error(
      `Cannot reach the server at ${API_BASE}. Start the API (port 4000), check your Wi‑Fi, and set EXPO_PUBLIC_API_URL in client/.env if needed.`
    );
  }

  let data: unknown = {};
  let rawBody = '';

  try {
    data = await res.json();
  } catch {
    rawBody = await res.text().catch(() => '');
  }

  if (!res.ok) {
    const msg =
      typeof data === 'object' && data !== null
        ? ((typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error?: unknown }).error as string
            : undefined) ??
          (typeof (data as { detail?: unknown }).detail === 'string'
            ? (data as { detail?: unknown }).detail as string
            : undefined) ??
          rawBody) || `Could not sync account with server (HTTP ${res.status})`
        : rawBody || `Could not sync account with server (HTTP ${res.status})`;
    const detail =
      typeof data === 'object' && data !== null
        ? (data as { detail?: unknown }).detail
        : undefined;
    logClientError('clerk.sync', new Error(msg), {
      status: res.status,
      apiBase: API_BASE,
      rawBody,
      detail,
    });
    throw new Error(detail ? `${msg} (${String(detail)})` : msg);
  }

  const typedData = data as Record<string, unknown>;
  const user = pickAuthUser(typedData.user as Record<string, unknown>);
  const accessToken = String(typedData.accessToken ?? typedData.token ?? '');
  const refreshToken = String(typedData.refreshToken ?? '');

  useAuthStore.getState().setSession({ accessToken, refreshToken, user });
  await AsyncStorage.multiSet([
    ['token', accessToken],
    ['refreshToken', refreshToken],
  ]);

  return { accessToken, refreshToken, user };
}
