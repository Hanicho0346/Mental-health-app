import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/log';
import { pickAuthUser, useAuthStore } from '@/stores/authStore';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resolvePostAuthRoute } from '@/lib/sessionRouting';

export default function PsychiatristPendingScreen() {
  const user = useAuthStore((s) => s.user);
  const [statusLoading, setStatusLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const { data } = await api.get<{
        verification_status: string;
        admin_feedback?: string;
      }>('/psychiatrist/verification/status');
      if (data.verification_status === 'approved') {
        try {
          const meRes = await api.get<Record<string, unknown>>('/users/me');
          const accessToken = useAuthStore.getState().accessToken ?? '';
          const refreshToken = useAuthStore.getState().refreshToken ?? '';
          useAuthStore.getState().setSession({
            accessToken,
            refreshToken,
            user: pickAuthUser(meRes.data),
          });
        } catch {
          /* route with existing store user */
        }
        router.replace(resolvePostAuthRoute(useAuthStore.getState().user));
        return;
      }
      if (data.verification_status === 'rejected') {
        router.replace('/psychiatrist-rejected');
        return;
      }
      setFeedback(data.admin_feedback ?? '');
    } catch {
      /* pending flow — user may lack full API access until profile exists */
    } finally {
      setStatusLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function handleUploadDocument(): Promise<void> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to upload documents.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]) return;

    setUploading(true);
    try {
      const asset = picked.assets[0];
      const form = new FormData();
      if (Platform.OS === 'web') {
        if ((asset as any).file instanceof File || (asset as any).file instanceof Blob) {
          form.append('document', (asset as any).file, asset.fileName ?? 'license.jpg');
        } else {
          const res = await fetch(asset.uri);
          const blob = await res.blob();
          form.append('document', blob, asset.fileName ?? 'license.jpg');
        }
      } else {
        form.append('document', {
          uri: asset.uri,
          name: asset.fileName ?? 'license.jpg',
          type: asset.mimeType ?? 'image/jpeg',
        } as unknown as Blob);
      }
      form.append('document_type', 'license');

      await api.post('/psychiatrist/verification/documents', form, Platform.OS === 'web' ? undefined : {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('Uploaded', 'Your document was submitted for review.');
      await refreshStatus();
    } catch (e: unknown) {
      Alert.alert('Upload failed', getApiErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Verification Pending</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <View style={s.iconCircle}>
          <Feather name="clock" size={32} color="#4ADE80" />
        </View>
        <Text style={s.title}>Under admin review</Text>
        <Text style={s.subtitle}>
          Hi {user?.full_name ?? 'Doctor'}, your professional credentials are being verified. You will
          get dashboard access once approved.
        </Text>

        {feedback ? (
          <View style={s.noteBox}>
            <Text style={s.noteLabel}>Admin note</Text>
            <Text style={s.noteText}>{feedback}</Text>
          </View>
        ) : null}

        {statusLoading ? (
          <ActivityIndicator color="#4ADE80" style={{ marginTop: 24 }} />
        ) : (
          <>
            <TouchableOpacity
              style={s.primaryBtn}
              onPress={() => void handleUploadDocument()}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={s.primaryBtnText}>Upload verification document</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.secondaryBtn}
              onPress={() => {
                setRefreshing(true);
                void refreshStatus();
              }}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator color="#4ADE80" />
              ) : (
                <Text style={s.secondaryBtnText}>Refresh status</Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  noteBox: {
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    width: '100%',
  },
  noteLabel: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  noteText: { fontSize: 13, color: '#4B5563' },
  primaryBtn: {
    backgroundColor: '#4ADE80',
    borderRadius: 16,
    height: 52,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 28,
  },
  primaryBtnText: { color: '#111827', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { marginTop: 16, padding: 12 },
  secondaryBtnText: { color: '#4ADE80', fontWeight: '600', fontSize: 14 },
});
