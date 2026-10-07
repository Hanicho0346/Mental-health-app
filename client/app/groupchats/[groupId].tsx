import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";
import { getApiErrorMessage } from "@/lib/log";

type GroupMessage = {
  id: string;
  group_id: string;
  from: { _id?: string; full_name?: string; avatar_url?: string };
  content: string;
  type: string;
  timestamp: string;
};

type GroupMember = { _id: string; full_name?: string; avatar_url?: string; is_online?: boolean };
type GroupAdmin = { _id: string; full_name?: string };

type GroupDetail = {
  _id: string;
  name: string;
  description: string;
  members: GroupMember[];
  admins: GroupAdmin[];
  avatar_color: string;
};

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#0891b2", "#78350f", "#9918ab"];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function GroupChatScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const me = useChatStore((s) => s.me);
  const currentUserId = me?._id ?? me?.userId;

  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const limit = 50;

  const flatListRef = useRef<FlatList>(null);
  const loadingMoreRef = useRef(false);

  const loadGroup = useCallback(async () => {
    if (!groupId) return;
    try {
      const { data } = await api.get<GroupDetail>(`/group-chats/${groupId}`);
      setGroup(data);
    } catch (err: unknown) {
      alert(getApiErrorMessage(err));
    }
  }, [groupId]);

  const loadMessages = useCallback(
    async (reset = false) => {
      if (!groupId || (!reset && !hasMore)) return;

      const before =
        !reset && messages.length > 0
          ? messages[0]?.timestamp ?? undefined
          : undefined;

      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (before) params.set("before", before);

        const { data } = await api.get<GroupMessage[]>(
          `/group-chats/${groupId}/messages?${params.toString()}`
        );

        if (reset) {
          setMessages(data ?? []);
        } else {
          setMessages((prev) => [...(data ?? []), ...prev]);
        }

        setHasMore((data ?? []).length === limit);
      } catch (err: unknown) {
        if (reset) {
          Alert.alert("Error", getApiErrorMessage(err));
        }
      } finally {
        if (reset) setLoading(false);
        loadingMoreRef.current = false;
      }
    },
    [groupId, messages, hasMore]
  );

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !groupId || sending) return;

    const content = draft.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const optimistic: GroupMessage = {
      id: tempId,
      group_id: groupId,
      from: { _id: currentUserId ?? "me", full_name: me?.full_name ?? "You" },
      content,
      type: "text",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);

    try {
      const { data } = await api.post(`/group-chats/${groupId}/messages`, {
        content,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: data.id, from: { _id: currentUserId ?? "me", full_name: me?.full_name ?? "You" } }
            : m
        )
      );
    } catch (err: unknown) {
      Alert.alert("Error", getApiErrorMessage(err));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, id: `err-${m.id}` } : m
        )
      );
    } finally {
      setSending(false);
    }
  }, [draft, groupId, sending, currentUserId, me]);

  useEffect(() => {
    void loadGroup();
    void loadMessages(true);
  }, [loadGroup, loadMessages]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !groupId) return;

    const joinAck: { ok?: boolean } = {};
    socket.emit("join-group", { groupId }, (res: { ok?: boolean }) => {
      Object.assign(joinAck, res);
    });

    const onGroupMessage = (msg: GroupMessage) => {
      if (msg.group_id !== groupId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    socket.on("group-message", onGroupMessage);

    return () => {
      socket.off("group-message", onGroupMessage);
      socket.emit("leave-group", { groupId });
    };
  }, [groupId]);

  const loadMore = () => {
    if (!loading && hasMore && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      void loadMessages(false);
    }
  };

  const renderMessage = ({ item }: { item: GroupMessage }) => {
    const isMe = item.from?._id === currentUserId;
    const senderName = item.from?.full_name ?? "Unknown";

    return (
      <View
        style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}
      >
        {!isMe && (
          <View
            style={[
              styles.msgAvatar,
              { backgroundColor: getAvatarColor(senderName) },
            ]}
          >
            <Text style={styles.msgAvatarTxt}>
              {getInitials(senderName)}
            </Text>
          </View>
        )}
        <View
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
        >
          {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
          <Text style={isMe ? styles.textMe : styles.textThem}>{item.content}</Text>
          <Text
            style={[
              styles.timeText,
              { color: isMe ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" },
            ]}
          >
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading group...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = group?.name ?? "Group Chat";
  const avatarColor = group?.avatar_color ?? getAvatarColor(displayName);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarTxt}>{getInitials(displayName)}</Text>
        </View>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.headerStatus}>
            {group?.members?.length ?? 0}{" "}
            member{group?.members?.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <TouchableOpacity style={styles.callBtn} onPress={() => {}}>
          <Feather name="video" size={22} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Be the first to say hello!
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              loading && messages.length > 0 ? (
                <ActivityIndicator style={{ margin: 12 }} color="#2563eb" />
              ) : null
            }
          />
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message the group..."
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            editable={!sending}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              (!draft.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5E5EA" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, fontSize: 16, color: "#6b7280" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: { padding: 5 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 5,
  },
  avatarTxt: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  headerStatus: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  callBtn: { padding: 10, backgroundColor: "#eff6ff", borderRadius: 20 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 16, color: "#6b7280" },
  emptySubtext: { fontSize: 14, color: "#9ca3af" },
   chatList: { padding: 16, gap: 8, flexGrow: 1 },
   msgWrapper: { flexDirection: "row", maxWidth: "85%" },
   msgRight: { alignSelf: "flex-end", justifyContent: "flex-end" },
   msgLeft: { alignSelf: "flex-start", justifyContent: "flex-start" },
   msgAvatar: {
     width: 32,
     height: 32,
     borderRadius: 16,
     backgroundColor: "#2563eb",
     justifyContent: "center",
     alignItems: "center",
     marginRight: 8,
   },
   msgAvatarTxt: { color: "#fff", fontSize: 12, fontWeight: "bold" },
   bubble: { padding: 12, borderRadius: 20, maxWidth: "100%" },
  bubbleMe: { backgroundColor: "#2563eb", borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  senderName: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 2,
  },
  textMe: { color: "#fff", fontSize: 15, lineHeight: 20 },
  textThem: { color: "#111827", fontSize: 15, lineHeight: 20 },
  timeText: { fontSize: 11, marginTop: 4 },
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#fff",
    paddingBottom: Platform.OS === "ios" ? 20 : 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    marginHorizontal: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#9ca3af", opacity: 0.5 },
});
