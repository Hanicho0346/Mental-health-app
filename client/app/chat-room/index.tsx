import { apiLogin, apiLoadUsers, connectSocket } from '@/lib/chatService';
import { useChatStore } from '@/stores/chatStore';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const HINTS = ['hana', 'yab', 'masti'];

export default function ChatLoginScreen() {
  const setMe = useChatStore((s) => s.setMe);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(): Promise<void> {
    const u = username.trim();
    const p = password.trim();
    if (!u || !p) { Alert.alert('Missing fields', 'Enter username and password.'); return; }
    setLoading(true);
    try {
      const me = await apiLogin(u, p);
      setMe(me);
      connectSocket(me.username);
      await apiLoadUsers();
      router.replace('/chat-room/lobby' as any);
    } catch (e: unknown) {
      Alert.alert('Login failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.card}>
        <View style={s.iconRow}>
          <View style={s.iconCircle}>
            <Feather name="message-circle" size={28} color="#2563eb" />
          </View>
        </View>
        <Text style={s.title}>Chat App</Text>
        <Text style={s.sub}>Sign in to start chatting</Text>

        <View style={s.hint}>
          <Text style={s.hintText}>Test accounts — password: <Text style={s.bold}>1234</Text></Text>
          <View style={s.hintRow}>
            {HINTS.map((h) => (
              <TouchableOpacity key={h} style={s.chip} onPress={() => setUsername(h)}>
                <Text style={s.chipTxt}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.inputWrap}>
          <Feather name="user" size={18} color="#9ca3af" style={s.inputIcon} />
          <TextInput
            style={s.input}
            placeholder="Username"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={s.inputWrap}>
          <Feather name="lock" size={18} color="#9ca3af" style={s.inputIcon} />
          <TextInput
            style={s.input}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void handleLogin()}
          />
        </View>

        <TouchableOpacity style={s.btn} onPress={() => void handleLogin()} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.btnTxt}>Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 28, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 6 },
  iconRow: { alignItems: 'center', marginBottom: 16 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#111', textAlign: 'center' },
  sub: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 4, marginBottom: 20 },
  hint: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginBottom: 20 },
  hintText: { fontSize: 13, color: '#3b82f6', marginBottom: 10 },
  bold: { fontWeight: '700' },
  hintRow: { flexDirection: 'row', gap: 8 },
  chip: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  chipTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e8e8e8', borderRadius: 12, paddingHorizontal: 14, height: 52, marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#111' },
  btn: { backgroundColor: '#2563eb', borderRadius: 12, height: 52, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  btnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
