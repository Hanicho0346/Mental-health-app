import { useAuthStore } from '@/stores/authStore';
import { useClerkBackendSession } from '@/hooks/useClerkBackendSession';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PsychiatristRejectedScreen() {
  const user = useAuthStore((s) => s.user);
  const { syncSession } = useClerkBackendSession();

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Application Rejected</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={[s.iconCircle, { backgroundColor: '#FEE2E2' }]}>
          <Feather name="x-circle" size={32} color="#DC2626" />
        </View>
        <Text style={s.title}>Verification not approved</Text>
        <Text style={s.subtitle}>
          Your psychiatrist application was reviewed and could not be approved at this time.
        </Text>

        {user?.admin_feedback ? (
          <View style={s.feedbackBox}>
            <Text style={s.feedbackLabel}>Feedback from admin</Text>
            <Text style={s.feedbackText}>{user.admin_feedback}</Text>
          </View>
        ) : (
          <Text style={s.hint}>Contact support if you believe this was a mistake.</Text>
        )}

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={() => {
            void syncSession().then(() => router.replace('/psychiatrist-pending'));
          }}
        >
          <Text style={s.secondaryBtnText}>Resubmit documents</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  scroll: { flex: 1 },
  content: { padding: 24, alignItems: 'center' },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  feedbackBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
  },
  feedbackLabel: { fontSize: 12, fontWeight: '700', color: '#991B1B', marginBottom: 6 },
  feedbackText: { fontSize: 14, color: '#374151', lineHeight: 20 },
  hint: { fontSize: 13, color: '#9CA3AF', marginTop: 16, textAlign: 'center' },
  secondaryBtn: {
    marginTop: 28,
    backgroundColor: '#4ADE80',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  secondaryBtnText: { color: '#111827', fontWeight: '700' },
});
