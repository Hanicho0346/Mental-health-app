// middleware/requirePaidConversation.ts
import { RequestHandler } from 'express';
import { Conversation } from '../models/Conversation.js';


export const requirePaidConversation: RequestHandler = async (req, res, next) => {
  const peerId = (req.body.receiver_id || req.query.peerId) as string;
  const userId = req.userId!;

  // Look for an active conversation seeded from a paid booking
  const conversation = await Conversation.findOne({
    participants: { $all: [userId, peerId] },
    status: 'active',
  }).populate('booking_id');

  if (!conversation) {
    res.status(403).json({ 
      error: 'No paid session found. Book and pay for a session to unlock chat.' 
    });
    return;
  }

  // Attach to request for downstream use
  (req as any).conversation = conversation;
  next();
};