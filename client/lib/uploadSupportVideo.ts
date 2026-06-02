import { api } from "@/lib/api";

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
  const { title, amharicTitle, tag, video, onProgress } = payload;

  // 1. Get a signed upload signature — use `api` so token refresh works automatically
  const { data: sig } = await api.get("/doctor/videos/sign");

  // 2. Upload directly to Cloudinary using plain axios (no auth needed, goes to Cloudinary not our server)
  const fileName =
    video.name && video.name.includes(".") ? video.name : `video-${Date.now()}.mp4`;

  // 2. Upload directly to Cloudinary using fetch (most compatible with React Native)
  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`;

  const formData = new FormData();
  formData.append("file", { uri: video.uri, name: fileName, type: video.type ?? "video/mp4" } as any);
  formData.append("api_key", sig.apiKey);
  formData.append("timestamp", String(sig.timestamp));
  formData.append("signature", sig.signature);
  formData.append("folder", sig.folder);

  const response = await fetch(cloudinaryUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.status.toString());
    throw new Error(`Cloudinary ${response.status}: ${errText}`);
  }

  const uploaded = await response.json() as { secure_url: string; public_id: string };
  onProgress?.(1);

  // 3. Save the Cloudinary URL — use `api` so token refresh works automatically
  const { data } = await api.post("/doctor/videos/save", {
    title,
    amharicTitle,
    tag,
    videoUrl: uploaded.secure_url,
    publicId: uploaded.public_id,
  });

  return data;
}
