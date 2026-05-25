"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMessage = exports.getConversations = exports.listMessages = void 0;
exports.roomForUser = roomForUser;
const mongoose_1 = __importDefault(require("mongoose"));
const Message_js_1 = require("../models/Message.js");
const User_js_1 = require("../models/User.js");
const messageService_js_1 = require("../services/messageService.js");
const logger_js_1 = require("../utils/logger.js");
function getIo(req) {
    return req.app.get('io');
}
function roomForUser(userId) {
    return `user:${userId}`;
}
/** List messages between authenticated user and peer (sender or receiver only). */
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
        const me = new mongoose_1.default.Types.ObjectId(req.userId);
        const peer = new mongoose_1.default.Types.ObjectId(peerId);
        const peerExists = await User_js_1.User.exists({ _id: peer });
        if (!peerExists) {
            res.status(404).json({ error: 'Peer user not found' });
            return;
        }
        const messages = await Message_js_1.Message.find({
            $or: [
                { sender_id: me, receiver_id: peer },
                { sender_id: peer, receiver_id: me },
            ],
        })
            .sort({ created_at: 1 })
            .lean();
        res.json(messages.map((m) => ({
            id: m._id.toString(),
            sender_id: m.sender_id.toString(),
            receiver_id: m.receiver_id.toString(),
            content: m.content,
            created_at: m.created_at,
        })));
    }
    catch (err) {
        (0, logger_js_1.logServerError)('listMessages', err, { userId: req.userId, peerId: req.query.peerId });
        res.status(500).json({ error: 'Failed to load messages' });
    }
};
exports.listMessages = listMessages;
/** Get all conversations for the authenticated user */
const getConversations = async (req, res) => {
    try {
        if (!req.userId || !req.auth) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const userId = new mongoose_1.default.Types.ObjectId(req.userId);
        // Get all unique conversations for the user
        const conversations = await Message_js_1.Message.aggregate([
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
    }
    catch (err) {
        (0, logger_js_1.logServerError)('getConversations', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to load conversations' });
    }
};
exports.getConversations = getConversations;
/** User may only send messages as themselves (sender enforced from JWT). */
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
        const result = await (0, messageService_js_1.persistMessage)(req.userId, receiver_id, content);
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
    }
    catch (err) {
        (0, logger_js_1.logServerError)('createMessage', err, { userId: req.userId });
        res.status(500).json({ error: 'Failed to send message' });
    }
};
exports.createMessage = createMessage;
