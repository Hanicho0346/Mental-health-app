import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { logServerError } from '../utils/logger.js';

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.userId;
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

export const getMyConversations = async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const userOid = new mongoose.Types.ObjectId(userId);

    const conversations = await Conversation.find({
      participants: userOid,
    })
      .populate<{
        participants: Array<{
          _id: mongoose.Types.ObjectId;
          full_name?: string;
          avatar_url?: string;
          is_online?: boolean;
        }>;
      }>('participants', '_id full_name avatar_url is_online')
      .sort({ updatedAt: -1 })
      .lean();

    const convIds = conversations.map((c) => c._id);

    // Batch: one query for last messages, one for unread counts
    const [lastMsgs, unreadCounts] = await Promise.all([
      ChatMessage.aggregate([
        { $match: { conversation_id: { $in: convIds } } },
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$conversation_id', content: { $first: '$content' }, timestamp: { $first: '$timestamp' } } },
      ]),
      ChatMessage.aggregate([
        { $match: { conversation_id: { $in: convIds }, to: userOid, is_read: false } },
        { $group: { _id: '$conversation_id', count: { $sum: 1 } } },
      ]),
    ]);

    const lastMsgMap = new Map(lastMsgs.map((m) => [m._id.toString(), m]));
    const unreadMap = new Map(unreadCounts.map((u) => [u._id.toString(), u.count as number]));

    const results = conversations.map((conv) => {
      const peer = conv.participants.find((p) => p._id.toString() !== userId);
      if (!peer) return null;
      const last = lastMsgMap.get(conv._id.toString());
      return {
        peerId: peer._id.toString(),
        peerName: peer.full_name ?? 'User',
        peerAvatar: peer.avatar_url ?? null,
        isOnline: peer.is_online ?? false,
        lastMessage: last?.content ?? 'No messages yet',
        lastMessageTime: last?.timestamp ?? null,
        unreadCount: unreadMap.get(conv._id.toString()) ?? 0,
      };
    });

    return res.json(results.filter(Boolean));
  } catch (error) {
    logServerError('conversations.getMyConversations', error);
    return res.status(500).json({ error: 'Failed to load conversations' });
  }
};

export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const { conversationId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some((p) => p.toString() === userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const rawBefore = req.query.before;
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const filter: Record<string, unknown> = { conversation_id: conversationId };
    if (typeof rawBefore === 'string' && rawBefore) {
      const beforeDate = new Date(rawBefore);
      if (!isNaN(beforeDate.getTime())) filter.timestamp = { $lt: beforeDate };
    }

    const messages = await ChatMessage.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return res.json(
      messages.reverse().map((m) => ({
        id: m._id.toString(),
        sender_id: m.from.toString(),
        receiver_id: m.to.toString(),
        content: m.content,
        created_at: m.timestamp,
      }))
    );
  } catch (error) {
    logServerError('conversations.getConversationMessages', error);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
};
