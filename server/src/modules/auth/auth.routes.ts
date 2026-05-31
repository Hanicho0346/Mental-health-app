import { Router } from 'express';
import {
  forgotPassword,
  login,
  logout,
  refresh,
  register,
  resendVerification,
  resetPassword,
  verifyEmail,
  updatePushToken,
  uploadCertificate
} from './auth.controller.js';
import { authRateLimiter } from '../../middleware/rateLimit.js';
import { validateBody } from '../../middleware/validateRequest.js';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resendEmailSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../../validators/auth.schemas.js';
import { requireAuth } from '../../middleware/authenticate.js';
import multer from 'multer';
const router = Router();

const authLimiter = authRateLimiter();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});
router.post('/register', authLimiter, validateBody(registerSchema), register);
router.post('/login', authLimiter, validateBody(loginSchema), login);
// authRoutes.ts
router.patch('/push-token', requireAuth, updatePushToken);
router.post('/refresh', authLimiter, validateBody(refreshSchema), refresh);
router.post('/logout', authLimiter, validateBody(logoutSchema), logout);
router.post('/verify-email', authLimiter, validateBody(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', authLimiter, validateBody(resendEmailSchema), resendVerification);
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPassword);
router.post('/upload/certificate', upload.single('file'), uploadCertificate);
export default router;
