import { z } from 'zod';

export const psychiatristVerificationSchema = z.object({
  document_type: z.enum(['license', 'national_id', 'certificate', 'other']),
  notes: z.string().max(500).optional(),
});
