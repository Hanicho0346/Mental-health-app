import type { RequestHandler } from 'express';
import { User } from '../models/User.js';
import { logServerError } from '../utils/logger.js';

export const requirePremier: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await User.findById(req.userId)
      .select('is_premier premier_expires_at subscription_tier account_status')
      .lean();

    if (!user || (user as any).account_status !== 'active') {
      res.status(403).json({ error: 'Account not active' });
      return;
    }

    // Check both is_premier flag AND that the subscription hasn't expired
    const isPremier = (user as any).is_premier === true;
    const expiresAt: Date | null = (user as any).premier_expires_at ?? null;
    const isExpired = expiresAt !== null && new Date(expiresAt) < new Date();

    if (!isPremier || isExpired) {
      // If expired, silently reset the flag so next check is faster
      if (isPremier && isExpired) {
        void User.findByIdAndUpdate(req.userId, {
          is_premier: false,
          subscription_tier: 'free',
        });
      }

      res.status(403).json({
        error: 'AI Chat is a Premier feature. Upgrade to access Dr. Selam.',
        upgrade_required: true,
      });
      return;
    }

    next();
  } catch (err) {
    logServerError('requirePremier', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};