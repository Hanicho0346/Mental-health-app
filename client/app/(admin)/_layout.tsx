import { useAuthStore } from '@/stores/authStore';
import { isAdmin } from '@/lib/authGuards';
import { useAuthHydrated } from '@/lib/auth';
import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function AdminLayout() {
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  if (!authHydrated) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!accessToken) {
    return <Redirect href="/login" />;
  }
  if (!isAdmin(user)) {
    return <Redirect href="/(tabs)/(user-tabs)/home" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
