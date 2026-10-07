/**
 * Socket.IO — authenticated realtime messaging and WebRTC signaling.
 */
import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'socket.io';
import mongoose from 'mongoose';
import { Server, type Server as IOServer } from 'socket.io';

import { createSocketCorsOriginValidator } from '../config/socket.cors.js';
import { env } from '../config/env.js';
import { roomForUser } from '../controllers/messageController.js';
import { persistMessage } from '../services/messageService.js';
import { logServerError, logServerInfo, logServerWarn } from '../utils/logger.js';
import { extractBearerToken, resolveUserIdFromBearerToken } from '../utils/bearerAuth.js';
import { User } from '../models/User.js';
import { ChatMessage } from '../models/ChatMessage.js';
import { Conversation } from '../models/Conversation.js';
import { CallLog } from '../models/CallLog.js';
import { GroupChat, GroupMessage } from '../models/GroupChat.js';
import { checkSocketMessageRate } from './socketRateLimit.js';

/** userId → socket.id (latest connection wins for calls) */
const onlineUsers: Record<string, string> = {};
/** userId → active socket ids */
const connectionsByUser = new Map<string, Set<string>>();

function trackConnection(userId: string, socketId: string, socket: Socket): void {
  let set = connectionsByUser.get(userId);
  if (!set) {
    set = new Set();
    connectionsByUser.set(userId, set);
  }

  while (set.size >= env.socketMaxConnectionsPerUser) {
    const oldest = set.values().next().value as string | undefined;
    if (!oldest) break;
    set.delete(oldest);
    const oldSocket = socket.nsp.sockets.get(oldest);
    oldSocket?.disconnect(true);
  }

  set.add(socketId);
  onlineUsers[userId] = socketId;
}

function untrackConnection(userId: string, socketId: string): void {
  const set = connectionsByUser.get(userId);
  if (set) {
    set.delete(socketId);
    if (set.size === 0) connectionsByUser.delete(userId);
  }
  if (onlineUsers[userId] === socketId) {
    delete onlineUsers[userId];
  }
}

async function assertActiveConversation(
  userId: string,
  peerId: string,
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  if (!mongoose.Types.ObjectId.isValid(peerId)) {
    return { ok: false, error: 'Invalid peer id' };
  }

  const conversation = await Conversation.findOne({
    participants: {
      $all: [new mongoose.Types.ObjectId(userId), new mongoose.Types.ObjectId(peerId)],
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

export function registerSocketHandlers(io: IOServer): void {
  io.use(async (socket, next) => {
    try {
      const token = extractBearerToken(
        typeof socket.handshake.headers.authorization === 'string'
          ? socket.handshake.headers.authorization
          : undefined,
        socket.handshake.auth as { token?: string },
      );

      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }

      const resolved = await resolveUserIdFromBearerToken(token);
      if (!resolved) {
        logServerWarn('socket.auth.failed', { socketId: socket.id });
        next(new Error('Unauthorized'));
        return;
      }

      (socket.data as { userId: string }).userId = resolved.userId;
      next();
    } catch (err) {
      logServerWarn('socket.auth.error', { reason: String(err) });
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;

    try {
      const currentUser = await User.findById(userId).select('chat_username full_name').lean();
      if (!currentUser) {
        socket.disconnect(true);
        return;
      }

      trackConnection(userId, socket.id, socket);
      await socket.join(roomForUser(userId));
      await User.findByIdAndUpdate(userId, { is_online: true, socket_id: socket.id });

      const userObjectId = new mongoose.Types.ObjectId(userId);
      const activeConversations = await Conversation.find({
        participants: userObjectId,
        status: 'active',
      })
        .select('_id participants')
        .lean();

      for (const conv of activeConversations) {
        await socket.join(`conv:${conv._id}`);
        // Notify only peers in this conversation
        for (const pid of conv.participants) {
          const peerId = pid.toString();
          if (peerId !== userId) io.to(roomForUser(peerId)).emit('users-updated');
        }
      }
      logServerInfo('socket.connected', { userId, socketId: socket.id });

      socket.on(
        'send-message',
        async (payload: { to: string; content: string }, ack?: (r: unknown) => void) => {
          try {
            const rate = await checkSocketMessageRate(userId);
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

            const result = await persistMessage(userId, to, content);
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

            io.to(roomForUser(savedMessage.receiver_id)).emit('message:new', savedMessage);
            io.to(roomForUser(userId)).emit('message:new', savedMessage);

            ack?.({ ok: true, message: savedMessage, messageId: savedMessage.id });
          } catch (err) {
            logServerError('socket.send-message', err, { userId });
            ack?.({ ok: false, error: 'Failed to send message' });
          }
        },
      );

      socket.on(
        'send-voice',
        async (
          { to, fileUrl }: { to: string; fileUrl: string },
          ack?: (r: unknown) => void,
        ) => {
          try {
            const rate = await checkSocketMessageRate(userId);
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

            const doc = await ChatMessage.create({
              conversation_id: gate.conversationId,
              from: new mongoose.Types.ObjectId(userId),
              to: new mongoose.Types.ObjectId(to),
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
            if (rid) io.to(rid).emit('receive-message', payload);
            ack?.({ ok: true, message: payload });
          } catch (err) {
            logServerError('socket.send-voice', err, { userId });
            ack?.({ ok: false, error: 'Failed to send voice message' });
          }
        },
      );

      socket.on(
        'call-user',
        async (
          { to, appointmentId }: { to: string; appointmentId?: string },
          ack?: (r: { ok: boolean; error?: string }) => void,
        ) => {
          try {
            if (!mongoose.Types.ObjectId.isValid(to)) {
              ack?.({ ok: false, error: 'Invalid peer id' });
              return;
            }

            const rid = onlineUsers[to];
            if (!rid) {
              ack?.({ ok: false, error: 'User is offline' });
              return;
            }

            const roomId = `room_${Date.now()}`;
            (socket.data as { callData?: unknown }).callData = {
              callerId: userId,
              recipientId: to,
              roomId,
              startedAt: new Date(),
            };

            io.to(rid).emit('incoming-call', { from: userId, roomId, appointmentId });
            ack?.({ ok: true });
          } catch (err) {
            logServerError('socket.call-user', err, { userId });
            ack?.({ ok: false, error: 'Server error' });
          }
        },
      );

      socket.on('call-accepted', ({ to, roomId }: { to: string; roomId: string }) => {
        logServerInfo('socket.call-accepted', { from: userId, to, roomId });
        // Emit only once via the user's persistent room (socket already joined it on connect)
        io.to(roomForUser(to)).emit('call-accepted', { from: userId, roomId });
      });

      socket.on('call-declined', ({ to }: { to: string }) => {
        logServerInfo('socket.call-declined', { from: userId, to });
        io.to(roomForUser(to)).emit('call-declined', { from: userId });
      });

      socket.on('webrtc-signal', ({ to, signal }: { to: string; signal: unknown }) => {
        if (!to || !mongoose.Types.ObjectId.isValid(to)) return;
        if (!signal || typeof signal !== 'object') return;
        const sigType = (signal as { type?: string })?.type ?? 'unknown';
        logServerInfo('socket.webrtc-signal', { from: userId, to, type: sigType });
        // Emit only once via the user's persistent room to avoid duplicate signal handling
        io.to(roomForUser(to)).emit('webrtc-signal', { from: userId, signal });
      });

      socket.on('call-ended', async ({ to, duration }: { to: string; duration: number }) => {
        try {
          logServerInfo('socket.call-ended', { from: userId, to, duration });
          io.to(roomForUser(to)).emit('call-ended', { from: userId });

          const data = (socket.data as { callData?: { callerId?: string; recipientId?: string; startedAt?: Date } })
            .callData;

          await CallLog.create({
            caller: data?.callerId ?? userId,
            recipient: data?.recipientId ?? to,
            status: 'completed',
            duration,
            startedAt: data?.startedAt ?? new Date(),
            endedAt: new Date(),
          });

          delete (socket.data as { callData?: unknown }).callData;
        } catch (err) {
          logServerError('socket.call-ended', err, { userId });
        }
      });

      socket.on(
        'join-group',
        async ({ groupId }: { groupId: string }, ack?: (r: unknown) => void) => {
          try {
            if (!mongoose.Types.ObjectId.isValid(groupId)) {
              ack?.({ ok: false, error: 'Invalid group id' });
              return;
            }

            const group = await GroupChat.findOne({
              _id: groupId,
              members: new mongoose.Types.ObjectId(userId),
              is_active: true,
            })
              .select('_id')
              .lean();

            if (!group) {
              ack?.({ ok: false, error: 'Not a member of this group' });
              return;
            }

            await socket.join(`group:${groupId}`);
            ack?.({ ok: true, groupId });
          } catch (err) {
            logServerError('socket.join-group', err, { userId });
            ack?.({ ok: false, error: 'Failed to join group' });
          }
        },
      );

      socket.on(
        'leave-group',
        ({ groupId }: { groupId: string }) => {
          if (!mongoose.Types.ObjectId.isValid(groupId)) return;
          void socket.leave(`group:${groupId}`);
        },
      );

      socket.on(
        'group-message',
        async (
          payload: { groupId: string; content: string },
          ack?: (r: unknown) => void,
        ) => {
          try {
            const rate = await checkSocketMessageRate(userId);
            if (!rate.allowed) {
              ack?.({ ok: false, error: 'Too many messages. Please slow down.' });
              return;
            }

            const { groupId, content } = payload;
            if (!groupId || !content?.trim()) {
              ack?.({ ok: false, error: 'Invalid message' });
              return;
            }

            if (!mongoose.Types.ObjectId.isValid(groupId)) {
              ack?.({ ok: false, error: 'Invalid group id' });
              return;
            }

            const userIdObj = new mongoose.Types.ObjectId(userId);
            const member = await GroupChat.exists({
              _id: groupId,
              members: userIdObj,
              is_active: true,
            });
            if (!member) {
              ack?.({ ok: false, error: 'Access denied' });
              return;
            }

            const msg = await GroupMessage.create({
              group_id: new mongoose.Types.ObjectId(groupId),
              from: userIdObj,
              content: content.trim(),
              read_by: [userIdObj],
            });

            const populated = await msg.populate('from', '_id full_name avatar_url');

            const emitted = {
              id: msg._id.toString(),
              group_id: groupId,
              from: populated.from,
              content: msg.content,
              type: msg.type,
              timestamp: msg.timestamp,
            };

            io.to(`group:${groupId}`).emit('group-message', emitted);
            ack?.({ ok: true, message: emitted });
          } catch (err) {
            logServerError('socket.group-message', err, { userId });
            ack?.({ ok: false, error: 'Failed to send message' });
          }
        },
      );

      socket.on('disconnect', async () => {
        try {
          untrackConnection(userId, socket.id);
          await User.findByIdAndUpdate(userId, { is_online: false, socket_id: '' });
          // Notify only peers who share an active conversation
          const convs = await Conversation.find({
            participants: new mongoose.Types.ObjectId(userId),
            status: 'active',
          }).select('participants').lean();
          for (const conv of convs) {
            for (const pid of conv.participants) {
              const peerId = pid.toString();
              if (peerId !== userId) io.to(roomForUser(peerId)).emit('users-updated');
            }
          }
          logServerInfo('socket.disconnected', { userId, socketId: socket.id });
        } catch (err) {
          logServerError('socket.disconnect', err, { userId });
        }
      });
    } catch (err) {
      logServerError('socket.connection', err, { userId });
      socket.disconnect(true);
    }
  });
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  const io = new Server(httpServer, {
    cors: {
      origin: createSocketCorsOriginValidator(),
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
export function _resetSocketStateForTests(): void {
  for (const key of Object.keys(onlineUsers)) delete onlineUsers[key];
  connectionsByUser.clear();
}
