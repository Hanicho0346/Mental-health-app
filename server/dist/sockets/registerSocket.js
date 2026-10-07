"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketHandlers = registerSocketHandlers;
exports.createSocketServer = createSocketServer;
exports._resetSocketStateForTests = _resetSocketStateForTests;
const mongoose_1 = __importDefault(require("mongoose"));
const socket_io_1 = require("socket.io");
const socket_cors_js_1 = require("../config/socket.cors.js");
const env_js_1 = require("../config/env.js");
const messageController_js_1 = require("../controllers/messageController.js");
const messageService_js_1 = require("../services/messageService.js");
const logger_js_1 = require("../utils/logger.js");
const bearerAuth_js_1 = require("../utils/bearerAuth.js");
const User_js_1 = require("../models/User.js");
const ChatMessage_js_1 = require("../models/ChatMessage.js");
const Conversation_js_1 = require("../models/Conversation.js");
const CallLog_js_1 = require("../models/CallLog.js");
const socketRateLimit_js_1 = require("./socketRateLimit.js");
/** userId → socket.id (latest connection wins for calls) */
const onlineUsers = {};
/** userId → active socket ids */
const connectionsByUser = new Map();
function trackConnection(userId, socketId, socket) {
    let set = connectionsByUser.get(userId);
    if (!set) {
        set = new Set();
        connectionsByUser.set(userId, set);
    }
    while (set.size >= env_js_1.env.socketMaxConnectionsPerUser) {
        const oldest = set.values().next().value;
        if (!oldest)
            break;
        set.delete(oldest);
        const oldSocket = socket.nsp.sockets.get(oldest);
        oldSocket?.disconnect(true);
    }
    set.add(socketId);
    onlineUsers[userId] = socketId;
}
function untrackConnection(userId, socketId) {
    const set = connectionsByUser.get(userId);
    if (set) {
        set.delete(socketId);
        if (set.size === 0)
            connectionsByUser.delete(userId);
    }
    if (onlineUsers[userId] === socketId) {
        delete onlineUsers[userId];
    }
}
async function assertActiveConversation(userId, peerId) {
    if (!mongoose_1.default.Types.ObjectId.isValid(peerId)) {
        return { ok: false, error: 'Invalid peer id' };
    }
    const conversation = await Conversation_js_1.Conversation.findOne({
        participants: {
            $all: [new mongoose_1.default.Types.ObjectId(userId), new mongoose_1.default.Types.ObjectId(peerId)],
        },
        status: 'active',
    })
        .select('_id')
        .lean();
    if (!conversation) {
        return { ok: false, error: 'No active conversation' };
    }
    return { ok: true, conversationId: conversation._id.toString() };
}
function registerSocketHandlers(io) {
    io.use(async (socket, next) => {
        try {
            const token = (0, bearerAuth_js_1.extractBearerToken)(typeof socket.handshake.headers.authorization === 'string'
                ? socket.handshake.headers.authorization
                : undefined, socket.handshake.auth);
            if (!token) {
                next(new Error('Unauthorized'));
                return;
            }
            const resolved = await (0, bearerAuth_js_1.resolveUserIdFromBearerToken)(token);
            if (!resolved) {
                (0, logger_js_1.logServerWarn)('socket.auth.failed', { socketId: socket.id });
                next(new Error('Unauthorized'));
                return;
            }
            socket.data.userId = resolved.userId;
            next();
        }
        catch (err) {
            (0, logger_js_1.logServerWarn)('socket.auth.error', { reason: String(err) });
            next(new Error('Unauthorized'));
        }
    });
    io.on('connection', async (socket) => {
        const userId = socket.data.userId;
        try {
            const currentUser = await User_js_1.User.findById(userId).select('chat_username full_name').lean();
            if (!currentUser) {
                socket.disconnect(true);
                return;
            }
            trackConnection(userId, socket.id, socket);
            await socket.join((0, messageController_js_1.roomForUser)(userId));
            await User_js_1.User.findByIdAndUpdate(userId, { is_online: true, socket_id: socket.id });
            const userObjectId = new mongoose_1.default.Types.ObjectId(userId);
            const activeConversations = await Conversation_js_1.Conversation.find({
                participants: userObjectId,
                status: 'active',
            })
                .select('_id')
                .lean();
            for (const conv of activeConversations) {
                await socket.join(`conv:${conv._id}`);
            }
            io.emit('users-updated');
            (0, logger_js_1.logServerInfo)('socket.connected', { userId, socketId: socket.id });
            socket.on('send-message', async (payload, ack) => {
                try {
                    const rate = await (0, socketRateLimit_js_1.checkSocketMessageRate)(userId);
                    if (!rate.allowed) {
                        ack?.({ ok: false, error: 'Too many messages. Please slow down.', code: 'RATE_LIMIT' });
                        return;
                    }
                    const { to, content } = payload;
                    if (!to || !content?.trim()) {
                        ack?.({ ok: false, error: 'Invalid message' });
                        return;
                    }
                    const gate = await assertActiveConversation(userId, to);
                    if (!gate.ok) {
                        ack?.({ ok: false, error: gate.error, code: 'FORBIDDEN' });
                        return;
                    }
                    const result = await (0, messageService_js_1.persistMessage)(userId, to, content);
                    if (!result.ok) {
                        ack?.(result);
                        return;
                    }
                    const savedMessage = result.message;
                    io.to(`conv:${result.conversationId}`).emit('receive-message', {
                        id: savedMessage.id,
                        sender_id: savedMessage.sender_id,
                        receiver_id: savedMessage.receiver_id,
                        content: savedMessage.content,
                        timestamp: savedMessage.created_at,
                        from: userId,
                    });
                    io.to((0, messageController_js_1.roomForUser)(savedMessage.receiver_id)).emit('message:new', savedMessage);
                    io.to((0, messageController_js_1.roomForUser)(userId)).emit('message:new', savedMessage);
                    ack?.({ ok: true, message: savedMessage, messageId: savedMessage.id });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)('socket.send-message', err, { userId });
                    ack?.({ ok: false, error: 'Failed to send message' });
                }
            });
            socket.on('send-voice', async ({ to, fileUrl }, ack) => {
                try {
                    const rate = await (0, socketRateLimit_js_1.checkSocketMessageRate)(userId);
                    if (!rate.allowed) {
                        ack?.({ ok: false, error: 'Too many messages. Please slow down.' });
                        return;
                    }
                    if (!to || !fileUrl?.trim()) {
                        ack?.({ ok: false, error: 'Invalid voice message' });
                        return;
                    }
                    const gate = await assertActiveConversation(userId, to);
                    if (!gate.ok) {
                        ack?.({ ok: false, error: gate.error });
                        return;
                    }
                    const doc = await ChatMessage_js_1.ChatMessage.create({
                        conversation_id: gate.conversationId,
                        from: new mongoose_1.default.Types.ObjectId(userId),
                        to: new mongoose_1.default.Types.ObjectId(to),
                        type: 'voice',
                        fileUrl: fileUrl.trim(),
                        content: '',
                        is_read: false,
                    });
                    const payload = {
                        id: doc._id.toString(),
                        sender_id: userId,
                        receiver_id: to,
                        fileUrl: doc.fileUrl,
                        type: 'voice',
                        timestamp: doc.timestamp,
                    };
                    io.to(`conv:${gate.conversationId}`).emit('receive-message', payload);
                    const rid = onlineUsers[to];
                    if (rid)
                        io.to(rid).emit('receive-message', payload);
                    ack?.({ ok: true, message: payload });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)('socket.send-voice', err, { userId });
                    ack?.({ ok: false, error: 'Failed to send voice message' });
                }
            });
            socket.on('call-user', async ({ to, appointmentId }) => {
                try {
                    if (!mongoose_1.default.Types.ObjectId.isValid(to))
                        return;
                    const gate = await assertActiveConversation(userId, to);
                    if (!gate.ok) {
                        socket.emit('call-declined', { reason: 'FORBIDDEN' });
                        return;
                    }
                    const rid = onlineUsers[to];
                    if (!rid) {
                        socket.emit('user-offline');
                        return;
                    }
                    const roomId = `room_${Date.now()}`;
                    socket.data.callData = {
                        callerId: userId,
                        recipientId: to,
                        roomId,
                        startedAt: new Date(),
                    };
                    io.to(rid).emit('incoming-call', { from: userId, roomId, appointmentId });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)('socket.call-user', err, { userId });
                }
            });
            socket.on('call-accepted', ({ to, roomId }) => {
                const rid = onlineUsers[to];
                if (rid)
                    io.to(rid).emit('call-accepted', { roomId });
            });
            socket.on('call-declined', ({ to }) => {
                const rid = onlineUsers[to];
                if (rid)
                    io.to(rid).emit('call-declined');
            });
            socket.on('webrtc-signal', ({ to, signal }) => {
                const rid = onlineUsers[to];
                if (rid)
                    io.to(rid).emit('webrtc-signal', { signal });
            });
            socket.on('call-ended', async ({ to, duration }) => {
                try {
                    const rid = onlineUsers[to];
                    if (rid)
                        io.to(rid).emit('call-ended');
                    const data = socket.data
                        .callData;
                    await CallLog_js_1.CallLog.create({
                        caller: data?.callerId ?? userId,
                        recipient: data?.recipientId ?? to,
                        status: 'completed',
                        duration,
                        startedAt: data?.startedAt ?? new Date(),
                        endedAt: new Date(),
                    });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)('socket.call-ended', err, { userId });
                }
            });
            socket.on('disconnect', async () => {
                try {
                    untrackConnection(userId, socket.id);
                    await User_js_1.User.findByIdAndUpdate(userId, { is_online: false, socket_id: '' });
                    io.emit('users-updated');
                    (0, logger_js_1.logServerInfo)('socket.disconnected', { userId, socketId: socket.id });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)('socket.disconnect', err, { userId });
                }
            });
        }
        catch (err) {
            (0, logger_js_1.logServerError)('socket.connection', err, { userId });
            socket.disconnect(true);
        }
    });
}
function createSocketServer(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: (0, socket_cors_js_1.createSocketCorsOriginValidator)(),
            methods: ['GET', 'POST'],
            credentials: true,
        },
        transports: ['websocket', 'polling'],
        pingInterval: 25_000,
        pingTimeout: 20_000,
    });
    registerSocketHandlers(io);
    return io;
}
/** Test helpers */
function _resetSocketStateForTests() {
    for (const key of Object.keys(onlineUsers))
        delete onlineUsers[key];
    connectionsByUser.clear();
}
