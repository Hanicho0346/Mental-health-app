import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Conversation } from '../models/Conversation.js';

export type MessagePayload = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: Date;
};

export async function persistMessage(
  senderIdStr: string,
  receiverIdStr: string,
  content: string
): Promise<
  | { ok: true; message: MessagePayload; conversationId: string }
  | { ok: false; status: number; error: string }
> {

  if (!mongoose.Types.ObjectId.isValid(receiverIdStr)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid receiver_id',
    };
  }

  if (receiverIdStr === senderIdStr) {
    return {
      ok: false,
      status: 400,
      error: 'Cannot message yourself',
    };
  }

  const trimmed = content.trim();

  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      error: 'content cannot be empty',
    };
  }

  const receiverExists = await User.exists({
    _id: receiverIdStr,
  });

  if (!receiverExists) {
    return {
      ok: false,
      status: 404,
      error: 'Receiver not found',
    };
  }

  // Conversation gate: must have active paid session
  const conversation = await Conversation.findOne({
    participants: {
      $all: [
        new mongoose.Types.ObjectId(senderIdStr),
        new mongoose.Types.ObjectId(receiverIdStr),
      ],
    },
    status: 'active',
  });

  if (!conversation) {
    return {
      ok: false,
      status: 403,
      error: 'No active paid session. Book and pay to unlock chat.',
    };
  }

  const doc = await ChatMessage.create({
    conversation_id: conversation._id,
    from: new mongoose.Types.ObjectId(senderIdStr),

    to: new mongoose.Types.ObjectId(receiverIdStr),

    content: trimmed,

    type: 'text',

    is_read: false,
  });

  return {
    ok: true,

    message: {
      id: doc._id.toString(),

      sender_id: doc.from.toString(),

      receiver_id: doc.to.toString(),

      content: doc.content,

      created_at: doc.timestamp,
    },
    conversationId: conversation._id.toString(),
  };
}