import { z } from 'zod';

export const bookAppointmentSchema = z.object({
  counselor_id: z.string().trim().min(1).max(64),
  scheduled_at: z
    .string()
    .trim()
    .min(1)
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'scheduled_at must be a valid ISO date' }),
  time_label: z.string().trim().max(200).optional().default(''),
});
