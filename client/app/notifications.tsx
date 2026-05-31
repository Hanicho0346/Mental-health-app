/**
 * NotificationsScreen.tsx
 *
 * Unified notification screen — works for user, psychiatrist, and admin roles.
 * No sub-tabs. Clean list with mark-read on tap, mark-all-read, pull-to-refresh,
 * and real-time badge updates via socket.
 *
 * Drop this file into any of:
 *   app/(tabs)/(user-tabs)/notifications.tsx
 *   app/(tabs)/(psychiatrist-tabs)/notifications.tsx
 *   app/(admin)/notifications.tsx
 *
 * The deep-link routes in handleNotificationPress are the only thing you may
 * want to adjust per-role.
 */

import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { logClientError } from "@/lib/log";
import { getSocket } from "@/lib/socket";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
  data?: {
    booking_id?: string;
    chat_id?: string;
    psychiatrist_id?: string;
  };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  booking_confirmed:       "check-circle",
  new_booking:             "calendar",
  new_message:             "message-circle",
  account_approved:        "check",
  account_rejected:        "x-circle",
  psychiatrist_registered: "user-plus",
  session_reminder:        "bell",
  payment_received:        "credit-card",
};

const COLOR_MAP: Record<string, { icon: string; bg: string }> = {
  booking_confirmed:       { icon: "#10B981", bg: "#ECFDF5" },
  new_booking:             { icon: "#3B82F6", bg: "#EFF6FF" },
  new_message:             { icon: "#8B5CF6", bg: "#F5F3FF" },
  account_approved:        { icon: "#10B981", bg: "#ECFDF5" },
  account_rejected:        { icon: "#EF4444", bg: "#FEF2F2" },
  psychiatrist_registered: { icon: "#F59E0B", bg: "#FFFBEB" },
  session_reminder:        { icon: "#3B82F6", bg: "#EFF6FF" },
  payment_received:        { icon: "#10B981", bg: "#ECFDF5" },
};

const DEFAULT_COLOR = { icon: "#6B7280", bg: "#F3F4F6" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getIcon(type: string): keyof typeof Feather.glyphMap {
  return ICON_MAP[type] ?? "bell";
}

function getColor(type: string) {
  return COLOR_MAP[type] ?? DEFAULT_COLOR;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 604_800_000) {
    const days = Math.floor(diff / 86_400_000);
    return `${days}d ago`;
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

// ─── Animated Row ─────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onPress,
  index,
}: {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  const { icon: iconColor, bg: bgColor } = getColor(item.type);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 280,
        delay: Math.min(index * 40, 300),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        delay: Math.min(index * 40, 300),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
    >
      <TouchableOpacity
        style={[styles.item, !item.is_read && styles.itemUnread]}
        onPress={() => onPress(item)}
        activeOpacity={0.7}
      >
        {/* Unread left accent */}
        {!item.is_read && <View style={styles.unreadAccent} />}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: bgColor }]}>
          <Feather
            name={getIcon(item.type)}
            size={18}
            color={item.is_read ? "#9CA3AF" : iconColor}
          />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, !item.is_read && styles.titleUnread]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.time}>{formatTime(item.created_at)}</Text>
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {item.body}
          </Text>
        </View>

        {/* Unread dot */}
        {!item.is_read && (
          <View style={[styles.dot, { backgroundColor: iconColor }]} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState() {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.emptyWrap,
        { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
      ]}
    >
      <View style={styles.emptyIconOuter}>
        <View style={styles.emptyIconInner}>
          <Feather name="bell-off" size={32} color="#9CA3AF" />
        </View>
      </View>
      <Text style={styles.emptyTitle}>All caught up!</Text>
      <Text style={styles.emptySub}>
        No notifications yet. We'll let you know when something happens.
      </Text>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Fetch ────────────────────────────────────────────────────────────────

  const loadNotifications = useCallback(async () => {
    try {
      const { data } = await api.get<{
        notifications: NotificationItem[];
        unread_count: number;
      }>("/notifications");
      setNotifications(data.notifications ?? []);
    } catch (e) {
      logClientError("notifications.load", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadNotifications().finally(() => setRefreshing(false));
  }, [loadNotifications]);

  // Reload whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadNotifications();
    }, [loadNotifications])
  );

  // ── Real-time socket: prepend new notifications ───────────────────────────

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNew = (notification: NotificationItem) => {
      setNotifications((prev) => {
        // Avoid duplicates
        if (prev.some((n) => n.id === notification.id)) return prev;
        return [notification, ...prev];
      });
    };

    socket.on("notification:new", handleNew);
    return () => {
      socket.off("notification:new", handleNew);
    };
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleMarkAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (e) {
      logClientError("notifications.markAllRead", e);
    }
  };

  const handleNotificationPress = async (item: NotificationItem) => {
    // Optimistically mark as read
    if (!item.is_read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      try {
        await api.patch(`/notifications/${item.id}/read`);
      } catch (e) {
        logClientError("notifications.markRead", e);
        // Revert on failure
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, is_read: false } : n))
        );
      }
    }

    // Deep-link routing
    if (item.data?.chat_id) {
      router.push(`/(tabs)/(user-tabs)/chats/${item.data.chat_id}` as any);
    } else if (item.data?.booking_id) {
      router.push(`/(tabs)/(user-tabs)/book` as any);
    } else if (item.data?.psychiatrist_id) {
      router.push(`/(admin)` as any);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={20} color="#111827" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={20} color="#111827" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>

        {unreadCount > 0 ? (
          <TouchableOpacity
            style={styles.markAllBtn}
            onPress={() => void handleMarkAllRead()}
          >
            <Feather name="check-circle" size={14} color="#3B82F6" />
            <Text style={styles.markAllText}>All read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      {/* ── List ── */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <NotificationRow
            item={item}
            index={index}
            onPress={(n) => void handleNotificationPress(n)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3B82F6"
          />
        }
        ListEmptyComponent={<EmptyState />}
        contentContainerStyle={[
          styles.listContent,
          notifications.length === 0 && styles.listEmpty,
        ]}
        // Group by date in list header
        ListHeaderComponent={
          notifications.length > 0 ? (
            <View style={styles.listHeaderWrap}>
              <Text style={styles.listHeaderText}>
                {notifications.length} notification
                {notifications.length !== 1 ? "s" : ""}
                {unreadCount > 0 ? ` · ${unreadCount} unread` : ""}
              </Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  headerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3B82F6",
  },

  // List
  listContent: { paddingBottom: 32 },
  listEmpty: { flexGrow: 1 },
  listHeaderWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  listHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9CA3AF",
    letterSpacing: 0.2,
  },
  separator: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginLeft: 72,
  },

  // Row
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: "relative",
  },
  itemUnread: {
    backgroundColor: "#FAFCFF",
  },
  unreadAccent: {
    position: "absolute",
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#3B82F6",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  content: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    flex: 1,
  },
  titleUnread: {
    color: "#111827",
    fontWeight: "700",
  },
  time: {
    fontSize: 11,
    color: "#9CA3AF",
    flexShrink: 0,
  },
  body: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 10,
    flexShrink: 0,
  },

  // Empty
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 48,
    marginTop: 60,
  },
  emptyIconOuter: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyIconInner: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 20,
  },
});