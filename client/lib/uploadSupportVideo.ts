import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { resolveApiBaseUrl } from "@/lib/resolveApiUrl";
import { useAuthStore } from "@/stores/authStore";

export type UploadSupportVideoPayload = {
  title: string;
  amharicTitle: string;
  tag: string;

  video: {
    uri: string;
    name?: string;
    type?: string;
  };

  onProgress?: (progress: number) => void;
};

function uploadEndpoint(): string {
  const origin = resolveApiBaseUrl().replace(/\/+$/, "");

  return `${origin}/api/doctor/videos/upload`;
}

async function resolveAccessToken(): Promise<string | undefined> {
  const storeToken = useAuthStore.getState().accessToken;

  if (storeToken) {
    return storeToken;
  }

  const asyncToken = await AsyncStorage.getItem("token");

  return asyncToken ?? undefined;
}

function normalizeVideoFile(video: UploadSupportVideoPayload["video"]) {
  const safeName =
    video.name && video.name.includes(".")
      ? video.name
      : `video-${Date.now()}.mp4`;

  return {
    uri:
      Platform.OS === "ios"
        ? video.uri.replace("file://", "")
        : video.uri,

    name: safeName,

    type: video.type ?? "video/mp4",
  };
}

export async function uploadSupportVideo(
  payload: UploadSupportVideoPayload,
): Promise<{ message?: string; video?: unknown }> {
  const { title, amharicTitle, tag, video, onProgress } = payload;

  const formData = new FormData();

  formData.append("title", title.trim());
  formData.append("amharicTitle", amharicTitle.trim());
  formData.append("tag", tag.trim());

  formData.append(
    "video",
    normalizeVideoFile(video) as any,
  );

  const token = await resolveAccessToken();

  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10 * 60 * 1000);

  try {
    if (__DEV__) {
      console.log("[UPLOAD] endpoint:", uploadEndpoint());
      console.log("[UPLOAD] file:", normalizeVideoFile(video));
    }

    const response = await fetch(uploadEndpoint(), {
      method: "POST",

      headers: {
        Accept: "application/json",

        ...(token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {}),
      },

      body: formData,

      signal: controller.signal,
    });

    const rawText = await response.text();

    let data: any = {};

    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {
        raw: rawText,
      };
    }

    if (__DEV__) {
      console.log("[UPLOAD] status:", response.status);
      console.log("[UPLOAD] response:", data);
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
          data?.error ||
          `Upload failed (${response.status})`,
      );
    }

    onProgress?.(1);

    return data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          "Upload timed out. Please check your internet connection.",
        );
      }

      console.error("[UPLOAD ERROR]:", error.message);

      throw error;
    }

    console.error("[UPLOAD ERROR]:", error);

    throw new Error("Something went wrong during upload.");
  } finally {
    clearTimeout(timeoutId);
  }
}