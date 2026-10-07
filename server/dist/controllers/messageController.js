"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.getConversations = exports.listMessages = void 0;
exports.roomForUser = roomForUser;
const mongoose_1 = __importDefault(require("mongoose"));
const User_js_1 = require("../models/User.js");
const Conversation_js_1 = require("../models/Conversation.js");
const ChatMessage_js_1 = require("../models/ChatMessage.js");
const logger_js_1 = require("../utils/logger.js");
const notification_service_js_1 = require("../services/notification.service.js");
function getIo(req) {
    return req.app.get('io');
}
function roomForUser(userId) {
    return `user:${userId}`;
}
/** Cast two string IDs to ObjectId and find the active Conversation between them. */
async function findActiveConversation(userIdStr, peerIdStr) {
    return Conversation_js_1.Conversation.findOne({
        participants: {
            $all: [
                new mongoose_1.default.Types.ObjectId(userIdStr),
                new mongoose_1.default.Types.ObjectId(peerIdStr),
            ],
        },
        status: 'active',
    });
}
/** List messages between authenticated user and peer — gated by paid Conversation. */
const listMessages = async (req, res) => {
    try {
        const peerId = req.query.peerId;
        if (typeof peerId !== 'string' || !mongoose_1.default.Types.ObjectId.isValid(peerId)) {
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
        if (!mongoose_1.default.Types.ObjectId.isValid(req.userId)) {
            res.status(401).json({ error: 'Invalid userId' });
            return;
        }
        const peerExists = await User_js_1.User.exists({ _id: new mongoose_1.default.Types.ObjectId(peerId) });
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
        const messages = await ChatMessage_js_1.ChatMessage.find({ conversation_id: conversation._id })
            .sort({ timestamp: 1 })
            .lean();
        res.json(messages.map((m) => ({
            id: m._id.toString(),
            sender_id: m.from.toString(),
            receiver_id: m.to.toString(),
            content: m.content,
            created_at: m.timestamp,
        })));
    }
    catch (err) {
        (0, logger_js_1.logServerError)('listMessages', err, { userId: req.userId, peerId: req.query.peerId });
        res.status(500).json({ error: 'Failed to load messages' });
    }
};
exports.listMessages = listMessages;
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
const getConversations = async (req, res) => {
    try {
        if (!req.userId || !req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = new mongoose_1.default.Types.ObjectId(req.userId);
        // ── Step 1: Find all active conversations this user participates in ────
        const conversations = await Conversation_js_1.Conversation.find({
            participants: userId,
            status: 'active',
        })
            .populate('participants', '_id full_name avatar_url is_online')
            .lean();
        // ── Step 2: For each conversation, find the last ChatMessage ──────────
        const results = await Promise.all(conversations.map(async (conv) => {
            // The peer is the other participant
            const peer = conv.participants.find((p) => p._id.toString() !== req.userId);
            if (!peer)
                return null;
            // Fetch the most recent message for this conversation (index on conversation_id + timestamp)
            const lastMsg = await ChatMessage_js_1.ChatMessage.findOne({ conversation_id: conv._id })
                .sort({ timestamp: -1 })
                .select('content from timestamp')
                .lean();
            // Count unread messages sent TO this user
            const unreadCount = await ChatMessage_js_1.ChatMessage.countDocuments({
                conversation_id: conv._id,
                to: userId,
                is_read: false,
            });
            return {
                peerId: peer._id.toString(),
                // FIX: use full_name; never fall back to the raw ObjectId string
                peerName: peer.full_name ?? 'User',
                peerAvatar: peer.avatar_url ?? null,
                isOnline: peer.is_online ?? false,
                lastMessage: lastMsg?.content ?? 'No messages yet',
                lastMessageTime: lastMsg?.timestamp ?? null,
                unreadCount,
            };
        }));
        res.json(results.filter(Boolean));
    }
    catch (err) {
        (0, logger_js_1.logServerError)('getConversations', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};
exports.getConversations = getConversations;
/**
 * Send a message — gated by paid Conversation, stored as ChatMessage.
 *
 * FIX: Emit to both the conversation room AND each user's personal room so
 * both the psychiatrist's and user's sockets receive `message:new` regardless
 * of which room they joined first.
 */
const createMessage = async (req, res) => {
    try {
        if (!req.userId || !req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const { receiver_id, content } = req.body;
        if (typeof receiver_id !== 'string' || typeof content !== 'string') {
            res.status(400).json({ error: 'receiver_id and content are required' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(receiver_id)) {
            res.status(400).json({ error: 'Invalid receiver_id' });
            return;
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(req.userId)) {
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
        const message = await ChatMessage_js_1.ChatMessage.create({
            conversation_id: conversation._id,
            from: new mongoose_1.default.Types.ObjectId(req.userId),
            to: new mongoose_1.default.Types.ObjectId(receiver_id),
            type: 'text',
            content: content.trim(),
        });
        const payload = {
            id: message._id.toString(),
            sender_id: req.userId,
            receiver_id,
            content: message.content,
            created_at: message.timestamp,
        };
        const [sender, recipient] = await Promise.all([
            User_js_1.User.findById(req.userId).select('full_name role').lean(),
            User_js_1.User.findById(receiver_id).select('role').lean(),
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
                void (0, notification_service_js_1.emitNotificationToUser)(io, receiver_id, {
                    id: message._id.toString(),
                    type: 'new_message',
                    title: `💬 ${sender.full_name ?? 'Someone'}`,
                    body: content.slice(0, 100),
                    is_read: false,
                    created_at: message.timestamp,
                    data: { chat_id: conversation._id.toString() },
                });
            }
        }
        res.status(201).json(payload);
        if (sender && recipient) {
            void (0, notification_service_js_1.notifyNewMessage)({
                recipientId: receiver_id,
                recipientRole: (recipient.role ?? 'user'),
                senderName: sender.full_name ?? 'Someone',
                messagePreview: content.slice(0, 100),
                chatId: conversation._id.toString(),
            });
        }
    }
    catch (err) {
        (0, logger_js_1.logServerError)('createMessage', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to send message' });
    }
};
exports.createMessage = createMessage;
