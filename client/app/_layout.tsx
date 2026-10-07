import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Constants from "expo-constants";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthHydrated } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { useIconFonts } from "@/lib/loadIconFonts";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { logClientError } from "@/lib/log";

import { resolvePostAuthRoute } from "@/lib/sessionRouting";

SplashScreen.preventAutoHideAsync();

const isExpoGo = Constants.appOwnership === "expo";

function RootNavigation() {
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const { fontsReady, fontError } = useIconFonts();
  const [navigationReady, setNavigationReady] = useState(false);
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  const hasNavigated = useRef(false);
  const wasAuthenticated = useRef(false);

  useEffect(() => {
    if (fontsReady || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, fontError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!authHydrated || !navigationReady || !fontsReady || hasNavigated.current) {
      return;
    }

    const routeName = segments[0] ?? "index";
    const isAuthRoute =
      routeName === "login" ||
      routeName === "register" ||
      routeName === "verify-email";
    const isRootRoute = (segments as string[]).length === 0;

    if (accessToken && (isAuthRoute || isRootRoute)) {
      hasNavigated.current = true;
      const targetRoute = resolvePostAuthRoute(user);
      router.replace(targetRoute as any);
    }
  }, [segments, authHydrated, navigationReady, fontsReady, accessToken, user]);

  useEffect(() => {
    if (!authHydrated || !navigationReady || !fontsReady) return;
    if (accessToken) {
      wasAuthenticated.current = true;
    } else if (wasAuthenticated.current && !accessToken) {
      wasAuthenticated.current = false;
      const routeName = segments[0] ?? "index";
      const isAuthRoute =
        routeName === "login" ||
        routeName === "register" ||
        routeName === "verify-email";
      if (!isAuthRoute) {
        router.replace("/login" as never);
      }
    }
  }, [segments, authHydrated, navigationReady, fontsReady, accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    if (isExpoGo || Platform.OS === "web") {
      return;
    }

    (async () => {
      const { registerPushToken, savePushTokenToBackend } = await import(
        "@/lib/notifications"
      );
      const token = await registerPushToken();
      if (token) {
        await savePushTokenToBackend(token);
      }
    })().catch((err) => {
      logClientError("pushTokenSetup", err);
    });
  }, [accessToken]);

  useEffect(() => {
    if (isExpoGo || Platform.OS === "web") {
      return;
    }

    let sub: { remove?: () => void } | undefined;

    (async () => {
      const Notifications = await import("expo-notifications");
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as Record<
          string,
          string
        >;
        try {
          if (data.chat_id) {
            router.push(`/chats/${data.chat_id}` as never);
          } else if (data.booking_id) {
            router.push(`/bookings/${data.booking_id}` as never);
          } else if (data.psychiatrist_id) {
            router.push("/(admin)" as never);
          }
        } catch (err) {
          logClientError("notificationTap", err);
        }
      });
    })();

    return () => {
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const socket = getSocket();
    if (!socket) return;

    const handleNotification = () => {
      // notification badge refresh logic
    };

    socket.on("notification:new", handleNotification);
    return () => {
      socket.off("notification:new", handleNotification);
    };
  }, [accessToken]);

  useEffect(() => {
    if (accessToken) return;
    disconnectSocket();
  }, [accessToken]);

  if (!fontsReady || !navigationReady || !authHydrated) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return <RootNavigation />;
}
