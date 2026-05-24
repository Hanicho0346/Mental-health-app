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
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthHydrated } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";
import { useIconFonts } from "@/lib/loadIconFonts";

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

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

function RootNavigation() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const colorScheme = useColorScheme();
  const { fontsReady, fontError } = useIconFonts();
  const [navigationReady, setNavigationReady] = useState(false);
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasNavigated = useRef(false);

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
    if (!authHydrated || !isLoaded || isSignedIn || !accessToken) {
      return;
    }

    useAuthStore.getState().clearSession();
  }, [authHydrated, isLoaded, isSignedIn, accessToken]);

  useEffect(() => {
    if (!isLoaded || !authHydrated || !navigationReady || !fontsReady || hasNavigated.current) {
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
  }, [isLoaded, isSignedIn, segments, authHydrated, navigationReady, fontsReady]);

  if (!fontsReady || !isLoaded || !navigationReady || !authHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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
  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <RootNavigation />
    </ClerkProvider>
  );
}
