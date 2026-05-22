import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { createClerkClient } from '@clerk/backend';
import { formatUnknownError, logServerWarn } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { User } from '../models/User.js';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY ?? '',
});

/** Bearer JWT (Clerk or legacy) → req.userId, req.auth */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  // ── Try Clerk token first ──────────────────────────────────────────────────
  try {
    const { verifyToken } = await import('@clerk/backend');
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY ?? '' });
    const clerkId = payload.sub;

    // Find or create user in MongoDB by clerkId
    let user = await User.findOne({ clerk_id: clerkId });
    if (!user) {
      // Try by email if Clerk token has it
      const clerkUser = await clerkClient.users.getUser(clerkId).catch(() => null);
      const email = clerkUser?.emailAddresses?.[0]?.emailAddress ?? '';
      const fullName = `${clerkUser?.firstName ?? ''} ${clerkUser?.lastName ?? ''}`.trim() || email.split('@')[0];
      const username = email.split('@')[0] || clerkId.slice(0, 8);

      user = await User.findOne({ email }).catch(() => null);
      if (user) {
        // Link existing user to Clerk
        user.clerk_id = clerkId;
        user.chat_username = username;
        await user.save();
      } else {
        // Create new user from Clerk identity
        user = await User.create({
          clerk_id: clerkId,
          full_name: fullName,
          email,
          password: clerkId, // placeholder
          chat_username: username,
          email_verified: true,
          role: 'user',
        });
      }
    }

    req.userId = user._id.toString();
    req.userObjectId = user._id;
    req.auth = { id: user._id.toString(), role: user.role as any, emailVerified: true };
    next();
    return;
  } catch {
    // Not a Clerk token — fall through to legacy JWT
  }

  // ── Legacy JWT fallback ────────────────────────────────────────────────────
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
