import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthHydrated } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { useIconFonts } from "@/lib/loadIconFonts";
import {
  registerPushToken,
  savePushTokenToBackend,
} from "@/lib/notifications";
import { getSocket } from "@/lib/socket";
import { logClientError } from "@/lib/log";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const isExpoGo = Constants.appOwnership === "expo";
// ───────const isExpoGo = Constants.appOwnership === "expo";──────────────────────────────────────────────────────
// Secure token cache for Clerk
// ─────────────────────────────────────────────────────────────

const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async saveToken(key: string, value: string) {
    try {
      return await SecureStore.setItemAsync(key, value);
    } catch {
      return;
    }
  },

  async clearToken(key: string) {
    try {
      return await SecureStore.deleteItemAsync(key);
    } catch {
      return;
    }
  },
};

// ─────────────────────────────────────────────────────────────
// Root Navigation
// ─────────────────────────────────────────────────────────────

function RootNavigation() {
  const { isLoaded, isSignedIn } = useAuth();

  const segments = useSegments();

  const colorScheme = useColorScheme();

  const { fontsReady, fontError } = useIconFonts();

  const [navigationReady, setNavigationReady] = useState(false);

  const authHydrated = useAuthHydrated();

  const accessToken = useAuthStore((s) => s.accessToken);

  const hasNavigated = useRef(false);

  // ─────────────────────────────────────────────────────────
  // Hide splash screen when fonts are ready
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (fontsReady || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, fontError]);

  // ─────────────────────────────────────────────────────────
  // Small delay before navigation
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => {
      setNavigationReady(true);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // ─────────────────────────────────────────────────────────
  // Clear stale local session
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!authHydrated || !isLoaded || isSignedIn || !accessToken) {
      return;
    }

    useAuthStore.getState().clearSession();
  }, [authHydrated, isLoaded, isSignedIn, accessToken]);

  // ─────────────────────────────────────────────────────────
  // Auto navigation after login
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (
      !isLoaded ||
      !authHydrated ||
      !navigationReady ||
      !fontsReady ||
      hasNavigated.current
    ) {
      return;
    }

    const routeName = segments[0] ?? "index";

    const isAuthRoute =
      routeName === "login" ||
      routeName === "register" ||
      routeName === "verify-email";

    const isRootRoute = segments.length === 0;

    if (isSignedIn && (isAuthRoute || isRootRoute)) {
      hasNavigated.current = true;

      router.replace("/(tabs)");
    }
  }, [
    isLoaded,
    isSignedIn,
    segments,
    authHydrated,
    navigationReady,
    fontsReady,
  ]);

  // ─────────────────────────────────────────────────────────
  // Push notification setup
  // Disabled in Expo Go
  // ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken) return;

    // Expo Go does not support remote push notifications
    const isExpoGo = Constants.appOwnership === "expo";

    if (isExpoGo) {
      console.log(
        "[Notifications] Push notifications skipped in Expo Go"
      );
      return;
    }

    registerPushToken()
      .then((token) => {
        if (token) {
          return savePushTokenToBackend(token);
        }
      })
      .catch((err) => {
        logClientError("pushTokenSetup", err);
      });
  }, [accessToken]);

  // ─────────────────────────────────────────────────────────
  // Notification tap handling
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
// Notification tap handling
// ─────────────────────────────────────────────────────────

useEffect(() => {
  if (isExpoGo) {
    console.log(
      "[Notifications] Notification listeners skipped in Expo Go"
    );
    return;
  }

  let sub: any;

  (async () => {
    const Notifications = await import("expo-notifications");

    sub =
      Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content
            .data as Record<string, string>;

          try {
            if (data.chat_id) {
              router.push(`/chats/${data.chat_id}` as any);
            } else if (data.booking_id) {
              router.push(`/bookings/${data.booking_id}` as any);
            } else if (data.psychiatrist_id) {
              router.push("/(admin)" as any);
            }
          } catch (err) {
            logClientError("notificationTap", err);
          }
        }
      );
  })();

  return () => {
    sub?.remove?.();
  };
}, []);

  // ─────────────────────────────────────────────────────────
  // Real-time notification socket listener
  // ─────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────
  // Loading screen
  // ─────────────────────────────────────────────────────────

  if (!fontsReady || !isLoaded || !navigationReady || !authHydrated) {
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

  // ─────────────────────────────────────────────────────────
  // Main App
  // ─────────────────────────────────────────────────────────

  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
      >
        <Stack screenOptions={{ headerShown: false }} />

        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

// ─────────────────────────────────────────────────────────────
// Root Layout
// ─────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      tokenCache={tokenCache}
    >
      <RootNavigation />
    </ClerkProvider>
  );
}