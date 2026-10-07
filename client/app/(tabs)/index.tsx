import { resolvePostAuthRoute } from '@/lib/sessionRouting';
import { useAuthStore } from '@/stores/authStore';
import { useAuthHydrated } from '@/lib/auth';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
    <ActivityIndicator size="large" />
  </View>
);

export default function TabsGroupLayout() {
  const authHydrated = useAuthHydrated();
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  if (!authHydrated) return <LoadingScreen />;
  if (!accessToken) return <Redirect href="/login" />;
  if (!user) return <LoadingScreen />;

  return <Redirect href={resolvePostAuthRoute(user)} />;
}
