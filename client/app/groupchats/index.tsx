import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { getApiErrorMessage } from "@/lib/log";

type GroupChat = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  avatarColor: string;
  lastMessage: string;
  lastMessageTime: string | null;
  unreadCount: number;
  isAdmin: boolean;
};

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669", "#0891b2", "#78350f", "#9918ab"];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatTime(timestamp?: string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function GroupChatsScreen() {
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<GroupChat[]>("/group-chats");
      setGroups(data ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadGroups();
    }, [loadGroups])
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);

  const createGroup = async () => {
    if (!groupName.trim()) return;
    try {
      await api.post("/group-chats", {
        name: groupName.trim(),
        description: groupDesc.trim(),
      });
      setGroupName("");
      setGroupDesc("");
      setModalVisible(false);
      void loadGroups();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err);
      alert(msg);
    }
  };

  const openGroup = (groupId: string) => {
    router.push(`/groupchats/${groupId}` as never);
  };

  const renderItem = ({ item }: { item: GroupChat }) => {
    const color = item.avatarColor || getAvatarColor(item.name);
    const initials = getInitials(item.name);

    return (
      <TouchableOpacity
        style={styles.chatRow}
        onPress={() => openGroup(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarTxt}>{initials}</Text>
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.chatTime}>{formatTime(item.lastMessageTime)}</Text>
          </View>
          <View style={styles.chatFooter}>
            <Text style={styles.lastMessage} numberOfLines={1}>
              {item.lastMessage}
            </Text>
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
          <Text style={styles.memberCount}>
            {item.memberCount} member{item.memberCount !== 1 ? "s" : ""}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color="#9ca3af" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Group Chats</Text>
          <View
            style={[styles.connectionDot, connected ? styles.dotOnline : styles.dotOffline]}
          />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading groups...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Group Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.connectionDot, connected ? styles.dotOnline : styles.dotOffline]}
          />
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="people-circle-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyTitle}>No group chats yet</Text>
          <Text style={styles.emptySub}>
            Create a group or get added by an admin to start chatting with your care team.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.emptyBtnTxt}>Create Group</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create New Group</Text>
            <Text style={styles.modalLabel}>Group Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Group name"
              value={groupName}
              onChangeText={setGroupName}
              autoFocus
            />
            <Text style={styles.modalLabel}>Description</Text>
            <TextInput
              style={[styles.modalInput, styles.modalInputMultiline]}
              placeholder="What's this group about?"
              value={groupDesc}
              onChangeText={setGroupDesc}
              multiline
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCreate]}
                onPress={createGroup}
                disabled={!groupName.trim()}
              >
                <Text style={styles.modalBtnCreateText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 16, color: "#6b7280" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { flex: 1, fontSize: 28, fontWeight: "bold", color: "#111827" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: "#22c55e" },
  dotOffline: { backgroundColor: "#ef4444" },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
  },
  list: { flexGrow: 1 },
  chatRow: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f9fafb",
    alignItems: "center",
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarTxt: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  chatInfo: { flex: 1, marginLeft: 14 },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  chatName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginRight: 8,
  },
  chatTime: { fontSize: 12, color: "#9ca3af" },
  chatFooter: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 2,
  },
  lastMessage: { flex: 1, fontSize: 14, color: "#6b7280", marginRight: 8 },
  unreadBadge: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  unreadText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  memberCount: { fontSize: 12, color: "#9ca3af" },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  emptyBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "90%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: "#f9fafb",
  },
  modalInputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnCancel: {
    backgroundColor: "#f3f4f6",
  },
  modalBtnCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4b5563",
  },
  modalBtnCreate: {
    backgroundColor: "#2563eb",
  },
  modalBtnCreateText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
