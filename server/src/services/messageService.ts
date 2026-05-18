import mongoose from 'mongoose';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';

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
): Promise<{ ok: true; message: MessagePayload } | { ok: false; status: number; error: string }> {
  if (!mongoose.Types.ObjectId.isValid(receiverIdStr)) {
    return { ok: false, status: 400, error: 'Invalid receiver_id' };
  }
  if (receiverIdStr === senderIdStr) {
    return { ok: false, status: 400, error: 'Cannot message yourself' };
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'content cannot be empty' };
  }
  const receiverExists = await User.exists({ _id: receiverIdStr });
  if (!receiverExists) {
    return { ok: false, status: 404, error: 'Receiver not found' };
  }
  const doc = await Message.create({
    sender_id: new mongoose.Types.ObjectId(senderIdStr),
    receiver_id: new mongoose.Types.ObjectId(receiverIdStr),
    content: trimmed,
    is_read: false,
  });
  return {
    ok: true,
    message: {
      id: doc._id.toString(),
      sender_id: doc.sender_id.toString(),
      receiver_id: doc.receiver_id.toString(),
      content: doc.content,
      created_at: doc.created_at,
    },
  };
}
