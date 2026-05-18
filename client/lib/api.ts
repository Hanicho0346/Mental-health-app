import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logClientError, logClientInfo } from '@/lib/log';
import { resolveApiBaseUrl } from '@/lib/resolveApiUrl';
import { pickAuthUser, useAuthStore } from '@/stores/authStore';

/** Base origin (scheme + host + port), no `/api` suffix. `api` client uses `baseURL: origin + '/api'`. */
export const API_URL = resolveApiBaseUrl();

if (__DEV__) {
  console.log(
    '[API] EXPO_PUBLIC_API_URL →',
    process.env.EXPO_PUBLIC_API_URL?.trim() ? process.env.EXPO_PUBLIC_API_URL : '(not set, using inferred)',
    '\n[API] Using base URL:',
    API_URL
  );
}

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30_000,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

const bareAuth = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30_000,
  headers: {
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
  },
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await bareAuth.post<{
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
    }>('/auth/refresh', { refreshToken });
    useAuthStore.getState().setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: pickAuthUser(data.user as Record<string, unknown>),
    });
   await AsyncStorage.multiSet([
  ['token', data.accessToken],
  ['refreshToken', data.refreshToken],
]);
    return data.accessToken;
  } catch (e) {
    logClientError('api.refreshAccessToken', e);
    await useAuthStore.getState().clearSession();
    return null;
  }
}

api.interceptors.request.use(async (config) => {
  const token = useAuthStore.getState().accessToken ?? (await AsyncStorage.getItem('token'));
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (__DEV__) {
    logClientInfo('api.request', {
      method: (config.method ?? 'get').toUpperCase(),
      url: `${config.baseURL ?? ''}${config.url ?? ''}`,
    });
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    if (__DEV__) {
      logClientInfo('api.response', {
        status: res.status,
        url: `${res.config.baseURL ?? ''}${res.config.url ?? ''}`,
      });
    }
    return res;
  },
  async (err) => {
    const original = err.config as typeof err.config & { _retry?: boolean };
    if (!original || original._retry) {
      logClientError('api.response.error', err);
      return Promise.reject(err);
    }
    const url = String(original.url ?? '');
    if (err.response?.status === 401 && useAuthStore.getState().refreshToken && !url.includes('/auth/refresh')) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const nextToken = await refreshPromise;
      if (nextToken) {
        original.headers.Authorization = `Bearer ${nextToken}`;
        return api(original);
      }
    }
    logClientError('api.response.error', err);
    return Promise.reject(err);
  }
);
