import { HapticTab } from "@/components/haptic-tab";
import { isAdmin } from "@/lib/authGuards";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { getStoredAuthToken } from "@/lib/auth";
import { connectSocket } from "@/lib/chatService";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs, router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSocket } from "@/lib/socket";

export default function UserTabLayout() {
  const [ready, setReady] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPremier = useAuthStore((s) => s.isPremier);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const appStateRef = useRef(AppState.currentState);

  const compact = width < 380;
  const iconSize = compact ? 22 : 24;

  useEffect(() => {
    if (!user) return;
    const setupSocket = async () => {
      const username = user.full_name?.trim() || user.id;
      const token = await getStoredAuthToken();
      useChatStore.getState().setMe({
        _id: user.id,
        userId: user.id,
        username,
        full_name: user.full_name ?? username,
      });
      if (token) connectSocket(username, token);
    };
    void setupSocket();
  }, [user]);

  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        const txRef = await AsyncStorage.getItem("pendingSubscriptionTxRef");
        if (txRef) {
          try {
            const { data } = await api.get<{ success?: boolean }>(
              `/subscriptions/verify/${encodeURIComponent(txRef)}`
            );
            if (data.success || data.success === undefined) {
              useAuthStore.getState().setIsPremier(true);
              await AsyncStorage.removeItem("pendingSubscriptionTxRef");
            }
          } catch {
            // ignore; payment will still be retried on the payment-return page
          }
        }
      }
      appStateRef.current = nextState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  const screenOptions = useMemo(() => {
    const bottomPad = Math.max(
      insets.bottom,
      Platform.select({ ios: 8, android: 10, default: 8 }) ?? 8,
    );
    const barHeight = (compact ? 52 : 58) + bottomPad;
    return {
      tabBarActiveTintColor: "#4ADE80",
      tabBarInactiveTintColor: "#9CA3AF",
      headerShown: false,
      tabBarHideOnKeyboard: true,
      tabBarButton: HapticTab,
      tabBarShowLabel: width >= 320,
      tabBarStyle: {
        height: barHeight,
        paddingBottom: bottomPad,
        paddingTop: 6,
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#F3F4F6",
        ...(Platform.OS === "web"
          ? { maxWidth: 720, alignSelf: "center" as const, width: "100%" as const }
          : {}),
      },
      tabBarLabelStyle: {
        fontSize: compact ? 10 : 11,
        fontWeight: "600" as const,
        marginTop: 2,
      },
      tabBarItemStyle: { paddingVertical: 4, minWidth: 0 },
    };
  }, [compact, insets.bottom, width]);

  useEffect(() => {
    const migrateAndReady = () => {
      void (async () => {
        if (!useAuthStore.getState().accessToken) {
          const legacy = await AsyncStorage.getItem("token");
          if (legacy) {
            useAuthStore.getState().setSession({ accessToken: legacy, refreshToken: "" });
          }
        }
        setReady(true);
      })();
    };
    const unsub = useAuthStore.persist.onFinishHydration(migrateAndReady);
    if (useAuthStore.persist.hasHydrated()) migrateAndReady();
    return unsub;
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!accessToken) return <Redirect href="/login" />;
  if (isAdmin(user)) return <Redirect href="/(admin)" />;
  if (user?.role === "psychiatrist")
    return <Redirect href="/(tabs)/(psychiatrist-tabs)/dashboard" />;

  return (
    <>
      <GlobalIncomingCallOverlay />
      <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="message-square" color={color} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: "Book",
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="calendar" color={color} />,
        }}
      />

      <Tabs.Screen
        name="aichat"
        options={
          isPremier
            ? {
                title: "AI Chat",
                headerShown: false,
                tabBarIcon: ({ color }) => (
                  <Feather size={iconSize} name="message-circle" color={color} />
                ),
              }
            : { href: null, headerShown: false }
        }
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="user" color={color} />,
        }}
      />
      <Tabs.Screen
        name="payment-confirmation"
        options={{
          href: null,
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="payment-return"
        options={{
          href: null,
          headerShown: false,
          tabBarStyle: { display: "none" },
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="bell" color={color} />,
        }}
      />
    </Tabs>
    </>
  );
}

// ── Global incoming-call overlay ──────────────────────────────────────────────
// Listens for incoming-call on the socket regardless of which screen is active.
// When the user accepts, it navigates to the correct chat screen.
function GlobalIncomingCallOverlay() {
  const [visible, setVisible] = useState(false);
  const [callerName, setCallerName] = useState<string>("");
  const callerIdRef  = useRef<string | null>(null);
  const roomIdRef    = useRef<string | null>(null);
  const timerRef     = useRef<NodeJS.Timeout | null>(null);
  const conversations = useChatStore((s) => s.conversations);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncomingCall = ({ from, roomId }: { from: string; roomId: string }) => {
      callerIdRef.current = from;
      roomIdRef.current   = roomId;

      // Resolve name from conversations store
      const match = conversations.find((c: any) => c.peerId === from);
      setCallerName(match?.peerName ? `Dr. ${match.peerName}` : "Psychiatrist");

      setVisible(true);

      // Auto-dismiss after 45 s if not answered
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        callerIdRef.current = null;
        roomIdRef.current   = null;
      }, 45_000);
    };

    const onCallEnded    = () => dismiss();
    const onCallDeclined = () => dismiss();

    socket.on("incoming-call",  onIncomingCall);
    socket.on("call-ended",     onCallEnded);
    socket.on("call-declined",  onCallDeclined);

    return () => {
      socket.off("incoming-call",  onIncomingCall);
      socket.off("call-ended",     onCallEnded);
      socket.off("call-declined",  onCallDeclined);
    };
  }, []);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    callerIdRef.current = null;
    roomIdRef.current   = null;
  };

  const handleDecline = () => {
    const socket = getSocket();
    if (socket && callerIdRef.current) {
      socket.emit("call-declined", { to: callerIdRef.current });
    }
    dismiss();
  };

  const handleAccept = () => {
    const callerId = callerIdRef.current;
    const roomId   = roomIdRef.current;
    if (!callerId || !roomId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit("call-accepted", { to: callerId, roomId });
    }

    dismiss();
    // Navigate to the chat screen with this psychiatrist — it will pick up
    // the incall state via the call-accepted event already emitted above.
    router.push(`/(tabs)/(user-tabs)/chats/${callerId}` as any);
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent>
      <View style={gs.overlay}>
        <View style={gs.card}>
          <Text style={gs.label}>Incoming Video Call</Text>
          <Text style={gs.name}>{callerName || "Psychiatrist"}</Text>
          <View style={gs.row}>
            <TouchableOpacity
              style={[gs.btn, { backgroundColor: "#ef4444" }]}
              onPress={handleDecline}
            >
              <MaterialIcons name="call-end" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[gs.btn, { backgroundColor: "#22c55e" }]}
              onPress={handleAccept}
            >
              <MaterialIcons name="videocam" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const gs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
    paddingBottom: 40,
    alignItems: "center",
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: "90%",
  },
  label: { fontSize: 14, color: "#9ca3af", marginBottom: 8 },
  name:  { fontSize: 26, fontWeight: "bold", color: "#fff", marginBottom: 32 },
  row:   { flexDirection: "row", gap: 48 },
  btn:   { width: 68, height: 68, borderRadius: 34, justifyContent: "center", alignItems: "center" },
});
