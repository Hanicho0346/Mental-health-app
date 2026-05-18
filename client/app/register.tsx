import { api } from "@/lib/api";
import { isAxiosError } from "axios";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { getDefaultTabRoute } from "@/lib/tabNavigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pickAuthUser, useAuthStore } from "@/stores/authStore";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Role = "user" | "psychiatrist" | null;

export default function RegisterScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role>(null);

  // Shared Fields
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Psychiatrist Specific Fields
  const [nationalId, setNationalId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [experience, setExperience] = useState("");
  const [certificateUploaded, setCertificateUploaded] = useState(false);

  const handleRoleSelect = (selectedRole: Role) => {
    setRole(selectedRole);
    setStep(2);
  };

  const handleDocumentUpload = () => {
    // Integrate expo-document-picker here in the future
    setCertificateUploaded(!certificateUploaded);
    Alert.alert("Success", "Certificate mock uploaded successfully.");
  };

  async function handleContinue(): Promise<void> {
    if (submitting) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        full_name: fullName.trim(),
        email: email.trim(),
        password,
        role: role === "psychiatrist" ? "psychiatrist" : "user",
      };

      if (role === "psychiatrist") {
        if (!certificateUploaded) {
          Alert.alert(
            "Missing Document",
            "Please upload your medical certificate.",
          );
          setSubmitting(false);
          return;
        }
        payload.national_id = nationalId.trim();
        payload.medical_license = licenseNumber.trim();
        payload.specialization = specialization.trim();
        payload.experience_years = Number(experience.trim());
      }

      const { data } = await api.post("/auth/register", payload);

      if (
        data &&
        typeof data === "object" &&
        "needsVerification" in data &&
        data.needsVerification
      ) {
        await useAuthStore.getState().clearSession();
        const verifyEmail =
          typeof data.email === "string" ? data.email : email.trim().toLowerCase();
        const resent =
          typeof data === "object" &&
          data !== null &&
          "verificationResent" in data &&
          data.verificationResent === true;
        Alert.alert(
          "Check your email",
          resent
            ? `A new verification code was sent to ${verifyEmail}.`
            : `A 6-digit verification code was sent to ${verifyEmail}.`,
        );
        router.replace({
          pathname: "/verify-email",
          params: { email: verifyEmail },
        });
        return;
      }

      const responseData = data as any;
      const access = responseData.accessToken ?? responseData.token;
      const authUser = pickAuthUser(responseData.user);
      useAuthStore.getState().setSession({
        accessToken: access,
        refreshToken: responseData.refreshToken,
        user: authUser,
      });
      await AsyncStorage.setItem("token", access);
      router.replace(getDefaultTabRoute(authUser));
    } catch (e: unknown) {
      const verifyEmail = email.trim().toLowerCase();
      if (isAxiosError(e) && e.response?.status === 409) {
        Alert.alert("Account already exists", getApiErrorMessage(e), [
          {
            text: "Verify email",
            onPress: () =>
              router.replace({
                pathname: "/verify-email",
                params: { email: verifyEmail },
              }),
          },
          {
            text: "Log in",
            onPress: () =>
              router.replace({ pathname: "/login", params: { email: verifyEmail } }),
          },
          { text: "Cancel", style: "cancel" },
        ]);
        return;
      }
      if (isAxiosError(e) && e.response?.status === 503) {
        Alert.alert(
          "Email not configured",
          `${getApiErrorMessage(e)}\n\nIn development, check the server console for your verification code.`,
          [
            {
              text: "Enter code",
              onPress: () =>
                router.replace({
                  pathname: "/verify-email",
                  params: { email: verifyEmail },
                }),
            },
            { text: "OK", style: "cancel" },
          ],
        );
        return;
      }
      logClientError("register.handleContinue", e);
      Alert.alert("Registration Failed", getApiErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  // --- UI PARTIALS ---

  const renderRoleSelection = () => (
    <View style={styles.roleContainer}>
      <Text style={styles.mainTitle}>Choose Account Type</Text>
      <Text style={styles.amharicMainTitle}>የመለያ አይነት ይምረጡ</Text>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => handleRoleSelect("user")}
      >
        <View style={styles.roleIconCircle}>
          <Feather name="user" size={28} color="#4ADE80" />
        </View>
        <View style={styles.roleTextContainer}>
          <Text style={styles.roleTitle}>Sign Up as User</Text>
          <Text style={styles.roleDescription}>
            Find support and track your mental wellbeing.
          </Text>
        </View>
        <Feather name="chevron-right" size={24} color="#9CA3AF" />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.roleCard}
        onPress={() => handleRoleSelect("psychiatrist")}
      >
        <View style={styles.roleIconCircle}>
          <Feather name="briefcase" size={28} color="#4ADE80" />
        </View>
        <View style={styles.roleTextContainer}>
          <Text style={styles.roleTitle}>Sign Up as Psychiatrist</Text>
          <Text style={styles.roleDescription}>
            Offer professional help and manage patients.
          </Text>
        </View>
        <Feather name="chevron-right" size={24} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  );

  const renderForm = () => (
    <View style={styles.formCard}>
      {/* Shared Fields */}
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Full Name / ሙሉ ስም</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Hana Alemu"
            placeholderTextColor="#9CA3AF"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email Address / ኢሜል አድራሻ</Text>
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
        <Text style={styles.label}>Password / የይለፍ ቃል</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            placeholderTextColor="#9CA3AF"
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Feather
              name={showPassword ? "eye" : "eye-off"}
              size={20}
              color="#6B7280"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Psychiatrist Additional Fields */}
      {role === "psychiatrist" && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Professional Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>National ID Number</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="ID-12345678"
                placeholderTextColor="#9CA3AF"
                value={nationalId}
                onChangeText={setNationalId}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Medical License Number</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="MED-98765432"
                placeholderTextColor="#9CA3AF"
                value={licenseNumber}
                onChangeText={setLicenseNumber}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Specialization</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="Clinical Psychology, CBT..."
                placeholderTextColor="#9CA3AF"
                value={specialization}
                onChangeText={setSpecialization}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Years of Experience</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder="5"
                keyboardType="numeric"
                placeholderTextColor="#9CA3AF"
                value={experience}
                onChangeText={setExperience}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              Upload Certificate <Text style={styles.requiredBadge}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.uploadBox}
              onPress={handleDocumentUpload}
            >
              <Feather
                name="upload-cloud"
                size={28}
                color={certificateUploaded ? "#4ADE80" : "#9CA3AF"}
              />
              <Text
                style={[
                  styles.uploadText,
                  certificateUploaded && { color: "#4ADE80" },
                ]}
              >
                {certificateUploaded
                  ? "Certificate Uploaded Successfully"
                  : "Tap to upload medical certificate (PDF/JPG)"}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Info Box */}
      <View style={styles.infoBox}>
        <Feather
          name="shield"
          size={16}
          color="#4B5563"
          style={{ marginTop: 2 }}
        />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoText}>
            Your data is private and securely encrypted.
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (step === 2 ? setStep(1) : router.back())}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Account / መለያ...</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {step === 1 ? (
          renderRoleSelection()
        ) : (
          <>
            <View style={styles.logoSection}>
              <View style={styles.iconCircle}>
                <Feather
                  name={role === "psychiatrist" ? "briefcase" : "user"}
                  size={24}
                  color="#4ADE80"
                />
              </View>
              <Text style={styles.mainTitle}>
                {role === "psychiatrist"
                  ? "Join as Psychiatrist"
                  : "Join SelamMind"}
              </Text>
              <Text style={styles.amharicMainTitle}>
                {role === "psychiatrist" ? "እንደ ባለሙያ ይመዝገቡ" : "ሰላምማይንድን ይቀላቀሉ"}
              </Text>
            </View>

            {renderForm()}

            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => void handleContinue()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.continueButtonText}>Create Account</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={styles.footerAction}>Login</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  scrollContent: { flex: 1, paddingHorizontal: 20 },

  roleContainer: { marginTop: 40, alignItems: "center" },
  roleCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  roleIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  roleTextContainer: { flex: 1 },
  roleTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  roleDescription: { fontSize: 13, color: "#6B7280", lineHeight: 18 },

  logoSection: { alignItems: "center", marginBottom: 24, marginTop: 10 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  mainTitle: { fontSize: 22, fontWeight: "bold", color: "#111827" },
  amharicMainTitle: {
    fontSize: 16,
    color: "#4ADE80",
    fontWeight: "bold",
    marginTop: 4,
  },

  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  requiredBadge: { color: "#EF4444" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    backgroundColor: "#F9FAFB",
  },
  input: { flex: 1, fontSize: 15, color: "#111827" },

  uploadBox: {
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    backgroundColor: "#F9FAFB",
  },
  uploadText: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 10,
    textAlign: "center",
  },

  infoBox: {
    flexDirection: "row",
    backgroundColor: "#FFFBEB",
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  infoTextContainer: { flex: 1, marginLeft: 10 },
  infoText: { fontSize: 12, color: "#4B5563", lineHeight: 18 },

  continueButton: {
    backgroundColor: "#4ADE80",
    borderRadius: 16,
    height: 56,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  continueButtonText: { color: "#111827", fontSize: 16, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerText: { color: "#6B7280", fontSize: 14 },
  footerAction: {
    color: "#4ADE80",
    fontSize: 14,
    fontWeight: "bold",
    marginLeft: 6,
  },
});
