import { Request, Response } from "express";
import mongoose from "mongoose";
import { Conversation } from "../models/Conversation.js";
import { ChatMessage } from "../models/ChatMessage.js";

export const getMyConversations = async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: new mongoose.Types.ObjectId(userId),
    })
      .populate<{
        participants: Array<{
          _id: mongoose.Types.ObjectId;
          full_name?: string;
          avatar_url?: string;
          is_online?: boolean;
        }>;
      }>("participants", "_id full_name avatar_url is_online")
      .sort({ updatedAt: -1 })
      .lean();

    const results = await Promise.all(
      conversations.map(async (conv) => {
        // The peer is the other participant
        const peer = conv.participants.find(
          (p) => p._id.toString() !== userId
        );
        if (!peer) return null;

        const lastMsg = await ChatMessage.findOne({ conversation_id: conv._id })
          .sort({ timestamp: -1 })
          .select("content from timestamp")
          .lean();

        const unreadCount = await ChatMessage.countDocuments({
          conversation_id: conv._id,
          to: new mongoose.Types.ObjectId(userId),
          is_read: false,
        });

        return {
          peerId:          peer._id.toString(),
          peerName:        peer.full_name ?? "User",   // ← real name, never an ID
          peerAvatar:      peer.avatar_url ?? null,
          isOnline:        peer.is_online ?? false,
          lastMessage:     lastMsg?.content ?? "No messages yet",
          lastMessageTime: lastMsg?.timestamp ?? null,
          unreadCount,
        };
      })
    );

    return res.json(results.filter(Boolean));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load conversations" });
  }
};

export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.id
    );
    if (!isParticipant) {
      return res.status(403).json({ error: "Access denied" });
    }

    const messages = await ChatMessage.find({ conversation_id: conversationId })
      .sort({ timestamp: 1 })
      .lean();

    return res.json(
      messages.map((m) => ({
        id:          m._id.toString(),
        sender_id:   m.from.toString(),    // ← map from → sender_id
        receiver_id: m.to.toString(),      // ← map to → receiver_id
        content:     m.content,
        created_at:  m.timestamp,          // ← map timestamp → created_at
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to load messages" });
  }
};