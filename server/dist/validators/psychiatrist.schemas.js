"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.psychiatristProfileUpdateSchema = exports.psychiatristVerificationSchema = void 0;
const zod_1 = require("zod");
exports.psychiatristVerificationSchema = zod_1.z.object({
    document_type: zod_1.z.enum(['license', 'national_id', 'certificate', 'other']),
    notes: zod_1.z.string().max(500).optional(),
});
exports.psychiatristProfileUpdateSchema = zod_1.z.object({
    specialization: zod_1.z.string().trim().min(1).max(200),
    license_number: zod_1.z.string().trim().min(1).max(128),
    years_of_experience: zod_1.z.coerce.number().int().min(0).max(80),
    hospital_or_clinic: zod_1.z.string().trim().max(300).optional(),
});
