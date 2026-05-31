/**
 * app/payment-return.tsx
 *
 * Deep-link landing screen after Chapa redirects back to the app.
 * URL: selamind://payment-return?tx_ref=sub_xxxx
 *
 * Flow:
 *  1. Parse tx_ref from URL params
 *  2. Call GET /subscriptions/verify/:tx_ref  (auth via api interceptor)
 *  3. On success → call GET /users/me → update isPremier in authStore
 *  4. Show success / error UI with appropriate CTA
 */

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Types ───────────────────────────────────────────────────────────────────

type ScreenState = 'verifying' | 'success' | 'already_paid' | 'error';

interface VerifyResponse {
  success?: boolean;
  already_paid?: boolean;
  expires_at?: string;
}

interface MeResponse {
  is_premier: boolean;
  premier_expires_at?: string;
  subscription_tier?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentReturnScreen() {
  const { tx_ref } = useLocalSearchParams<{ tx_ref: string }>();
  const [screenState, setScreenState] = useState<ScreenState>('verifying');
  const [errorMsg, setErrorMsg]       = useState('');
  const [expiresAt, setExpiresAt]     = useState<string | null>(null);

  // Animation for success/error icon
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scaleAnim, fadeAnim]);

  // ── Verify on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!tx_ref?.trim()) {
      setErrorMsg('Missing transaction reference. Please contact support if you were charged.');
      setScreenState('error');
      animateIn();
      return;
    }
    void verify(tx_ref.trim());
  }, [tx_ref]);

  async function verify(ref: string): Promise<void> {
    try {
      // Step 1 — verify payment with backend
      const verifyRes = await api.get<VerifyResponse>(
        `/subscriptions/verify/${encodeURIComponent(ref)}`
      );

      const { already_paid, expires_at } = verifyRes.data;

      if (expires_at) setExpiresAt(expires_at);

      // Step 2 — re-fetch /users/me to get latest is_premier flag
      // This is the source of truth; don't rely solely on the verify response
      try {
        const meRes = await api.get<MeResponse>('/users/me');
        useAuthStore.getState().setIsPremier(meRes.data.is_premier ?? true);
      } catch {
        // /users/me failed but payment succeeded — optimistically set premier
        // so the AI Chat tab appears immediately without forcing a restart
        useAuthStore.getState().setIsPremier(true);
      }

      setScreenState(already_paid ? 'already_paid' : 'success');
      animateIn();
    } catch (e: any) {
      const msg: string =
        e?.response?.data?.error ??
        e?.message ??
        'Payment could not be confirmed. Please contact support.';

      // If Chapa reports not-yet-settled, give a softer message
      const isNotYet = /not successful|pending/i.test(msg);

      setErrorMsg(
        isNotYet
          ? 'Payment is still being processed. Wait a moment and try again from your profile.'
          : msg
      );
      setScreenState('error');
      animateIn();
    }
  }

  // ── Retry ──────────────────────────────────────────────────────────────────

  function handleRetry(): void {
    if (!tx_ref?.trim()) return;
    setScreenState('verifying');
    scaleAnim.setValue(0);
    fadeAnim.setValue(0);
    void verify(tx_ref.trim());
  }

  // ── Navigation helpers ─────────────────────────────────────────────────────

  function goToAiChat(): void {
    router.replace('/(tabs)/(user-tabs)/aichat');
  }

  function goHome(): void {
    router.replace('/(tabs)/(user-tabs)/home');
  }

  function goProfile(): void {
    router.replace('/(tabs)/(user-tabs)/profile');
  }

  // ── Format expiry ──────────────────────────────────────────────────────────

  function formatExpiry(iso: string | null): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-ET', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  }

  // ─── Render: verifying ────────────────────────────────────────────────────

  if (screenState === 'verifying') {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}>
          <View style={s.spinnerWrap}>
            <ActivityIndicator size="large" color="#16A34A" />
          </View>
          <Text style={s.verifyTitle}>Confirming your payment…</Text>
          <Text style={s.verifySub}>
            This usually takes a few seconds. Please don't close the app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: error ────────────────────────────────────────────────────────

  if (screenState === 'error') {
    return (
      <SafeAreaView style={s.root}>
        <Animated.View style={[s.center, { opacity: fadeAnim }]}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <View style={[s.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <Feather name="x-circle" size={40} color="#EF4444" />
            </View>
          </Animated.View>

          <Text style={[s.title, { color: '#EF4444' }]}>Payment Not Confirmed</Text>
          <Text style={s.subtitle}>{errorMsg}</Text>

          <TouchableOpacity
            style={[s.btn, { backgroundColor: '#EF4444' }]}
            onPress={handleRetry}
          >
            <Feather name="refresh-cw" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={s.btnText}>Try Verifying Again</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.secondaryBtn} onPress={goProfile}>
            <Text style={s.secondaryBtnText}>Back to profile</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    );
  }

  // ─── Render: success / already_paid ──────────────────────────────────────

  const isAlreadyPaid = screenState === 'already_paid';

  return (
    <SafeAreaView style={s.root}>
      <Animated.View style={[s.center, { opacity: fadeAnim }]}>

        {/* Icon */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View style={[s.iconCircle, { backgroundColor: '#DCFCE7' }]}>
            <Feather name="check-circle" size={40} color="#16A34A" />
          </View>
        </Animated.View>

        {/* Title */}
        <Text style={s.title}>
          {isAlreadyPaid ? 'Already Premier!' : '🎉 Welcome to Premier!'}
        </Text>

        {/* Subtitle */}
        <Text style={s.subtitle}>
          {isAlreadyPaid
            ? 'Your Premier subscription is already active. All features are unlocked.'
            : 'Your subscription is now active. Enjoy unlimited AI chat sessions, daily streaks, and group access.'}
        </Text>

        {/* Expiry chip */}
        {expiresAt ? (
          <View style={s.expiryChip}>
            <Feather name="calendar" size={13} color="#16A34A" />
            <Text style={s.expiryText}>
              Active until {formatExpiry(expiresAt)}
            </Text>
          </View>
        ) : null}

        {/* Benefits row */}
        <View style={s.benefitsRow}>
          {[
            { icon: 'message-circle', label: 'AI Chat' },
            { icon: 'zap',            label: 'Streaks'  },
            { icon: 'users',          label: 'Groups'   },
          ].map((b) => (
            <View key={b.label} style={s.benefitPill}>
              <Feather name={b.icon as any} size={14} color="#16A34A" />
              <Text style={s.benefitPillTxt}>{b.label}</Text>
            </View>
          ))}
        </View>

        {/* Primary CTA */}
        <TouchableOpacity style={[s.btn, { backgroundColor: '#16A34A' }]} onPress={goToAiChat}>
          <Feather name="message-circle" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={s.btnText}>Chat with Dr. Selam</Text>
        </TouchableOpacity>

        {/* Secondary CTAs */}
        <TouchableOpacity style={s.secondaryBtn} onPress={goHome}>
          <Text style={s.secondaryBtnText}>Go to home</Text>
        </TouchableOpacity>

      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },

  // Verifying
  spinnerWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  verifyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  verifySub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Icon
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },

  // Text
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
    marginBottom: 20,
  },

  // Expiry chip
  expiryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  expiryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#16A34A',
  },

  // Benefits row
  benefitsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  benefitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  benefitPillTxt: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },

  // Buttons
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
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    paddingVertical: 12,
  },
  secondaryBtnText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
