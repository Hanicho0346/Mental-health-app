import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { resolveApiBaseUrl } from '@/lib/resolveApiUrl';
import { useAuthStore } from '@/stores/authStore';

export type UploadSupportVideoPayload = {
  title: string;
  amharicTitle: string;
  tag: string;

  video: {
    uri: string;
    name: string;
    type: string;
  };

  onProgress?: (progress: number) => void;
};

type RnMultipartPayload = {
  uri: string;
  name: string;
  type: string;
};

function uploadEndpoint(): string {
  const origin = resolveApiBaseUrl().replace(/\/+$/, '');
  return `${origin}/api/doctor/videos/upload`;
}

async function resolveAccessToken(): Promise<string | undefined> {
  const fromStore = useAuthStore.getState().accessToken;
  if (fromStore) return fromStore;
  const token = await AsyncStorage.getItem('token');
  return token ?? undefined;
}

/**
 * Primary upload strategy — uses the React Native FormData + fetch multipart trick.
 * Does NOT go through Axios/api.ts so it won't trigger the api response interceptor.
 */
export async function uploadWithFetch(
  payload: UploadSupportVideoPayload,
): Promise<{ message?: string; video?: unknown }> {
  const { title, amharicTitle, tag, video } = payload;

  const formData = new FormData();

  formData.append('title', title);
  formData.append('amharicTitle', amharicTitle);
  formData.append('tag', tag);

  // React Native accepts this object shape as a file part in FormData
  const filePart: RnMultipartPayload = {
    uri: video.uri,
    name:
      video.name.includes('.')
        ? video.name
        : `${video.name || 'recording'}.mp4`,
    type: video.type || 'video/mp4',
  };
  formData.append('video', filePart as unknown as Blob);

  const token = await resolveAccessToken();

  const controller = new AbortController();
  // 10-minute timeout for large video files
  const timeoutId = setTimeout(() => controller.abort(), 600_000);

  if (__DEV__) {
    console.info('[PsychUpload] fetch() upload →', uploadEndpoint());
    console.info('[PsychUpload] file uri:', video.uri);
    console.info('[PsychUpload] token present:', !!token);
  }

  try {
    const response = await fetch(uploadEndpoint(), {
      method: 'POST',
      headers: {
        // ⚠️  Do NOT set Content-Type here — fetch sets it automatically
        // with the correct multipart boundary when body is FormData.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
      },
      body: formData,
      signal: controller.signal,
    });

    const text = await response.text();
    if (__DEV__) {
      console.info('[PsychUpload] HTTP status:', response.status);
      console.info('[PsychUpload] raw body:', text.slice(0, 300));
    }

    let body: Record<string, unknown> = {};
    if (text) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        body = { rawText: text };
      }
    }

    if (!response.ok) {
      const msg =
        (typeof body.message === 'string' && body.message) ||
        (typeof body.error === 'string' && body.error) ||
        `Upload failed (HTTP ${response.status})`;
      throw new Error(msg);
    }

    return body as { message?: string; video?: unknown };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Upload timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Main export. Uses fetch() directly — no Axios, no native FileSystem.uploadAsync.
 *
 * Why skip FileSystem.uploadAsync?
 *   - It fails in Expo Go with ERR_NETWORK on many Android builds.
 *   - The RN FormData + fetch approach is equally reliable and simpler.
 *   - It avoids the Axios interceptor logging spurious api.response.errors.
 */
export async function uploadSupportVideo(
  payload: UploadSupportVideoPayload,
): Promise<{ message?: string; video?: unknown }> {
  if (__DEV__) {
    console.info('[PsychUpload] starting upload via fetch() →', uploadEndpoint());
  }

  // Web and native both use the same fetch path — it works everywhere.
  return uploadWithFetch(payload);
}