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
  status: "sending" | "sent" | "error";
};

export default function UserDirectChatScreen() {
  const { peer: peerId } = useLocalSearchParams<{ peer: string }>();
  const me = useChatStore((s) => s.me);
  const currentUserId = me?.userId;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [peerName, setPeerName] = useState<string>("");

  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCaller, setIncomingCaller] = useState<string | null>(null);
  const [callRoomId, setCallRoomId] = useState<string | null>(null);

  const flatListRef = useRef<FlatList>(null);
  const tempIds = useRef<Set<string>>(new Set());
  const callTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callStartRef = useRef<number>(0);
  // Ref mirrors callState to avoid stale closures in socket handlers
  const callStateRef = useRef<CallState>("idle");

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    const { useAuthStore } = await import("@/stores/authStore");
    return useAuthStore.getState().accessToken;
  }, []);

  const historyFetching = useRef(false);
  const peerFetching = useRef(false);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    if (!peerId || peerFetching.current) return;
    peerFetching.current = true;

    const fetchPeerName = async () => {
      try {
        const { data } = await api.get(`/users/peer/${peerId}`, { timeout: 5_000 });
        if (data?.full_name) setPeerName(data.full_name);
      } catch {
        // silently fail
      } finally {
        peerFetching.current = false;
      }
    };

    void fetchPeerName();
  }, [peerId, getAuthToken]);

  const loadHistory = useCallback(async () => {
    if (!peerId || historyFetching.current) return;
    historyFetching.current = true;
    setLoading(true);
    try {
      const { data } = await api.get('/messages', {
        params: { peerId },
        timeout: 10_000,
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
      historyFetching.current = false;
    }
  }, [peerId, getAuthToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // If we navigated here because the global overlay already accepted the call,
  // the psychiatrist side already received call-accepted and is in "incall".
  // We need to also go incall. We detect this by listening for the psychiatrist
  // emitting a webrtc-signal offer (they start WebRTC as initiator after call-accepted).
  // Simpler: just check if there's a pending accepted call via a one-time call-accepted event.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId) return;

    // One-time handler: if call-accepted arrives right after we mount
    // (because global overlay already emitted call-accepted before navigation)
    const onCallAcceptedOnMount = (data: { from: string; roomId: string }) => {
      if (data.from !== peerId) return;
      setCallRoomId(data.roomId);
      callStartRef.current = Date.now();
      setCallState("incall");
      callStateRef.current = "incall";
    };
    socket.once("call-accepted", onCallAcceptedOnMount);

    return () => {
      socket.off("call-accepted", onCallAcceptedOnMount);
    };
  }, [peerId]);

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

    const onIncomingCall = (data: { from: string; roomId: string }) => {
      setIncomingCaller(data.from);
      setCallRoomId(data.roomId);
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

    const onCallAccepted = (data: { from: string; roomId: string }) => {
      if (callStateRef.current === "calling") {
        setCallRoomId(data.roomId);
        callStartRef.current = Date.now();
        setCallState("incall");
        callStateRef.current = "incall";
        if (callTimerRef.current) clearTimeout(callTimerRef.current);
      }
    };

    const onCallDeclined = ({ from }: { from?: string }) => {
      if (from && from !== peerId) return;
      setCallState("idle");
      callStateRef.current = "idle";
      setCallRoomId(null);
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };

    const onCallEnded = () => {
      setCallState("idle");
      callStateRef.current = "idle";
      setCallRoomId(null);
      setIncomingCaller(null);
      if (callTimerRef.current) clearTimeout(callTimerRef.current);
    };

    socket.on("message:new", onMessageNew);
    socket.on("receive-message", onReceive);
    socket.on("incoming-call", onIncomingCall);
    socket.on("call-accepted", onCallAccepted);
    socket.on("call-declined", onCallDeclined);
    socket.on("call-ended", onCallEnded);

    return () => {
      socket.off("message:new", onMessageNew);
      socket.off("receive-message", onReceive);
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-accepted", onCallAccepted);
      socket.off("call-declined", onCallDeclined);
      socket.off("call-ended", onCallEnded);
    };
  }, [peerId]); // no callState dep — use callStateRef instead

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !peerId || sending) return;
    setSending(true);

    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const content = draft.trim();
    const optimistic: Message = {
      id: tempId,
      sender_id: currentUserId ?? "me",
      receiver_id: peerId,
      content,
      created_at: new Date().toISOString(),
      status: "sending",
    };

    tempIds.current.add(tempId);
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
        tempIds.current.delete(tempId);
        return prev.map((m) =>
          m.id === tempId ? { ...data, status: "sent" as const } : m
        );
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const errMsg =
        status === 429
          ? "Sending too fast. Please wait a moment."
          : err?.response?.data?.error ?? err?.message ?? "Failed to send message";
      Alert.alert("Error", errMsg);
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" as const } : m))
      );
      tempIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending, getAuthToken]);

  const startCall = useCallback(() => {
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
        Alert.alert("No Answer", "The psychiatrist did not answer.");
      }
    }, 30_000);
  }, [peerId]);

  const acceptCall = useCallback(() => {
    const socket = getSocket();
    if (!socket || !incomingCaller || !callRoomId) return;
    socket.emit("call-accepted", { to: incomingCaller, roomId: callRoomId });
    callStartRef.current = Date.now();
    setCallState("incall");
    callStateRef.current = "incall";
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
  }, [incomingCaller, callRoomId]);

  const declineCall = useCallback(() => {
    const socket = getSocket();
    if (!socket || !incomingCaller) return;
    socket.emit("call-declined", { to: incomingCaller });
    setCallState("idle");
    callStateRef.current = "idle";
    setIncomingCaller(null);
    setCallRoomId(null);
    if (callTimerRef.current) clearTimeout(callTimerRef.current);
  }, [incomingCaller]);

  const endCall = useCallback(() => {
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
  }, [peerId]);

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
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={{ marginTop: 10, color: "#6b7280" }}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const displayName = peerName ? `Dr. ${peerName}` : "Doctor";

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {peerName ? peerName.charAt(0).toUpperCase() : "D"}
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
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
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
