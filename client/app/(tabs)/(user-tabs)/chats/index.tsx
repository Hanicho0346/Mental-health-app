import { useUser } from "@clerk/clerk-expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  FlatList,
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
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0];
}

export default function UserChatsLobby() {
  const me = useChatStore((s) => s.me);
  
  const storeConversations = useChatStore((s) => s.conversations);
  const storeUsers = useChatStore((s) => s.users);
  
  const conversations = storeConversations ?? [];
  const users = storeUsers ?? [];
  
  const setPeer = useChatStore((s) => s.setPeer);

  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    setConnected(socket.connected);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  const openChat = (username: string) => {
    setPeer(username);
    router.push(`./${username}` as any);
  };

  const renderChatItem = ({ item }: { item: any }) => {
    const peerUser = users.find((u) => u.username === item.peerUsername) || { username: item.peerUsername, isOnline: false };
    
    return (
      <TouchableOpacity style={styles.chatRow} onPress={() => openChat(item.peerUsername)} activeOpacity={0.7}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(item.peerUsername) }]}>
          <Text style={styles.avatarTxt}>{item.peerUsername[0]?.toUpperCase()}</Text>
          {peerUser.isOnline && <View style={styles.onlineBadge} />}
        </View>

        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{item.peerUsername}</Text>
            <Text style={styles.chatTime}>{item.lastMessageTime || "Now"}</Text>
          </View>
          
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage || "Started a conversation"}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

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
        keyExtractor={(item) => item.peerUsername}
        renderItem={renderChatItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={60} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No chats yet</Text>
            <Text style={styles.emptySub}>Tap the button below to start a new conversation.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: "bold", color: "#111827" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: "#22c55e" },
  dotOffline: { backgroundColor: "#ef4444" },
  list: { paddingBottom: 100 },
  chatRow: { flexDirection: "row", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f9fafb", alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: "center", alignItems: "center", position: "relative" },
  avatarTxt: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  onlineBadge: { position: "absolute", bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22c55e", borderWidth: 2, borderColor: "#fff" },
  chatInfo: { flex: 1, marginLeft: 14 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  chatName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  chatTime: { fontSize: 12, color: "#6b7280" },
  chatFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lastMessage: { flex: 1, fontSize: 14, color: "#6b7280", marginRight: 16 },
  unreadBadge: { backgroundColor: "#2563eb", borderRadius: 10, minWidth: 20, height: 20, justifyContent: "center", alignItems: "center", paddingHorizontal: 6 },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  emptyWrap: { alignItems: "center", marginTop: 100, padding: 20 },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: "#374151", marginTop: 16 },
  emptySub: { fontSize: 14, color: "#6b7280", textAlign: "center", marginTop: 8 },
});
