import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
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

function normalizeVideoFile(
  video: UploadSupportVideoPayload["video"],
) {
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
  const {
    title,
    amharicTitle,
    tag,
    video,
    onProgress,
  } = payload;

  const formData = new FormData();

  formData.append("title", title.trim());
  formData.append(
    "amharicTitle",
    amharicTitle.trim(),
  );
  formData.append("tag", tag.trim());

  formData.append(
    "video",
    normalizeVideoFile(video) as any,
  );

  const token = await resolveAccessToken();

  try {
    if (__DEV__) {
      console.log(
        "[UPLOAD] endpoint:",
        uploadEndpoint(),
      );

      console.log(
        "[UPLOAD] file:",
        normalizeVideoFile(video),
      );
    }

    const response = await axios.post(
      uploadEndpoint(),
      formData,
      {
        headers: {
          Accept: "application/json",
          "Content-Type":
            "multipart/form-data",

          ...(token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {}),
        },

        timeout: 10 * 60 * 1000,

        maxBodyLength: Infinity,
        maxContentLength: Infinity,

        onUploadProgress: (
          progressEvent,
        ) => {
          if (!progressEvent.total) return;

          const progress =
            progressEvent.loaded /
            progressEvent.total;

          onProgress?.(progress);
        },
      },
    );

    const data = response.data;

    if (__DEV__) {
      console.log(
        "[UPLOAD] status:",
        response.status,
      );

      console.log(
        "[UPLOAD] response:",
        data,
      );
    }

    onProgress?.(1);

    return data;
  } catch (error: any) {
    console.error(
      "[UPLOAD ERROR FULL]:",
      error?.response?.data ||
        error?.message ||
        error,
    );

    if (error?.code === "ECONNABORTED") {
      throw new Error(
        "Upload timed out. Please check your internet connection.",
      );
    }

    if (
      error?.message?.includes(
        "Network Error",
      )
    ) {
      throw new Error(
        "Cannot connect to server. Check your backend IP and internet connection.",
      );
    }

    throw new Error(
      error?.response?.data?.message ||
        error?.message ||
        "Something went wrong during upload.",
    );
  }
}