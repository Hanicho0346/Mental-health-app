import axios from "axios";
import { Platform } from "react-native";

import { resolveApiBaseUrl } from "@/lib/resolveApiUrl";

export type UploadSupportVideoPayload = {
  title: string;
  amharicTitle: string;
  tag: string;

  video: {
    uri: string;
    name?: string;
    type?: string;
  };

  /** Bearer token — pass Clerk's getToken() result from the calling component */
  token?: string;

  onProgress?: (progress: number) => void;
};

function uploadEndpoint(): string {
  const origin = resolveApiBaseUrl().replace(/\/+$/, "");
  return `${origin}/api/doctor/videos/upload`;
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
  const { title, amharicTitle, tag, video, token, onProgress } = payload;

  const formData = new FormData();
  formData.append("title", title.trim());
  formData.append("amharicTitle", amharicTitle.trim());
  formData.append("tag", tag.trim());
  formData.append("video", normalizeVideoFile(video) as any);

  if (__DEV__) {
    console.log("[UPLOAD] endpoint:", uploadEndpoint());
    console.log("[UPLOAD] file:", normalizeVideoFile(video));
    console.log("[UPLOAD] token present:", !!token);
  }

  try {
    const response = await axios.post(uploadEndpoint(), formData, {
      headers: {
        Accept: "application/json",
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 10 * 60 * 1000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (progressEvent) => {
        if (!progressEvent.total) return;
        onProgress?.(progressEvent.loaded / progressEvent.total);
      },
    });

    if (__DEV__) {
      console.log("[UPLOAD] status:", response.status);
      console.log("[UPLOAD] response:", response.data);
    }

    onProgress?.(1);
    return response.data;
  } catch (error: any) {
    console.error(
      "[UPLOAD ERROR FULL]:",
      error?.response?.data ?? error?.message ?? error,
    );

    if (error?.code === "ECONNABORTED") {
      throw new Error("Upload timed out. Please check your internet connection.");
    }

    if (error?.message?.includes("Network Error")) {
      throw new Error(
        "Cannot connect to server. Check your backend IP and internet connection.",
      );
    }

    throw new Error(
      error?.response?.data?.message ??
        error?.message ??
        "Something went wrong during upload.",
    );
  }
}
