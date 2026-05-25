"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCloudinary = configureCloudinary;
exports.isCloudinaryConfigured = isCloudinaryConfigured;
exports.uploadBuffer = uploadBuffer;
const cloudinary_1 = require("cloudinary");
const env_js_1 = require("../config/env.js");
let configured = false;
function configureCloudinary() {
    const { cloudName, apiKey, apiSecret } = env_js_1.env.cloudinary;
    if (cloudName && apiKey && apiSecret) {
        cloudinary_1.v2.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
        configured = true;
    }
}
function isCloudinaryConfigured() {
    return configured;
}
async function uploadBuffer(buffer, folder, options) {
    if (!configured) {
        throw new Error('Cloudinary is not configured');
    }
    const upload = await new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({
            folder,
            public_id: options?.publicId,
            resource_type: options?.resourceType ?? 'auto',
        }, (err, result) => {
            if (err || !result)
                reject(err ?? new Error('Upload failed'));
            else
                resolve({ secure_url: result.secure_url, public_id: result.public_id });
        });
        stream.end(buffer);
    });
    return { url: upload.secure_url, public_id: upload.public_id };
}
