import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useChatStore, ChatMessage, CallLog } from '@/stores/chatStore';
import { initSocket, getSocket, disconnectSocket } from './socket';

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

export const CHAT_SERVER = resolveChatServer();

let _me = '';
let _peer = () => useChatStore.getState().peer;

export function connectSocket(username: string, token?: string): void {
  _me = username;
  const socket = initSocket();
  if (socket?.connected) return;

  // Set auth token if provided
  if (token) {
    socket.auth = { token };
  }

  socket.on('connect', () => {
    console.log('[Socket] Connected as:', username);
    socket!.emit('user-online', { username });
  });

  socket.on('users-updated', async () => {
    try {
      const r = await fetch(`${CHAT_SERVER}/api/chat/users`);
      const users = await r.json();
      useChatStore.getState().setUsers(users);
    } catch (e) {
      console.error('[Socket] Failed to load users:', e);
    }
  });

  socket.on('receive-message', (msg: ChatMessage) => {
    const peer = _peer();
    if (!peer) return;
    const involves =
      (msg.from === _me && msg.to === peer) ||
      (msg.from === peer && msg.to === _me);
    if (involves) useChatStore.getState().appendMessage(msg);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.connect();
}

export { getSocket };

export function emitSendMessage(from: string, to: string, content: string): void {
  getSocket()?.emit('send-message', { from, to, content });
}

export function emitSendVoice(from: string, to: string, fileUrl: string): void {
  getSocket()?.emit('send-voice', { from, to, fileUrl });
}

export function emitCallUser(from: string, to: string): void {
  getSocket()?.emit('call-user', { from, to });
}

export function emitCallAccepted(from: string, to: string): void {
  getSocket()?.emit('call-accepted', { from, to });
}

export function emitCallDeclined(from: string, to: string): void {
  getSocket()?.emit('call-declined', { from, to });
}

export function emitCallEnded(from: string, to: string, duration: number): void {
  getSocket()?.emit('call-ended', { from, to, duration });
}

export function emitSpSignal(to: string, signal: unknown): void {
  getSocket()?.emit('sp-signal', { to, signal });
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<{ userId: string; username: string }> {
  const r = await fetch(`${CHAT_SERVER}/api/chat/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Login failed');
  return d;
}

export async function apiLoadUsers(): Promise<void> {
  const r = await fetch(`${CHAT_SERVER}/api/chat/users`);
  useChatStore.getState().setUsers(await r.json());
}

export async function apiLoadTimeline(userA: string, userB: string): Promise<void> {
  const [mRes, cRes] = await Promise.all([
    fetch(`${CHAT_SERVER}/api/chat/messages/${userA}/${userB}`),
    fetch(`${CHAT_SERVER}/api/chat/calls/${userA}/${userB}`),
  ]);
  const messages: ChatMessage[] = await mRes.json();
  const calls: CallLog[] = await cRes.json();
  const tagged = [
    ...messages.map((m) => ({ ...m, _kind: 'msg' as const })),
    ...calls.map((c) => ({ ...c, _kind: 'call' as const })),
  ].sort(
    (a, b) =>
      new Date(a._kind === 'msg' ? a.timestamp : a.startedAt).getTime() -
      new Date(b._kind === 'msg' ? b.timestamp : b.startedAt).getTime(),
  );
  useChatStore.getState().setTimeline(tagged);
}

export async function apiUploadVoice(uri: string): Promise<string> {
  const fd = new FormData();
  fd.append('audio', { uri, name: 'voice.webm', type: 'audio/webm' } as any);
  const r = await fetch(`${CHAT_SERVER}/api/chat/upload-voice`, { method: 'POST', body: fd });
  const d = await r.json();
  if (d.error) throw new Error(d.error);
  return d.fileUrl as string;
}
