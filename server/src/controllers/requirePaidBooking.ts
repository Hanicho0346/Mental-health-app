import type { RequestHandler } from 'express';
import { hasActivePaidBooking } from '../controllers/booking.service.js';
import { AppError } from '../utils/AppError.js';

/**
 * Requires req.params.psychiatristId or req.body.psychiatrist_id.
 * Guards chat/call APIs so only paid users can access them.
 */
export const requirePaidBooking: RequestHandler = async (req, res, next) => {
  try {
    if (!req.userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const psychiatristId =
      req.params.psychiatristId ??
      req.params.receiverId ??
      req.body?.psychiatrist_id ??
      req.body?.receiver_id ??
      req.query?.psychiatrist_id as string;

    if (!psychiatristId) {
      res.status(400).json({ error: 'psychiatrist_id required' });
      return;
    }

    const hasPaid = await hasActivePaidBooking(req.userId, psychiatristId);
    if (!hasPaid) {
      res.status(403).json({
        error: 'Book and pay for a session first to access chat.',
        code: 'BOOKING_REQUIRED',
      });
      return;
    }
    next();
  } catch (err) { next(err); }
};