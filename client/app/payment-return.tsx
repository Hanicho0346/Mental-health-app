import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type State = 'verifying' | 'success' | 'already_paid' | 'error';

export default function PaymentReturnScreen() {
  const { tx_ref } = useLocalSearchParams<{ tx_ref: string }>();
  const [state, setState] = useState<State>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!tx_ref) {
      setErrorMsg('Missing transaction reference. Please contact support.');
      setState('error');
      return;
    }
    void verify();
  }, [tx_ref]);

  async function verify() {
    try {
      const res = await api.get<{ success?: boolean; already_paid?: boolean }>(
        `/subscriptions/verify/${tx_ref}`
      );

      // Re-fetch user to update isPremier in the store → unlocks AI Chat tab
      const meRes = await api.get<{ is_premier: boolean }>('/users/me');
      useAuthStore.getState().setIsPremier(meRes.data.is_premier);

      setState(res.data.already_paid ? 'already_paid' : 'success');
    } catch (e: any) {
      setErrorMsg(
        e?.response?.data?.error ??
          'Payment could not be confirmed. Please contact support.'
      );
      setState('error');
    }
  }

  if (state === 'verifying') {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#16A34A" />
        <Text style={s.verifyingText}>Confirming your payment…</Text>
      </SafeAreaView>
    );
  }

  if (state === 'error') {
    return (
      <SafeAreaView style={s.center}>
        <View style={[s.iconCircle, { backgroundColor: '#FEE2E2' }]}>
          <Feather name="x" size={32} color="#EF4444" />
        </View>
        <Text style={s.title}>Payment not confirmed</Text>
        <Text style={s.subtitle}>{errorMsg}</Text>
        <TouchableOpacity
          style={[s.btn, { backgroundColor: '#EF4444' }]}
          onPress={() => router.replace('/(tabs)')}
        >
          <Text style={s.btnText}>Back to home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // success or already_paid
  return (
    <SafeAreaView style={s.center}>
      <View style={[s.iconCircle, { backgroundColor: '#DCFCE7' }]}>
        <Feather name="check" size={32} color="#16A34A" />
      </View>
      <Text style={s.title}>
        {state === 'already_paid' ? 'Already Premier!' : '🎉 Welcome to Premier!'}
      </Text>
      <Text style={s.subtitle}>
        {state === 'already_paid'
          ? 'Your Premier access is active. Enjoy all features.'
          : 'Your subscription is active. Unlimited AI chat, streaks, and group access are now unlocked.'}
      </Text>

      <TouchableOpacity
        style={[s.btn, { backgroundColor: '#16A34A' }]}
        onPress={() => router.replace('/(tabs)/(user-tabs)/aichat')}
      >
        <Feather name="message-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
        <Text style={s.btnText}>Chat with Dr. Selam</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
        <Text style={s.secondaryBtnText}>Go to home</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F9FAFB',
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyingText: { marginTop: 20, fontSize: 16, color: '#6B7280' },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 28,
    marginBottom: 12,
    width: '100%',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryBtn: { paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
});