import { api } from '@/lib/api';
import { getApiErrorMessage, logClientError } from '@/lib/log';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PublicConfig = {
  emergency_phone: string;
  support_message: string;
};

export default function EmergencyScreen() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get<PublicConfig>('/config/public');
        setConfig(data);
      } catch (e) {
        logClientError('emergency.loadConfig', e);
        Alert.alert('Could not load helpline settings', getApiErrorMessage(e));
        setConfig({ emergency_phone: '', support_message: '' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function dialHotline(): void {
    const raw = config?.emergency_phone?.trim() ?? '';
    if (!raw) {
      Alert.alert(
        'Hotline not configured',
        'Set EMERGENCY_PHONE on the server (e.g. E.164 +15551234567) and restart the API, or call your local emergency number from the phone app.'
      );
      logClientError('emergency.dialHotline', new Error('missing EMERGENCY_PHONE'));
      return;
    }
    const tel = raw.startsWith('tel:') ? raw : `tel:${raw}`;
    void Linking.openURL(tel).catch((e) => {
      logClientError('emergency.openURL', e, { tel });
      Alert.alert('Could not start call', getApiErrorMessage(e));
    });
  }

  function openMaps(): void {
    const url = 'https://www.google.com/maps/search/?api=1&query=crisis+center+near+me';
    void Linking.openURL(url).catch((e) => {
      logClientError('emergency.openMaps', e);
      Alert.alert('Could not open maps', getApiErrorMessage(e));
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="chevron-left" size={28} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency Help / አስቸኳይ...</Text>
        <TouchableOpacity>
          <Feather name="more-vertical" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator style={{ marginVertical: 16 }} color="#4ADE80" /> : null}

        <View style={styles.imageBox}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1470071131384-001b85755536?w=800&h=400&fit=crop' }}
            style={styles.heroImage}
          />
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.9)', '#FFFFFF']} style={styles.gradient} />
        </View>

        <View style={styles.textCenter}>
          <Text style={styles.mainText}>You are not alone.</Text>
          <Text style={styles.helpText}>Help is available.</Text>
          <Text style={styles.amharicMainText}>እርስዎ ብቻ አይዶሉም።</Text>
          <Text style={styles.amharicHelpText}>እገዛ አለ።</Text>
          {config?.support_message ? (
            <Text style={styles.configHint}>{config.support_message}</Text>
          ) : null}
        </View>

        <TouchableOpacity style={styles.callButton} onPress={dialHotline}>
          <Feather name="phone-call" size={24} color="#FFF" style={{ marginRight: 10 }} />
          <View>
            <Text style={styles.btnTitleWhite}>Call Counselor / Hotline</Text>
            <Text style={styles.btnAmharicWhite}>ይደውሉ ምክር አገልጋይ</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.locationButton} onPress={openMaps}>
          <Feather name="map-pin" size={24} color="#D97706" style={{ marginRight: 10 }} />
          <View>
            <Text style={styles.btnTitleDark}>Find Help Nearby</Text>
            <Text style={styles.btnAmharicDark}>አቅራቢያዎን ያግኙ</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>
          <Feather name="shield" size={16} /> QUICK SAFETY TIPS / የደህንነት ምክሮች
        </Text>

        <View style={styles.tipsList}>
          <View style={styles.tipCard}>
            <Feather name="wind" size={18} color="#4ADE80" style={{ marginRight: 12 }} />
            <Text style={styles.tipText}>Take 3 deep breaths / 3 ጊዜ በጥልቀት ይተንፍሱ</Text>
          </View>
          <View style={styles.tipCard}>
            <Feather name="heart" size={18} color="#4ADE80" style={{ marginRight: 12 }} />
            <Text style={styles.tipText}>You are safe now / አሁን ደህና ነዎት</Text>
          </View>
          <View style={styles.tipCard}>
            <Feather name="eye" size={18} color="#4ADE80" style={{ marginRight: 12 }} />
            <Text style={styles.tipText}>Focus on your surroundings / አካባቢዎን ያስተውሉ</Text>
          </View>
          <View style={styles.tipCard}>
            <Feather name="message-circle" size={18} color="#4ADE80" style={{ marginRight: 12 }} />
            <Text style={styles.tipText}>We are here with you / እኛ ከእርስዎ ጋር ነን</Text>
          </View>
        </View>

        <View style={styles.privacyBox}>
          <Feather name="shield" size={20} color="#111827" style={{ marginTop: 4 }} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={styles.privacyTitle}>Confidential & Private</Text>
            <Text style={styles.privacyDesc}>
              Your data and calls are 100% secure. / መረጃዎ ምስጢራዊነቱ የተጠበቀ ነው።
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  content: { paddingHorizontal: 20 },
  imageBox: { height: 200, width: '100%', borderRadius: 24, overflow: 'hidden', marginTop: 10, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  textCenter: { alignItems: 'center', marginTop: 10, marginBottom: 30 },
  mainText: { fontSize: 24, fontWeight: '800', color: '#111827' },
  helpText: { fontSize: 24, fontWeight: '800', color: '#4ADE80' },
  amharicMainText: { fontSize: 18, color: '#6B7280', marginTop: 12 },
  amharicHelpText: { fontSize: 18, color: '#6B7280', marginTop: 4 },
  configHint: { fontSize: 13, color: '#6B7280', marginTop: 12, textAlign: 'center', paddingHorizontal: 12 },
  callButton: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    height: 70,
    marginBottom: 16,
  },
  locationButton: {
    backgroundColor: '#FFF7ED',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    height: 70,
    borderWidth: 1,
    borderColor: '#FFEDD5',
    marginBottom: 30,
  },
  btnTitleWhite: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  btnAmharicWhite: { color: '#FECACA', fontSize: 11, marginTop: 2, textAlign: 'center' },
  btnTitleDark: { color: '#111827', fontSize: 16, fontWeight: 'bold' },
  btnAmharicDark: { color: '#9CA3AF', fontSize: 11, marginTop: 2, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#4B5563', marginBottom: 16, letterSpacing: 1 },
  tipsList: { gap: 12, marginBottom: 30 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  tipText: { fontSize: 14, color: '#111827', fontWeight: '500', flex: 1 },
  privacyBox: { flexDirection: 'row', backgroundColor: '#F9FAFB', padding: 20, borderRadius: 20 },
  privacyTitle: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  privacyDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
});
