/**
 * components/UpgradeModal.tsx
 *
 * Bottom-sheet modal for upgrading to Premier.
 * Tabs: Premier (Chapa payment) | Student Discount (ID/email verify)
 *
 * Premier flow:
 *  1. POST /subscriptions/premier/initiate → { checkout_url, tx_ref }
 *  2. Open Chapa in system browser via Linking.openURL (not WebBrowser —
 *     WebBrowser blocks the JS thread and prevents the deep-link from firing)
 *  3. Chapa redirects to selamind://payment-return?tx_ref=...
 *  4. payment-return.tsx handles verification + isPremier update
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'premier' | 'student';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Called after student verify succeeds — re-fetch profile data */
  onSuccess: () => void;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function UpgradeModal({ visible, onClose, onSuccess }: Props) {
  const [tab, setTab]                 = useState<Tab>('premier');
  const [studentId, setStudentId]     = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [loading, setLoading]         = useState(false);

  // ── Premier ────────────────────────────────────────────────────────────────

  async function handlePremierSubscribe(): Promise<void> {
    setLoading(true);
    try {
      const res = await api.post<{ tx_ref: string; checkout_url: string }>(
        '/subscriptions/premier/initiate'
      );
console.log("INITIATE RESPONSE:", res.data);
      const { checkout_url } = res.data;
console.log("CHECKOUT URL:", checkout_url);
      if (!checkout_url) {
        Alert.alert('Error', 'No checkout URL returned. Please try again.');
        return;
      }

      // Close the modal BEFORE opening the browser so there's no UI stack issue
      onClose();

      // Use Linking.openURL (not WebBrowser) — this hands off to the system
      // browser and immediately returns, leaving the JS bridge free to receive
      // the deep-link redirect when Chapa sends the user back.
      const canOpen = await Linking.canOpenURL(checkout_url);
      if (!canOpen) {
        Alert.alert('Cannot open browser', 'Please visit: ' + checkout_url);
        return;
      }

      await AsyncStorage.setItem('pendingSubscriptionTxRef', res.data.tx_ref);
      await Linking.openURL(checkout_url);
      // → user completes payment in browser
      // → Chapa redirects to selamind://payment-return?tx_ref=...
      // → app/payment-return.tsx takes over

    } catch (e: unknown) {
      Alert.alert('Could not start payment', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Student ────────────────────────────────────────────────────────────────

  async function handleStudentVerify(): Promise<void> {
    const id    = studentId.trim();
    const email = studentEmail.trim();

    if (!id && !email) {
      Alert.alert('Required', 'Please enter your student ID or university email.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/subscriptions/student-verify', {
        student_id:    id    || undefined,
        student_email: email || undefined,
      });
      Alert.alert('✅ Student Verified!', 'Your student discount has been applied.');
      onSuccess();
      onClose();
    } catch (e: unknown) {
      Alert.alert('Verification failed', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Reset state on close ───────────────────────────────────────────────────

  function handleClose(): void {
    if (loading) return; // don't allow close mid-request
    setStudentId('');
    setStudentEmail('');
    setLoading(false);
    onClose();
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={s.overlay}>
        <View style={s.sheet}>

          {/* ── Header ── */}
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Unlock Premier Access</Text>
            <TouchableOpacity onPress={handleClose} disabled={loading} hitSlop={12}>
              <Feather name="x" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={s.sheetSubtitle}>Choose how you'd like to upgrade</Text>

          {/* ── Tab switcher ── */}
          <View style={s.tabs}>
            {(['premier', 'student'] as Tab[]).map((t) => {
              const isActive = tab === t;
              const activeColor = t === 'premier' ? '#B45309' : '#1D4ED8';
              return (
                <TouchableOpacity
                  key={t}
                  style={[s.tab, isActive && s.tabActive]}
                  onPress={() => setTab(t)}
                  disabled={loading}
                >
                  <Feather
                    name={t === 'premier' ? 'star' : 'book-open'}
                    size={14}
                    color={isActive ? activeColor : '#9CA3AF'}
                  />
                  <Text
                    style={[
                      s.tabText,
                      isActive && { color: activeColor },
                    ]}
                  >
                    {t === 'premier' ? 'Premier' : 'Student Discount'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Benefits (shared) ── */}
          <View style={s.benefits}>
            {[
              { icon: 'message-circle', text: 'Unlimited AI chat with Dr. Selam' },
              { icon: 'zap',            text: 'Daily streak tracking & rewards'  },
              { icon: 'users',          text: 'Access to group chats & community' },
            ].map((b) => (
              <View key={b.text} style={s.benefitRow}>
                <View style={s.benefitIcon}>
                  <Feather name={b.icon as any} size={15} color="#16A34A" />
                </View>
                <Text style={s.benefitText}>{b.text}</Text>
              </View>
            ))}
          </View>

          {/* ── Tab content ── */}
          {tab === 'premier' ? (
            <>
              {/* Price */}
              <View style={s.priceBox}>
                <Text style={s.price}>ETB 299</Text>
                <Text style={s.pricePer}>/month</Text>
              </View>

              {/* Info note */}
              <View style={s.infoRow}>
                <Feather name="shield" size={13} color="#16A34A" />
                <Text style={s.infoTxt}>
                  You'll be taken to Chapa's secure payment page. The app will confirm
                  automatically when you return.
                </Text>
              </View>

              <TouchableOpacity
                style={[s.ctaBtn, { backgroundColor: '#B45309' }, loading && s.ctaBtnDisabled]}
                onPress={() => void handlePremierSubscribe()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Feather name="credit-card" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={s.ctaBtnText}>Pay ETB 299 with Chapa</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.inputLabel}>Student ID</Text>
              <TextInput
                style={s.input}
                placeholder="e.g. STU-2024-001"
                value={studentId}
                onChangeText={setStudentId}
                placeholderTextColor="#9CA3AF"
                editable={!loading}
              />

              <Text style={s.inputLabel}>Or university email (.edu / .edu.et)</Text>
              <TextInput
                style={s.input}
                placeholder="you@university.edu.et"
                value={studentEmail}
                onChangeText={setStudentEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
                editable={!loading}
              />

              <TouchableOpacity
                style={[s.ctaBtn, { backgroundColor: '#1D4ED8' }, loading && s.ctaBtnDisabled]}
                onPress={() => void handleStudentVerify()}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.ctaBtnText}>Verify Student Status</Text>
                )}
              </TouchableOpacity>
            </>
          )}

        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 44,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sheetSubtitle: { fontSize: 13, color: '#6B7280', marginBottom: 20 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },

  benefits: { gap: 10, marginBottom: 20 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0FDF4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: { fontSize: 13, color: '#374151', fontWeight: '600' },

  priceBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginBottom: 12,
  },
  price: { fontSize: 28, fontWeight: '800', color: '#111827' },
  pricePer: { fontSize: 14, color: '#6B7280' },

  infoRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    alignItems: 'flex-start',
  },
  infoTxt: {
    flex: 1,
    fontSize: 12,
    color: '#374151',
    lineHeight: 18,
  },

  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },

  ctaBtn: {
    flexDirection: 'row',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  ctaBtnDisabled: { opacity: 0.6 },
  ctaBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
