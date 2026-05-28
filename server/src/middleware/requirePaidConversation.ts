// middleware/requirePaidConversation.ts
import { RequestHandler } from 'express';
import { Conversation } from '../models/Conversation.js';


export const requirePaidConversation: RequestHandler = async (req, res, next) => {
  const peerId = (req.body.receiver_id || req.query.peerId) as string;
console.log('[requirePaidConversation] path:', req.path, '| peerId:', peerId);

  // No peerId means it's a list/meta request — no gate needed
  if (!peerId) return next();
 console.log('[requirePaidConversation] no peerId → skipping gate');
  const userId = req.userId!;

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

  (req as any).conversation = conversation;
  next();
};