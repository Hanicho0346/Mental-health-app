import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Server, type Server as IOServer } from 'socket.io';
import { env } from '../config/env.js';
import { roomForUser } from '../controllers/messageController.js';
import { persistMessage } from '../services/messageService.js';
import { formatUnknownError, logServerError, logServerWarn } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { CallLog } from '../models/CallLog.js';
import { User } from '../models/User.js';

// Chat online users map: username → socketId
const onlineUsers: Record<string, string> = {};

export function registerSocketHandlers(io: IOServer): void {
  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string })?.token ||
        (typeof socket.handshake.headers.authorization === 'string' &&
        socket.handshake.headers.authorization.startsWith('Bearer ')
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);
      if (!token) {
        logServerWarn('socket: missing token', { id: socket.id });
        next(new Error('Unauthorized'));
        return;
      }
      const { sub } = verifyAccessToken(token);
      if (!mongoose.Types.ObjectId.isValid(sub)) {
        logServerWarn('socket: invalid subject', { id: socket.id });
        next(new Error('Unauthorized'));
        return;
      }
      (socket.data as { userId: string }).userId = sub;
      next();
    } catch (err) {
      logServerWarn('socket: handshake auth failed', {
        id: socket.id,
        reason: formatUnknownError(err).message,
      });
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;
    void socket.join(roomForUser(userId));

    socket.on(
      'send_message',
      async (payload: { receiver_id?: string; content?: string }, ack?: (r: unknown) => void) => {
        try {
          if (typeof payload?.receiver_id !== 'string' || typeof payload?.content !== 'string') {
            ack?.({ ok: false, error: 'receiver_id and content are required' });
            return;
          }
          const result = await persistMessage(userId, payload.receiver_id, payload.content);
          if (!result.ok) {
            ack?.({ ok: false, error: result.error, status: result.status });
            return;
          }
          io.to(roomForUser(result.message.receiver_id)).emit('message:new', result.message);
          io.to(roomForUser(result.message.sender_id)).emit('message:new', result.message);
          ack?.({ ok: true, message: result.message });
        } catch (e) {
          logServerError('socket: send_message', e, { userId });
          ack?.({
            ok: false,
            error: 'Server error',
            detail: formatUnknownError(e).message,
          });
        }
      }
    );

    // ── Chat events ───────────────────────────────────────────────────────────

    socket.on('user-online', async ({ username }: { username: string }) => {
      (socket as any)._chatUsername = username;
      onlineUsers[username] = socket.id;
      await User.findOneAndUpdate({ chat_username: username }, { is_online: true, socket_id: socket.id });
      io.emit('users-updated');
    });

    socket.on('send-message', async ({ from, to, content: text }: { from: string; to: string; content: string }) => {
      const msg = await ChatMessage.create({ from, to, type: 'text', content: text });
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('receive-message', msg);
      socket.emit('receive-message', msg);
    });

    socket.on('send-voice', async ({ from, to, fileUrl }: { from: string; to: string; fileUrl: string }) => {
      const msg = await ChatMessage.create({ from, to, type: 'voice', fileUrl });
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('receive-message', msg);
      socket.emit('receive-message', msg);
    });

    socket.on('call-user', ({ from, to }: { from: string; to: string }) => {
      (socket as any)._callData = { caller: from, recipient: to, startedAt: new Date() };
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('incoming-call', { from });
    });

    socket.on('call-accepted', ({ from, to }: { from: string; to: string }) => {
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('call-accepted', { from });
    });

    socket.on('call-declined', ({ from, to }: { from: string; to: string }) => {
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('call-declined', { from });
    });

    socket.on('sp-signal', ({ to, signal }: { to: string; signal: unknown }) => {
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('sp-signal', { signal });
    });

    socket.on('call-ended', async ({ from, to, duration }: { from: string; to: string; duration: number }) => {
      const rid = onlineUsers[to];
      if (rid) io.to(rid).emit('call-ended');
      await CallLog.create({
        caller: from, recipient: to,
        status: 'completed', duration,
        startedAt: (socket as any)._callData?.startedAt || new Date(),
        endedAt: new Date(),
      });
    });

    socket.on('disconnect', async () => {
      const username = (socket as any)._chatUsername;
      if (username) {
        delete onlineUsers[username];
        await User.findOneAndUpdate({ chat_username: username }, { is_online: false, socket_id: '' });
        io.emit('users-updated');
      }
    });

  });
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  const io = new Server(httpServer, {
    cors: {
      origin: env.corsOrigins && env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    },
  });
  registerSocketHandlers(io);
  return io;
}
