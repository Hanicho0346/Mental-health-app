"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clerkSyncSchema = void 0;
const zod_1 = require("zod");
exports.clerkSyncSchema = zod_1.z
    .object({
    role: zod_1.z.enum(['user', 'psychiatrist']).optional(),
    national_id: zod_1.z.string().trim().max(64).optional(),
    medical_license: zod_1.z.string().trim().max(128).optional(),
    specialization: zod_1.z.string().trim().max(200).optional(),
    experience_years: zod_1.z.coerce.number().int().min(0).max(80).optional(),
    hospital_or_clinic: zod_1.z.string().trim().max(300).optional(),
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
