import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { Server as IOServer } from 'socket.io';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { logServerError } from '../utils/logger.js';

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

    const messages = await ChatMessage.find({ conversation_id: conversation._id })
      .sort({ timestamp: 1 })
      .lean();

    res.json(
      messages.map((m) => ({
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

    // ── Step 1: Find all active conversations this user participates in ────
    const conversations = await Conversation.find({
      participants: userId,
      status: 'active',
    })
      .populate<{ participants: Array<{ _id: mongoose.Types.ObjectId; full_name?: string; avatar_url?: string; is_online?: boolean }> }>(
        'participants',
        '_id full_name avatar_url is_online'
      )
      .lean();

    // ── Step 2: For each conversation, find the last ChatMessage ──────────
    const results = await Promise.all(
      conversations.map(async (conv) => {
        // The peer is the other participant
        const peer = conv.participants.find(
          (p) => p._id.toString() !== req.userId
        );

        if (!peer) return null;

        // Fetch the most recent message for this conversation (index on conversation_id + timestamp)
        const lastMsg = await ChatMessage.findOne({ conversation_id: conv._id })
          .sort({ timestamp: -1 })
          .select('content from timestamp')
          .lean();

        // Count unread messages sent TO this user
        const unreadCount = await ChatMessage.countDocuments({
          conversation_id: conv._id,
          to: userId,
          is_read: false,
        });

        return {
          peerId:          peer._id.toString(),
          // FIX: use full_name; never fall back to the raw ObjectId string
          peerName:        peer.full_name ?? 'User',
          peerAvatar:      peer.avatar_url ?? null,
          isOnline:        peer.is_online ?? false,
          lastMessage:     lastMsg?.content ?? 'No messages yet',
          lastMessageTime: lastMsg?.timestamp ?? null,
          unreadCount,
        };
      })
    );

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

    const io = getIo(req);
    if (io) {
      // FIX: Emit to the conversation room (both participants are in it after connect)
      io.to(`conv:${conversation._id}`).emit('message:new', payload);

      // Also emit to each participant's personal user room as a fallback
      // (covers the case where a socket hasn't joined the conv room yet)
      io.to(roomForUser(req.userId)).emit('message:new', payload);
      io.to(roomForUser(receiver_id)).emit('message:new', payload);
    }

    res.status(201).json(payload);
  } catch (err) {
    logServerError('createMessage', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to send message' });
  }
};