import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { Server as IOServer } from 'socket.io';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { logServerError } from '../utils/logger.js';
import { notifyNewMessage, emitNotificationToUser, sendNotification } from '../services/notification.service.js';

function getIo(req: Parameters<RequestHandler>[0]): IOServer | undefined {
  return req.app.get('io') as IOServer | undefined;
}

export function roomForUser(userId: string): string {
  return `user:${userId}`;
}

/** Cast two string IDs to ObjectId and find the active Conversation between them. */
async function findActiveConversation(
  userIdStr: string,
  peerIdStr: string
): Promise<InstanceType<typeof Conversation> | null> {
  return Conversation.findOne({
    participants: {
      $all: [
        new mongoose.Types.ObjectId(userIdStr),
        new mongoose.Types.ObjectId(peerIdStr),
      ],
    },
    status: 'active',
  });
}

/** List messages between authenticated user and peer — gated by paid Conversation. */
export const listMessages: RequestHandler = async (req, res) => {
  try {
    const peerId = req.query.peerId;
    if (typeof peerId !== 'string' || !mongoose.Types.ObjectId.isValid(peerId)) {
      res.status(400).json({ error: 'Valid peerId query parameter is required' });
      return;
    }
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (peerId === req.userId) {
      res.status(400).json({ error: 'peerId must be another user' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(req.userId)) {
      res.status(401).json({ error: 'Invalid userId' });
      return;
    }

    const peerExists = await User.exists({ _id: new mongoose.Types.ObjectId(peerId) });
    if (!peerExists) {
      res.status(404).json({ error: 'Peer user not found' });
      return;
    }

    // ── BOOKING GATE — ObjectId cast fixes the $all match ─────────────────
    const conversation = await findActiveConversation(req.userId, peerId);
    if (!conversation) {
      res.status(403).json({
        error: 'No active paid session found. Book and pay for a session to unlock chat.',
      });
      return;
    }

    const rawLimit = parseInt(String(req.query.limit ?? '50'), 10);
    const rawBefore = req.query.before;
    const limit = Math.min(Math.max(rawLimit, 1), 100);

    const filter: Record<string, unknown> = { conversation_id: conversation._id };
    if (typeof rawBefore === 'string' && rawBefore) {
      const beforeDate = new Date(rawBefore);
      if (!isNaN(beforeDate.getTime())) filter.timestamp = { $lt: beforeDate };
    }

    const messages = await ChatMessage.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(
      messages.reverse().map((m) => ({
        id:          m._id.toString(),
        sender_id:   m.from.toString(),
        receiver_id: m.to.toString(),
        content:     m.content,
        created_at:  m.timestamp,
      }))
    );
  } catch (err) {
    logServerError('listMessages', err, { userId: req.userId, peerId: req.query.peerId });
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

/**
 * FIX: Get conversations for the authenticated user (used by psychiatrist lobby).
 *
 * ROOT CAUSE OF "ID SHOWN INSTEAD OF NAME":
 * The original aggregate used the legacy `Message` model. The new chat system
 * stores messages in `ChatMessage` with a `conversation_id` reference. The
 * aggregate was returning `peerName: '$_id'` (an ObjectId) when no matching
 * user was found, because the lookup was on the wrong collection/field.
 *
 * FIX: Query `Conversation` directly, populate participants, and return real names.
 * This is faster (one query vs. a slow aggregate over all messages) and correct.
 */
export const getConversations: RequestHandler = async (req, res) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = new mongoose.Types.ObjectId(req.userId);

    const conversations = await Conversation.find({
      participants: userId,
      status: 'active',
    })
      .populate<{ participants: Array<{ _id: mongoose.Types.ObjectId; full_name?: string; avatar_url?: string; is_online?: boolean }> }>(
        'participants',
        '_id full_name avatar_url is_online'
      )
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
        { $match: { conversation_id: { $in: convIds }, to: userId, is_read: false } },
        { $group: { _id: '$conversation_id', count: { $sum: 1 } } },
      ]),
    ]);

    const lastMsgMap = new Map(lastMsgs.map((m) => [m._id.toString(), m]));
    const unreadMap = new Map(unreadCounts.map((u) => [u._id.toString(), u.count as number]));

    const results = conversations.map((conv) => {
      const peer = conv.participants.find((p) => p._id.toString() !== req.userId);
      if (!peer) return null;
      const last = lastMsgMap.get(conv._id.toString());
      return {
        peerId:          peer._id.toString(),
        peerName:        peer.full_name ?? 'User',
        peerAvatar:      peer.avatar_url ?? null,
        isOnline:        peer.is_online ?? false,
        lastMessage:     last?.content ?? 'No messages yet',
        lastMessageTime: last?.timestamp ?? null,
        unreadCount:     unreadMap.get(conv._id.toString()) ?? 0,
      };
    });

    res.json(results.filter(Boolean));
  } catch (err) {
    logServerError('getConversations', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};

/**
 * Send a message — gated by paid Conversation, stored as ChatMessage.
 *
 * FIX: Emit to both the conversation room AND each user's personal room so
 * both the psychiatrist's and user's sockets receive `message:new` regardless
 * of which room they joined first.
 */
export const createMessage: RequestHandler = async (req, res) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { receiver_id, content } = req.body as Record<string, unknown>;
    if (typeof receiver_id !== 'string' || typeof content !== 'string') {
      res.status(400).json({ error: 'receiver_id and content are required' });
      return;
    }
    if (!content.trim() || content.length > 4000) {
      res.status(400).json({ error: 'content must be 1–4000 characters' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(receiver_id)) {
      res.status(400).json({ error: 'Invalid receiver_id' });
      return;
    }
    if (!mongoose.Types.ObjectId.isValid(req.userId)) {
      res.status(401).json({ error: 'Invalid userId' });
      return;
    }

    // ── BOOKING GATE ───────────────────────────────────────────────────────
    const conversation = await findActiveConversation(req.userId, receiver_id);
    if (!conversation) {
      res.status(403).json({
        error: 'No active paid session found. Book and pay for a session to unlock chat.',
      });
      return;
    }

    const message = await ChatMessage.create({
      conversation_id: conversation._id,
      from:            new mongoose.Types.ObjectId(req.userId),
      to:              new mongoose.Types.ObjectId(receiver_id),
      type:            'text',
      content:         content.trim(),
    });

const payload = {
      id:          message._id.toString(),
      sender_id:   req.userId,
      receiver_id,
      content:     message.content,
      created_at:  message.timestamp,
    };

    const [sender, recipient] = await Promise.all([
      User.findById(req.userId).select('full_name role').lean(),
      User.findById(receiver_id).select('role').lean(),
    ]);

    const io = getIo(req);
    if (io) {
      // FIX: Emit to the conversation room (both participants are in it after connect)
      io.to(`conv:${conversation._id}`).emit('message:new', payload);

      // Also emit to each participant's personal user room as a fallback
      // (covers the case where a socket hasn't joined the conv room yet)
      io.to(roomForUser(req.userId)).emit('message:new', payload);
      io.to(roomForUser(receiver_id)).emit('message:new', payload);

      // Emit notification to socket room for real-time updates
      if (sender && recipient) {
        void emitNotificationToUser(io, receiver_id, {
          id: message._id.toString(),
          type: 'new_message',
          title: `💬 ${sender.full_name ?? 'Someone'}`,
          body: (content as string).slice(0, 100),
          is_read: false,
          created_at: message.timestamp,
          data: { chat_id: conversation._id.toString() },
        });
      }
    }

    res.status(201).json(payload);
    if (sender && recipient) {
      void notifyNewMessage({
        recipientId:    receiver_id,
        recipientRole:  (recipient.role ?? 'user') as 'user' | 'psychiatrist',
        senderName:     sender.full_name ?? 'Someone',
        messagePreview: (content as string).slice(0, 100),
        chatId:         conversation._id.toString(),
      });
    }
  } catch (err) {
    logServerError('createMessage', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to send message' });
  }
};