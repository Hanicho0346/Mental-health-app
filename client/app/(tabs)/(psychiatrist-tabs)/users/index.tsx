import { api } from '@/lib/api';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
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

type PatientRow = {
  id: string;
  full_name: string;
  avatar_url: string;
  mood_status: string;
};

export default function UsersScreen() {
  const { width } = useWindowDimensions();
  const pad = width < 380 ? 16 : 24;

  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<PatientRow[]>('/doctor/patients');
      setPatients(Array.isArray(data) ? data : []);
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { paddingHorizontal: pad }]}>
        <Text style={styles.headerTitle}>Users / ተጠቃሚዎች</Text>
        <Text style={styles.headerSub}>Patients linked through your appointments</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingHorizontal: pad }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 32 }} size="large" color="#111827" />
        ) : patients.length === 0 ? (
          <View style={styles.card}>
            <Feather name="users" size={28} color="#4ADE80" />
            <Text style={styles.cardTitle}>No clients yet</Text>
            <Text style={styles.cardBody}>
              When patients book with you or you have appointments, they will appear here.
            </Text>
          </View>
        ) : (
          patients.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.row}
              onPress={() => router.push(`/(tabs)/(psychiatrist-tabs)/users/${p.id}` as any)}
              activeOpacity={0.8}
            >
              <Image
                source={{ uri: p.avatar_url?.trim() || DEFAULT_AVATAR }}
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.full_name}</Text>
                {p.mood_status ? (
                  <Text style={styles.mood} numberOfLines={1}>
                    Mood: {p.mood_status}
                  </Text>
                ) : null}
              </View>
              <Feather name="chevron-right" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  scroll: { paddingTop: 20, paddingBottom: 32, flexGrow: 1 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    gap: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  cardBody: { fontSize: 14, color: '#6B7280', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  name: { fontSize: 16, fontWeight: '700', color: '#111827' },
  mood: { fontSize: 13, color: '#6B7280', marginTop: 2 },
});
