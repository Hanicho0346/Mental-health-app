import type { RequestHandler } from 'express';
import type { z } from 'zod';

export function validateBody<T extends z.ZodTypeAny>(schema: T): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.flatten() });
      return;
    }
    req.body = parsed.data as typeof req.body;
    next();
  };
}
