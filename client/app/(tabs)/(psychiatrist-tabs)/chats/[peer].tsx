/**
 * PSYCHIATRIST SIDE — Direct chat with a patient/user
 *
 * FIXES (modelled on the working UserDirectChatScreen):
 *
 * FIX-A: Message history mapping
 *   Old code re-mapped fields: m.from → sender_id, m.to → receiver_id,
 *   m.timestamp → created_at. The API returns messages already shaped as
 *   { sender_id, receiver_id, content, created_at, id } (same contract the
 *   user chat relies on). Spreading { ...m, status: "sent" } — exactly what
 *   the user chat does — keeps the field names correct and avoids a situation
 *   where sender_id is undefined and isMe is always false.
 *
 * FIX-B: getToken({ template: "backend" }) everywhere
 *   sendMessageViaAPI was calling getToken() with no template, so the server
 *   received a raw Clerk session token instead of a backend JWT. The backend
 *   JWT middleware resolves the token to a MongoDB _id and populates
 *   req.userId. Without the template the middleware can't resolve the user,
 *   so the sender_id stored on the message is wrong (or the request fails
 *   with 401). Every axios call now uses getToken({ template: "backend" }).
 *
 * FIX-C: currentUserId sourced correctly
 *   me?.userId is whatever the chatStore's /api/auth/me call returns.
 *   If the store returns the field as _id (MongoDB ObjectId string) rather
 *   than userId, the comparison item.sender_id === currentUserId is always
 *   false. Mirror the user chat exactly: use me?.userId, but add a fallback
 *   comment so the team knows to check the store shape if bubbles still
 *   appear on the wrong side.
 *
 * All other features (video call modals, socket handlers, styles) preserved.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";
import { useAuth } from "@clerk/clerk-expo";
import axios from "axios";
import { API_URL } from "@/lib/api";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  status?: "sending" | "sent" | "error";
};

export default function PsychiatristDirectChatScreen() {
  const { peer: peerId } = useLocalSearchParams<{ peer: string }>();
  const { getToken } = useAuth();

  const me = useChatStore((s) => s.me);
  const conversations = useChatStore((s) => s.conversations);

  // NOTE: if bubbles still appear on the wrong side, check what field
  // chatStore.me uses. It must match the sender_id field coming back from
  // /api/messages. Common mismatch: store uses _id but component reads userId.
  // In PsychiatristDirectChatScreen:
  const currentUserId = me?._id ?? me?.userId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peerName, setPeerName] = useState<string>("");

  const flatListRef = useRef<FlatList>(null);
  const tempMessageIds = useRef<Set<string>>(new Set());

  // Video Call States
  const [callState, setCallState] = useState<
    "idle" | "calling" | "ringing" | "incall"
  >("idle");
  const [incomingCaller, setIncomingCaller] = useState<string | null>(null);
  const peerNameFetched = useRef(false);
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  });
  // ── Resolve peer name ──────────────────────────────────────────────────
  useEffect(() => {
    if (!peerId || peerNameFetched.current) return;

    if (conversations?.length > 0) {
      const match = conversations.find(
        (c: any) => c.peerId === peerId || c._id === peerId,
      );
      if (match?.peerName && match.peerName !== peerId) {
        setPeerName(match.peerName);
        peerNameFetched.current = true;
        return;
      }
    }

    peerNameFetched.current = true;

    const fetchPeerName = async () => {
      try {
        const token = await getTokenRef.current({ template: "backend" });
        if (!token) return;
        const { data } = await axios.get(`${API_URL}/api/users/${peerId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (data?.full_name) setPeerName(data.full_name);
      } catch (e: any) {
        if (e?.response?.status === 404) {
          console.warn("[Chat] Peer user not found:", peerId);
        }
      }
    };

    void fetchPeerName();
  }, [peerId]);

  // ── Load history ───────────────────────────────────────────────────────
  // FIX-A + FIX-B: use backend token; spread message directly like user chat does
  const loadChatHistory = useCallback(async () => {
    if (!peerId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const token = await getTokenRef.current({ template: "backend" });
      if (!token) {
        setLoading(false);
        return;
      }
      const { data } = await axios.get(`${API_URL}/api/messages`, {
        params: { peerId },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      if (Array.isArray(data)) {
        setMessages(data.map((m: any) => ({ ...m, status: "sent" as const })));
        tempMessageIds.current.clear();
        setTimeout(
          () => flatListRef.current?.scrollToEnd({ animated: false }),
          100,
        );
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        Alert.alert(
          "Session Required",
          "You need an active paid session to access this chat.",
          [{ text: "OK", onPress: () => router.back() }],
        );
      }
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  // ── Send via REST ──────────────────────────────────────────────────────
  // FIX-B: always use { template: "backend" } so server can resolve MongoDB _id
  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !peerId || sending) return;

    setSending(true);
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    tempMessageIds.current.add(tempId);
    const content = draft.trim();

    const optimistic: Message = {
      id: tempId,
      sender_id: currentUserId ?? "",
      receiver_id: peerId,
      content,
      created_at: new Date().toISOString(),
      status: "sending",
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const token = await getToken({ template: "backend" });
      if (!token) throw new Error("No auth token");

      const { data } = await axios.post(
        `${API_URL}/api/messages`,
        { receiver_id: peerId, content },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      setMessages((prev) => {
        tempMessageIds.current.delete(tempId);
        return prev.map((m) =>
          m.id === tempId ? { ...data, status: "sent" as const } : m,
        );
      });
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error || err?.message || "Failed to send message";
      Alert.alert("Error", errMsg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId ? { ...m, status: "error" as const } : m,
        ),
      );
      tempMessageIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending, getToken]);

  // ── Socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId) return;

    const onMessageNew = (data: any) => {
      if (data.sender_id !== peerId && data.receiver_id !== peerId) return;
      setMessages((prev) => {
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, { ...data, status: "sent" as const }];
      });
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    };

    const onReceiveMessage = (msg: any) => {
      const senderId = msg.sender_id?.toString?.() ?? msg.from;
      const receiverId = msg.receiver_id?.toString?.() ?? msg.to;
      if (senderId !== peerId && receiverId !== peerId) return;
      setMessages((prev) => {
        const id = msg._id?.toString() ?? msg.id;
        if (prev.find((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            sender_id: senderId,
            receiver_id: receiverId,
            content: msg.content,
            created_at:
              msg.created_at ?? msg.timestamp ?? new Date().toISOString(),
            status: "sent" as const,
          },
        ];
      });
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    };

    const onIncomingCall = ({ from }: { from: string }) => {
      setIncomingCaller(from);
      setCallState("ringing");
    };
    socket.on("incoming-call", onIncomingCall);
    socket.on("call-accepted", () => setCallState("incall"));
    socket.on("call-declined", () => setCallState("idle"));
    socket.on("call-ended", () => setCallState("idle"));
    socket.on("message:new", onMessageNew);
    socket.on("receive-message", onReceiveMessage);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("receive-message", onReceiveMessage);
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-accepted");
      socket.off("call-declined");
      socket.off("call-ended");
    };
  }, [peerId]);

  useEffect(() => {
    void loadChatHistory();
  }, [loadChatHistory]);

  const startCall = () => getSocket()?.emit("call-user", { to: peerId });

  // ── Render ─────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View
        style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}
      >
        <View
          style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
        >
          <Text style={isMe ? styles.textMe : styles.textThem}>
            {item.content}
          </Text>
          <View style={styles.msgFooter}>
            <Text
              style={[
                styles.timeText,
                { color: isMe ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" },
              ]}
            >
              {new Date(item.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            {isMe && item.status === "sending" && (
              <ActivityIndicator
                size="small"
                color="#a7f3d0"
                style={{ marginLeft: 4 }}
              />
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = peerName || (peerId ? peerId.slice(0, 8) + "…" : "User");

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {peerName ? peerName.charAt(0).toUpperCase() : "?"}
          </Text>
        </View>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {displayName}
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
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubbles-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>
              Send a message to start chatting
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) =>
              item.id.startsWith("temp") ? `${item.id}-${item.status}` : item.id
            }
            renderItem={renderMessage}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
            onLayout={() =>
              flatListRef.current?.scrollToEnd({ animated: false })
            }
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

      {/* Incoming call modal */}
      <Modal
        visible={callState === "ringing"}
        animationType="slide"
        transparent
      >
        <View style={styles.callModalOverlay}>
          <View style={styles.callModal}>
            <Text style={styles.callModalTitle}>Incoming Video Call</Text>
            <Text style={styles.callModalName}>{incomingCaller}</Text>
            <View style={styles.callActionRow}>
              <TouchableOpacity
                style={[styles.callActionBtn, { backgroundColor: "#ef4444" }]}
                onPress={() => setCallState("idle")}
              >
                <MaterialIcons name="call-end" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.callActionBtn, { backgroundColor: "#22c55e" }]}
                onPress={() => setCallState("incall")}
              >
                <MaterialIcons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* In-call / calling modal */}
      <Modal
        visible={callState === "incall" || callState === "calling"}
        animationType="fade"
        transparent
      >
        <View style={styles.callModalOverlay}>
          <View style={styles.callModal}>
            <Text style={styles.callModalTitle}>
              {callState === "calling" ? "Calling..." : "In Call With"}
            </Text>
            <Text style={styles.callModalName}>{displayName}</Text>
            <View style={styles.videoPlaceholder}>
              <Feather name="video-off" size={40} color="#9ca3af" />
              <Text style={{ color: "#9ca3af", marginTop: 10 }}>
                Video Stream placeholder
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.callActionBtn,
                { backgroundColor: "#ef4444", marginTop: 40 },
              ]}
              onPress={() => setCallState("idle")}
            >
              <MaterialIcons name="call-end" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  headerStatus: { fontSize: 12, color: "#22c55e", marginTop: 2 },
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
  msgWrapper: { width: "100%", flexDirection: "row" },
  msgRight: { justifyContent: "flex-end" },
  msgLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "75%", padding: 12, borderRadius: 20 },
  bubbleMe: { backgroundColor: "#2563eb", borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: "#fff", borderBottomLeftRadius: 4 },
  textMe: { color: "#fff", fontSize: 15, lineHeight: 20 },
  textThem: { color: "#111827", fontSize: 15, lineHeight: 20 },
  msgFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
    marginTop: 4,
  },
  timeText: { fontSize: 11 },
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
  callModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  callModal: {
    backgroundColor: "#111827",
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    width: "90%",
  },
  callModalTitle: { fontSize: 18, color: "#9ca3af", marginBottom: 10 },
  callModalName: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 40,
  },
  videoPlaceholder: {
    width: "100%",
    height: 300,
    backgroundColor: "#1f2937",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  callActionRow: { flexDirection: "row", gap: 40, marginTop: 40 },
  callActionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
});
