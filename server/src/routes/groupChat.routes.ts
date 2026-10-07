import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/authenticate.js';
import { GroupChat, GroupMessage } from '../models/GroupChat.js';
import { logServerError } from '../utils/logger.js';

const router = Router();
router.use(requireAuth);

// ── Create group ──────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description, memberIds } = req.body as {
      name: string;
      description?: string;
      memberIds?: string[];
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const creatorId = new mongoose.Types.ObjectId(req.userId!);
    const extraMembers = (memberIds ?? [])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const members = [creatorId, ...extraMembers.filter((m) => !m.equals(creatorId))];

    const group = await GroupChat.create({
      name: name.trim(),
      description: description?.trim() ?? '',
      created_by: creatorId,
      members,
      admins: [creatorId],
    });

    res.status(201).json(group);
  } catch (err) {
    logServerError('groupChat.create', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// ── List my groups ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const groups = await GroupChat.find({ members: userId, is_active: true })
      .select('name description members admins avatar_color createdAt')
      .lean();

    // Attach last message + unread count per group
    const groupIds = groups.map((g) => g._id);
    const [lastMsgs, unreadCounts] = await Promise.all([
      GroupMessage.aggregate([
        { $match: { group_id: { $in: groupIds } } },
        { $sort: { timestamp: -1 } },
        { $group: { _id: '$group_id', content: { $first: '$content' }, timestamp: { $first: '$timestamp' } } },
      ]),
      GroupMessage.aggregate([
        { $match: { group_id: { $in: groupIds }, read_by: { $ne: userId } } },
        { $group: { _id: '$group_id', count: { $sum: 1 } } },
      ]),
    ]);

    const lastMsgMap  = new Map(lastMsgs.map((m) => [m._id.toString(), m]));
    const unreadMap   = new Map(unreadCounts.map((u) => [u._id.toString(), u.count as number]));

    res.json(
      groups.map((g) => {
        const last = lastMsgMap.get(g._id.toString());
        return {
          id:              g._id.toString(),
          name:            g.name,
          description:     g.description,
          memberCount:     g.members.length,
          avatarColor:     g.avatar_color,
          lastMessage:     last?.content ?? 'No messages yet',
          lastMessageTime: last?.timestamp ?? null,
          unreadCount:     unreadMap.get(g._id.toString()) ?? 0,
          isAdmin:         (g.admins as mongoose.Types.ObjectId[]).some((a) => a.equals(userId)),
        };
      })
    );
  } catch (err) {
    logServerError('groupChat.list', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

// ── Get group detail ──────────────────────────────────────────────────────────
router.get('/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ error: 'Invalid group id' }); return;
    }
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const group = await GroupChat.findOne({ _id: groupId, members: userId, is_active: true })
      .populate('members', '_id full_name avatar_url is_online')
      .populate('admins', '_id full_name')
      .lean();
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }
    res.json(group);
  } catch (err) {
    logServerError('groupChat.detail', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to load group' });
  }
});

// ── Get messages (paginated) ──────────────────────────────────────────────────
router.get('/:groupId/messages', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ error: 'Invalid group id' }); return;
    }
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const member = await GroupChat.exists({ _id: groupId, members: userId, is_active: true });
    if (!member) { res.status(403).json({ error: 'Access denied' }); return; }

    const limit  = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10), 1), 100);
    const filter: Record<string, unknown> = { group_id: new mongoose.Types.ObjectId(groupId) };
    const rawBefore = req.query.before;
    if (typeof rawBefore === 'string' && rawBefore) {
      const d = new Date(rawBefore);
      if (!isNaN(d.getTime())) filter.timestamp = { $lt: d };
    }

    const messages = await GroupMessage.find(filter)
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('from', '_id full_name avatar_url')
      .lean();

    // Mark as read
    await GroupMessage.updateMany(
      { group_id: groupId, read_by: { $ne: userId } },
      { $addToSet: { read_by: userId } }
    );

    res.json(messages.reverse().map((m) => ({
      id:         m._id.toString(),
      group_id:   m.group_id.toString(),
      from:       m.from,
      content:    m.content,
      type:       m.type,
      fileUrl:    m.fileUrl,
      timestamp:  m.timestamp,
    })));
  } catch (err) {
    logServerError('groupChat.messages', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// ── Send message ──────────────────────────────────────────────────────────────
router.post('/:groupId/messages', async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      res.status(400).json({ error: 'Invalid group id' }); return;
    }
    const userId = new mongoose.Types.ObjectId(req.userId!);
    const member = await GroupChat.exists({ _id: groupId, members: userId, is_active: true });
    if (!member) { res.status(403).json({ error: 'Access denied' }); return; }

    const { content } = req.body as { content: string };
    if (!content?.trim() || content.length > 4000) {
      res.status(400).json({ error: 'content must be 1–4000 characters' }); return;
    }

    const msg = await GroupMessage.create({
      group_id: new mongoose.Types.ObjectId(groupId),
      from:     userId,
      content:  content.trim(),
      read_by:  [userId],
    });

    const populated = await msg.populate('from', '_id full_name avatar_url');

    // Emit via socket (app.get('io'))
    const io = (req.app.get('io') as import('socket.io').Server | undefined);
    if (io) {
      io.to(`group:${groupId}`).emit('group-message', {
        id:        msg._id.toString(),
        group_id:  groupId,
        from:      populated.from,
        content:   msg.content,
        type:      msg.type,
        timestamp: msg.timestamp,
      });
    }

    res.status(201).json({ id: msg._id.toString(), group_id: groupId, content: msg.content, timestamp: msg.timestamp });
  } catch (err) {
    logServerError('groupChat.sendMessage', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ── Add member (admin only) ───────────────────────────────────────────────────
router.post('/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { userId: newMemberId } = req.body as { userId: string };
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(newMemberId)) {
      res.status(400).json({ error: 'Invalid id' }); return;
    }
    const requesterId = new mongoose.Types.ObjectId(req.userId!);
    const group = await GroupChat.findOne({ _id: groupId, admins: requesterId, is_active: true });
    if (!group) { res.status(403).json({ error: 'Only admins can add members' }); return; }

    await GroupChat.findByIdAndUpdate(groupId, {
      $addToSet: { members: new mongoose.Types.ObjectId(newMemberId) },
    });
    res.json({ ok: true });
  } catch (err) {
    logServerError('groupChat.addMember', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// ── Remove member / leave ─────────────────────────────────────────────────────
router.delete('/:groupId/members/:memberId', async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(memberId)) {
      res.status(400).json({ error: 'Invalid id' }); return;
    }
    const requesterId = new mongoose.Types.ObjectId(req.userId!);
    const memberOid   = new mongoose.Types.ObjectId(memberId);
    const isSelf      = requesterId.equals(memberOid);

    const group = await GroupChat.findById(groupId);
    if (!group) { res.status(404).json({ error: 'Group not found' }); return; }

    const isAdmin = (group.admins as mongoose.Types.ObjectId[]).some((a) => a.equals(requesterId));
    if (!isSelf && !isAdmin) {
      res.status(403).json({ error: 'Only admins can remove members' }); return;
    }

    await GroupChat.findByIdAndUpdate(groupId, { $pull: { members: memberOid, admins: memberOid } });
    res.json({ ok: true });
  } catch (err) {
    logServerError('groupChat.removeMember', err, { userId: req.userId });
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
