"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.resendEmailSchema = exports.verifyEmailSchema = exports.logoutSchema = exports.refreshSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z
    .object({
    full_name: zod_1.z.string().trim().min(1).max(200),
    email: zod_1.z.string().trim().email().max(320),
    password: zod_1.z.string().min(8).max(128),
    role: zod_1.z.enum(['user', 'psychiatrist']).optional(),
    national_id: zod_1.z.string().trim().max(64).optional(),
    medical_license: zod_1.z.string().trim().max(128).optional(),
    specialization: zod_1.z.string().trim().max(200).optional(),
    experience_years: zod_1.z.coerce.number().int().min(0).max(80).optional(),
})
    .superRefine((data, ctx) => {
    if (data.role === 'psychiatrist') {
        if (!data.national_id?.trim()) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'National ID is required', path: ['national_id'] });
        }
        if (!data.medical_license?.trim()) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Medical license is required', path: ['medical_license'] });
        }
        if (!data.specialization?.trim()) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Specialization is required', path: ['specialization'] });
        }
        if (data.experience_years == null || Number.isNaN(data.experience_years)) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Experience years is required', path: ['experience_years'] });
        }
    }
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    password: zod_1.z.string().min(1).max(128),
});
exports.refreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(20).max(512),
});
exports.logoutSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(20).max(512).optional(),
});
exports.verifyEmailSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    code: zod_1.z.string().regex(/^\d{6}$/),
});
exports.resendEmailSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
});
exports.resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().trim().email(),
    code: zod_1.z.string().regex(/^\d{6}$/),
    password: zod_1.z.string().min(8).max(128),
});
