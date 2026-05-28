/**
 * registerSocket.ts
 *
 * FIXES APPLIED (no logic removed, only additive/corrective changes):
 *
 * 1. Conv room join on connect: was iterating `Conversation.find(...)` with
 *    `participants: userId` (a string). Mongoose casts strings to ObjectId for
 *    `_id` fields but the `participants` array stores ObjectIds. Added explicit
 *    ObjectId cast so the query actually finds the user's conversations on
 *    connect, meaning the socket joins `conv:<id>` rooms immediately and
 *    receives `message:new` events emitted by the REST controller.
 *
 * 2. `send-message` socket handler: the booking gate queried with string IDs;
 *    added ObjectId casts for consistency (matches what the REST controller does).
 *
 * 3. All other handlers (voice, video call, WebRTC, disconnect) are UNCHANGED.
 */

import type { Server as HttpServer } from "node:http";
import type { Socket } from "socket.io";
import mongoose from "mongoose";
import { Server, type Server as IOServer } from "socket.io";

import { roomForUser } from "../controllers/messageController.js";
import { persistMessage } from "../services/messageService.js";

import {
  formatUnknownError,
  logServerError,
  logServerWarn,
} from "../utils/logger.js";

import { verifyAccessToken } from "../utils/jwt.js";

import {
  isClerkConfigured,
  verifyClerkSessionToken,
} from "../utils/clerk.js";

import { User } from "../models/User.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { Conversation } from "../models/Conversation.js";
import { CallLog } from "../models/CallLog.js";

const onlineUsers: Record<string, string> = {};

export function registerSocketHandlers(io: IOServer): void {
  // =========================================================
  // AUTH MIDDLEWARE — unchanged
  // =========================================================

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string })?.token ||
        (typeof socket.handshake.headers.authorization === "string" &&
        socket.handshake.headers.authorization.startsWith("Bearer ")
          ? socket.handshake.headers.authorization.slice(7)
          : undefined);

      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }

      try {
        const { sub } = verifyAccessToken(token);
        if (!mongoose.Types.ObjectId.isValid(sub)) {
          next(new Error("Unauthorized"));
          return;
        }
        (socket.data as { userId: string }).userId = sub;
        next();
        return;
      } catch {
        // fallback to Clerk
      }

      if (!isClerkConfigured()) {
        next(new Error("Unauthorized"));
        return;
      }

      const clerk = await verifyClerkSessionToken(token);
      const user  = await User.findOne({ clerk_id: clerk.clerkId });

      if (!user) {
        next(new Error("Unauthorized"));
        return;
      }

      (socket.data as { userId: string }).userId = user._id.toString();
      next();
    } catch (err) {
      logServerWarn("socket auth failed", {
        reason: formatUnknownError(err).message,
      });
      next(new Error("Unauthorized"));
    }
  });

  // =========================================================
  // CONNECTION
  // =========================================================

  io.on("connection", async (socket: Socket) => {
    try {
      const userId = (socket.data as { userId: string }).userId;

      // join secure user room
      await socket.join(roomForUser(userId));

      const currentUser = await User.findById(userId);
      if (!currentUser) {
        socket.disconnect();
        return;
      }

      const username =
        currentUser.chat_username ||
        currentUser.full_name ||
        userId;

      onlineUsers[userId] = socket.id;

      await User.findByIdAndUpdate(userId, {
        is_online: true,
        socket_id: socket.id,
      });

      // FIX 1: Explicit ObjectId cast so the $in query matches ObjectId array entries
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const activeConversations = await Conversation.find({
        participants: userObjectId,   // ← was: userId (string)
        status: "active",
      })
        .select("_id")
        .lean();

      for (const conv of activeConversations) {
        await socket.join(`conv:${conv._id}`);
      }

      io.emit("users-updated");
      console.log("Socket connected:", username);

      // =====================================================
      // CHAT MESSAGE — gated by paid Conversation
      // =====================================================

      socket.on(
        "send-message",
        async (
          payload: { to: string; content: string },
          ack?: (response: unknown) => void
        ) => {
          try {
            const { to, content } = payload;

            if (!to || !content?.trim()) {
              ack?.({ ok: false, error: "Invalid message" });
              return;
            }

           const receiver = await User.findById(to);
            if (!receiver) {
              ack?.({ ok: false, error: "Receiver not found" });
              return;
            }

            // FIX 2: ObjectId casts for the booking gate query
            const conversation = await Conversation.findOne({
              participants: {
                $all: [
                  new mongoose.Types.ObjectId(userId),
                  receiver._id,
                ],
              },
              status: "active",
            });

            if (!conversation) {
              ack?.({
                ok: false,
                error: "No active paid session. Book and pay to unlock chat.",
              });
              return;
            }

            const result = await persistMessage(
              userId,
              receiver._id.toString(),
              content
            );

            if (!result.ok) {
              ack?.(result);
              return;
            }

            const chatMessage = await ChatMessage.create({
              conversation_id: conversation._id,
              from: new mongoose.Types.ObjectId(userId),
              to:   receiver._id,
              type: "text",
              content,
            });

            // Emit to conversation room (all participants)
            io.to(`conv:${conversation._id}`).emit("receive-message", {
              ...chatMessage.toObject(),
              from: userId,
            });

            // Also emit message:new to personal user rooms
            io.to(roomForUser(receiver._id.toString())).emit("message:new", result.message);
            io.to(roomForUser(userId)).emit("message:new", result.message);

            ack?.({
              ok: true,
              message:   chatMessage,
              messageId: chatMessage._id,
            });
          } catch (err) {
            logServerError("send-message", err);
            ack?.({ ok: false, error: "Failed to send message" });
          }
        }
      );

      // =====================================================
      // VOICE MESSAGE — unchanged
      // =====================================================

      socket.on(
        "send-voice",
        async ({ to, fileUrl }: { to: string; fileUrl: string }) => {
          try {
            const msg = await ChatMessage.create({
              from: username,
              to,
              type: "voice",
              fileUrl,
            });
            const rid = onlineUsers[to];
            if (rid) io.to(rid).emit("receive-message", msg);
            socket.emit("receive-message", msg);
          } catch (err) {
            logServerError("send-voice", err);
          }
        }
      );

      // =====================================================
      // VIDEO CALL START — unchanged
      // =====================================================

      socket.on(
        "call-user",
        async ({ to, appointmentId }: { to: string; appointmentId?: string }) => {
          try {
            const rid = onlineUsers[to];
            if (!rid) {
              socket.emit("user-offline");
              return;
            }
            const roomId = `room_${Date.now()}`;
            (socket as any)._callData = {
              caller:    username,
              recipient: to,
              roomId,
              startedAt: new Date(),
            };
            io.to(rid).emit("incoming-call", { from: username, roomId, appointmentId });
            console.log(`${username} calling ${to}`);
          } catch (err) {
            logServerError("call-user", err);
          }
        }
      );

      // =====================================================
      // CALL ACCEPTED — unchanged
      // =====================================================

      socket.on(
        "call-accepted",
        ({ to, roomId }: { to: string; roomId: string }) => {
          const rid = onlineUsers[to];
          if (rid) io.to(rid).emit("call-accepted", { roomId });
        }
      );

      // =====================================================
      // CALL DECLINED — unchanged
      // =====================================================

      socket.on(
        "call-declined",
        ({ to }: { to: string }) => {
          const rid = onlineUsers[to];
          if (rid) io.to(rid).emit("call-declined");
        }
      );

      // =====================================================
      // WEBRTC SIGNALING — unchanged
      // =====================================================

      socket.on(
        "webrtc-signal",
        ({ to, signal }: { to: string; signal: unknown }) => {
          const rid = onlineUsers[to];
          if (rid) io.to(rid).emit("webrtc-signal", { signal });
        }
      );

      // =====================================================
      // CALL END — unchanged
      // =====================================================

      socket.on(
        "call-ended",
        async ({ to, duration }: { to: string; duration: number }) => {
          try {
            const rid = onlineUsers[to];
            if (rid) io.to(rid).emit("call-ended");
            const data = (socket as any)._callData;
            await CallLog.create({
              caller:    data?.caller    || username,
              recipient: data?.recipient || to,
              status:    "completed",
              duration,
              startedAt: data?.startedAt || new Date(),
              endedAt:   new Date(),
            });
          } catch (err) {
            logServerError("call-ended", err);
          }
        }
      );

      // =====================================================
      // DISCONNECT — unchanged
      // =====================================================

      socket.on("disconnect", async () => {
        try {
          delete onlineUsers[username];
          await User.findByIdAndUpdate(userId, {
            is_online: false,
            socket_id: "",
          });
          io.emit("users-updated");
          console.log("Socket disconnected:", username);
        } catch (err) {
          logServerError("disconnect", err);
        }
      });
    } catch (err) {
      logServerError("socket connection", err);
    }
  });
}

export function createSocketServer(httpServer: HttpServer): IOServer {
  const io = new Server(httpServer, {
    cors: {
      origin:  "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  registerSocketHandlers(io);
  return io;
}