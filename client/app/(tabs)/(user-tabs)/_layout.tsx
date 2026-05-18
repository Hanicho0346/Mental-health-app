import { HapticTab } from "@/components/haptic-tab";
import { useAuthStore } from "@/stores/authStore";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect, Tabs } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UserTabLayout() {
  const [ready, setReady] = useState(false);
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const compact = width < 380;
  const iconSize = compact ? 22 : 24;

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

  if (!ready) return null;
  if (!accessToken) return <Redirect href="/login" />;
  if (user?.role === "psychiatrist") return <Redirect href="/(tabs)/(psychiatrist-tabs)/dashboard" />;

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
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <Feather size={iconSize} name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
