import { useChatStore, ChatMessage, CallLog } from '@/stores/chatStore';
import { initSocket, getSocket } from './socket';
import { API_URL } from './api';
import { getStoredAuthToken } from './auth';

export const CHAT_SERVER = API_URL;

let _me = '';
let _peer = () => useChatStore.getState().peer;

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await import('@/stores/authStore')).useAuthStore.getState().accessToken || (await getStoredAuthToken());
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function legacyFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = {
  ...(await authHeaders()),
  ...(init?.headers as Record<string, string> | undefined),
  };
  return fetch(`${CHAT_SERVER}${path}`, { ...init, headers });
}

export function connectSocket(username: string, token?: string): void {
  _me = username;
  const socket = initSocket(token);

  socket.on('connect', () => {
    if (__DEV__) console.log('[Socket] Connected');
    socket!.emit('user-online', { username });
  });

  socket.on('users-updated', async () => {
    try {
      const r = await legacyFetch('/api/chat/users');
      if (!r.ok) return;
      const users = await r.json();
      useChatStore.getState().setUsers(users);
    } catch (e) {
      if (__DEV__) console.error('[Socket] Failed to load users:', e);
    }
  });

  socket.on('receive-message', (msg: Record<string, unknown>) => {
    const peer = _peer();
    if (!peer) return;
    const senderId = (msg.sender_id as { toString?: () => string })?.toString?.() ?? String(msg.from ?? '');
    const receiverId = (msg.receiver_id as { toString?: () => string })?.toString?.() ?? String(msg.to ?? '');
    const involves =
      (senderId === _me && receiverId === peer) ||
      (senderId === peer && receiverId === _me);
    if (involves) {
      useChatStore.getState().appendMessage({
        ...msg,
        from: senderId,
        to: receiverId,
        timestamp: (msg.created_at as string | undefined) ?? (msg.timestamp as string | undefined),
      } as ChatMessage);
    }
  });

  socket.on('connect_error', (err) => {
    if (__DEV__) console.error('[Socket] Connection error:', err);
  });

  socket.on('disconnect', (reason) => {
    if (__DEV__) console.log('[Socket] Disconnected:', reason);
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

/** @deprecated Legacy chat login — server derives identity from Bearer token. */
export async function apiLogin(
  username: string,
  _password: string,
): Promise<{ userId: string; username: string }> {
  const r = await legacyFetch('/api/chat/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? 'Login failed');
  return d;
}

export async function apiLoadUsers(): Promise<void> {
  const r = await legacyFetch('/api/chat/users');
  if (!r.ok) throw new Error('Failed to load users');
  useChatStore.getState().setUsers(await r.json());
}

export async function apiLoadTimeline(userA: string, userB: string): Promise<void> {
  const [mRes, cRes] = await Promise.all([
    legacyFetch(`/api/chat/messages/${encodeURIComponent(userA)}/${encodeURIComponent(userB)}`),
    legacyFetch(`/api/chat/calls/${encodeURIComponent(userA)}/${encodeURIComponent(userB)}`),
  ]);
  if (!mRes.ok || !cRes.ok) throw new Error('Failed to load timeline');
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
  fd.append('audio', { uri, name: 'voice.webm', type: 'audio/webm' } as unknown as Blob);
  const headers = await authHeaders();
  const r = await fetch(`${CHAT_SERVER}/api/chat/upload-voice`, {
    method: 'POST',
    headers,
    body: fd,
  });
  const d = await r.json();
  if (!r.ok || d.error) throw new Error(d.error ?? 'Upload failed');
  return d.fileUrl as string;
}
