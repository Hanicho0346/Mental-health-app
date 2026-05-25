"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookAppointmentSchema = void 0;
const zod_1 = require("zod");
exports.bookAppointmentSchema = zod_1.z.object({
    counselor_id: zod_1.z.string().trim().min(1).max(64),
    scheduled_at: zod_1.z
        .string()
        .trim()
        .min(1)
        .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'scheduled_at must be a valid ISO date' }),
    time_label: zod_1.z.string().trim().max(200).optional().default(''),
});
