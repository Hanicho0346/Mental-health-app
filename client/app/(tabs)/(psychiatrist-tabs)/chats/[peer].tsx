/**
 * PSYCHIATRIST SIDE — Direct chat with a patient/user
 */
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
import VideoCallModal, { type CallState } from "@/components/VideoCallModal";

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  status?: "sending" | "sent" | "error";
};

export default function PsychiatristDirectChatScreen() {
  const {
    peer: peerId,
    autoAccept,
    roomId: routeRoomId,
  } = useLocalSearchParams<{
    peer: string;
    autoAccept?: string;
    roomId?: string;
  }>();
  const me = useChatStore((s) => s.me);
  const conversations = useChatStore((s) => s.conversations);
  const currentUserId = me?._id ?? me?.userId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peerName, setPeerName] = useState<string>("");

  const flatListRef = useRef<FlatList>(null);
  const tempMessageIds = useRef<Set<string>>(new Set());

  const [callState, setCallState] = useState<CallState>(
    autoAccept === "1" ? "incall" : "idle"
  );
  const [incomingCaller, setIncomingCaller] = useState<string | null>(
    autoAccept === "1" ? peerId ?? null : null
  );
  const [callRoomId, setCallRoomId] = useState<string | null>(
    autoAccept === "1" ? routeRoomId ?? null : null
  );
  const callTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStartRef = useRef<number>(autoAccept === "1" ? Date.now() : 0);
  // Ref mirrors callState to avoid stale closures in socket handlers
  const callStateRef = useRef<CallState>(autoAccept === "1" ? "incall" : "idle");
  const peerNameFetched = useRef(false);

  useEffect(() => {
    if (autoAccept === "1" && peerId) {
      setCallState("incall");
      callStateRef.current = "incall";
      setIncomingCaller(peerId);
      if (routeRoomId) setCallRoomId(routeRoomId);
      const socket = getSocket();
      if (socket) {
        socket.emit("call-accepted", {
          to: peerId,
          roomId: routeRoomId ?? `room_${Date.now()}`,
        });
      }
    }
  }, [autoAccept, peerId, routeRoomId]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // ── Resolve peer name ──────────────────────────────────────────────────
  useEffect(() => {
    if (!peerId || peerNameFetched.current) return;

    // Try store first (instant)
    if (conversations?.length > 0) {
      const match = conversations.find(
        (c: any) => c.peerId === peerId || c._id === peerId
      );
      if (match?.peerName && match.peerName !== peerId) {
        setPeerName(match.peerName);
        peerNameFetched.current = true;
        return;
      }
    }

    // Fall back to API — mark fetched only after success to allow one retry
    peerNameFetched.current = true;
    const fetchPeerName = async () => {
      try {
        const { data } = await api.get(`/users/peer/${peerId}`, { timeout: 5000 });
        if (data?.full_name) setPeerName(data.full_name);
      } catch {
        // silently ignore — header shows truncated id as fallback
      }
    };
    void fetchPeerName();
  }, [peerId, conversations]);

  // ── Load history ───────────────────────────────────────────────────────
  const loadChatHistory = useCallback(async () => {
    if (!peerId) { setLoading(false); return; }
    try {
      setLoading(true);
      const { data } = await api.get('/messages', {
        params: { peerId },
        timeout: 10000,
      });
      if (Array.isArray(data)) {
        const seen = new Set<string>();
        const unique = data
          .map((m: any) => ({ ...m, id: m.id ?? m._id?.toString(), status: "sent" as const }))
          .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
        setMessages(unique);
        tempMessageIds.current.clear();
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch (error: any) {
      if (error?.response?.status === 403) {
        Alert.alert(
          "Session Required",
          "You need an active paid session to access this chat.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      }
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  // ── Send via REST ──────────────────────────────────────────────────────
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
      const { data } = await api.post(
        '/messages',
        { receiver_id: peerId, content },
        { headers: { "Content-Type": "application/json" } }
      );
      setMessages((prev) => {
        tempMessageIds.current.delete(tempId);
        const updated = prev.map((m) =>
          m.id === tempId
            ? { ...data, id: data.id ?? data._id?.toString(), status: "sent" as const }
            : m
        );
        const seen = new Set<string>();
        return updated.filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; });
      });
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || "Failed to send message";
      Alert.alert("Error", errMsg);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" as const } : m))
      );
      tempMessageIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending]);

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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
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
            created_at: msg.created_at ?? msg.timestamp ?? new Date().toISOString(),
            status: "sent" as const,
          },
        ];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const onIncomingCall = ({ from, roomId }: { from: string; roomId?: string }) => {
      setIncomingCaller(from);
      if (roomId) setCallRoomId(roomId);
      setCallState("ringing");
      callStateRef.current = "ringing";
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
      callTimerRef.current = setTimeout(() => {
        setCallState("idle");
        callStateRef.current = "idle";
        setIncomingCaller(null);
        setCallRoomId(null);
      }, 45_000);
    };

    const onCallAccepted = ({ from, roomId }: { from: string; roomId?: string }) => {
      console.log("[Chat] onCallAccepted received:", from, roomId);
      if (roomId) setCallRoomId(roomId);
      callStartRef.current = Date.now();
      setCallState("incall");
      callStateRef.current = "incall";
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };

    const onCallDeclined = ({ from }: { from?: string }) => {
      if (from && from !== peerId) return;
      setCallState("idle");
      callStateRef.current = "idle";
      setIncomingCaller(null);
      setCallRoomId(null);
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };

    const onCallEnded = () => {
      setCallState("idle");
      callStateRef.current = "idle";
      setIncomingCaller(null);
      setCallRoomId(null);
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-accepted", onCallAccepted);
    socket.on("call-declined", onCallDeclined);
    socket.on("call-ended", onCallEnded);
    socket.on("message:new", onMessageNew);
    socket.on("receive-message", onReceiveMessage);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("receive-message", onReceiveMessage);
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-accepted", onCallAccepted);
      socket.off("call-declined", onCallDeclined);
      socket.off("call-ended", onCallEnded);
    };
  }, [peerId]); // no callState dep — use callStateRef instead

  useEffect(() => {
    void loadChatHistory();
  }, [loadChatHistory]);

  const startCall = () => {
    const socket = getSocket();
    if (!socket || !peerId) return;
    setCallState("calling");
    callStateRef.current = "calling";
    callStartRef.current = Date.now();

    socket.emit("call-user", { to: peerId }, (ack: { ok: boolean; error?: string }) => {
      if (!ack?.ok) {
        Alert.alert("Call Failed", ack?.error ?? "The user may be offline.");
        setCallState("idle");
        callStateRef.current = "idle";
      }
    });

    callTimerRef.current = setTimeout(() => {
      if (callStateRef.current === "calling") {
        setCallState("idle");
        callStateRef.current = "idle";
        Alert.alert("No Answer", "The patient did not answer.");
      }
    }, 30_000);
  };

  const acceptCall = () => {
    const socket = getSocket();
    if (!socket || !incomingCaller) return;
    socket.emit("call-accepted", { to: incomingCaller, roomId: callRoomId ?? undefined });
    callStartRef.current = Date.now();
    setCallState("incall");
    callStateRef.current = "incall";
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
  };

  const declineCall = () => {
    const socket = getSocket();
    if (!socket || !incomingCaller) return;
    socket.emit("call-declined", { to: incomingCaller });
    setCallState("idle");
    callStateRef.current = "idle";
    setIncomingCaller(null);
    setCallRoomId(null);
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
  };

  const endCall = () => {
    const socket = getSocket();
    if (!socket) return;
    const duration = callStartRef.current
      ? Math.floor((Date.now() - callStartRef.current) / 1000)
      : 0;
    socket.emit("call-ended", { to: peerId, duration });
    setCallState("idle");
    callStateRef.current = "idle";
    setIncomingCaller(null);
    setCallRoomId(null);
    callStartRef.current = 0;
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={isMe ? styles.textMe : styles.textThem}>{item.content}</Text>
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = peerName || "Patient";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.replace("/(tabs)/(psychiatrist-tabs)/chats" as any)}
        >
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
            <Text style={styles.emptySubtext}>Send a message to start chatting</Text>
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
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <VideoCallModal
        callState={callState}
        peerId={peerId ?? null}
        peerName={displayName}
        incomingCaller={incomingCaller}
        callRoomId={callRoomId}
        onAccept={acceptCall}
        onDecline={declineCall}
        onEnd={endCall}
      />
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
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
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
});
