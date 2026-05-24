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
  const { getToken, userId } = useAuth();
  const me = useChatStore((s) => s.me);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  
  // Store temporary message IDs to prevent duplicates
  const tempMessageIds = useRef<Set<string>>(new Set());

  // Video Call States
  const [callState, setCallState] = useState<"idle" | "calling" | "ringing" | "incall">("idle");
  const [incomingCaller, setIncomingCaller] = useState<string | null>(null);

  // Get current user ID from Clerk
  const currentUserId = userId || me?.id;
  
  // Fetch chat history
  const loadChatHistory = useCallback(async () => {
    if (!peerId || !currentUserId) {
      console.log("Missing required data for loading history:", { peerId, currentUserId });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getToken();
      
      if (!token) {
        console.error("No auth token available");
        setLoading(false);
        return;
      }

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.137.250:4000';
      
      const response = await axios.get(
        `${API_URL}/api/messages`,
        {
          params: { peerId: peerId },
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }
      );

      if (response.status === 200 && response.data && Array.isArray(response.data)) {
        const formattedMessages = response.data.map((msg: any) => ({
          ...msg,
          status: "sent" as const
        }));
        
        setMessages(formattedMessages);
        // Clear temp IDs since we have real messages
        tempMessageIds.current.clear();
        
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch (error: any) {
      console.error("Error loading messages:", error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  }, [peerId, currentUserId, getToken]);

  // Send message via REST API
  const sendMessageViaAPI = useCallback(async (content: string) => {
    if (!peerId || !currentUserId) return null;

    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token available");

      const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.137.250:4000';
      
      const response = await axios.post(
        `${API_URL}/api/messages`,
        { receiver_id: peerId, content: content },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
      );

      if (response.data && response.data.id) {
        return { success: true, message: { ...response.data, status: "sent" as const } };
      }
      return { success: false, error: "No message ID returned" };
    } catch (error: any) {
      console.error("Error sending message:", error.response?.data || error.message);
      return { success: false, error: error.response?.data?.error || "Failed to send message" };
    }
  }, [peerId, currentUserId, getToken]);

  // Socket event handlers
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !peerId || !currentUserId) return;

    const onConnect = () => {
      console.log("Socket connected");
      socket.emit("join-rooms", { userId: currentUserId });
    };

    const onMessageNew = (data: any) => {
      console.log("New message received:", data.id);
      
      // Check if message is for this chat
      if (data.sender_id === peerId || data.receiver_id === peerId) {
        setMessages((prev) => {
          // Check if message already exists (by ID or temp ID)
          const exists = prev.find((m) => m.id === data.id);
          if (exists) {
            console.log("Message already exists, skipping:", data.id);
            return prev;
          }
          
          // Also check if this is a temp message that was just sent
          const tempExists = Array.from(tempMessageIds.current).some(
            (tempId) => prev.find((m) => m.id === tempId)
          );
          
          if (tempExists) {
            console.log("Temp message exists, skipping duplicate");
            return prev;
          }
          
          return [...prev, { ...data, status: "sent" as const }];
        });
        
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    };

    socket.on("connect", onConnect);
    socket.on("message:new", onMessageNew);

    if (socket.connected) onConnect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("message:new", onMessageNew);
    };
  }, [peerId, currentUserId]);

  // Load messages on mount
  useEffect(() => {
    if (peerId && currentUserId) {
      loadChatHistory();
    }
  }, [peerId, currentUserId]);

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || !peerId || !currentUserId || sending) return;
    
    setSending(true);
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    tempMessageIds.current.add(tempId);
    
    const messageContent = draft.trim();
    
    // Add optimistic message
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: currentUserId,
      receiver_id: peerId,
      content: messageContent,
      created_at: new Date().toISOString(),
      status: "sending"
    };
    
    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");
    
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await sendMessageViaAPI(messageContent);
      
      if (result && result.success) {
        // Replace temp message with real one
        setMessages((prev) => {
          tempMessageIds.current.delete(tempId);
          return prev.map((msg) =>
            msg.id === tempId ? result.message : msg
          );
        });
      } else {
        // Mark as error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId ? { ...msg, status: "error" as const } : msg
          )
        );
        Alert.alert("Error", result?.error || "Failed to send message");
        tempMessageIds.current.delete(tempId);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: "error" as const } : msg
        )
      );
      Alert.alert("Error", "Failed to send message");
      tempMessageIds.current.delete(tempId);
    } finally {
      setSending(false);
    }
  }, [draft, peerId, currentUserId, sending, sendMessageViaAPI]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    // Use a unique key that includes status for temp messages
    const key = item.id.startsWith('temp') ? `${item.id}-${item.status}` : item.id;

    return (
      <View key={key} style={[styles.msgWrapper, isMe ? styles.msgRight : styles.msgLeft]}>
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

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{peerId ? peerId.charAt(0).toUpperCase() : "?"}</Text>
        </View>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{peerId || "Unknown User"}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        
        <TouchableOpacity onPress={() => {}} style={styles.callBtn}>
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
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Send a message to start chatting</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id.startsWith('temp') ? `${item.id}-${item.status}` : item.id}
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

      {/* Call Modals */}
      <Modal visible={callState === "ringing"} animationType="slide" transparent>
        <View style={styles.callModalOverlay}>
          <View style={styles.callModal}>
            <Text style={styles.callModalTitle}>Incoming Video Call</Text>
            <Text style={styles.callModalName}>{incomingCaller}</Text>
            <View style={styles.callActionRow}>
              <TouchableOpacity style={[styles.callActionBtn, { backgroundColor: "#ef4444" }]} onPress={() => setCallState("idle")}>
                <MaterialIcons name="call-end" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.callActionBtn, { backgroundColor: "#22c55e" }]} onPress={() => setCallState("incall")}>
                <MaterialIcons name="call" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={callState === "incall" || callState === "calling"} animationType="fade" transparent>
        <View style={styles.callModalOverlay}>
          <View style={styles.callModal}>
            <Text style={styles.callModalTitle}>
              {callState === "calling" ? "Calling..." : "In Call With"}
            </Text>
            <Text style={styles.callModalName}>{peerId}</Text>
            
            <View style={styles.videoPlaceholder}>
              <Feather name="video-off" size={40} color="#9ca3af" />
              <Text style={{ color: "#9ca3af", marginTop: 10 }}>Video Stream placeholder</Text>
            </View>

            <TouchableOpacity style={[styles.callActionBtn, { backgroundColor: "#ef4444", marginTop: 40 }]} onPress={() => setCallState("idle")}>
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
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  backBtn: { padding: 5 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center", marginLeft: 5 },
  avatarText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  headerTitleContainer: { flex: 1, marginLeft: 10 },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  headerStatus: { fontSize: 12, color: "#22c55e", marginTop: 2 },
  callBtn: { padding: 10, backgroundColor: "#eff6ff", borderRadius: 20 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, color: "#6b7280", marginBottom: 8 },
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
  msgFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 4 },
  timeText: { fontSize: 11 },
  inputContainer: { flexDirection: "row", alignItems: "center", padding: 10, backgroundColor: "#fff", paddingBottom: Platform.OS === "ios" ? 20 : 10 },
  input: { flex: 1, backgroundColor: "#f3f4f6", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16, marginHorizontal: 8 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center" },
  sendBtnDisabled: { backgroundColor: "#9ca3af", opacity: 0.5 },
  callModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  callModal: { backgroundColor: "#111827", borderRadius: 20, padding: 30, alignItems: "center", width: "90%" },
  callModalTitle: { fontSize: 18, color: "#9ca3af", marginBottom: 10 },
  callModalName: { fontSize: 32, fontWeight: "bold", color: "#fff", marginBottom: 40 },
  videoPlaceholder: { width: "100%", height: 300, backgroundColor: "#1f2937", borderRadius: 20, justifyContent: "center", alignItems: "center" },
  callActionRow: { flexDirection: "row", gap: 40, marginTop: 40 },
  callActionBtn: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center" }
});