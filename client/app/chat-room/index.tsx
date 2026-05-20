import { useUser } from '@clerk/clerk-expo';
import { apiLoadUsers, connectSocket, CHAT_SERVER } from '@/lib/chatService';
import { useChatStore } from '@/stores/chatStore';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatRoomEntry() {
  const { user, isLoaded } = useUser();
  const setMe = useChatStore((s) => s.setMe);
  const me = useChatStore((s) => s.me);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    // Not signed in with Clerk — go to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // Already connected
    if (me) {
      router.replace('/chat-room/lobby' as any);
      return;
    }

    // Auto-connect using Clerk identity
    async function connect() {
      try {
        const username = user!.username
          ?? user!.emailAddresses[0]?.emailAddress?.split('@')[0]
          ?? user!.id;

        const fullName = user!.fullName ?? username;

        // Register/login on chat server using Clerk identity
        const res = await fetch(`${CHAT_SERVER}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password: user!.id, // use Clerk user ID as password
            fullName,
            clerkId: user!.id,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Connection failed');

        setMe({ userId: data.userId, username: data.username });
        connectSocket(data.username);
        await apiLoadUsers();
        router.replace('/chat-room/lobby' as any);
      } catch (e: any) {
        setError(e.message ?? 'Failed to connect to chat');
      }
    }

    void connect();
  }, [isLoaded, user, me]);

  if (error) {
    return (
      <SafeAreaView style={s.container}>
        <Text style={s.errorText}>Chat connection failed: {error}</Text>
        <Text style={s.errorSub}>Make sure the chat server is running</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={s.loadingText}>Connecting to chat…</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center' },
  center: { alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, color: '#6b7280', marginTop: 8 },
  errorText: { fontSize: 16, color: '#ef4444', textAlign: 'center', paddingHorizontal: 24 },
  errorSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 8 },
});
