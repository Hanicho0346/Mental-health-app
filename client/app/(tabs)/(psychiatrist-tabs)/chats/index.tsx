

import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { getStoredAuthToken } from "@/lib/auth";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/stores/chatStore";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669"];

function getAvatarColor(name: string = "A"): string {
  const firstChar = name?.charCodeAt(0) || 65;
  return AVATAR_COLORS[firstChar % AVATAR_COLORS.length] || AVATAR_COLORS[0];
}

function getInitials(name: string): string {
  if (!name || name === "undefined" || name === "null") return "?";
  if (name.length === 24 && /^[0-9a-fA-F]+$/.test(name)) return "?";
  return name.charAt(0).toUpperCase();
}

export default function PsychiatristChatsLobby() {
  const { getToken } = useAuth();

  const conversations     = useChatStore((s) => s.conversations);
  const loading           = useChatStore((s) => s.loading);
  const setPeer           = useChatStore((s) => s.setPeer);
  const loadConversations = useChatStore((s) => s.loadConversations);

  const [connected,  setConnected]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // FIX-A: pass backend JWT so the server resolves the MongoDB _id correctly
  useEffect(() => {
    const load = async () => {
      const token =
        (await getStoredAuthToken()) ??
        (await getToken({ template: "backend" }));
      if (token) await loadConversations(token);
    };
    load();
  }, []);

  // FIX-B: named handlers so cleanup only removes this component's listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    setConnected(socket.connected);

    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onMessageNew = (msg: any) => {
      const senderId   = msg.sender_id?.toString?.() ?? msg.from;
      const receiverId = msg.receiver_id?.toString?.() ?? msg.to;

      useChatStore.setState((state) => {
        const updated = state.conversations.map((c: any) => {
          if (c.peerId === senderId || c.peerId === receiverId) {
            return {
              ...c,
              lastMessage:     msg.content,
              lastMessageTime: msg.timestamp ?? new Date().toISOString(),
            };
          }
          return c;
        });
        return { conversations: updated };
      });
    };

    socket.on("connect",    onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onMessageNew);

    return () => {
      socket.off("connect",    onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onMessageNew);
    };
  }, []);

  // FIX-C: backend template on refresh too (was already correct, kept explicit)
  const onRefresh = async () => {
    setRefreshing(true);
    const token =
      (await getStoredAuthToken()) ??
      (await getToken({ template: "backend" }));
    if (token && loadConversations) await loadConversations(token);
    setRefreshing(false);
  };

  const openChat = (peerId: string, peerName: string) => {
    setPeer(peerId);
    router.push(`/(tabs)/(psychiatrist-tabs)/chats/${peerId}`);
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return "Now";
    const date = new Date(timestamp);
    const now  = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000)    return "Just now";
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: "short" });
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const renderChatItem = ({ item }: { item: any }) => {
    const peerId   = item?.peerId   || item?._id;

  const rawName  = item?.peerName || item?.full_name || item?.name || item?.username || "";
  
 
  const isMongoId = rawName.length === 24 && /^[0-9a-fA-F]+$/.test(rawName);
  const peerName  = (!rawName || isMongoId) ? "User" : rawName;
 
    const lastMessage = item?.lastMessage || "No messages yet";
    const unreadCount = item?.unreadCount || 0;
    const isOnline    = item?.isOnline || false;

    const initials    = getInitials(peerName);
    const avatarColor = getAvatarColor(peerName);

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => openChat(peerId, peerName)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarTxt}>{initials}</Text>
          {isOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>{peerName}</Text>
            <Text style={styles.chatTime}>{formatTime(item?.lastMessageTime)}</Text>
          </View>
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={1}>{lastMessage}</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading conversations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chats</Text>
          <View style={styles.headerActions}>
            <View style={[styles.connectionDot, connected ? styles.dotOnline : styles.dotOffline]} />
          </View>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="chatbubbles-outline" size={60} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptySub}>
            Start a conversation by messaging a patient or colleague.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <View style={[styles.connectionDot, connected ? styles.dotOnline : styles.dotOffline]} />
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item, index) =>
          item?.peerId || item?._id || index.toString()
        }
        renderItem={renderChatItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: "#fff" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText:      { marginTop: 12, fontSize: 16, color: "#6b7280" },
  header:           { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerTitle:      { flex: 1, fontSize: 28, fontWeight: "bold", color: "#111827" },
  headerActions:    { flexDirection: "row", alignItems: "center", gap: 16 },
  connectionDot:    { width: 10, height: 10, borderRadius: 5 },
  dotOnline:        { backgroundColor: "#22c55e" },
  dotOffline:       { backgroundColor: "#ef4444" },
  list:             { flexGrow: 1 },
  chatRow:          { flexDirection: "row", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f9fafb", alignItems: "center" },
  avatar:           { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", position: "relative" },
  avatarTxt:        { color: "#fff", fontSize: 20, fontWeight: "bold" },
  onlineBadge:      { position: "absolute", bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#fff" },
  chatInfo:         { flex: 1, marginLeft: 14 },
  chatHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  chatName:         { fontSize: 16, fontWeight: "600", color: "#111827", flex: 1, marginRight: 8 },
  chatTime:         { fontSize: 12, color: "#9ca3af" },
  chatFooter:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lastMessage:      { flex: 1, fontSize: 14, color: "#6b7280", marginRight: 12 },
  unreadBadge:      { backgroundColor: "#2563eb", borderRadius: 12, minWidth: 24, height: 24, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  unreadText:       { color: "#fff", fontSize: 12, fontWeight: "bold" },
  emptyWrap:        { alignItems: "center", marginTop: 100, padding: 20 },
  emptyTitle:       { fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16 },
  emptySub:         { fontSize: 14, color: "#6b7280", textAlign: "center", marginTop: 8 },
});