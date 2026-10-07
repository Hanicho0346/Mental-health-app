import { RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';

export const requirePaidConversation: RequestHandler = async (req, res, next) => {
  const peerId = (req.body.receiver_id || req.query.peerId) as string | undefined;

  if (!peerId) {
    return next();
  }

  const userId = req.userId!;

  if (
    !mongoose.Types.ObjectId.isValid(userId) ||
    !mongoose.Types.ObjectId.isValid(peerId)
  ) {
    res.status(400).json({ error: 'Invalid user or peer ID' });
    return;
  }

  const conversation = await Conversation.findOne({
    participants: {
      $all: [
        new mongoose.Types.ObjectId(userId),
        new mongoose.Types.ObjectId(peerId),
      ],
    },
    status: 'active',
  }).populate('booking_id');

  if (!conversation) {
    res.status(403).json({
      error: 'No paid session found. Book and pay for a session to unlock chat.',
    });
    return;
  }

  (req as { conversation?: typeof conversation }).conversation = conversation;
  next();
};
