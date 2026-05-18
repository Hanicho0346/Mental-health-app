import { api } from '@/lib/api';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=100&h=100&fit=crop';

type PatientProfile = {
  id: string;
  full_name: string;
  avatar_url: string;
  mood_status: string;
  email: string;
};

export default function PatientProfileScreen() {
  const { width } = useWindowDimensions();
  const pad = width < 380 ? 16 : 24;
  const { patientId } = useLocalSearchParams<{ patientId: string }>();

  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) {
      setError('Missing patient');
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<PatientProfile>(`/doctor/patients/${patientId}`);
        if (!cancelled) {
          setProfile(data);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setError('Could not load this patient.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.topBar, { paddingHorizontal: pad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Patient</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#111827" />
      ) : error || !profile ? (
        <View style={[styles.card, { marginHorizontal: pad, marginTop: 24 }]}>
          <Text style={styles.errText}>{error ?? 'Not found'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: 32 }}>
          <View style={styles.hero}>
            <Image
              source={{ uri: profile.avatar_url?.trim() || DEFAULT_AVATAR }}
              style={styles.heroAvatar}
            />
            <Text style={styles.heroName}>{profile.full_name}</Text>
            <Text style={styles.heroEmail}>{profile.email}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Mood status</Text>
            <Text style={styles.value}>{profile.mood_status?.trim() || '—'}</Text>
          </View>
          <Text style={styles.hint}>You are seeing this profile because they have appointments with you.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: { padding: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
  topTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  hero: { alignItems: 'center', paddingVertical: 28 },
  heroAvatar: { width: 96, height: 96, borderRadius: 48 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 16 },
  heroEmail: { fontSize: 14, color: '#6B7280', marginTop: 6 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  value: { fontSize: 16, color: '#111827', marginTop: 6 },
  hint: { fontSize: 13, color: '#9CA3AF', marginTop: 16, lineHeight: 18 },
  errText: { color: '#B91C1C', fontSize: 15 },
});
