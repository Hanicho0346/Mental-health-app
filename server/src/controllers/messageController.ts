import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import type { Server as IOServer } from 'socket.io';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { persistMessage } from '../services/messageService.js';
import { logServerError } from '../utils/logger.js';

function getIo(req: Parameters<RequestHandler>[0]): IOServer | undefined {
  return req.app.get('io') as IOServer | undefined;
}

export function roomForUser(userId: string): string {
  return `user:${userId}`;
}

/** List messages between authenticated user and peer (sender or receiver only). */
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
    const me = new mongoose.Types.ObjectId(req.userId);
    const peer = new mongoose.Types.ObjectId(peerId);
    const peerExists = await User.exists({ _id: peer });
    if (!peerExists) {
      res.status(404).json({ error: 'Peer user not found' });
      return;
    }
    const messages = await Message.find({
      $or: [
        { sender_id: me, receiver_id: peer },
        { sender_id: peer, receiver_id: me },
      ],
    })
      .sort({ created_at: 1 })
      .lean();

    res.json(
      messages.map((m) => ({
        id: m._id.toString(),
        sender_id: m.sender_id.toString(),
        receiver_id: m.receiver_id.toString(),
        content: m.content,
        created_at: m.created_at,
      }))
    );
  } catch (err) {
    logServerError('listMessages', err, { userId: req.userId, peerId: req.query.peerId });
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

/** Get all conversations for the authenticated user */
export const getConversations: RequestHandler = async (req, res) => {
  try {
    if (!req.userId || !req.auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Get all unique conversations for the user
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender_id: userId },
            { receiver_id: userId }
          ]
        }
      },
      {
        $sort: { created_at: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender_id", userId] },
              "$receiver_id",
              "$sender_id"
            ]
          },
          lastMessage: { $first: "$content" },
          lastMessageTime: { $first: "$created_at" },
          unreadCount: {
            $sum: {
              $cond: [
                { 
                  $and: [
                    { $eq: ["$receiver_id", userId] },
                    { $eq: ["$is_read", false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "peer"
        }
      },
      {
        $unwind: {
          path: "$peer",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          peerId: "$_id",
          peerName: { $ifNull: ["$peer.full_name", "$_id"] },
          peerAvatar: "$peer.avatar_url",
          isOnline: { $ifNull: ["$peer.is_online", false] },
          lastMessage: 1,
          lastMessageTime: 1,
          unreadCount: 1
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      }
    ]);

    res.json(conversations);
  } catch (err) {
    logServerError('getConversations', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};

/** User may only send messages as themselves (sender enforced from JWT). */
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
    const result = await persistMessage(req.userId, receiver_id, content);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const io = getIo(req);
    if (io) {
      io.to(roomForUser(result.message.receiver_id)).emit('message:new', result.message);
      io.to(roomForUser(result.message.sender_id)).emit('message:new', result.message);
    }
    res.status(201).json(result.message);
  } catch (err) {
    logServerError('createMessage', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to send message' });
  }
};