import { z } from 'zod';

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    role: z.enum(['user', 'psychiatrist']).optional(),
    national_id: z.string().trim().max(64).optional(),
    medical_license: z.string().trim().max(128).optional(),
    specialization: z.string().trim().max(200).optional(),
    experience_years: z.coerce.number().int().min(0).max(80).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === 'psychiatrist') {
      if (!data.national_id?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'National ID is required', path: ['national_id'] });
      }
      if (!data.medical_license?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Medical license is required', path: ['medical_license'] });
      }
      if (!data.specialization?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Specialization is required', path: ['specialization'] });
      }
      if (data.experience_years == null || Number.isNaN(data.experience_years)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Experience years is required', path: ['experience_years'] });
      }
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(512),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(20).max(512).optional(),
});

export const verifyEmailSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^\d{6}$/),
});

export const resendEmailSchema = z.object({
  email: z.string().trim().email(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().regex(/^\d{6}$/),
  password: z.string().min(8).max(128),
});
