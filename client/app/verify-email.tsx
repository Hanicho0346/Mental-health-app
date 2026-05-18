import { api } from '@/lib/api';
import { getApiErrorMessage, logClientError } from '@/lib/log';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function pickParam(v: string | string[] | undefined): string {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0].trim();
  return '';
}

export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string | string[] }>();
  const email = useMemo(() => pickParam(emailParam), [emailParam]);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleVerify(): Promise<void> {
    if (!email) {
      Alert.alert('Missing email', 'Go back and register again.');
      return;
    }
    const digits = code.replace(/\D/g, '').slice(0, 6);
    if (digits.length !== 6) {
      Alert.alert('Invalid code', 'Enter the 6-digit code sent to your email.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      await api.post('/auth/verify-email', { email, code: digits });
      router.replace({ pathname: '/login', params: { email } });
    } catch (e: unknown) {
      logClientError('verify-email.handleVerify', e);
      Alert.alert('Verification failed', getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (!email) return;
    if (resending) return;
    setResending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      Alert.alert('Sent', 'If an account needs verification, a new code was sent.');
    } catch (e: unknown) {
      logClientError('verify-email.handleResend', e);
      Alert.alert('Could not resend', getApiErrorMessage(e));
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify email / ኢሜል ያረጋግጡ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.logoSection}>
          <View style={styles.iconCircle}>
            <Feather name="mail" size={24} color="#4ADE80" />
          </View>
          <Text style={styles.mainTitle}>Check your inbox</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{' '}
            <Text style={styles.emailEmphasis}>{email || 'your email'}</Text>
          </Text>
          <Text style={styles.amharicHint}>ወደ ኢሜልዎ የላክነውን 6 አሃዝ ኮድ ያስገቡ</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Verification code</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => void handleResend()} disabled={resending || !email}>
            {resending ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={styles.secondaryBtnText}>Resend code</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => void handleVerify()}
          disabled={submitting || code.replace(/\D/g, '').length !== 6}
        >
          {submitting ? <ActivityIndicator color="#111827" /> : <Text style={styles.continueButtonText}>Verify & continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.footerLink} onPress={() => router.replace('/register')}>
          <Text style={styles.footerLinkText}>Wrong email? Register again</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827', flex: 1, textAlign: 'center' },
  scrollContent: { flex: 1, paddingHorizontal: 20 },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  mainTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center', paddingHorizontal: 8 },
  emailEmphasis: { fontWeight: '700', color: '#111827' },
  amharicHint: { fontSize: 14, color: '#4ADE80', fontWeight: '600', marginTop: 10, textAlign: 'center' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
  },
  input: { flex: 1, fontSize: 20, letterSpacing: 4, color: '#111827', fontWeight: '600' },
  secondaryBtn: { alignSelf: 'center', paddingVertical: 12 },
  secondaryBtnText: { color: '#4ADE80', fontWeight: '700', fontSize: 14 },
  continueButton: {
    backgroundColor: '#4ADE80',
    borderRadius: 16,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  continueButtonText: { color: '#111827', fontSize: 16, fontWeight: '700' },
  footerLink: { alignItems: 'center', marginTop: 20 },
  footerLinkText: { color: '#6B7280', fontSize: 14 },
});
