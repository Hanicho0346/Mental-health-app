import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Server, type Server as IOServer } from 'socket.io';
import { env } from '../config/env.js';
import { roomForUser } from '../controllers/messageController.js';
import { persistMessage } from '../services/messageService.js';
import { formatUnknownError, logServerError, logServerWarn } from '../utils/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';

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
