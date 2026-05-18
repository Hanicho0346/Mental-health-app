import { API_URL, api } from '@/lib/api';
import { getAuthToken } from '@/lib/auth';
import { getApiErrorMessage, logClientError, logClientInfo } from '@/lib/log';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';

type MeResponse = { id: string };
type MessageDto = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};
type PeerPublic = { id: string; full_name: string; avatar_url: string };

const DEFAULT_PEER_AVATAR =
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function DirectChatScreen() {
  const { id: peerId } = useLocalSearchParams<{ id: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [peerProfile, setPeerProfile] = useState<PeerPublic | null>(null);

  const loadHistory = useCallback(async () => {
    if (!peerId) return;
    try {
      const { data } = await api.get<MessageDto[]>(`/messages?peerId=${encodeURIComponent(peerId)}`);
      setMessages([...data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    } catch (e) {
      logClientError('directChat.loadHistory', e, { peerId });
      throw e;
    }
  }, [peerId]);

  useEffect(() => {
    if (!peerId) {
      setConnecting(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) { router.replace('/login'); return; }
        const [meRes, peerRes] = await Promise.all([
          api.get<MeResponse>('/users/me'),
          api.get<PeerPublic>(`/users/peer/${encodeURIComponent(peerId)}`).catch((e) => {
            logClientError('directChat.loadPeer', e, { peerId });
            return { data: null as PeerPublic | null };
          }),
        ]);
        await loadHistory();
        if (!cancelled) {
          setCurrentUserId(meRes.data.id);
          setPeerProfile(peerRes.data ?? { id: peerId, full_name: 'User', avatar_url: '' });
        }
        const socket = io(API_URL, { transports: ['websocket'], auth: { token } });
        socketRef.current = socket;
        socket.on('connect', () => { if (!cancelled) { setConnecting(false); setSocketError(null); logClientInfo('directChat.socket', { event: 'connect' }); } });
        socket.on('connect_error', (err: Error) => { if (!cancelled) { setConnecting(false); setSocketError(err?.message ?? 'connect_error'); logClientError('directChat.socket.connect_error', err); } });
        socket.on('disconnect', (reason: string) => logClientInfo('directChat.socket', { event: 'disconnect', reason }));
        socket.on('message:new', (payload: MessageDto) => {
          const uid = meRes.data.id;
          const involvesMe = (payload.sender_id === uid || payload.receiver_id === uid) && (payload.sender_id === peerId || payload.receiver_id === peerId);
          if (!involvesMe) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            return [...prev, payload].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });
        });
      } catch (e) {
        if (!cancelled) { setConnecting(false); logClientError('directChat.bootstrap', e, { peerId }); Alert.alert('Unable to load chat', getApiErrorMessage(e)); }
      }
    })();
    return () => { cancelled = true; socketRef.current?.disconnect(); socketRef.current = null; };
  }, [loadHistory, peerId]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !peerId) return;
    const socket = socketRef.current;
    if (!socket?.connected) { Alert.alert('Not connected', 'Please wait for the connection to finish.'); return; }
    socket.emit('send_message', { receiver_id: peerId, content: text }, (ack: { ok?: boolean; error?: string; detail?: string } | undefined) => {
      if (ack?.ok === false && typeof ack.error === 'string') {
        logClientError('directChat.send_message.ack', new Error(ack.error), { detail: ack.detail });
        Alert.alert('Message not sent', ack.error);
      }
    });
    setDraft('');
  }, [draft, peerId]);

  const bubbles = useMemo(() => messages.map((m) => {
    const mine = currentUserId != null && m.sender_id === currentUserId;
    return (
      <View key={m.id} style={[styles.messageRow, mine ? { justifyContent: 'flex-end' } : undefined]}>
        <View style={mine ? styles.outgoingBubble : styles.incomingBubble}>
          <Text style={styles.messageText}>{m.content}</Text>
          <Text style={styles.timeText}>
            {formatTime(m.created_at)}
            {mine ? <> <Ionicons name="checkmark-done" size={14} color="#4ADE80" /></> : null}
          </Text>
        </View>
      </View>
    );
  }), [messages, currentUserId]);

  const headerTitle = peerProfile?.full_name?.trim() || 'Chat';
  const peerAvatarUri = peerProfile?.avatar_url?.trim() || DEFAULT_PEER_AVATAR;
  const statusLabel = connecting ? 'CONNECTING' : socketError ? 'OFFLINE' : 'ONLINE';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="chevron-left" size={28} color="#111827" /></TouchableOpacity>
        <View style={styles.headerCenter}>
          <Image source={{ uri: peerAvatarUri }} style={styles.headerAvatar} />
          <View>
            <Text style={styles.headerTitle}>{headerTitle}</Text>
            <Text style={styles.onlineStatus}>{statusLabel}</Text>
          </View>
        </View>
        <TouchableOpacity><Feather name="phone" size={20} color="#4ADE80" /></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={styles.chatContainer}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.sessionInfo}>
            <Text style={styles.sessionStarted}>SESSION STARTED • TODAY</Text>
            <Text style={styles.secureText}>Your conversation is private and secure.</Text>
          </View>
          {bubbles}
          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={styles.inputContainer}>
          <View style={styles.textInputBox}>
            <TextInput
              style={styles.input}
              placeholder="Type your message..."
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendMessage}
            />
          </View>
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Feather name="send" size={20} color="#4ADE80" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerTitle: { fontSize: 15, fontWeight: 'bold', color: '#111827' },
  onlineStatus: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  chatContainer: { flex: 1, paddingHorizontal: 20 },
  sessionInfo: { alignItems: 'center', marginVertical: 20 },
  sessionStarted: { fontSize: 12, fontWeight: 'bold', color: '#4B5563', letterSpacing: 1 },
  secureText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  messageRow: { marginBottom: 16, flexDirection: 'row' },
  incomingBubble: { backgroundColor: '#ECFDF5', padding: 14, borderRadius: 18, borderBottomLeftRadius: 4, maxWidth: '80%' },
  outgoingBubble: { backgroundColor: '#FFF4E6', padding: 14, borderRadius: 18, borderBottomRightRadius: 4, maxWidth: '80%' },
  messageText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 6, textAlign: 'right' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB', gap: 10 },
  textInputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 24, paddingHorizontal: 16, height: 46 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  sendButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 22 },
});
