import { disconnectSocket } from '@/lib/chatService';
import { useChatStore } from '@/stores/chatStore';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const AVATAR_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#d97706'];
function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]!;
}

export default function LobbyScreen() {
  const me = useChatStore((s) => s.me);
  const users = useChatStore((s) => s.users);
  const setPeer = useChatStore((s) => s.setPeer);

  useEffect(() => {
    if (!me) router.replace('/chat-room');
  }, [me]);

  function logout(): void {
    disconnectSocket();
    useChatStore.getState().clear();
    router.replace('/chat-room');
  }

  function openChat(username: string): void {
    setPeer(username);
    router.push(`/chat-room/${username}` as any);
  }

  const others = users.filter((u) => u.username !== me?.username);

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Chat App</Text>
          <Text style={s.headerSub}>Signed in as <Text style={s.bold}>{me?.username}</Text></Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={logout}>
          <Feather name="log-out" size={18} color="#2563eb" />
          <Text style={s.logoutTxt}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.sectionLabel}>PEOPLE</Text>

      <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
        {others.length === 0 && (
          <Text style={s.empty}>No other users found.</Text>
        )}
        {others.map((u) => (
          <TouchableOpacity key={u.username} style={s.row} onPress={() => openChat(u.username)} activeOpacity={0.8}>
            <View style={[s.avatar, { backgroundColor: avatarColor(u.username) }]}>
              <Text style={s.avatarTxt}>{u.username[0]?.toUpperCase()}</Text>
            </View>
            <View style={s.rowInfo}>
              <Text style={s.rowName}>{u.username}</Text>
              <View style={s.statusRow}>
                <View style={[s.dot, u.isOnline && s.dotOn]} />
                <Text style={s.statusTxt}>{u.isOnline ? 'online' : 'offline'}</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#d1d5db" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2563eb', paddingHorizontal: 18, paddingVertical: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  bold: { fontWeight: '700' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  logoutTxt: { color: '#2563eb', fontWeight: '700', fontSize: 13 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#bbb', letterSpacing: 1, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 8 },
  list: { paddingHorizontal: 14, paddingBottom: 32 },
  empty: { textAlign: 'center', color: '#ccc', marginTop: 40, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontSize: 19, fontWeight: '800' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '600', color: '#111' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d1d5db' },
  dotOn: { backgroundColor: '#22c55e' },
  statusTxt: { fontSize: 13, color: '#9ca3af' },
});
