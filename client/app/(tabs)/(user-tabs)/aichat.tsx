// app/(tabs)/(user-tabs)/ai-chat.tsx
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

type UsageInfo = {
  chats_used_today: number | null;
  daily_limit: number | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const GREEN = '#4ADE80';
const GREEN_DARK = '#16A34A';
const TEAL = '#0D9488';

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Selam! 👋 I'm Dr. Selam, your mental wellness companion.\n\nI'm here to listen, support, and guide you through whatever you're feeling — anxiety, stress, relationship challenges, grief, or simply needing someone to talk to.\n\nEverything you share stays between us. How are you feeling today?",
};

const QUICK_PROMPTS = [
  "I've been feeling anxious lately",
  'I need help managing stress',
  'I feel overwhelmed and don\'t know why',
  'I want to talk about my relationships',
];

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View style={[bubbleStyles.row, isUser && bubbleStyles.rowReverse]}>
      {!isUser && (
        <View style={bubbleStyles.avatar}>
          <Text style={bubbleStyles.avatarText}>Dr</Text>
        </View>
      )}
      <View
        style={[
          bubbleStyles.bubble,
          isUser ? bubbleStyles.userBubble : bubbleStyles.aiBubble,
        ]}
      >
        <Text
          style={[
            bubbleStyles.text,
            isUser ? bubbleStyles.userText : bubbleStyles.aiText,
          ]}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <View style={[bubbleStyles.row]}>
      <View style={bubbleStyles.avatar}>
        <Text style={bubbleStyles.avatarText}>Dr</Text>
      </View>
      <View style={[bubbleStyles.bubble, bubbleStyles.aiBubble, { paddingVertical: 14 }]}>
        <View style={typingStyles.dots}>
          <View style={[typingStyles.dot, { opacity: 0.4 }]} />
          <View style={[typingStyles.dot, { opacity: 0.7 }]} />
          <View style={[typingStyles.dot, { opacity: 1 }]} />
        </View>
      </View>
    </View>
  );
}

// ─── Usage Bar ────────────────────────────────────────────────────────────────

function UsageBar({ usage }: { usage: UsageInfo | null }) {
  if (!usage || usage.daily_limit === null) return null; // unlimited

  const pct = Math.min(usage.chats_used_today! / usage.daily_limit, 1);
  const remaining = usage.daily_limit - (usage.chats_used_today ?? 0);
  const isLow = remaining <= 2;

  return (
    <View style={usageStyles.container}>
      <View style={usageStyles.track}>
        <View
          style={[
            usageStyles.fill,
            { width: `${pct * 100}%`, backgroundColor: isLow ? '#EF4444' : GREEN_DARK },
          ]}
        />
      </View>
      <Text style={[usageStyles.label, isLow && { color: '#EF4444' }]}>
        {remaining} {remaining === 1 ? 'message' : 'messages'} left today
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AIChatScreen() {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Load history on mount
  useEffect(() => {
    void loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await api.get<Message[]>('/ai-chat/history');
      if (res.data.length > 0) {
        setMessages([WELCOME_MESSAGE, ...res.data]);
      }
    } catch {
      // history load failure is non-critical
    } finally {
      setHistoryLoading(false);
    }
  }

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading || limitReached) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Build history for context (last 10 messages, skip welcome)
    const history = messages
      .filter(m => m.id !== 'welcome')
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await api.post<{ response: string; usage: UsageInfo }>('/ai-chat/message', {
        message: content,
        history,
      });

      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: res.data.response,
      };

      setMessages(prev => [...prev, aiMsg]);
      setUsage(res.data.usage);
    } catch (e: any) {
      if (e?.response?.data?.limit_reached) {
        setLimitReached(true);
        const limitMsg: Message = {
          id: `limit-${Date.now()}`,
          role: 'assistant',
          content:
            "You've reached your daily AI chat limit. 🌙 Upgrade to Premier for unlimited conversations with me anytime.\n\nTake care of yourself until tomorrow — you're doing great. 💚",
        };
        setMessages(prev => [...prev, limitMsg]);
      } else {
        Alert.alert('Error', getApiErrorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, []);

  useEffect(() => {
    if (messages.length > 1) scrollToBottom();
  }, [messages, loading]);

  async function clearHistory() {
    Alert.alert(
      'Clear Conversation',
      'This will delete your chat history with Dr. Selam. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete('/ai-chat/history');
              setMessages([WELCOME_MESSAGE]);
              setLimitReached(false);
            } catch (e) {
              Alert.alert('Error', getApiErrorMessage(e));
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.drAvatar}>
            <Text style={styles.drAvatarText}>Dr</Text>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerName}>Dr. Selam</Text>
            <Text style={styles.headerSub}>Mental Wellness AI · Always here</Text>
          </View>
        </View>
        <TouchableOpacity onPress={clearHistory} style={styles.clearBtn}>
          <Feather name="trash-2" size={18} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Usage bar */}
      <UsageBar usage={usage} />

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {historyLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={GREEN_DARK} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={item => item.id}
            renderItem={({ item }) => <MessageBubble message={item} />}
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={loading ? <TypingIndicator /> : null}
          />
        )}

        {/* Quick prompts — shown when only welcome message */}
        {messages.length === 1 && !loading && (
          <View style={styles.quickPrompts}>
            <Text style={styles.quickPromptsLabel}>Tap to get started</Text>
            <View style={styles.quickPromptsGrid}>
              {QUICK_PROMPTS.map(prompt => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.quickChip}
                  onPress={() => sendMessage(prompt)}
                >
                  <Text style={styles.quickChipText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputBar}>
          {limitReached ? (
            <View style={styles.limitBanner}>
              <Feather name="moon" size={16} color="#6B7280" />
              <Text style={styles.limitBannerText}>
                Daily limit reached. Upgrade for unlimited chats.
              </Text>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Share what's on your mind…"
                placeholderTextColor="#9CA3AF"
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={1000}
                onSubmitEditing={() => sendMessage()}
                editable={!loading}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
                onPress={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 16,
    paddingHorizontal: 16,
    gap: 10,
  },
  rowReverse: { flexDirection: 'row-reverse' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 11, fontWeight: '800', color: GREEN_DARK },
  bubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: GREEN_DARK,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  text: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  aiText: { color: '#111827' },
});

const typingStyles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#9CA3AF',
  },
});

const usageStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  track: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2 },
  label: { fontSize: 11, color: '#6B7280', fontWeight: '600', minWidth: 100 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  drAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  drAvatarText: { fontSize: 13, fontWeight: '800', color: GREEN_DARK },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerName: { fontSize: 16, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  messageList: { paddingTop: 20, paddingBottom: 8 },

  quickPrompts: { paddingHorizontal: 16, paddingBottom: 12 },
  quickPromptsLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  quickPromptsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  quickChipText: { fontSize: 13, color: '#374151', fontWeight: '500' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    maxHeight: 120,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN_DARK,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1FAE5' },

  limitBanner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  limitBannerText: { flex: 1, fontSize: 13, color: '#6B7280' },
});