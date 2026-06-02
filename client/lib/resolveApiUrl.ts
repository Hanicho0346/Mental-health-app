import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 4000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** If env is `http://host:5000/api`, normalize to origin so axios `baseURL` + `/api` is not doubled. */
function stripTrailingApiPath(url: string): string {
  return stripTrailingSlash(url).replace(/\/api$/i, '');
}

function parsePortFromOptionalUrl(url?: string): number | null {
  if (!url?.trim()) return null;
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    const port = new URL(normalized).port;
    return port ? parseInt(port, 10) : null;
  } catch {
    return null;
  }
}

/** True when EXPO_PUBLIC_API_URL targets a typical LAN/dev host (safe to replace host with Metro LAN IP). */
function isLikelyLocalDevApiUrl(url: string): boolean {
  try {
    const origin = stripTrailingApiPath(url);
    const normalized = /^https?:\/\//i.test(origin) ? origin : `http://${origin}`;
    const { hostname } = new URL(normalized);
    const h = hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '10.0.2.2') return true;
    if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
    return /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h);
  } catch {
    return false;
  }
}

/** LAN hostname from Metro (same machine as the API in typical dev). */
function packagerLanHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri !== 'string' || hostUri.length === 0) return null;
  const host = hostUri.split(':')[0]?.trim();
  if (!host) return null;
  const isTunnelOrCloud =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.includes('exp.direct') ||
    host.endsWith('.exp.host') ||
    host.includes('expo.dev');
  if (isTunnelOrCloud) return null;
  return host;
}

/**
 * When EXPO_PUBLIC_API_URL is unset, pick a URL that can reach the machine running Metro + the API.
 * If the env value ends with `/api`, it is stripped — the Axios client already uses `baseURL` + `/api`.
 * - In __DEV__ on native, prefer the packager LAN host over a stale EXPO_PUBLIC_API_URL IP (fixes ERR_NETWORK).
 * - Android emulator: host loopback is not the PC; use 10.0.2.2.
 * - iOS simulator: 127.0.0.1 reaches the Mac.
 */
export function resolveApiBaseUrl(): string {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.API_BASE_URL?.trim() ||
    (typeof Constants.expoConfig?.extra === 'object' && typeof (Constants.expoConfig?.extra as any).EXPO_PUBLIC_API_URL === 'string'
      ? (Constants.expoConfig?.extra as any).EXPO_PUBLIC_API_URL.trim()
      : '') ||
    (typeof Constants.expoConfig?.extra === 'object' && typeof (Constants.expoConfig?.extra as any).API_BASE_URL === 'string'
      ? (Constants.expoConfig?.extra as any).API_BASE_URL.trim()
      : '') ||
    (typeof Constants.manifest?.extra === 'object' && typeof (Constants.manifest?.extra as any).EXPO_PUBLIC_API_URL === 'string'
      ? (Constants.manifest?.extra as any).EXPO_PUBLIC_API_URL.trim()
      : '') ||
    (typeof Constants.manifest?.extra === 'object' && typeof (Constants.manifest?.extra as any).API_BASE_URL === 'string'
      ? (Constants.manifest?.extra as any).API_BASE_URL.trim()
      : '');
  const envOrigin = fromEnv ? stripTrailingApiPath(fromEnv) : null;
  const portFromEnv = parsePortFromOptionalUrl(fromEnv) ?? API_PORT;

  const lanHost = packagerLanHost();
  if (
    __DEV__ &&
    Platform.OS !== 'web' &&
    lanHost &&
    (!fromEnv || isLikelyLocalDevApiUrl(fromEnv))
  ) {
    return `http://${lanHost}:${portFromEnv}`;
  }

  if (envOrigin) {
    return envOrigin;
  }

  if (typeof Constants.expoConfig?.hostUri === 'string' && Constants.expoConfig.hostUri.length > 0) {
    const host = Constants.expoConfig.hostUri.split(':')[0]?.trim();
    const isTunnelOrCloud =
      !host ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.includes('exp.direct') ||
      host.endsWith('.exp.host') ||
      host.includes('expo.dev');
    if (!isTunnelOrCloud) {
      return `http://${host}:${API_PORT}`;
    }
  }

  if (__DEV__) {
    console.warn(
      '[API] Set EXPO_PUBLIC_API_URL or API_BASE_URL in client/.env if register/login fails (e.g. http://YOUR_LAN_IP:4000). ' +
        'Use the same machine IP shown by `npx expo start` (LAN). Android emulator uses 10.0.2.2 when host is not usable.'
    );
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://127.0.0.1:${API_PORT}`;
}
