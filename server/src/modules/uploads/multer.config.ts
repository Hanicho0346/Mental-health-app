import multer from 'multer';

const MAX_BYTES = 50 * 1024 * 1024;

export const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5 },
});
