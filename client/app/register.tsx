import { Feather, Ionicons } from "@expo/vector-icons";
import { useAuth, useSignUp } from "@clerk/clerk-expo";
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
import { resolvePostAuthRoute } from "@/lib/sessionRouting";

type Role = "user" | "psychiatrist" | null;
type Step = 1 | 2 | 3;

export default function RegisterScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  // const { session } = useClerk(); // ✅ Access live session after setActive resolves

  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState<Role>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
const { sessionId, getToken } = useAuth();
  // Psychiatrist fields
  const [nationalId, setNationalId] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [experience, setExperience] = useState("");
  const [certificateUploaded, setCertificateUploaded] = useState(false);

  async function handleRegister(): Promise<void> {
    if (!isLoaded || submitting) return;
    if (!role) {
      Alert.alert(
        "Choose an account type",
        "Please select user or psychiatrist.",
      );
      return;
    }
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert("Missing fields", "Please complete all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      await signUp?.create({
        emailAddress: email.trim(),
        password,
               firstName: fullName.trim().split(" ")[0],
        lastName: fullName.trim().split(" ").slice(1).join(" ") || "",
        unsafeMetadata: { role },
      });

      await signUp?.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep(3);
    } catch (e: any) {
      const msg =
        e?.errors?.[0]?.longMessage ?? e?.message ?? "Registration failed";
      Alert.alert("Registration failed", msg);
    } finally {
      setSubmitting(false);
    }
  }

 async function handleVerifyOtp(): Promise<void> {
  if (!isLoaded || submitting) return;

  if (!otp.trim()) {
    Alert.alert(
      "Enter code",
      "Please enter the verification code."
    );
    return;
  }

  setSubmitting(true);

  try {
    // 1. Verify OTP
    const result = await signUp?.attemptEmailAddressVerification({
      code: otp.trim(),
    });

    if (
      result?.status !== "complete" ||
      !result.createdSessionId
    ) {
      Alert.alert(
        "Verification failed",
        "Invalid verification code."
      );
      return;
    }

    // 2. Activate Clerk session
    await setActive({
  session: result.createdSessionId,
});

console.log("SESSION ACTIVATED");

// wait for Clerk auth to refresh
await new Promise(resolve => setTimeout(resolve, 1500));

let token: string | null = null;

try {
  token = await getToken({
    template: "backend",
  });

  console.log("BACKEND TOKEN:", token);
} catch (err) {
  console.log("Backend token failed:", err);
}

if (!token) {
  try {
    token = await getToken();

    console.log("DEFAULT TOKEN:", token);
  } catch (err) {
    console.log("Default token failed:", err);
  }
}

if (!token) {
  Alert.alert(
    "Session error",
    "Could not obtain session token. Please login."
  );

  router.replace("/login");
  return;
}

    console.log("TOKEN OK");

    // 6. Build backend payload
    const payload =
      role === "psychiatrist"
        ? {
            role: "psychiatrist" as const,
            national_id: nationalId.trim(),
            medical_license: licenseNumber.trim(),
            specialization: specialization.trim(),
            experience_years:
              parseInt(experience, 10) || 0,
          }
        : {
            role: "user" as const,
          };

    // 7. Sync with backend
    const { syncClerkWithBackend } =
      await import("@/lib/clerkBackendSync");

    const syncResult =
      await syncClerkWithBackend(
        token,
        payload
      );

    console.log("SYNC RESULT:", syncResult);

    if (!syncResult?.user) {
      Alert.alert(
        "Sync failed",
        "Could not sync account."
      );

      router.replace("/login");
      return;
    }

    // 8. Navigate
    router.replace(
      resolvePostAuthRoute(syncResult.user)
    );

  } catch (e: any) {
    console.error("VERIFY ERROR:", e);

    const msg =
      e?.errors?.[0]?.longMessage ||
      e?.message ||
      "Verification failed";

    Alert.alert(
      "Verification failed",
      msg
    );
  } finally {
    setSubmitting(false);
  }
}

  // ── Step 1: Role selection ──────────────────────────────────────────────
  if (step === 1) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/login");
              }
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Create Account / መለያ...</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={s.scroll}>
          <View style={s.roleContainer}>
            <Text style={s.mainTitle}>Choose Account Type</Text>
            <Text style={s.amharicMainTitle}>የመለያ አይነት ይምረጡ</Text>

            <TouchableOpacity
              style={s.roleCard}
              onPress={() => {
                setRole("user");
                setStep(2);
              }}
            >
              <View style={s.roleIconCircle}>
                <Feather name="user" size={28} color="#4ADE80" />
              </View>
              <View style={s.roleTextContainer}>
                <Text style={s.roleTitle}>Sign Up as User</Text>
                <Text style={s.roleDescription}>
                  Find support and track your mental wellbeing.
                </Text>
              </View>
              <Feather name="chevron-right" size={24} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.roleCard}
              onPress={() => {
                setRole("psychiatrist");
                setStep(2);
              }}
            >
              <View style={s.roleIconCircle}>
                <Feather name="briefcase" size={28} color="#4ADE80" />
              </View>
              <View style={s.roleTextContainer}>
                <Text style={s.roleTitle}>Sign Up as Psychiatrist</Text>
                <Text style={s.roleDescription}>
                  Offer professional help and manage patients.
                </Text>
              </View>
              <Feather name="chevron-right" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={s.footer}>
            <Text style={s.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={s.footerAction}>Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step 3: OTP verification ────────────────────────────────────────────
  if (step === 3) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => setStep(2)}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Verify Email</Text>
          <View style={{ width: 24 }} />
        </View>
        <ScrollView style={s.scroll}>
          <View style={s.logoSection}>
            <View style={s.iconCircle}>
              <Feather name="mail" size={24} color="#4ADE80" />
            </View>
            <Text style={s.mainTitle}>Check your email</Text>
            <Text
              style={[
                s.amharicMainTitle,
                { fontSize: 13, color: "#6B7280", fontWeight: "400" },
              ]}
            >
              We sent a 6-digit code to {email}
            </Text>
          </View>

          <View style={s.formCard}>
            <View style={s.inputGroup}>
              <Text style={s.label}>Verification Code</Text>
              <Text style={s.amharicLabel}>የማረጋገጫ ኮድ</Text>
              <View style={[s.inputContainer, { justifyContent: "center" }]}>
                <TextInput
                  style={[
                    s.input,
                    {
                      textAlign: "center",
                      fontSize: 24,
                      letterSpacing: 8,
                      fontWeight: "700",
                    },
                  ]}
                  placeholder="000000"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                />
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={s.continueButton}
            onPress={() => void handleVerifyOtp()}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={s.continueButtonText}>Verify & Continue</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={{ alignItems: "center", marginTop: 16 }}
            onPress={() =>
              signUp?.prepareEmailAddressVerification({
                strategy: "email_code",
              })
            }
          >
            <Text style={{ color: "#4ADE80", fontSize: 14, fontWeight: "600" }}>
              Resend code
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Step 2: Registration form ───────────────────────────────────────────
  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => setStep(1)}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Account / መለያ...</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={s.scroll}>
        <View style={s.logoSection}>
          <View style={s.iconCircle}>
            <Feather
              name={role === "psychiatrist" ? "briefcase" : "user"}
              size={24}
              color="#4ADE80"
            />
          </View>
          <Text style={s.mainTitle}>
            {role === "psychiatrist"
              ? "Join as Psychiatrist"
              : "Join SelamMind"}
          </Text>
          <Text style={s.amharicMainTitle}>
            {role === "psychiatrist" ? "እንደ ባለሙያ ይመዝገቡ" : "ሰላምማይንድን ይቀላቀሉ"}
          </Text>
        </View>

        <View style={s.formCard}>
          <View style={s.inputGroup}>
            <Text style={s.label}>Full Name / ሙሉ ስም</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
                placeholder="Hana Alemu"
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
              />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Email Address / ኢሜል አድራሻ</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
                placeholder="hana@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor="#9CA3AF"
                value={email}
                onChangeText={setEmail}
              />
            </View>
          </View>
           <View style={s.inputGroup}>
                <Text style={s.label}>National ID Number</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    style={s.input}
                    placeholder="ID-12345678"
                    placeholderTextColor="#9CA3AF"
                    value={nationalId}
                    onChangeText={setNationalId}
                  />
                </View>
              </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Password / የይለፍ ቃል</Text>
            <View style={s.inputContainer}>
              <TextInput
                style={s.input}
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

          {role === "psychiatrist" && (
            <>
              <View style={s.divider} />
              <Text style={s.sectionTitle}>Professional Details</Text>

              <View style={s.inputGroup}>
                <Text style={s.label}>National ID Number</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    style={s.input}
                    placeholder="ID-12345678"
                    placeholderTextColor="#9CA3AF"
                    value={nationalId}
                    onChangeText={setNationalId}
                  />
                </View>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Medical License Number</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    style={s.input}
                    placeholder="MED-98765432"
                    placeholderTextColor="#9CA3AF"
                    value={licenseNumber}
                    onChangeText={setLicenseNumber}
                  />
                </View>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Specialization</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    style={s.input}
                    placeholder="Clinical Psychology, CBT..."
                    placeholderTextColor="#9CA3AF"
                    value={specialization}
                    onChangeText={setSpecialization}
                  />
                </View>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Years of Experience</Text>
                <View style={s.inputContainer}>
                  <TextInput
                    style={s.input}
                    placeholder="5"
                    keyboardType="numeric"
                    placeholderTextColor="#9CA3AF"
                    value={experience}
                    onChangeText={setExperience}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={s.uploadBox}
                onPress={() => setCertificateUploaded(!certificateUploaded)}
              >
                <Feather
                  name="upload-cloud"
                  size={28}
                  color={certificateUploaded ? "#4ADE80" : "#9CA3AF"}
                />
                <Text
                  style={[
                    s.uploadText,
                    certificateUploaded && { color: "#4ADE80" },
                  ]}
                >
                  {certificateUploaded
                    ? "Certificate Uploaded Successfully"
                    : "Tap to upload medical certificate (PDF/JPG)"}
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={s.infoBox}>
            <Feather
              name="shield"
              size={16}
              color="#4B5563"
              style={{ marginTop: 2 }}
            />
            <Text style={[s.infoText, { marginLeft: 10 }]}>
              Your data is private and securely encrypted.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={s.continueButton}
          onPress={() => void handleRegister()}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={s.continueButtonText}>Create Account</Text>
          )}
        </TouchableOpacity>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.push("/login")}>
            <Text style={s.footerAction}>Login</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
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
  scroll: { flex: 1, paddingHorizontal: 20 },
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
  amharicLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 2,
    marginBottom: 8,
  },
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
    marginBottom: 16,
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
  infoText: { fontSize: 12, color: "#4B5563", lineHeight: 18, flex: 1 },
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
