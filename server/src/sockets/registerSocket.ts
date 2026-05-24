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
import { CallLog } from "../models/CallLog.js";

const onlineUsers: Record<string, string> = {};

export function registerSocketHandlers(io: IOServer): void {
  // =========================================================
  // AUTH MIDDLEWARE
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

      const user = await User.findOne({
        clerk_id: clerk.clerkId,
      });

      if (!user) {
        next(new Error("Unauthorized"));
        return;
      }

      (socket.data as { userId: string }).userId =
        user._id.toString();

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

      // join secure room
      await socket.join(roomForUser(userId));

      // get current user
      const currentUser = await User.findById(userId);

      if (!currentUser) {
        socket.disconnect();
        return;
      }

      const username =
        currentUser.chat_username ||
        currentUser.full_name ||
        userId;

      // save online socket
      onlineUsers[username] = socket.id;

      // mark online
      await User.findByIdAndUpdate(userId, {
        is_online: true,
        socket_id: socket.id,
      });

      // notify everyone
      io.emit("users-updated");

      console.log("Socket connected:", username);

      // =====================================================
      // CHAT MESSAGE
      // =====================================================

      socket.on(
        "send-message",
        async (
          payload: {
            to: string;
            content: string;
          },
          ack?: (response: unknown) => void
        ) => {
          try {
            const { to, content } = payload;

            if (!to || !content?.trim()) {
              ack?.({
                ok: false,
                error: "Invalid message",
              });

              return;
            }

            const receiver = await User.findOne({
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
            const result = await persistMessage(
              userId,
              receiver._id.toString(),
              content
            );

            if (!result.ok) {
              ack?.(result);
              return;
            }

            // chat ui message
            const chatMessage = await ChatMessage.create({
              from: username,
              to,
              type: "text",
              content,
            });

            const receiverSocket = onlineUsers[to];

            if (receiverSocket) {
              io.to(receiverSocket).emit(
                "receive-message",
                chatMessage
              );
            }

            socket.emit("receive-message", chatMessage);

            ack?.({
              ok: true,
              message: chatMessage,
              messageId: chatMessage._id,
            });
          } catch (err) {
            logServerError("send-message", err);

            ack?.({
              ok: false,
              error: "Failed to send message",
            });
          }
        }
      );

      // =====================================================
      // VOICE MESSAGE
      // =====================================================

      socket.on(
        "send-voice",
        async ({
          to,
          fileUrl,
        }: {
          to: string;
          fileUrl: string;
        }) => {
          try {
            const msg = await ChatMessage.create({
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
          } catch (err) {
            logServerError("send-voice", err);
          }
        }
      );

      // =====================================================
      // VIDEO CALL START
      // =====================================================

      socket.on(
        "call-user",
        async ({
          to,
          appointmentId,
        }: {
          to: string;
          appointmentId?: string;
        }) => {
          try {
            const rid = onlineUsers[to];

            if (!rid) {
              socket.emit("user-offline");
              return;
            }

            const roomId = `room_${Date.now()}`;

            (socket as any)._callData = {
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
          } catch (err) {
            logServerError("call-user", err);
          }
        }
      );

      // =====================================================
      // CALL ACCEPTED
      // =====================================================

      socket.on(
        "call-accepted",
        ({
          to,
          roomId,
        }: {
          to: string;
          roomId: string;
        }) => {
          const rid = onlineUsers[to];

          if (rid) {
            io.to(rid).emit("call-accepted", {
              roomId,
            });
          }
        }
      );

      // =====================================================
      // CALL DECLINED
      // =====================================================

      socket.on(
        "call-declined",
        ({ to }: { to: string }) => {
          const rid = onlineUsers[to];

          if (rid) {
            io.to(rid).emit("call-declined");
          }
        }
      );

      // =====================================================
      // WEBRTC SIGNALING
      // =====================================================

      socket.on(
        "webrtc-signal",
        ({
          to,
          signal,
        }: {
          to: string;
          signal: unknown;
        }) => {
          const rid = onlineUsers[to];

          if (rid) {
            io.to(rid).emit("webrtc-signal", {
              signal,
            });
          }
        }
      );

      // =====================================================
      // CALL END
      // =====================================================

      socket.on(
        "call-ended",
        async ({
          to,
          duration,
        }: {
          to: string;
          duration: number;
        }) => {
          try {
            const rid = onlineUsers[to];

            if (rid) {
              io.to(rid).emit("call-ended");
            }

            const data = (socket as any)._callData;

            await CallLog.create({
              caller: data?.caller || username,
              recipient: data?.recipient || to,
              status: "completed",
              duration,
              startedAt:
                data?.startedAt || new Date(),
              endedAt: new Date(),
            });
          } catch (err) {
            logServerError("call-ended", err);
          }
        }
      );

      // =====================================================
      // DISCONNECT
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

export function createSocketServer(
  httpServer: HttpServer
): IOServer {
  const io = new Server(httpServer, {
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