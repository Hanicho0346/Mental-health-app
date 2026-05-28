import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useChatStore } from "@/stores/chatStore";
import { getSocket } from "@/lib/socket";

const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#db2777", "#d97706", "#059669"];

function getAvatarColor(name: string = "A"): string {
  return (
    AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length] || AVATAR_COLORS[0]
  );
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString([], { weekday: "short" });
}

type PsychiatristItem = {
  id: string;
  full_name: string;
  avatar_url?: string;
  is_online: boolean;
  booking?: {
    scheduled_at?: string;
    time_label?: string;
  };
};

export default function UserChatsLobby() {
  const setPeer = useChatStore((s) => s.setPeer);

  const [psychiatrists, setPsychiatrists] = useState<PsychiatristItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);

  // Reload every time screen comes into focus (catches post-payment return)
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load = async () => {
        setLoading(true);
        try {
          const { data } = await api.get<{ psychiatrists: PsychiatristItem[] }>(
            "/bookings/my-psychiatrists",
          );
          if (active) setPsychiatrists(data.psychiatrists ?? []);
        } catch {
          if (active) setPsychiatrists([]);
        } finally {
          if (active) setLoading(false);
        }
      };

      void load();

      // Socket connection indicator
      const socket = getSocket();
      if (socket) {
        setConnected(socket.connected);
        socket.on("connect", () => setConnected(true));
        socket.on("disconnect", () => setConnected(false));

        // Re-fetch if a new message arrives (updates last message preview)
        socket.on("message:new", () => void load());
      }

      return () => {
        active = false;
        if (socket) {
          socket.off("connect");
          socket.off("disconnect");
          socket.off("message:new");
        }
      };
    }, []),
  );

  const openChat = (psychiatristId: string) => {
    setPeer(psychiatristId);
    router.push(`/(tabs)/(user-tabs)/chats/${psychiatristId}` as any);
  };

  const renderItem = ({ item }: { item: PsychiatristItem }) => (
    <TouchableOpacity
      style={styles.chatRow}
      onPress={() => openChat(item.id)}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.avatar,
          { backgroundColor: getAvatarColor(item.full_name) },
        ]}
      >
        <Text style={styles.avatarTxt}>
          {item.full_name?.[0]?.toUpperCase() ?? "?"}
        </Text>
        {item.is_online && <View style={styles.onlineBadge} />}
      </View>

      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={styles.chatTime}>
            {formatTime(item.booking?.scheduled_at)}
          </Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.booking?.time_label ?? "Tap to open chat"}
        </Text>
      </View>

      {/* Arrow hint */}
      <Feather name="chevron-right" size={18} color="#9ca3af" />
    </TouchableOpacity>
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Header connected={connected} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </SafeAreaView>
    );
  }

  // ── No paid bookings → gate ────────────────────────────────────────────────
  if (psychiatrists.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Header connected={connected} />
        <View style={styles.gateCard}>
          <Feather name="lock" size={32} color="#D97706" />
          <Text style={styles.gateTitle}>Book a Session First</Text>
          <Text style={styles.gateSub}>
            Pay ETB 300 to unlock chat access with a psychiatrist.
          </Text>
          <TouchableOpacity
            style={styles.gateBtn}
            onPress={() => router.push("/(tabs)/(user-tabs)/book")}
          >
            <Text style={styles.gateBtnTxt}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Has paid bookings → show chat list ────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <Header connected={connected} />
      <FlatList
        data={psychiatrists}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="chatbubbles-outline" size={60} color="#d1d5db" />
            <Text style={styles.emptyTitle}>No chats yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// Small extracted header so it's not repeated 3 times
function Header({ connected }: { connected: boolean }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Chats</Text>
      <View
        style={[
          styles.connectionDot,
          connected ? styles.dotOnline : styles.dotOffline,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: "bold", color: "#111827" },
  connectionDot: { width: 10, height: 10, borderRadius: 5 },
  dotOnline: { backgroundColor: "#22c55e" },
  dotOffline: { backgroundColor: "#ef4444" },
  list: { paddingBottom: 100 },
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
    position: "relative",
  },
  avatarTxt: { color: "#fff", fontSize: 20, fontWeight: "bold" },
  onlineBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#22c55e",
    borderWidth: 2,
    borderColor: "#fff",
  },
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
  chatTime: { fontSize: 12, color: "#6b7280" },
  lastMessage: { fontSize: 14, color: "#6b7280" },
  emptyWrap: { alignItems: "center", marginTop: 100, padding: 20 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
    marginTop: 16,
  },
  gateCard: {
    margin: 20,
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  gateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginTop: 12,
    marginBottom: 8,
  },
  gateSub: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  gateBtn: {
    backgroundColor: "#4ADE80",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  gateBtnTxt: { fontSize: 15, fontWeight: "700", color: "#111827" },
});
