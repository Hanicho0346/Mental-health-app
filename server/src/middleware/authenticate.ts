import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { logServerWarn } from '../utils/logger.js';
import { resolveUserIdFromBearerToken } from '../utils/bearerAuth.js';

async function attachUserFromBearerToken(req: import('express').Request): Promise<boolean> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return false;

  const resolved = await resolveUserIdFromBearerToken(token);
  if (!resolved) return false;

  req.userId = resolved.userId;
  req.userObjectId = new mongoose.Types.ObjectId(resolved.userId);
  req.auth = {
    id: resolved.userId,
    role: resolved.role,
    emailVerified: resolved.emailVerified,
  };
  return true;
}

/** Bearer access JWT → req.userId, req.auth */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const attached = await attachUserFromBearerToken(req);
  if (!attached) {
    logServerWarn('requireAuth: token verify failed', {
      method: req.method,
      path: req.originalUrl,
    });
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  next();
};

/** Optional auth for pre-registration flows. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  await attachUserFromBearerToken(req);
  next();
};
