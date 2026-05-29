import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
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

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void; // called after student verify only; Chapa goes via deep link
};

export function UpgradeModal({ visible, onClose, onSuccess }: Props) {
  const [tab, setTab] = useState<'premier' | 'student'>('premier');
  const [studentId, setStudentId] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handlePremierSubscribe() {
    setLoading(true);
    try {
      const res = await api.post<{ tx_ref: string; checkout_url: string }>(
        '/subscriptions/premier/initiate'
      );

      // Close modal before opening browser so it doesn't linger behind
      onClose();

      // Open Chapa's hosted payment page in the system browser.
      // When Chapa finishes it redirects to selamind://payment-return?tx_ref=...
      // which Expo Router handles in app/payment-return.tsx
      await WebBrowser.openBrowserAsync(res.data.checkout_url, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });

      // WebBrowser.openBrowserAsync resolves when the user dismisses the browser.
      // The actual verification + unlock happens in payment-return.tsx via deep link.
    } catch (e: any) {
      Alert.alert('Could not start payment', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleStudentVerify() {
    if (!studentId.trim() && !studentEmail.trim()) {
      Alert.alert('Required', 'Please enter your student ID or .edu email.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/subscriptions/student-verify', {
        student_id: studentId.trim() || undefined,
        student_email: studentEmail.trim() || undefined,
      });
      Alert.alert('✅ Student Verified!', 'Your student discount has been applied.');
      onSuccess(); // refresh profile data
      onClose();
    } catch (e) {
      Alert.alert('Verification failed', getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          {/* Header */}
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Unlock Premier Access</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={s.sheetSubtitle}>Choose how you'd like to upgrade</Text>

          {/* Tabs */}
          <View style={s.tabs}>
            {(['premier', 'student'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.tab, tab === t && s.tabActive]}
                onPress={() => setTab(t)}
              >
                <Feather
                  name={t === 'premier' ? 'star' : 'book-open'}
                  size={14}
                  color={
                    tab === t
                      ? t === 'premier' ? '#B45309' : '#1D4ED8'
                      : '#9CA3AF'
                  }
                />
                <Text
                  style={[
                    s.tabText,
                    tab === t && (t === 'premier' ? s.tabTextAmber : s.tabTextBlue),
                  ]}
                >
                  {t === 'premier' ? 'Premier' : 'Student Discount'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Benefits — same for both tabs */}
          <View style={s.benefits}>
            {[
              { icon: 'message-circle', text: 'Unlimited AI chat sessions' },
              { icon: 'zap',            text: 'Daily streak tracking & rewards' },
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

          {/* Tab content */}
          {tab === 'premier' ? (
            <>
              <View style={s.priceBox}>
                <Text style={s.price}>ETB 299</Text>
                <Text style={s.pricePer}>/month</Text>
              </View>
              <TouchableOpacity
                style={[s.ctaBtn, { backgroundColor: '#B45309' }]}
                onPress={handlePremierSubscribe}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.ctaBtnText}>Pay with Chapa →</Text>
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
              />
              <Text style={s.inputLabel}>Or .edu / university email</Text>
              <TextInput
                style={s.input}
                placeholder="you@university.edu.et"
                value={studentEmail}
                onChangeText={setStudentEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
              />
              <TouchableOpacity
                style={[s.ctaBtn, { backgroundColor: '#1D4ED8' }]}
                onPress={handleStudentVerify}
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

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
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
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '700', color: '#9CA3AF' },
  tabTextAmber: { color: '#B45309' },
  tabTextBlue: { color: '#1D4ED8' },
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
    marginBottom: 16,
  },
  price: { fontSize: 28, fontWeight: '800', color: '#111827' },
  pricePer: { fontSize: 14, color: '#6B7280' },
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
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  ctaBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});