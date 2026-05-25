"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSocketHandlers = registerSocketHandlers;
exports.createSocketServer = createSocketServer;
const mongoose_1 = __importDefault(require("mongoose"));
const socket_io_1 = require("socket.io");
const env_js_1 = require("../config/env.js");
const messageController_js_1 = require("../controllers/messageController.js");
const messageService_js_1 = require("../services/messageService.js");
const logger_js_1 = require("../utils/logger.js");
const jwt_js_1 = require("../utils/jwt.js");
function registerSocketHandlers(io) {
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token ||
                (typeof socket.handshake.headers.authorization === 'string' &&
                    socket.handshake.headers.authorization.startsWith('Bearer ')
                    ? socket.handshake.headers.authorization.slice(7)
                    : undefined);
            if (!token) {
                (0, logger_js_1.logServerWarn)('socket: missing token', { id: socket.id });
                next(new Error('Unauthorized'));
                return;
            }
            const { sub } = (0, jwt_js_1.verifyAccessToken)(token);
            if (!mongoose_1.default.Types.ObjectId.isValid(sub)) {
                (0, logger_js_1.logServerWarn)('socket: invalid subject', { id: socket.id });
                next(new Error('Unauthorized'));
                return;
            }
            socket.data.userId = sub;
            next();
        }
        catch (err) {
            (0, logger_js_1.logServerWarn)('socket: handshake auth failed', {
                id: socket.id,
                reason: (0, logger_js_1.formatUnknownError)(err).message,
            });
            next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        void socket.join((0, messageController_js_1.roomForUser)(userId));
        socket.on('send_message', async (payload, ack) => {
            try {
                if (typeof payload?.receiver_id !== 'string' || typeof payload?.content !== 'string') {
                    ack?.({ ok: false, error: 'receiver_id and content are required' });
                    return;
                }
                const result = await (0, messageService_js_1.persistMessage)(userId, payload.receiver_id, payload.content);
                if (!result.ok) {
                    ack?.({ ok: false, error: result.error, status: result.status });
                    return;
                }
                io.to((0, messageController_js_1.roomForUser)(result.message.receiver_id)).emit('message:new', result.message);
                io.to((0, messageController_js_1.roomForUser)(result.message.sender_id)).emit('message:new', result.message);
                ack?.({ ok: true, message: result.message });
            }
            catch (e) {
                (0, logger_js_1.logServerError)('socket: send_message', e, { userId });
                ack?.({
                    ok: false,
                    error: 'Server error',
                    detail: (0, logger_js_1.formatUnknownError)(e).message,
                });
            }
        });
    });
}
function createSocketServer(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: env_js_1.env.corsOrigins && env_js_1.env.corsOrigins.length > 0 ? env_js_1.env.corsOrigins : true,
            credentials: true,
        },
    });
    registerSocketHandlers(io);
    return io;
}
