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
import { useAuth } from "@clerk/clerk-expo";
import axios from "axios";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  status: "sending" | "sent" | "error";
};

export default function UserDirectChatScreen() {
  const { peer: peerId } = useLocalSearchParams<{ peer: string }>();
  const { getToken, userId } = useAuth();
  const me = useChatStore((s) => s.me);

  // userId from Clerk is the Clerk ID — backend resolves it to MongoDB _id via JWT middleware
 const currentUserId = me?._id ?? userId;

  const [messages, setMessages]   = useState<Message[]>([]);
  const [draft, setDraft]         = useState("");
  const [loading, setLoading]     = useState(true);
  const [sending, setSending]     = useState(false);
  const [peerName, setPeerName]   = useState<string>("");
  const flatListRef               = useRef<FlatList>(null);
  const tempIds                   = useRef<Set<string>>(new Set());

  // ── Load history ────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!peerId) { setLoading(false); return; }
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      const { data } = await axios.get(`${API_URL}/api/messages`, {
        params:  { peerId },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });

      if (Array.isArray(data)) {
        setMessages(data.map((m: any) => ({ ...m, status: "sent" as const })));
        tempIds.current.clear();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        Alert.alert(
          "Session Required",
          "You need a paid booking to chat with this psychiatrist.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } finally {
      setLoading(false);
    }
  }, [peerId, getToken]);

  // ── Load peer name from my-psychiatrists list ───────────────────────────
  const loadPeerName = useCallback(async () => {
    if (!peerId) return;
    try {
      const token = await getToken();
      const { data } = await axios.get(`${API_URL}/api/bookings/my-psychiatrists`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const match = (data.psychiatrists ?? []).find((p: any) => p.id === peerId);
      if (match) setPeerName(match.full_name);
    } catch { /* silently fail — header will show ID as fallback */ }
  }, [peerId, getToken]);

  useEffect(() => {
    void loadHistory();
    void loadPeerName();
  }, [loadHistory, loadPeerName]);

  // ── Socket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId) return;

    const onMessageNew = (data: any) => {
      if (data.sender_id !== peerId && data.receiver_id !== peerId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, { ...data, status: "sent" as const }];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const onReceive = (msg: any) => {
      if (msg.from !== peerId && msg.to !== peerId) return;
      setMessages((prev) => {
        const id = msg._id?.toString() ?? msg.id;
        if (prev.find((m) => m.id === id)) return prev;
        return [...prev, {
          id,
          sender_id:   msg.from,
          receiver_id: msg.to,
          content:     msg.content,
          created_at:  msg.timestamp ?? new Date().toISOString(),
          status:      "sent" as const,
        }];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    // WebRTC listeners — untouched
    socket.on("incoming-call",  ({ from }: { from: string }) => {});
    socket.on("call-accepted",  () => {});
    socket.on("call-declined",  () => {});
    socket.on("call-ended",     () => {});

    socket.on("message:new",    onMessageNew);
    socket.on("receive-message", onReceive);

    return () => {
      socket.off("message:new",    onMessageNew);
      socket.off("receive-message", onReceive);
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("call-declined");
      socket.off("call-ended");
    };
  }, [peerId]);

  // ── Send via REST ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !peerId || sending) return;

    setSending(true);
    const tempId  = `temp-${Date.now()}-${Math.random()}`;
    const content = draft.trim();

    const optimistic: Message = {
      id:          tempId,
      sender_id:   currentUserId ?? "me",
      receiver_id: peerId,
      content,
      created_at:  new Date().toISOString(),
      status:      "sending",
    };

    tempIds.current.add(tempId);
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      const { data } = await axios.post(
        `${API_URL}/api/messages`,
        { receiver_id: peerId, content },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      setMessages((prev) => {
        tempIds.current.delete(tempId);
        return prev.map((m) => m.id === tempId ? { ...data, status: "sent" as const } : m);
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.error ?? "Failed to send message";
      setMessages((prev) =>
        prev.map((m) => m.id === tempId ? { ...m, status: "error" as const } : m)
      );
      Alert.alert("Error", errMsg);
      tempIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending, getToken]);

  const startCall = () => getSocket()?.emit("call-user", { to: peerId });

  // ── Render ──────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={isMe ? styles.textMe : styles.textThem}>{item.content}</Text>
          <View style={styles.msgFooter}>
            <Text style={[styles.timeText, { color: isMe ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" }]}>
              {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            {isMe && item.status === "sending" && (
              <ActivityIndicator size="small" color="#a7f3d0" style={{ marginLeft: 4 }} />
            )}
            {isMe && item.status === "sent" && (
              <Ionicons name="checkmark-done" size={14} color="#fff" />
            )}
            {isMe && item.status === "error" && (
              <Ionicons name="alert-circle" size={14} color="#ef4444" />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ marginTop: 10, color: "#6b7280" }}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {peerName ? `Dr. ${peerName}` : "Chat"}
          </Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <TouchableOpacity onPress={startCall} style={styles.callBtn}>
          <Feather name="video" size={22} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        {messages.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={{ color: "#6b7280", marginTop: 12 }}>No messages yet. Say hello!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            editable={!sending}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!draft.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={18} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, backgroundColor: "#E5E5EA" },
  center:               { flex: 1, justifyContent: "center", alignItems: "center" },
  header:               { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backBtn:              { padding: 5 },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle:          { fontSize: 18, fontWeight: "bold", color: "#111827" },
  headerStatus:         { fontSize: 12, color: "#22c55e", marginTop: 2 },
  callBtn:              { padding: 10, backgroundColor: "#eff6ff", borderRadius: 20 },
  chatList:             { padding: 16, gap: 8, flexGrow: 1 },
  msgWrapper:           { width: "100%", flexDirection: "row" },
  msgRight:             { justifyContent: "flex-end" },
  msgLeft:              { justifyContent: "flex-start" },
  bubble:               { maxWidth: "75%", padding: 12, borderRadius: 20 },
  bubbleMe:             { backgroundColor: "#2563eb", borderBottomRightRadius: 4 },
  bubbleThem:           { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  textMe:               { color: "#fff", fontSize: 15, lineHeight: 20 },
  textThem:             { color: "#111827", fontSize: 15, lineHeight: 20 },
  msgFooter:            { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  timeText:             { fontSize: 11 },
  inputContainer:       { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#fff", paddingBottom: Platform.OS === "ios" ? 20 : 10 },
  input:                { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginHorizontal: 8 },
  sendBtn:              { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center" },
  sendBtnDisabled:      { backgroundColor: "#9ca3af", opacity: 0.5 },
});