import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

/** Non-sensitive client configuration (hotlines, etc.). */
export const getPublicConfig: RequestHandler = (_req, res) => {
  res.json({
    emergency_phone: env.emergencyPhone,
    support_message: 'If you are in immediate danger, contact local emergency services.',
  });
};
