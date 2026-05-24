import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { formatUnknownError, logServerWarn } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { isClerkConfigured, verifyClerkSessionToken } from '../utils/clerk.js';
import { User } from '../models/User.js';
import type { UserRole } from '../types/roles.js';
import { AppError } from '../utils/AppError.js';

function bearerToken(req: { headers: { authorization?: string } }): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/**
 * Bearer token: internal JWT (Mongo user id) or Clerk session JWT.
 * Sets `req.userId`, `req.userObjectId`, `req.auth`.
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = bearerToken(req);
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
    return;
  } catch {
    /* try Clerk below */
  }

  if (!isClerkConfigured()) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const clerk = await verifyClerkSessionToken(token);
    const user = await User.findOne({ clerk_id: clerk.clerkId }).lean();
    if (!user) {
      res.status(401).json({ error: 'Account not synced. Complete registration first.' });
      return;
    }
    const dbRole = (user.role ?? 'user') as UserRole;
    req.userId = user._id.toString();
    req.userObjectId = user._id;
    req.auth = {
      id: user._id.toString(),
      role: dbRole,
      emailVerified: user.email_verified ?? true,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    logServerWarn('requireAuth: clerk verify failed', {
      method: req.method,
      path: req.originalUrl,
      reason: formatUnknownError(err).message,
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/** Requires Clerk bearer only (for sync / bootstrap before internal JWT exists). */
export const requireClerkSession: RequestHandler = async (req, res, next) => {
    console.log('[requireClerkSession] hit, token present:', !!bearerToken(req)); 
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Missing Clerk session token' });
    return;
  }
  try {
    req.clerkSession = await verifyClerkSessionToken(token);
    next();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    logServerWarn('requireClerkSession: clerk verify failed', {
      method: req.method,
      path: req.originalUrl,
      reason: formatUnknownError(err).message,
    });
    res.status(401).json({ error: 'Invalid Clerk session' });
  }
};
