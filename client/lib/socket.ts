import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const CHAT_PORT = 4000;

function resolveChatServer(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (__DEV__ && Platform.OS !== 'web' && typeof hostUri === 'string' && hostUri.length > 0) {
    const host = hostUri.split(':')[0]?.trim();
    const isTunnel =
      !host ||
      host.includes('exp.direct') ||
      host.endsWith('.exp.host') ||
      host.includes('expo.dev');
    if (!isTunnel) return `http://${host}:${CHAT_PORT}`;
  }
  if (Platform.OS === 'android') return `http://10.0.2.2:${CHAT_PORT}`;
  return `http://127.0.0.1:${CHAT_PORT}`;
}

const SOCKET_URL = resolveChatServer();

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(token: string): Socket {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    transports: ["polling", "websocket"],

    auth: {
      token,
    },

    autoConnect: false,

    reconnection: true,

    reconnectionAttempts: 10,

    reconnectionDelay: 1000,

    timeout: 20000,

    forceNew: true,
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.log("[Socket] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}