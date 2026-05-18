import type { RequestHandler } from 'express';
import type { UserRole } from '../types/roles.js';

/** Requires `requireAuth` first. */
export const requireRole =
  (...roles: UserRole[]): RequestHandler =>
  (req, res, next) => {
    const a = req.auth;
    if (!a) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!roles.includes(a.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
