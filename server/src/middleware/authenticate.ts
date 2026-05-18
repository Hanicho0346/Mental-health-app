import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { formatUnknownError, logServerWarn } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';

/** Bearer JWT → `req.userId`, `req.userObjectId`, `req.auth`. Use before role-specific middleware. */
export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  try {
    const { sub, role, ev } = verifyAccessToken(token);
    if (!mongoose.Types.ObjectId.isValid(sub)) {
      logServerWarn('requireAuth: invalid token subject', { method: req.method, path: req.originalUrl });
      res.status(401).json({ error: 'Invalid token subject' });
      return;
    }
    req.userId = sub;
    req.userObjectId = new mongoose.Types.ObjectId(sub);
    req.auth = { id: sub, role, emailVerified: ev };
    next();
  } catch (err) {
    logServerWarn('requireAuth: token verify failed', {
      method: req.method,
      path: req.originalUrl,
      reason: formatUnknownError(err).message,
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
