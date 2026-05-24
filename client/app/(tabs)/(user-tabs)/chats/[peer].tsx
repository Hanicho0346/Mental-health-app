import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text,
  TextInput, TouchableOpacity, View, Modal, SafeAreaView as RNSafeArea,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";

type Message = {
  id: string;
  from: string;
  content: string;
  timestamp: string;
  status: "sending" | "sent" | "read";
};

export default function UserDirectChatScreen() {
  const { peer: peerId } = useLocalSearchParams<{ peer: string }>();
  const me = useChatStore((s) => s.me);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const flatListRef = useRef<FlatList>(null);

  // Video Call States
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "incall">("idle");
  const [incomingCaller, setIncomingCaller] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId || !me?.username) return;

    const onMessage = (msg: Message) => {
      if (msg.from === peerId || msg.from === me.username) {
        setMessages((prev) => {
          const exists = prev.find(m => m.id === msg.id);
          if (exists) {
            return prev.map(m => m.id === msg.id ? { ...msg, status: "sent" } : m);
          }
          return [...prev, { ...msg, status: "sent" }];
        });
      }
    };

    socket.on("receive-message", onMessage);
    
    // WebRTC Listeners
    socket.on("incoming-call", ({ from }) => { setIncomingCaller(from); setCallState("ringing"); });
    socket.on("call-accepted", () => setCallState("incall"));
    socket.on("call-declined", () => setCallState("idle"));
    socket.on("call-ended", () => setCallState("idle"));

    return () => {
      socket.off("receive-message", onMessage);
      socket.off("incoming-call");
      socket.off("call-accepted");
      socket.off("call-declined");
      socket.off("call-ended");
    };
  }, [peerId, me?.username]);

  const sendMessage = useCallback(() => {
    if (!draft.trim() || !peerId || !me?.username) return;
    const socket = getSocket();
    if (!socket) return;

    const tempId = Date.now().toString();
    const newMsg: Message = {
      id: tempId,
      from: me.username,
      content: draft.trim(),
      timestamp: new Date().toISOString(),
      status: "sending",
    };

    setMessages((prev) => [...prev, newMsg]);
    setDraft("");

    socket.emit("send-message", { to: peerId, content: newMsg.content }, (ack: any) => {
      if (ack?.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
        );
      } else {
        // If failed, mark as unsent
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...m, status: "sending" } : m))
        );
      }
    });
  }, [draft, peerId, me]);

  // Call Actions
  const startCall = () => { setCallState("calling"); getSocket()?.emit("call-user", { to: peerId }); };
  const acceptCall = () => { setCallState("incall"); getSocket()?.emit("call-accepted", { to: incomingCaller }); };
  const declineCall = () => { setCallState("idle"); getSocket()?.emit("call-declined", { to: incomingCaller }); };
  const endCall = () => { setCallState("idle"); getSocket()?.emit("call-ended", { to: peerId }); };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.from === me?.username;
    
    return (
      <View style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={isMe ? styles.textMe : styles.textThem}>{item.content}</Text>
          <View style={styles.msgFooter}>
            <Text style={styles.timeText}>
              {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Text>
            {isMe && (
              <Ionicons
                name={item.status === "sending" ? "time-outline" : "checkmark-done"}
                size={14}
                color={item.status === "sending" ? "#a7f3d0" : "#fff"}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{peerId}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <TouchableOpacity onPress={startCall} style={styles.callBtn}>
          <Feather name="video" size={22} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.chatList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Message..."
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#E5E5EA" }, 
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backBtn: { padding: 5 },
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
  msgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  timeText: { fontSize: 11, color: "rgba(255,255,255,0.7)" },
  inputContainer: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#fff", paddingBottom: Platform.OS === "ios" ? 20 : 10 },
  input: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginHorizontal: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center" },
});
