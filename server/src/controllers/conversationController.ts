import { Request, Response } from "express";
import { Conversation } from "../models/Conversation.js";
import { ChatMessage } from "../models/ChatMessage.js";

export const getMyConversations = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("user_id", "full_name role")
      .populate("psychiatrist_id", "full_name role")
      .sort({ updatedAt: -1 });

    return res.json(conversations);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to load conversations",
    });
  }
};

export const getConversationMessages = async (
  req: Request,
  res: Response
) => {
  try {
    const { conversationId } = req.params;

    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        error: "Conversation not found",
      });
    }

    const isParticipant =
      conversation.participants.some(
        (p) => p.toString() === req.user.id
      );

    if (!isParticipant) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    const messages = await ChatMessage.find({
      conversation_id: conversationId,
    }).sort({ timestamp: 1 });

    return res.json(messages);
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Failed to load messages",
    });
  }
};