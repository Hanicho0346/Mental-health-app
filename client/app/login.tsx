import { useSignIn } from '@clerk/clerk-expo';
import { Feather, Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
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

export default function LoginScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(): Promise<void> {
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)/(user-tabs)/home');
      } else {
        Alert.alert('Login incomplete', 'Please check your email for a verification code.');
      }
    } catch (e: any) {
      const msg = e?.errors?.[0]?.longMessage ?? e?.message ?? 'Login failed';
      Alert.alert('Could not log in', msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Login / ይግቡ</Text>
        <TouchableOpacity>
          <Feather name="more-vertical" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.logoSection}>
          <View style={styles.iconCircle}>
            <Feather name="shield" size={24} color="#4ADE80" />
            <View style={styles.checkBadge}>
              <Ionicons name="checkmark" size={10} color="#FFF" />
            </View>
          </View>
          <Text style={styles.mainTitle}>Welcome Back</Text>
          <Text style={styles.amharicMainTitle}>እንኳን ደህና መጡ</Text>
        </View>

        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <Text style={styles.amharicLabel}>ኢሜል አድራሻ</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="hana@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <Text style={styles.amharicLabel}>የይለፍ ቃል</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                secureTextEntry={!showPassword}
                placeholderTextColor="#9CA3AF"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={() => void handleLogin()}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Feather name={showPassword ? 'eye' : 'eye-off'} size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.continueButton}
          onPress={() => void handleLogin()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.continueButtonText}>Login / ይግቡ</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{"Don't have an account?"}</Text>
          <TouchableOpacity onPress={() => router.push('/register')}>
            <Text style={styles.footerAction}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  scrollContent: { flex: 1, paddingHorizontal: 20 },
  logoSection: { alignItems: 'center', marginBottom: 24 },
  iconCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  checkBadge: { position: 'absolute', bottom: 12, right: 12, backgroundColor: '#4ADE80', width: 14, height: 14, borderRadius: 7, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FFF' },
  mainTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  amharicMainTitle: { fontSize: 16, color: '#4ADE80', fontWeight: 'bold', marginTop: 4 },
  formCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 15, elevation: 2 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  amharicLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, height: 50 },
  input: { flex: 1, fontSize: 15, color: '#111827' },
  forgotPassword: { alignSelf: 'flex-end', marginTop: -5 },
  forgotPasswordText: { color: '#4ADE80', fontWeight: '600', fontSize: 13 },
  continueButton: { backgroundColor: '#4ADE80', borderRadius: 16, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 24, shadowColor: '#4ADE80', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  continueButtonText: { color: '#111827', fontSize: 16, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  footerText: { color: '#6B7280', fontSize: 14 },
  footerAction: { color: '#4ADE80', fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
});
