"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketHandlers = registerSocketHandlers;
exports.createSocketServer = createSocketServer;
const mongoose_1 = __importDefault(require("mongoose"));
const socket_io_1 = require("socket.io");
const messageController_js_1 = require("../controllers/messageController.js");
const messageService_js_1 = require("../services/messageService.js");
const logger_js_1 = require("../utils/logger.js");
const jwt_js_1 = require("../utils/jwt.js");
const clerk_js_1 = require("../utils/clerk.js");
const User_js_1 = require("../models/User.js");
const ChatMessage_js_1 = require("../models/ChatMessage.js");
const CallLog_js_1 = require("../models/CallLog.js");
const onlineUsers = {};
function registerSocketHandlers(io) {
    // =========================================================
    // AUTH MIDDLEWARE
    // =========================================================
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token ||
                (typeof socket.handshake.headers.authorization === "string" &&
                    socket.handshake.headers.authorization.startsWith("Bearer ")
                    ? socket.handshake.headers.authorization.slice(7)
                    : undefined);
            if (!token) {
                next(new Error("Unauthorized"));
                return;
            }
            try {
                const { sub } = (0, jwt_js_1.verifyAccessToken)(token);
                if (!mongoose_1.default.Types.ObjectId.isValid(sub)) {
                    next(new Error("Unauthorized"));
                    return;
                }
                socket.data.userId = sub;
                next();
                return;
            }
            catch {
                // fallback to Clerk
            }
            if (!(0, clerk_js_1.isClerkConfigured)()) {
                next(new Error("Unauthorized"));
                return;
            }
            const clerk = await (0, clerk_js_1.verifyClerkSessionToken)(token);
            const user = await User_js_1.User.findOne({
                clerk_id: clerk.clerkId,
            });
            if (!user) {
                next(new Error("Unauthorized"));
                return;
            }
            socket.data.userId =
                user._id.toString();
            next();
        }
        catch (err) {
            (0, logger_js_1.logServerWarn)("socket auth failed", {
                reason: (0, logger_js_1.formatUnknownError)(err).message,
            });
            next(new Error("Unauthorized"));
        }
    });
    // =========================================================
    // CONNECTION
    // =========================================================
    io.on("connection", async (socket) => {
        try {
            const userId = socket.data.userId;
            // join secure room
            await socket.join((0, messageController_js_1.roomForUser)(userId));
            // get current user
            const currentUser = await User_js_1.User.findById(userId);
            if (!currentUser) {
                socket.disconnect();
                return;
            }
            const username = currentUser.chat_username ||
                currentUser.full_name ||
                userId;
            // save online socket
            onlineUsers[username] = socket.id;
            // mark online
            await User_js_1.User.findByIdAndUpdate(userId, {
                is_online: true,
                socket_id: socket.id,
            });
            // notify everyone
            io.emit("users-updated");
            console.log("Socket connected:", username);
            // =====================================================
            // CHAT MESSAGE
            // =====================================================
            socket.on("send-message", async (payload, ack) => {
                try {
                    const { to, content } = payload;
                    if (!to || !content?.trim()) {
                        ack?.({
                            ok: false,
                            error: "Invalid message",
                        });
                        return;
                    }
                    const receiver = await User_js_1.User.findOne({
                        chat_username: to,
                    });
                    if (!receiver) {
                        ack?.({
                            ok: false,
                            error: "Receiver not found",
                        });
                        return;
                    }
                    // secure database message
                    const result = await (0, messageService_js_1.persistMessage)(userId, receiver._id.toString(), content);
                    if (!result.ok) {
                        ack?.(result);
                        return;
                    }
                    // chat ui message
                    const chatMessage = await ChatMessage_js_1.ChatMessage.create({
                        from: username,
                        to,
                        type: "text",
                        content,
                    });
                    const receiverSocket = onlineUsers[to];
                    if (receiverSocket) {
                        io.to(receiverSocket).emit("receive-message", chatMessage);
                    }
                    socket.emit("receive-message", chatMessage);
                    ack?.({
                        ok: true,
                        message: chatMessage,
                        messageId: chatMessage._id,
                    });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)("send-message", err);
                    ack?.({
                        ok: false,
                        error: "Failed to send message",
                    });
                }
            });
            // =====================================================
            // VOICE MESSAGE
            // =====================================================
            socket.on("send-voice", async ({ to, fileUrl, }) => {
                try {
                    const msg = await ChatMessage_js_1.ChatMessage.create({
                        from: username,
                        to,
                        type: "voice",
                        fileUrl,
                    });
                    const rid = onlineUsers[to];
                    if (rid) {
                        io.to(rid).emit("receive-message", msg);
                    }
                    socket.emit("receive-message", msg);
                }
                catch (err) {
                    (0, logger_js_1.logServerError)("send-voice", err);
                }
            });
            // =====================================================
            // VIDEO CALL START
            // =====================================================
            socket.on("call-user", async ({ to, appointmentId, }) => {
                try {
                    const rid = onlineUsers[to];
                    if (!rid) {
                        socket.emit("user-offline");
                        return;
                    }
                    const roomId = `room_${Date.now()}`;
                    socket._callData = {
                        caller: username,
                        recipient: to,
                        roomId,
                        startedAt: new Date(),
                    };
                    io.to(rid).emit("incoming-call", {
                        from: username,
                        roomId,
                        appointmentId,
                    });
                    console.log(`${username} calling ${to}`);
                }
                catch (err) {
                    (0, logger_js_1.logServerError)("call-user", err);
                }
            });
            // =====================================================
            // CALL ACCEPTED
            // =====================================================
            socket.on("call-accepted", ({ to, roomId, }) => {
                const rid = onlineUsers[to];
                if (rid) {
                    io.to(rid).emit("call-accepted", {
                        roomId,
                    });
                }
            });
            // =====================================================
            // CALL DECLINED
            // =====================================================
            socket.on("call-declined", ({ to }) => {
                const rid = onlineUsers[to];
                if (rid) {
                    io.to(rid).emit("call-declined");
                }
            });
            // =====================================================
            // WEBRTC SIGNALING
            // =====================================================
            socket.on("webrtc-signal", ({ to, signal, }) => {
                const rid = onlineUsers[to];
                if (rid) {
                    io.to(rid).emit("webrtc-signal", {
                        signal,
                    });
                }
            });
            // =====================================================
            // CALL END
            // =====================================================
            socket.on("call-ended", async ({ to, duration, }) => {
                try {
                    const rid = onlineUsers[to];
                    if (rid) {
                        io.to(rid).emit("call-ended");
                    }
                    const data = socket._callData;
                    await CallLog_js_1.CallLog.create({
                        caller: data?.caller || username,
                        recipient: data?.recipient || to,
                        status: "completed",
                        duration,
                        startedAt: data?.startedAt || new Date(),
                        endedAt: new Date(),
                    });
                }
                catch (err) {
                    (0, logger_js_1.logServerError)("call-ended", err);
                }
            });
            // =====================================================
            // DISCONNECT
            // =====================================================
            socket.on("disconnect", async () => {
                try {
                    delete onlineUsers[username];
                    await User_js_1.User.findByIdAndUpdate(userId, {
                        is_online: false,
                        socket_id: "",
                    });
                    io.emit("users-updated");
                    console.log("Socket disconnected:", username);
                }
                catch (err) {
                    (0, logger_js_1.logServerError)("disconnect", err);
                }
            });
        }
        catch (err) {
            (0, logger_js_1.logServerError)("socket connection", err);
        }
    });
}
function createSocketServer(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
            credentials: true,
        },
        transports: ["websocket", "polling"],
    });
    registerSocketHandlers(io);
    return io;
}
