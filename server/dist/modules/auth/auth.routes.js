"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_js_1 = require("./auth.controller.js");
const rateLimit_js_1 = require("../../middleware/rateLimit.js");
const validateRequest_js_1 = require("../../middleware/validateRequest.js");
const auth_schemas_js_1 = require("../../validators/auth.schemas.js");
const authenticate_js_1 = require("../../middleware/authenticate.js");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const authLimiter = (0, rateLimit_js_1.authRateLimiter)();
const otpLimiter = (0, rateLimit_js_1.otpRateLimiter)();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024,
    },
});
router.post('/register', authLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.registerSchema), auth_controller_js_1.register);
router.post('/login', authLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.loginSchema), auth_controller_js_1.login);
// authRoutes.ts
router.patch('/push-token', authenticate_js_1.requireAuth, auth_controller_js_1.updatePushToken);
router.post('/refresh', authLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.refreshSchema), auth_controller_js_1.refresh);
router.post('/logout', authLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.logoutSchema), auth_controller_js_1.logout);
router.post('/verify-email', otpLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.verifyEmailSchema), auth_controller_js_1.verifyEmail);
router.post('/resend-verification', otpLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.resendEmailSchema), auth_controller_js_1.resendVerification);
router.post('/forgot-password', otpLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.forgotPasswordSchema), auth_controller_js_1.forgotPassword);
router.post('/reset-password', otpLimiter, (0, validateRequest_js_1.validateBody)(auth_schemas_js_1.resetPasswordSchema), auth_controller_js_1.resetPassword);
router.post('/upload/certificate', authLimiter, upload.single('file'), authenticate_js_1.optionalAuth, auth_controller_js_1.uploadCertificate);
exports.default = router;
