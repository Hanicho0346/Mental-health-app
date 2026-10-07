/**
 * LEGACY chat REST API — secured in Phase B.
 *
 * @deprecated Prefer `/api/messages` and Socket.IO for production chat.
 * These routes remain for `client/lib/chatService.ts` presence helpers only.
 * See `docs/LEGACY_CHAT.md`.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { User } from '../models/User.js';
import { ChatMessage as Message } from '../models/ChatMessage.js';
import { Conversation } from '../models/Conversation.js';
import { CallLog } from '../models/CallLog.js';
import { requireAuth } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { memoryUpload } from '../modules/uploads/multer.config.js';
import { uploadBuffer } from '../services/cloudinary.service.js';
import { logServerError } from '../utils/logger.js';

const router = Router();
const legacyChatLimiter = authRateLimiter();

const VOICE_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
]);
const MAX_VOICE_BYTES = 10 * 1024 * 1024;

router.use(requireAuth);
router.use(legacyChatLimiter);

function parseObjectId(value: string): mongoose.Types.ObjectId | null {
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

async function assertConversationPeers(
  userId: string,
  peerId: string
): Promise<mongoose.Types.ObjectId | null> {
  const me = parseObjectId(userId);
  const peer = parseObjectId(peerId);
  if (!me || !peer) return null;

  const conv = await Conversation.findOne({
    participants: { $all: [me, peer] },
  })
    .select('_id')
    .lean();

  return conv ? conv._id : null;
}

/** @deprecated Use authenticated session; returns the caller's chat identity only. */
router.post('/login', async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('chat_username full_name').lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const username = user.chat_username?.trim() || user.full_name?.trim() || req.userId!;
    res.json({ userId: user._id.toString(), username });
  } catch (err) {
    logServerError('legacyChat.login', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

/** Online peers from conversations the authenticated user belongs to. */
router.get('/users', async (req, res) => {
  try {
    const userId = req.userId!;
    const me = parseObjectId(userId);
    if (!me) {
      res.status(400).json({ error: 'Invalid user' });
      return;
    }

    const convs = await Conversation.find({ participants: me }).select('participants').lean();
    const peerIds = new Set<string>();
    for (const conv of convs) {
      for (const p of conv.participants) {
        const id = p.toString();
        if (id !== userId) peerIds.add(id);
      }
    }

    if (peerIds.size === 0) {
      res.json([]);
      return;
    }

    const users = await User.find({ _id: { $in: [...peerIds] } })
      .select('chat_username full_name is_online')
      .lean();

    res.json(
      users.map((u) => ({
        username: u.chat_username?.trim() || u.full_name?.trim() || u._id.toString(),
        userId: u._id.toString(),
        isOnline: u.is_online ?? false,
      }))
    );
  } catch (err) {
    logServerError('legacyChat.users', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

router.get('/messages/:userA/:userB', async (req, res) => {
  try {
    const me = req.userId!;
    const { userA, userB } = req.params;

    if (me !== userA && me !== userB) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const conversationId = await assertConversationPeers(userA, userB);
    if (!conversationId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const msgs = await Message.find({ conversation_id: conversationId })
      .sort({ timestamp: 1 })
      .limit(200)
      .lean();

    res.json(msgs);
  } catch (err) {
    logServerError('legacyChat.messages', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

router.get('/calls/:userA/:userB', async (req, res) => {
  try {
    const me = req.userId!;
    const { userA, userB } = req.params;

    if (me !== userA && me !== userB) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const conversationId = await assertConversationPeers(userA, userB);
    if (!conversationId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const calls = await CallLog.find({
      $or: [
        { caller: userA, recipient: userB },
        { caller: userB, recipient: userA },
      ],
    })
      .sort({ startedAt: 1 })
      .limit(100)
      .lean();

    res.json(calls);
  } catch (err) {
    logServerError('legacyChat.calls', err);
    res.status(500).json({ error: 'Request failed' });
  }
});

router.post('/upload-voice', memoryUpload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'No audio file uploaded' });
      return;
    }

    if (file.size > MAX_VOICE_BYTES) {
      res.status(400).json({ error: 'File too large' });
      return;
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!VOICE_MIME.has(mime)) {
      res.status(400).json({ error: 'Invalid audio type' });
      return;
    }

    const publicId = `voice_${req.userId}_${randomBytes(8).toString('hex')}`;
    const { url } = await uploadBuffer(file.buffer, 'voice-messages', {
      publicId,
      resourceType: 'video',
    });

    res.json({ fileUrl: url });
  } catch (err) {
    logServerError('legacyChat.uploadVoice', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
