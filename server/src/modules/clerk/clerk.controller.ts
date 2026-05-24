import type { RequestHandler } from 'express';
import { syncClerkAccount } from './clerk.service.js';
import { logAuthError } from '../auth/auth.service.js';

export const clerkSync: RequestHandler = async (req, res, next) => {
  try {
    if (!req.clerkSession) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const result = await syncClerkAccount(req.clerkSession, req.body, req);
    res.status(200).json(result);
  } catch (err) {
    logAuthError('clerk.sync', err);
    next(err);
  }
};
