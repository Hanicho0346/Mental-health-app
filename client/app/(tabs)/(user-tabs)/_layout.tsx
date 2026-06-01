// app/(tabs)/(user-tabs)/_layout.tsx

import { HapticTab } from "@/components/haptic-tab";
import { isAdmin } from "@/lib/authGuards";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useChatStore } from "@/stores/chatStore";
import { connectSocket } from "@/lib/chatService";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, ActivityIndicator, Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@clerk/clerk-expo";

export default function UserTabLayout() {
  const [ready, setReady] = useState(false);
  const { getToken } = useAuth();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const isPremier = useAuthStore((s) => s.isPremier); // ← read from store
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const appStateRef = useRef(AppState.currentState);
  const setIsPremier = useAuthStore((s) => s.setIsPremier);

  const compact = width < 380;
  const iconSize = compact ? 22 : 24;

  useEffect(() => {
    if (!user) return;
    const setupSocket = async () => {
      const username = user.full_name?.trim() || user.id;
      const token = await getToken({ template: "backend" });
      useChatStore.getState().setMe({
        _id: user.id,
        userId: user.id,
        username,
        full_name: user.full_name ?? username,
      });
      if (token) connectSocket(username, token);
    };
    void setupSocket();
  }, [user, getToken]);

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

      {/* AI Chat — visible only for premier users */}
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
          href: null, // keep hidden per your original setup
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="bell" color={color} />,
        }}
      />
    </Tabs>
  );
}