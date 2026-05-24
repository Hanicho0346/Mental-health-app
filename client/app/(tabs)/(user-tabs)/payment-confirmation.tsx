import { api } from '@/lib/api';
import { getApiErrorMessage, logClientError } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const GREEN      = '#4ADE80';
const GREEN_DARK = '#16A34A';
const AMOUNT     = 300;
const PSYCH_PCT  = 0.70;
const ADMIN_PCT  = 0.30;

type PaymentState = 'idle' | 'initiating' | 'awaiting_payment' | 'verifying' | 'success' | 'failed';

export default function PaymentConfirmationScreen() {
  const params = useLocalSearchParams<{
    psychiatrist_id: string;
    psychiatrist_name: string;
    specialization: string;
    rating: string;
    sessions_count: string;
    scheduled_at: string;
    time_label: string;
    date_label: string;
    time_of_day: string;
  }>();

  const [payState, setPayState]   = useState<PaymentState>('idle');
  const [txRef, setTxRef]         = useState<string | null>(null);
  const appStateRef               = useRef(AppState.currentState);
  const pollRef                   = useRef<ReturnType<typeof setInterval> | null>(null);
const [bookingId, setBookingId] = useState<string | null>(null);
  // When app comes back to foreground after Chapa redirect, verify payment
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        next === 'active' &&
        txRef &&
        payState === 'awaiting_payment'
      ) {
        void verifyPayment(txRef);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [txRef, payState]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handlePay(): Promise<void> {
    if (!params.psychiatrist_id || payState !== 'idle') return;
    setPayState('initiating');
    try {
      const { data } = await api.post<{ checkout_url: string; tx_ref: string; booking_id: string }>(
        '/bookings/initiate',
        {
          psychiatrist_id: params.psychiatrist_id,
          scheduled_at:    params.scheduled_at,
          time_label:      params.time_label,
        }
      );
      setTxRef(data.tx_ref);
      setPayState('awaiting_payment');
      await Linking.openURL(data.checkout_url);
    } catch (e: unknown) {
      logClientError('payment-confirmation.handlePay', e);
      setPayState('idle');
      Alert.alert('Could not initiate payment', getApiErrorMessage(e));
    }
  }

 // Replace only the two functions that change — everything else stays identical

async function verifyPayment(ref: string): Promise<void> {
    if (payState === 'verifying' || payState === 'success') return;
    setPayState('verifying');
    try {
      const { data } = await api.get<{
        success: boolean;
        already_paid: boolean;
        booking_id: string;          // ← make sure your backend returns this
        booking: { payment_status: string };
      }>(`/bookings/verify/${encodeURIComponent(ref)}`);

      if (data.success && (data.booking.payment_status === 'paid' || data.already_paid)) {
        setBookingId(data.booking_id);  // ← store so goToChat can use it
        setPayState('success');
      } else {
        setPayState('failed');
      }
    } catch (e: unknown) {
      logClientError('payment-confirmation.verifyPayment', e);
      setPayState('failed');
    }
  }



  function handleManualVerify(): void {
    if (txRef) void verifyPayment(txRef);
  }

 function goToChat(): void {
    // Navigate to the specific chat room for this booking
    // Adjust the route to match your chat screen's expected params
    router.replace({
      pathname: '/(tabs)/(user-tabs)/chats',
      params: { booking_id: bookingId ?? '' },
    });
  }

  const psychiatristEarning = Math.round(AMOUNT * PSYCH_PCT); // 210
  const platformFee         = AMOUNT - psychiatristEarning;   // 90

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.back()}
          disabled={payState === 'initiating' || payState === 'verifying'}
        >
          <Feather name="chevron-left" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Confirm Booking</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Success state ── */}
        {payState === 'success' && (
          <View style={s.statusCard}>
            <View style={[s.statusIcon, { backgroundColor: '#DCFCE7' }]}>
              <Feather name="check-circle" size={36} color={GREEN_DARK} />
            </View>
            <Text style={s.statusTitle}>Payment Successful!</Text>
            <Text style={s.statusSub}>
              Your session with {params.psychiatrist_name} is confirmed.{'\n'}
              You can now access the chat.
            </Text>
            <TouchableOpacity style={s.chatBtn} onPress={goToChat}>
              <Feather name="message-circle" size={18} color="#111827" />
              <Text style={s.chatBtnTxt}>Go to Chat</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Failed state ── */}
        {payState === 'failed' && (
          <View style={s.statusCard}>
            <View style={[s.statusIcon, { backgroundColor: '#FEE2E2' }]}>
              <Feather name="x-circle" size={36} color="#EF4444" />
            </View>
            <Text style={[s.statusTitle, { color: '#EF4444' }]}>Payment Not Confirmed</Text>
            <Text style={s.statusSub}>
              We could not verify your payment. If you completed the payment, tap Verify below.
            </Text>
            <TouchableOpacity style={s.retryBtn} onPress={handleManualVerify}>
              <Text style={s.retryBtnTxt}>Verify Payment</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.retryBtn, { backgroundColor: '#F3F4F6', marginTop: 8 }]} onPress={() => setPayState('idle')}>
              <Text style={[s.retryBtnTxt, { color: '#374151' }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Verifying state ── */}
        {payState === 'verifying' && (
          <View style={s.statusCard}>
            <ActivityIndicator size="large" color={GREEN_DARK} />
            <Text style={s.statusTitle}>Verifying Payment…</Text>
            <Text style={s.statusSub}>Please wait while we confirm your payment with Chapa.</Text>
          </View>
        )}

        {/* ── Awaiting payment state ── */}
        {payState === 'awaiting_payment' && (
          <View style={s.statusCard}>
            <View style={[s.statusIcon, { backgroundColor: '#FEF9C3' }]}>
              <Feather name="clock" size={36} color="#D97706" />
            </View>
            <Text style={s.statusTitle}>Complete Payment</Text>
            <Text style={s.statusSub}>
              Complete the payment in your browser, then return here.{'\n'}
              The app will verify automatically when you return.
            </Text>
            <TouchableOpacity style={s.chatBtn} onPress={handleManualVerify}>
              <Text style={s.chatBtnTxt}>I've Paid — Verify Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Idle / initiating state — show booking details ── */}
        {(payState === 'idle' || payState === 'initiating') && (
          <>
            {/* Doctor summary */}
            <View style={s.card}>
              <View style={s.doctorRow}>
                <View style={s.avatar}>
                  <Feather name="user" size={28} color={GREEN_DARK} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.doctorName}>{params.psychiatrist_name}</Text>
                  <Text style={s.doctorSpec}>{params.specialization}</Text>
                  <View style={s.metaRow}>
                    <View style={s.chip}>
                      <Feather name="star" size={11} color="#F59E0B" />
                      <Text style={s.chipTxt}>{params.rating}</Text>
                    </View>
                    <View style={[s.chip, { backgroundColor: '#EFF6FF' }]}>
                      <Feather name="users" size={11} color="#2563EB" />
                      <Text style={[s.chipTxt, { color: '#2563EB' }]}>
                        {params.sessions_count} sessions
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            {/* Session details */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Session Details</Text>
              <View style={s.detailRow}>
                <Feather name="calendar" size={16} color="#6B7280" />
                <Text style={s.detailTxt}>{params.date_label}</Text>
              </View>
              <View style={s.detailRow}>
                <Feather name="clock" size={16} color="#6B7280" />
                <Text style={s.detailTxt}>{params.time_of_day}</Text>
              </View>
              <View style={s.detailRow}>
                <Feather name="video" size={16} color="#6B7280" />
                <Text style={s.detailTxt}>Video / In-person session · 50 min</Text>
              </View>
            </View>

            {/* Payment breakdown */}
            <View style={s.card}>
              <Text style={s.sectionTitle}>Payment Breakdown</Text>
              <View style={s.priceRow}>
                <Text style={s.priceLabel}>Session fee</Text>
                <Text style={s.priceValue}>ETB {AMOUNT}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.priceRow}>
                <View style={s.splitLabel}>
                  <View style={[s.splitDot, { backgroundColor: GREEN_DARK }]} />
                  <Text style={s.splitTxt}>Psychiatrist (70%)</Text>
                </View>
                <Text style={[s.priceValue, { color: GREEN_DARK }]}>ETB {psychiatristEarning}</Text>
              </View>
              <View style={s.priceRow}>
                <View style={s.splitLabel}>
                  <View style={[s.splitDot, { backgroundColor: '#2563EB' }]} />
                  <Text style={s.splitTxt}>Platform (30%)</Text>
                </View>
                <Text style={[s.priceValue, { color: '#2563EB' }]}>ETB {platformFee}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.priceRow}>
                <Text style={[s.priceLabel, { fontWeight: '700', color: '#111827' }]}>Total</Text>
                <Text style={[s.priceValue, { color: GREEN_DARK, fontSize: 20 }]}>ETB {AMOUNT}</Text>
              </View>
            </View>

            {/* Info box */}
            <View style={s.infoBox}>
              <Feather name="shield" size={16} color={GREEN_DARK} style={{ marginTop: 1 }} />
              <Text style={s.infoTxt}>
                Payment is processed securely via Chapa. Cancel 24 hours before for a full refund.
              </Text>
            </View>

            {/* Pay button */}
            <TouchableOpacity
              style={[s.payBtn, payState === 'initiating' && s.payBtnDisabled]}
              onPress={() => void handlePay()}
              disabled={payState === 'initiating'}
              activeOpacity={0.85}
            >
              {payState === 'initiating' ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <>
                  <Text style={s.payBtnTxt}>Pay ETB {AMOUNT} with Chapa</Text>
                  <Feather name="arrow-right" size={18} color="#111827" />
                </>
              )}
            </TouchableOpacity>

            <Text style={s.disclaimer}>
              You will be redirected to Chapa's secure payment page.
            </Text>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center',
  },
  scroll: { paddingHorizontal: 16, paddingTop: 20 },

  // Status cards
  statusCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 28,
    alignItems: 'center', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statusIcon: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  statusTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  statusSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  chatBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  chatBtnTxt: { fontSize: 15, fontWeight: '700', color: '#111827' },
  retryBtn: {
    backgroundColor: GREEN_DARK, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14, width: '100%', alignItems: 'center',
  },
  retryBtnTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  // Booking detail cards
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  doctorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56, height: 56, borderRadius: 14,
    backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center',
  },
  doctorName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  doctorSpec: { fontSize: 13, color: '#6B7280', marginTop: 2, marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  chipTxt: { fontSize: 11, fontWeight: '600', color: '#92400E' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  detailTxt: { fontSize: 14, color: '#374151' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  priceLabel: { fontSize: 14, color: '#6B7280' },
  priceValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  splitLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  splitDot: { width: 8, height: 8, borderRadius: 4 },
  splitTxt: { fontSize: 13, color: '#374151' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB', marginVertical: 10 },
  infoBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#F0FDF4',
    borderRadius: 12, padding: 14, marginBottom: 20,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  infoTxt: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: GREEN, borderRadius: 14, height: 56, marginBottom: 12,
  },
  payBtnDisabled: { backgroundColor: '#D1FAE5' },
  payBtnTxt: { fontSize: 16, fontWeight: '700', color: '#111827' },
  disclaimer: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', lineHeight: 16 },
});
