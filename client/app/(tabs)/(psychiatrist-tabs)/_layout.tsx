import { HapticTab } from "@/components/haptic-tab";
import { isRejectedPsychiatrist } from "@/lib/authGuards";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { getStoredAuthToken } from "@/lib/auth";
import { connectSocket } from "@/lib/chatService";
import { Feather, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs, router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSocket } from "@/lib/socket";

export default function PsychiatristTabLayout() {
  const [ready, setReady] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

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
      if (token) {
        connectSocket(username, token);
      }
    };
    void setupSocket();
  }, [user]);

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
          ? {
              maxWidth: 720,
              alignSelf: "center" as const,
              width: "100%" as const,
            }
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
            useAuthStore
              .getState()
              .setSession({ accessToken: legacy, refreshToken: "" });
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!accessToken) return <Redirect href="/login" />;
  if (user?.role !== "psychiatrist")
    return <Redirect href="/(tabs)/(user-tabs)/home" />;
  if (isRejectedPsychiatrist(user)) {
    return <Redirect href="/psychiatrist-rejected" />;
  }

  return (
    <>
      <GlobalIncomingCallOverlay />
      <Tabs screenOptions={screenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="grid" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: "Chats",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="message-square" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: "Users",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="users" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calender"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="calendar" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="user" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Notifications",
          tabBarIcon: ({ color }) => (
            <Feather size={iconSize} name="bell" color={color} />
          ),
        }}
      />
    </Tabs>
    </>
  );
}

function GlobalIncomingCallOverlay() {
  const [visible, setVisible] = useState(false);
  const [callerName, setCallerName] = useState("Patient");
  const callerIdRef = useRef<string | null>(null);
  const roomIdRef   = useRef<string | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    callerIdRef.current = null;
    roomIdRef.current   = null;
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncomingCall = ({ from, roomId }: { from: string; roomId: string }) => {
      callerIdRef.current = from;
      roomIdRef.current   = roomId;
      setCallerName("Patient");
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(dismiss, 45_000);
    };

    socket.on("incoming-call", onIncomingCall);
    socket.on("call-ended",    dismiss);
    socket.on("call-declined", dismiss);

    return () => {
      socket.off("incoming-call", onIncomingCall);
      socket.off("call-ended",    dismiss);
      socket.off("call-declined", dismiss);
    };
  }, []);

  const handleDecline = () => {
    const socket = getSocket();
    if (socket && callerIdRef.current)
      socket.emit("call-declined", { to: callerIdRef.current });
    dismiss();
  };

  const handleAccept = () => {
    const callerId = callerIdRef.current;
    const roomId   = roomIdRef.current;
    if (!callerId || !roomId) return;
    const socket = getSocket();
    if (socket) socket.emit("call-accepted", { to: callerId, roomId });
    dismiss();
    router.push(`/(tabs)/(psychiatrist-tabs)/chats/${callerId}` as any);
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent>
      <View style={gs.overlay}>
        <View style={gs.card}>
          <Text style={gs.label}>Incoming Video Call</Text>
          <Text style={gs.name}>{callerName}</Text>
          <View style={gs.row}>
            <TouchableOpacity style={[gs.btn, { backgroundColor: "#ef4444" }]} onPress={handleDecline}>
              <MaterialIcons name="call-end" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[gs.btn, { backgroundColor: "#22c55e" }]} onPress={handleAccept}>
              <MaterialIcons name="videocam" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const gs = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end", paddingBottom: 40, alignItems: "center" },
  card:    { backgroundColor: "#111827", borderRadius: 24, padding: 32, alignItems: "center", width: "90%" },
  label:   { fontSize: 14, color: "#9ca3af", marginBottom: 8 },
  name:    { fontSize: 26, fontWeight: "bold", color: "#fff", marginBottom: 32 },
  row:     { flexDirection: "row", gap: 48 },
  btn:     { width: 68, height: 68, borderRadius: 34, justifyContent: "center", alignItems: "center" },
});
