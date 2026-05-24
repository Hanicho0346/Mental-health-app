import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { User } from '../models/User.js';
import { ChatMessage as Message } from '../models/ChatMessage.js';
import { requireAuth } from '../middleware/authenticate.js';

const router = Router();
const upload = multer({ dest: 'tmp/' });
if (!fs.existsSync('tmp')) fs.mkdirSync('tmp');

// Chat login — find or create user, return chat identity
router.post('/login', async (req, res) => {
  try {
    const { username, clerkId, fullName } = req.body as Record<string, string>;
    if (!username) { res.status(400).json({ error: 'username required' }); return; }

    let user = clerkId ? await User.findOne({ clerk_id: clerkId }) : null;
    if (!user) user = await User.findOne({ chat_username: username });
    if (!user && clerkId) {
      user = await User.create({
        full_name: fullName || username,
        email: `${username}@chat.local`,
        password: clerkId,
        clerk_id: clerkId,
        chat_username: username,
        email_verified: true,
        role: 'user',
      });
    }
    if (!user) { res.status(401).json({ error: 'User not found' }); return; }
    res.json({ userId: user._id, username: user.chat_username || username });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get all chat users
router.get('/users', async (_req, res) => {
  const users = await User.find({}, 'chat_username is_online');
  res.json(users.filter(u => u.chat_username).map(u => ({
    username: u.chat_username,
    isOnline: u.is_online,
  })));
});

// Get message history between two users
router.get('/messages/:userA/:userB', async (req, res) => {
  const { userA, userB } = req.params;
  const msgs = await Message.find({
    $or: [
      { from: userA, to: userB },
      { from: userB, to: userA },
    ],
  }).sort({ timestamp: 1 });
  res.json(msgs);
});

// Get call logs between two users
router.get('/calls/:userA/:userB', async (req, res) => {
  const { userA, userB } = req.params;
  const { CallLog } = await import('../models/CallLog.js');
  const calls = await CallLog.find({
    $or: [
      { caller: userA, recipient: userB },
      { caller: userB, recipient: userA },
    ],
  }).sort({ startedAt: 1 });
  res.json(calls);
});

// Upload voice message to Cloudinary
router.post('/upload-voice', upload.single('audio'), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload((req.file as any).path, {
      resource_type: 'video',
      folder: 'voice-messages',
    });
    fs.unlinkSync((req.file as any).path);
    res.json({ fileUrl: result.secure_url });
  } catch (e: any) {
    res.status(500).json({ error: 'Upload failed: ' + e.message });
  }
});

export default router;
