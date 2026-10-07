import { api } from "@/lib/api";

export type UploadSupportVideoPayload = {
  title: string;
  amharicTitle: string;
  tag: string;
  video: { uri: string; name?: string; type?: string };
  token?: string;
  onProgress?: (progress: number) => void;
};

export async function uploadSupportVideo(
  payload: UploadSupportVideoPayload,
): Promise<{ message?: string; video?: unknown }> {
  const { title, amharicTitle, tag, video, onProgress } = payload;

  // 1. Get a signed upload signature
  const { data: sig } = await api.get("/doctor/videos/sign");

  const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${sig.cloudName}/video/upload`;

  // 2. Fetch the local file as a Blob, then upload via XHR — works in both Expo Go and native builds
  const fileBlob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", video.uri);
    xhr.responseType = "blob";
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error("Failed to read local video file"));
    xhr.send();
  });

  const formData = new FormData();
  formData.append("file", fileBlob, video.name ?? `video-${Date.now()}.mp4`);
  formData.append("api_key", String(sig.apiKey));
  formData.append("timestamp", String(sig.timestamp));
  formData.append("signature", String(sig.signature));
  formData.append("folder", String(sig.folder));

  const uploadedData = await new Promise<{ secure_url: string; public_id: string }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", cloudinaryUrl);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); }
          catch { reject(new Error("Cloudinary response parse error")); }
        } else {
          reject(new Error(`Cloudinary ${xhr.status}: ${xhr.responseText}`));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during Cloudinary upload"));
      xhr.timeout = 120_000;
      xhr.ontimeout = () => reject(new Error("Cloudinary upload timed out"));
      xhr.send(formData);
    }
  );

  onProgress?.(1);

  // 3. Save the Cloudinary URL to our server
  const { data } = await api.post("/doctor/videos/save", {
    title,
    amharicTitle,
    tag,
    videoUrl: uploadedData.secure_url,
    publicId: uploadedData.public_id,
  });

  return data;
}
