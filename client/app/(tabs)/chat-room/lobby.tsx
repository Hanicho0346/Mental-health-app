import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useChatStore } from '@/stores/chatStore';
import { useRouter } from 'expo-router';

type PeerItem = {
  username: string;
  isOnline: boolean;
  lastMessage?: string;
  lastAt?: string;
  unread?: number;
};

export default function LobbyScreen() {
  const me = useChatStore((s) => s.me);
  const [loading, setLoading] = useState(true);
  const [peers, setPeers] = useState<PeerItem[]>([]);
  const router = useRouter();

  const loadConversations = useCallback(async () => {
    if (!me?.username) return;
    setLoading(true);
    try {
      const { data: users } = await api.get<{ username: string; isOnline: boolean }[]>('/chat/users');

      // For each user, fetch message history and compute last message + unread
      const items = await Promise.all(
        users.map(async (u) => {
          try {
            const { data: msgs } = await api.get<any[]>(`/chat/messages/${encodeURIComponent(me.username)}/${encodeURIComponent(u.username)}`);
            const last = msgs && msgs.length > 0 ? msgs[msgs.length - 1] : null;
            const unread = msgs ? msgs.filter(m => m.to === me.username && !m.read).length : 0;
            return {
              username: u.username,
              isOnline: u.isOnline,
              lastMessage: last?.content ?? '',
              lastAt: last ? new Date(last.timestamp || last.created_at || Date.now()).toISOString() : undefined,
              unread,
            } as PeerItem;
          } catch {
            return { username: u.username, isOnline: u.isOnline } as PeerItem;
          }
        })
      );

      // Sort by lastAt desc
      items.sort((a, b) => {
        const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
        const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
        return tb - ta;
      });

      setPeers(items);
    } catch (e) {
      console.warn('Failed to load conversations', e);
    } finally {
      setLoading(false);
    }
  }, [me?.username]);

  useEffect(() => {
    void loadConversations();
    const socket = getSocket();
    if (!socket) return;

    const onReceive = (msg: any) => {
      // If msg involves me, refresh the list for simplicity
      if (!me?.username) return;
      if (msg.from === me.username || msg.to === me.username) {
        void loadConversations();
      }
    };

    socket.on('receive-message', onReceive);
    socket.on('message:new', onReceive);

    return () => {
      socket.off('receive-message', onReceive);
      socket.off('message:new', onReceive);
    };
  }, [loadConversations, me?.username]);

  const openChat = (peer: string) => {
    useChatStore.getState().setPeer(peer);
    router.push({ pathname: '/chat-room/[peer]', params: { peer } });
  };

  if (!me) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.empty}><Text style={styles.title}>Not signed in</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" /></View>
      ) : (
        <FlatList
          data={peers}
          keyExtractor={(i) => i.username}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openChat(item.username)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.peer}>{item.username}</Text>
                <Text style={styles.last}>{item.lastMessage}</Text>
              </View>
              <View style={styles.meta}>
                {item.lastAt && <Text style={styles.time}>{new Date(item.lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>}
                {item.unread ? <View style={styles.unread}><Text style={styles.unreadText}>{item.unread}</Text></View> : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title: { fontSize: 20, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', padding: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  peer: { fontSize: 16, fontWeight: '600' },
  last: { fontSize: 13, color: '#6B7280', marginTop: 4, maxWidth: 220 },
  meta: { alignItems: 'flex-end' },
  time: { fontSize: 12, color: '#9CA3AF' },
  unread: { backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 2, marginTop: 6 },
  unreadText: { color: '#fff', fontSize: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});