import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

let configured = false;

export function configureCloudinary(): void {
  const { cloudName, apiKey, apiSecret } = env.cloudinary;
  if (cloudName && apiKey && apiSecret) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    configured = true;
  }
}

export function isCloudinaryConfigured(): boolean {
  return configured;
}

export async function uploadBuffer(
  buffer: Buffer,
  folder: string,
  options?: { publicId?: string; resourceType?: 'image' | 'video' | 'raw' }
): Promise<{ url: string; public_id: string }> {
  if (!configured) {
    throw new Error('Cloudinary is not configured');
  }
  const upload = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: options?.publicId,
        resource_type: options?.resourceType ?? 'auto',
      },
      (err, result) => {
        if (err || !result) reject(err ?? new Error('Upload failed'));
        else resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
  return { url: upload.secure_url, public_id: upload.public_id };
}
