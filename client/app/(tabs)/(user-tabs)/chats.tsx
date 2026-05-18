import { API_URL, api } from '@/lib/api';
import { getAuthToken } from '@/lib/auth';
import { getApiErrorMessage, logClientError, logClientInfo } from '@/lib/log';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
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

type MeResponse = {
  id: string;
};

type MessageDto = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

type PeerPublic = {
  id: string;
  full_name: string;
  avatar_url: string;
};

const PEER_ID = process.env.EXPO_PUBLIC_CHAT_PEER_ID?.trim() ?? '';

const DEFAULT_PEER_AVATAR =
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function ChatScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const socketRef = useRef<Socket | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [draft, setDraft] = useState('');
  const [connecting, setConnecting] = useState(true);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [peerProfile, setPeerProfile] = useState<PeerPublic | null>(null);

  const peerId = PEER_ID;

  const loadHistory = useCallback(async () => {
    if (!peerId) return;
    try {
      const { data } = await api.get<MessageDto[]>(`/messages?peerId=${encodeURIComponent(peerId)}`);
      setMessages(
        [...data].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      );
    } catch (e) {
      logClientError('chat.loadHistory', e, { peerId });
      throw e;
    }
  }, [peerId]);

  useEffect(() => {
    if (!peerId) {
      if (__DEV__) {
        console.warn(
          '[chat] Set EXPO_PUBLIC_CHAT_PEER_ID in client/.env to a counselor user MongoDB _id to enable messaging.'
        );
      }
      setConnecting(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          router.replace('/login');
          return;
        }
        const [meRes, peerRes] = await Promise.all([
          api.get<MeResponse>('/users/me'),
          api.get<PeerPublic>(`/users/peer/${encodeURIComponent(peerId)}`).catch((e) => {
            logClientError('chat.loadPeerProfile', e, { peerId });
            return { data: null as PeerPublic | null };
          }),
        ]);
        await loadHistory();
        const meData = meRes.data;
        if (peerRes.data) {
          if (!cancelled) setPeerProfile(peerRes.data);
        } else if (!cancelled) {
          setPeerProfile({
            id: peerId,
            full_name: 'Counselor',
            avatar_url: '',
          });
        }
        if (!cancelled) {
          setCurrentUserId(meData.id);
        }

        const socket = io(API_URL, {
          transports: ['websocket'],
          auth: { token },
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          if (!cancelled) {
            setConnecting(false);
            setSocketError(null);
            logClientInfo('chat.socket', { event: 'connect', id: socket.id });
          }
        });

        socket.on('connect_error', (err: Error) => {
          if (!cancelled) {
            setConnecting(false);
            const msg = err?.message ?? 'Socket connect_error';
            setSocketError(msg);
            logClientError('chat.socket.connect_error', err, { apiUrl: API_URL });
          }
        });

        socket.on('disconnect', (reason: string) => {
          logClientInfo('chat.socket', { event: 'disconnect', reason });
        });

        socket.on('message:new', (payload: MessageDto) => {
          const uid = meData.id;
          const involvesMe =
            (payload.sender_id === uid || payload.receiver_id === uid) &&
            (payload.sender_id === peerId || payload.receiver_id === peerId);
          if (!involvesMe) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.id)) return prev;
            return [...prev, payload].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });
        });
      } catch (e) {
        if (!cancelled) {
          setConnecting(false);
          logClientError('chat.bootstrap', e, { peerId });
          Alert.alert('Unable to load chat', getApiErrorMessage(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [loadHistory, peerId]);

  const sendMessage = useCallback(() => {
    const text = draft.trim();
    if (!text || !peerId) return;
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      Alert.alert('Not connected', 'Please wait for the chat connection to finish.');
      return;
    }

    socket.emit(
      'send_message',
      { receiver_id: peerId, content: text },
      (ack: { ok?: boolean; error?: string; detail?: string; message?: MessageDto } | undefined) => {
        if (ack && ack.ok === false && typeof ack.error === 'string') {
          const detail = typeof ack.detail === 'string' ? `\n\n${ack.detail}` : '';
          logClientError('chat.send_message.ack', new Error(ack.error), { detail: ack.detail, ack });
          Alert.alert('Message not sent', `${ack.error}${detail}`);
        }
      }
    );
    setDraft('');
  }, [draft, peerId]);

  const bubbles = useMemo(() => {
    return messages.map((m) => {
      const mine = currentUserId != null && m.sender_id === currentUserId;
      return (
        <View
          key={m.id}
          style={[styles.messageRow, mine ? { justifyContent: 'flex-end' } : undefined]}
        >
          <View style={mine ? styles.outgoingBubble : styles.incomingBubble}>
            <Text style={styles.messageText}>{m.content}</Text>
            <Text style={mine ? styles.timeTextRight : styles.timeText}>
              {formatTime(m.created_at)}
              {mine ? (
                <>
                  {' '}
                  <Ionicons name="checkmark-done" size={14} color="#4ADE80" />
                </>
              ) : null}
            </Text>
          </View>
        </View>
      );
    });
  }, [messages, currentUserId]);

  const headerTitle = peerProfile?.full_name?.trim() ? `${peerProfile.full_name} (Counselor)` : 'Counselor';
  const peerAvatarUri =
    (peerProfile?.avatar_url ?? '').trim().length > 0 ? (peerProfile?.avatar_url ?? '').trim() : DEFAULT_PEER_AVATAR;
  const statusLabel = !peerId
    ? 'NO PEER'
    : connecting
      ? 'CONNECTING'
      : socketError
        ? 'OFFLINE'
        : 'ONLINE';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="chevron-left" size={28} color="#111827" /></TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <Text style={styles.onlineStatus}>{statusLabel}</Text>
        </View>
        <TouchableOpacity><Feather name="phone" size={20} color="#4ADE80" /></TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!peerId ? (
          <View style={styles.setupPanel}>
            <Feather name="settings" size={40} color="#6B7280" />
            <Text style={styles.setupTitle}>Chat is not configured</Text>
            <Text style={styles.setupBody}>
              Add{' '}
              <Text style={styles.mono}>EXPO_PUBLIC_CHAT_PEER_ID</Text> to <Text style={styles.mono}>client/.env</Text>{' '}
              with the MongoDB <Text style={styles.mono}>_id</Text> of the counselor account you want to message. Restart
              Expo after saving.
            </Text>
          </View>
        ) : null}
        <ScrollView
          ref={scrollRef}
          style={[styles.chatContainer, !peerId && styles.chatDisabled]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!peerId}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          
          <View style={styles.sessionInfo}>
            <Image source={{ uri: peerAvatarUri }} style={styles.doctorAvatar} />
            <View style={styles.onlineDot} />
            <Text style={styles.sessionStarted}>SESSION STARTED • TODAY</Text>
            <Text style={styles.secureText}>Your conversation is private and secure.</Text>
          </View>

          {bubbles}

          {/* Alert Box */}
          <View style={styles.alertBox}>
            <Feather name="alert-circle" size={20} color="#4B5563" style={{ marginTop: 2 }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.alertTitle}>Need Immediate Help? / አስቸኳይ እርዳታ ይፈልጋሉ?</Text>
              <Text style={styles.alertDesc}>
                Our counselors are here for you, but if you are in immediate danger, please reach out to emergency
                services.
              </Text>
            </View>
          </View>

        </ScrollView>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TouchableOpacity><Feather name="plus" size={24} color="#6B7280" /></TouchableOpacity>
          <TouchableOpacity style={{ marginLeft: 16 }}><Feather name="paperclip" size={20} color="#6B7280" /></TouchableOpacity>
          
          <View style={styles.textInputBox}>
            <TextInput
              style={styles.input}
              placeholder="Type your message... /"
              placeholderTextColor="#9CA3AF"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendMessage}
              editable={!!peerId}
            />
            <Feather name="smile" size={20} color="#6B7280" />
          </View>
          
          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
            disabled={!peerId}
            accessibilityState={{ disabled: !peerId }}
          >
            <Feather name="send" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  setupPanel: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 20,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'center',
  },
  setupTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 12, textAlign: 'center' },
  setupBody: { fontSize: 14, color: '#4B5563', marginTop: 10, lineHeight: 22, textAlign: 'center' },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13, color: '#111827' },
  chatDisabled: { opacity: 0.45 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitleContainer: { alignItems: 'center', flexDirection: 'row' },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginRight: 8 },
  onlineStatus: { fontSize: 10, fontWeight: 'bold', color: '#111827', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chatContainer: { flex: 1, padding: 20 },
  sessionInfo: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  doctorAvatar: { width: 50, height: 50, borderRadius: 25 },
  onlineDot: { position: 'absolute', top: 35, right: 140, width: 12, height: 12, backgroundColor: '#4ADE80', borderRadius: 6, borderWidth: 2, borderColor: '#FFF' },
  sessionStarted: { fontSize: 12, fontWeight: 'bold', color: '#4B5563', marginTop: 16, letterSpacing: 1 },
  secureText: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic', marginTop: 4 },
  messageRow: { marginBottom: 20, flexDirection: 'row' },
  incomingBubble: { backgroundColor: '#ECFDF5', padding: 16, borderRadius: 20, borderBottomLeftRadius: 4, maxWidth: '85%' },
  outgoingBubble: { backgroundColor: '#FFF4E6', padding: 16, borderRadius: 20, borderBottomRightRadius: 4, maxWidth: '85%' },
  messageText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  amharicMessageText: { fontSize: 13, color: '#4B5563', marginTop: 8, lineHeight: 20 },
  timeText: { fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'right' },
  timeTextRight: { fontSize: 11, color: '#9CA3AF', marginTop: 8, textAlign: 'right', alignItems: 'center' },
  alertBox: { flexDirection: 'row', backgroundColor: '#F3F4F6', padding: 16, borderRadius: 16, marginTop: 10, marginBottom: 40 },
  alertTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  alertDesc: { fontSize: 12, color: '#4B5563', lineHeight: 18 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  textInputBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 24, paddingHorizontal: 16, height: 48, marginLeft: 16, marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  sendButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
