import { z } from 'zod';

export const psychiatristVerificationSchema = z.object({
  document_type: z.enum(['license', 'national_id', 'certificate', 'other']),
  notes: z.string().max(500).optional(),
});

export const psychiatristProfileUpdateSchema = z.object({
  specialization: z.string().trim().min(1).max(200),
  license_number: z.string().trim().min(1).max(128),
  years_of_experience: z.coerce.number().int().min(0).max(80),
  hospital_or_clinic: z.string().trim().max(300).optional(),
});
