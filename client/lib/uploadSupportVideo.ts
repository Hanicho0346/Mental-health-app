import axios from "axios";
import { resolveApiBaseUrl } from "@/lib/resolveApiUrl";
import { getStoredAuthToken } from "@/lib/auth";

export type UploadSupportVideoPayload = {
  title: string;
  amharicTitle: string;
  tag: string;
  video: { uri: string; name?: string; type?: string };
  token?: string;
  onProgress?: (progress: number) => void;
};

function apiBase(): string {
  return resolveApiBaseUrl().replace(/\/+$/, "");
}

export async function uploadSupportVideo(
  payload: UploadSupportVideoPayload,
): Promise<{ message?: string; video?: unknown }> {
  const { title, amharicTitle, tag, video, token, onProgress } = payload;

  const authToken = token ?? (await getStoredAuthToken());
  const authHeaders = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  // 1. Get a signed upload signature from our server
  const { data: sig } = await axios.get(`${apiBase()}/api/doctor/videos/sign`, {
    headers: authHeaders,
  });

  // 2. Upload directly to Cloudinary
  const fileName =
    video.name && video.name.includes(".") ? video.name : `video-${Date.now()}.mp4`;

  const formData = new FormData();
  formData.append("file", { uri: video.uri, name: fileName, type: video.type ?? "video/mp4" } as any);
  formData.append("api_key", sig.apiKey);
  formData.append("timestamp", String(sig.timestamp));
  formData.append("signature", sig.signature);
  formData.append("folder", sig.folder);
  formData.append("eager", "");

  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`;

  const { data: uploaded } = await axios.post(cloudinaryUrl, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 10 * 60 * 1000,
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.min((e.loaded / e.total) * 0.95, 0.95));
    },
  });

  onProgress?.(1);

  // 3. Save the Cloudinary URL to our server
  const { data } = await axios.post(
    `${apiBase()}/api/doctor/videos/save`,
    {
      title,
      amharicTitle,
      tag,
      videoUrl: uploaded.secure_url,
      publicId: uploaded.public_id,
    },
    { headers: { ...authHeaders, "Content-Type": "application/json" } },
  );

  return data;
}
