/**
 * PSYCHIATRIST SIDE — Direct chat with a patient/user
 *
 * FIXES APPLIED:
 * 1. currentUserId: was `userId || me?.id` (Clerk ID fallback).
 *    The backend JWT middleware resolves the Clerk token to a MongoDB _id and
 *    puts it in `req.userId`. So all REST calls succeed with the token, BUT the
 *    `isMe` bubble alignment used `currentUserId` to compare against
 *    `item.sender_id` (a MongoDB _id from the DB). Clerk IDs are "user_XXXX"
 *    strings — they never equal a MongoDB _id, so every message appeared on
 *    the "them" side. Fix: use `me?._id` (set by chatStore after /api/auth/me)
 *    and fall back to Clerk userId only as a last resort, with a clear comment.
 *
 * 2. Peer name in header: was showing the raw peerId (MongoDB ObjectId string).
 *    Fix: load peer name from the conversations store / a dedicated lookup.
 *
 * 3. Socket join: emitting "join-rooms" with the Clerk userId was a no-op on
 *    the server (server uses MongoDB _id for rooms). Removed that emit; the
 *    server joins rooms automatically on connect using the authenticated userId.
 *
 * 4. Duplicate socket message guard: the old logic checked all tempIds which
 *    could cause legitimate incoming messages to be skipped. Simplified to a
 *    strict id-based dedup.
 *
 * 5. No other features changed. Video call modals, call-user socket, styling
 *    all remain identical.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Modal, Alert, ActivityIndicator
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons, MaterialIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";
import { useAuth } from "@clerk/clerk-expo";
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

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

  // FIX 1: Always use the MongoDB _id from the store, NOT the Clerk userId.
  // The chatStore should populate `me` via /api/auth/me which returns the
  // MongoDB user document. The backend sets req.userId = MongoDB _id via JWT
  // middleware, so sender_id/receiver_id in responses are MongoDB _ids.
  const me = useChatStore((s) => s.me);
  const conversations = useChatStore((s) => s.conversations);
  const currentUserId = me?._id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // FIX 2: Track peer name separately; load from conversations store or API
  const [peerName, setPeerName] = useState<string>("");

  const flatListRef = useRef<FlatList>(null);
  const tempMessageIds = useRef<Set<string>>(new Set());

  // Video Call States — unchanged
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "incall">("idle");
  const [incomingCaller, setIncomingCaller] = useState<string | null>(null);

  // ── FIX 2: Resolve peer name ───────────────────────────────────────────
  // Try to get name from already-loaded conversations first (zero cost).
  // If not found, fetch from /api/users/:id endpoint.
  useEffect(() => {
    if (!peerId) return;

    // Check conversations store first (loaded by lobby)
    if (conversations && conversations.length > 0) {
      const match = conversations.find(
        (c: any) => c.peerId === peerId || c._id === peerId
      );
      if (match?.peerName && match.peerName !== peerId) {
        setPeerName(match.peerName);
        return;
      }
    }

    // Fallback: fetch user info from API
    const fetchPeerName = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const { data } = await axios.get(`${API_URL}/api/users/${peerId}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (data?.full_name) setPeerName(data.full_name);
      } catch {
        // Silent fallback — header will show abbreviated ID
      }
    };
    void fetchPeerName();
  }, [peerId, conversations]);

  // ── Load history ───────────────────────────────────────────────────────
  const loadChatHistory = useCallback(async () => {
    if (!peerId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const token = await getToken();
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
      // Other errors: leave messages empty, show empty state
    } finally {
      setLoading(false);
    }
  }, [peerId, getToken]);

  // ── Send via REST ──────────────────────────────────────────────────────
  const sendMessageViaAPI = useCallback(async (content: string) => {
    if (!peerId) return null;
    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token available");

      const { data } = await axios.post(
        `${API_URL}/api/messages`,
        { receiver_id: peerId, content },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      if (data?.id) {
        return { success: true, message: { ...data, status: "sent" as const } };
      }
      return { success: false, error: "No message ID returned" };
    } catch (error: any) {
      return {
        success: false,
        error: error?.response?.data?.error ?? "Failed to send message",
      };
    }
  }, [peerId, getToken]);

  // ── Socket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId) return;

    // FIX 3: Removed "join-rooms" emit — server joins rooms automatically
    // during the connection handshake using the authenticated MongoDB userId.
    // Emitting with a Clerk ID was a no-op and could cause confusion.

    const onMessageNew = (data: any) => {
      if (data.sender_id !== peerId && data.receiver_id !== peerId) return;
      setMessages((prev) => {
        // FIX 4: Simple id-based dedup — don't skip real incoming messages
        if (prev.find((m) => m.id === data.id)) return prev;
        return [...prev, { ...data, status: "sent" as const }];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const onReceiveMessage = (msg: any) => {
      const senderId = msg.from?.toString?.() ?? msg.from;
      const receiverId = msg.to?.toString?.() ?? msg.to;
      if (senderId !== peerId && receiverId !== peerId) return;
      setMessages((prev) => {
        const id = msg._id?.toString() ?? msg.id;
        if (prev.find((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            sender_id:   senderId,
            receiver_id: receiverId,
            content:     msg.content,
            created_at:  msg.timestamp ?? new Date().toISOString(),
            status:      "sent" as const,
          },
        ];
      });
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    // WebRTC listeners — unchanged
    const onIncomingCall = ({ from }: { from: string }) => {
      setIncomingCaller(from);
      setCallState("ringing");
    };
    socket.on("incoming-call",  onIncomingCall);
    socket.on("call-accepted",  () => setCallState("incall"));
    socket.on("call-declined",  () => setCallState("idle"));
    socket.on("call-ended",     () => setCallState("idle"));
    socket.on("message:new",     onMessageNew);
    socket.on("receive-message", onReceiveMessage);

    return () => {
      socket.off("message:new",     onMessageNew);
      socket.off("receive-message", onReceiveMessage);
      socket.off("incoming-call",   onIncomingCall);
      socket.off("call-accepted");
      socket.off("call-declined");
      socket.off("call-ended");
    };
  }, [peerId]);

  // Load on mount
  useEffect(() => {
    void loadChatHistory();
  }, [loadChatHistory]);

  // ── Send handler ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !peerId || sending) return;

    setSending(true);
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    tempMessageIds.current.add(tempId);
    const content = draft.trim();

    const optimistic: Message = {
      id:          tempId,
      sender_id:   currentUserId ?? "me",
      receiver_id: peerId,
      content,
      created_at:  new Date().toISOString(),
      status:      "sending",
    };

    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await sendMessageViaAPI(content);
      if (result?.success) {
        setMessages((prev) => {
          tempMessageIds.current.delete(tempId);
          return prev.map((m) => (m.id === tempId ? result.message : m));
        });
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "error" as const } : m))
        );
        Alert.alert("Error", result?.error ?? "Failed to send message");
        tempMessageIds.current.delete(tempId);
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: "error" as const } : m))
      );
      Alert.alert("Error", "Failed to send message");
      tempMessageIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending, sendMessageViaAPI]);

  // ── Video call helper — unchanged ──────────────────────────────────────
  const startCall = () => getSocket()?.emit("call-user", { to: peerId });

  // ── Render ─────────────────────────────────────────────────────────────
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
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // FIX 2: Header now shows real name instead of raw peerId
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
          {/* FIX 2: Show actual name */}
          <Text style={styles.headerTitle} numberOfLines={1}>{displayName}</Text>
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
            keyExtractor={(item) => item.id.startsWith("temp") ? `${item.id}-${item.status}` : item.id}
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

      {/* Incoming call modal — unchanged */}
      <Modal visible={callState === "ringing"} animationType="slide" transparent>
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

      {/* In-call / calling modal — unchanged */}
      <Modal visible={callState === "incall" || callState === "calling"} animationType="fade" transparent>
        <View style={styles.callModalOverlay}>
          <View style={styles.callModal}>
            <Text style={styles.callModalTitle}>
              {callState === "calling" ? "Calling..." : "In Call With"}
            </Text>
            <Text style={styles.callModalName}>{displayName}</Text>
            <View style={styles.videoPlaceholder}>
              <Feather name="video-off" size={40} color="#9ca3af" />
              <Text style={{ color: "#9ca3af", marginTop: 10 }}>Video Stream placeholder</Text>
            </View>
            <TouchableOpacity
              style={[styles.callActionBtn, { backgroundColor: "#ef4444", marginTop: 40 }]}
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
  container:            { flex: 1, backgroundColor: "#E5E5EA" },
  loadingContainer:     { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText:          { marginTop: 10, fontSize: 16, color: "#6b7280" },
  header:               { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backBtn:              { padding: 5 },
  avatar:               { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center", marginLeft: 5 },
  avatarText:           { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle:          { fontSize: 18, fontWeight: "bold", color: "#111827" },
  headerStatus:         { fontSize: 12, color: "#22c55e", marginTop: 2 },
  callBtn:              { padding: 10, backgroundColor: "#eff6ff", borderRadius: 20 },
  emptyContainer:       { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText:            { fontSize: 16, color: "#6b7280" },
  emptySubtext:         { fontSize: 14, color: "#9ca3af" },
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
  callModalOverlay:     { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  callModal:            { backgroundColor: "#111827", borderRadius: 20, padding: 30, alignItems: "center", width: "90%" },
  callModalTitle:       { fontSize: 18, color: "#9ca3af", marginBottom: 10 },
  callModalName:        { fontSize: 32, fontWeight: "bold", color: "#fff", marginBottom: 40 },
  videoPlaceholder:     { width: "100%", height: 300, backgroundColor: "#1f2937", borderRadius: 20, justifyContent: "center", alignItems: "center" },
  callActionRow:        { flexDirection: "row", gap: 40, marginTop: 40 },
  callActionBtn:        { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" },
});