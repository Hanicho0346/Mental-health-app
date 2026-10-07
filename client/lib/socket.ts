import { io, Socket } from 'socket.io-client';
import { resolveApiBaseUrl } from './resolveApiUrl';

function resolveChatServer(): string {
  const chatUrl = process.env.EXPO_PUBLIC_CHAT_SERVER_URL?.trim();
  if (chatUrl) return chatUrl.replace(/\/+$/, '');
  return resolveApiBaseUrl();
}

const SOCKET_URL = resolveChatServer();

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(token?: string): Socket {
  if (socket) {
    if (socket.connected) return socket;
    socket.disconnect();
    socket = null;
  }

  if (!token?.trim()) {
    throw new Error('Socket requires an authentication token');
  }

  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  socket.on('connect', () => console.log('[Socket] Connected:', socket?.id));
  socket.on('connect_error', (err) => console.log('[Socket] Error:', err.message));
  socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));

  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
