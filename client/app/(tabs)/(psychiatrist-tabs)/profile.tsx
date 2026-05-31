import {
  fetchPsychiatristFullProfile,
  fetchPsychiatristVerificationStatus,
} from "@/lib/psychiatristApi";
import { useRemoteData } from "@/lib/useRemoteData";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBadge } from "@/components/psychiatrist/StatusBadge";
import {
  ProfileInfoCard,
  InfoRow,
} from "@/components/psychiatrist/ProfileInfoCard";
import WalletSection from "@/components/psychiatrist/wallet";
import DocumentsSection from "@/components/psychiatrist/documents";
import { clearAuthToken } from "@/lib/auth";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { useClerk } from "@clerk/clerk-expo";
import { router } from "expo-router";

// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "overview" | "documents" | "wallet";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "user" },
  { key: "documents", label: "Documents", icon: "file-text" },
  { key: "wallet", label: "Wallet", icon: "credit-card" },
];

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function PsychiatristProfileScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const {
    data: profile,
    loading,
    error,
    reload,
  } = useRemoteData(fetchPsychiatristFullProfile, []);

 

// ✅ Only re-fetch when the screen comes into focus
useFocusEffect(
  useCallback(() => {
    reload();
  }, [reload])  // reload is now stable, so this never re-triggers
);
  const { signOut } = useClerk();
  async function logout() {
    try {
      await signOut();
      await clearAuthToken();
      router.replace("/login");
    } catch (e) {
      Alert.alert("Logout failed", getApiErrorMessage(e));
    }
  }
  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.root}>
      {/* ── Top bar ── */}
      <View style={s.topbar}>
        <Text style={s.topbarTitle}>Professional Profile</Text>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={reload}
          accessibilityLabel="Refresh"
        >
          <Feather name="refresh-cw" size={17} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* ── Loading / Error ── */}
      {loading ? (
        <ActivityIndicator style={s.loader} size="large" color="#1D9E75" />
      ) : error ? (
        <View style={s.errorBox}>
          <Feather name="alert-circle" size={28} color="#B91C1C" />
          <Text style={s.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          {/* ── Hero ── */}
          <View style={s.hero}>
            <View style={s.avatar}>
              <Feather name="user" size={26} color="#0F6E56" />
            </View>
            <View style={s.heroInfo}>
              <Text style={s.heroName}>{profile?.full_name}</Text>
              <Text style={s.heroEmail} numberOfLines={1}>
                {profile?.email}
              </Text>
              <View style={s.heroMeta}>
                {profile?.specialization ? (
                  <View style={s.specTag}>
                    <Text style={s.specTagText}>{profile.specialization}</Text>
                  </View>
                ) : null}
                {profile?.verification_status ? (
                  <StatusBadge
                    status={profile.verification_status as any}
                    size="sm"
                  />
                ) : null}
              </View>
            </View>
          </View>

          {/* ── Tabs ── */}
          <View style={s.tabBar}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={s.tab}
                  onPress={() => setActiveTab(tab.key)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Feather
                    name={tab.icon as any}
                    size={15}
                    color={active ? "#1D9E75" : "#9CA3AF"}
                  />
                  <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                    {tab.label}
                  </Text>
                  {active && <View style={s.tabIndicator} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tab content ── */}
          <ScrollView
            contentContainerStyle={s.scrollContent}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={reload} />
            }
          >
            {activeTab === "overview" && <OverviewTab profile={profile} />}
            {activeTab === "documents" && <DocumentsTab profile={profile} />}
            {activeTab === "wallet" && <WalletTab profile={profile} />}
            {/* ── Logout Section ── */}
            {/* ── Logout Section ── */}
            <View style={s.section}>
              <TouchableOpacity
                style={s.logoutRow}
                onPress={() => void logout()}
                activeOpacity={0.8}
              >
                <View style={s.logoutIconWrap}>
                  <Feather name="log-out" size={18} color="#DC2626" />
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.logoutTitle}>
                    Log out <Text style={s.amharicRowTitle}>/ ውጣ</Text>
                  </Text>
                  <Text style={s.logoutSubText}>
                    End this session on this device
                  </Text>
                </View>

                <Feather name="chevron-right" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ profile }: { profile: any }) {
  return (
    <>
      {/* ── Professional Information ── */}
      <View style={s.section}>
        <ProfileInfoCard title="Professional Information" icon="briefcase">
          <InfoRow
            label="Specialization"
            value={profile?.specialization || "—"}
            icon="activity"
          />
          <InfoRow
            label="License Number"
            value={profile?.license_number || "—"}
            icon="file-text"
          />
          <InfoRow
            label="Experience"
            value={
              profile?.years_of_experience
                ? `${profile.years_of_experience} years`
                : "—"
            }
            icon="award"
          />
          <InfoRow
            label="Hospital / Clinic"
            value={profile?.hospital_or_clinic || "—"}
            icon="map-pin"
          />
        </ProfileInfoCard>
      </View>

      {/* ── Contact Information ── */}
      <View style={s.section}>
        <ProfileInfoCard title="Contact Information" icon="phone">
          <InfoRow
            label="Email"
            value={profile?.email || "—"}
            icon="mail"
          />
          <InfoRow
            label="National ID"
            value={profile?.national_id || "—"}
            icon="credit-card"
          />
          <InfoRow
            label="Phone"
            value={profile?.phone || "—"}
            icon="phone"
          />
        </ProfileInfoCard>
      </View>

      {/* ── Verification Status ── */}
      <View style={s.section}>
        <ProfileInfoCard title="Verification Status" icon="shield">
          <View style={s.statusRow}>
            <View>
              <Text style={s.statusLabel}>Current status</Text>
              <Text style={s.statusValue}>
                {profile?.verification_status ?? "—"}
              </Text>
            </View>
            {profile?.verification_status && (
              <StatusBadge
                status={profile.verification_status as any}
                size="sm"
              />
            )}
          </View>

          {profile?.is_suspended && (
            <View style={[s.alertBox, s.alertDanger]}>
              <Feather name="alert-triangle" size={15} color="#A32D2D" />
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>Account Suspended</Text>
                <Text style={s.alertBody}>
                  {profile.suspension_reason || "No reason provided"}
                </Text>
              </View>
            </View>
          )}

          {profile?.admin_feedback &&
            profile.verification_status === "rejected" && (
              <View style={[s.alertBox, s.alertWarning]}>
                <Feather name="message-square" size={15} color="#854F0B" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { color: "#854F0B" }]}>
                    Admin Feedback
                  </Text>
                  <Text style={[s.alertBody, { color: "#633806" }]}>
                    {profile.admin_feedback}
                  </Text>
                </View>
              </View>
            )}
        </ProfileInfoCard>
      </View>

      {/* ── Account Information ── */}
      <View style={s.section}>
        <View style={s.card}>
          <Text style={s.cardTitle}>Account Information</Text>
          <View style={s.accountRow}>
            <Text style={s.accountLabel}>Member since</Text>
            <Text style={s.accountValue}>
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })
                : "—"}
            </Text>
          </View>
          <View style={s.accountRow}>
            <Text style={s.accountLabel}>Role</Text>
            <Text style={s.accountValue} style={{ textTransform: "capitalize" }}>
              {profile?.role ?? "Psychiatrist"}
            </Text>
          </View>
          <View style={[s.accountRow, { borderBottomWidth: 0 }]}>
            <Text style={s.accountLabel}>Account ID</Text>
            <Text style={s.accountValue}>
              {profile?.id ? `${profile.id.slice(0, 8)}…` : "—"}
            </Text>
          </View>
        </View>
      </View>

     

      {/* ── Action ── */}
      {profile?.verification_status === "approved" ? (
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() =>
            Alert.alert("Edit Profile", "Profile editing coming soon")
          }
        >
          <Feather name="edit-2" size={16} color="#fff" />
          <Text style={s.actionBtnText}>Edit Profile Information</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnOutline]}
          onPress={() =>
            Alert.alert("Upload Documents", "Document upload coming soon")
          }
        >
          <Feather name="upload-cloud" size={16} color="#1D9E75" />
          <Text style={[s.actionBtnText, { color: "#1D9E75" }]}>
            Upload Documents
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
}

// ─── Documents tab ────────────────────────────────────────────────────────────
function DocumentsTab({ profile }: { profile: any }) {
  return (
    <View style={s.section}>
      <DocumentsSection
        documents={profile?.uploaded_documents || []}
        onUpload={() => Alert.alert("Upload", "Upload coming soon")}
        onOpen={(doc: any) => console.log(doc)}
      />
    </View>
  );
}

// ─── Wallet tab ───────────────────────────────────────────────────────────────
function WalletTab({ profile }: { profile: any }) {
  return (
    <View style={s.section}>
      <WalletSection
        balance={profile?.wallet_balance ?? 0}
        currency={profile?.wallet_currency ?? "USD"}
        onWithdraw={() => Alert.alert("Withdraw", "Withdraw coming soon")}
        onViewWallet={() => Alert.alert("Wallet", "History coming soon")}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const GREEN = "#1D9E75";
const GREEN_LIGHT = "#E1F5EE";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },

  // Topbar
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  topbarTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },

  // Loader / Error
  loader: { marginTop: 48 },
  errorBox: {
    marginTop: 48,
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  errorText: { color: "#B91C1C", textAlign: "center", fontSize: 14 },

  // Hero
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 14,
    backgroundColor: GREEN_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInfo: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 17, fontWeight: "700", color: "#111827" },
  heroEmail: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    flexWrap: "wrap",
  },
  specTag: {
    backgroundColor: "#F0FDF4",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#BBF7D0",
  },
  specTagText: { fontSize: 12, color: "#166534" },
statsRow: {
  flexDirection: "row",
  gap: 10,
},
statCard: {
  flex: 1,
  backgroundColor: "#FFFFFF",
  borderRadius: 14,
  paddingVertical: 16,
  alignItems: "center",
  gap: 6,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: "#E5E7EB",
},
statValue: {
  fontSize: 20,
  fontWeight: "800",
  color: "#111827",
},
statLabel: {
  fontSize: 11,
  color: "#6B7280",
  fontWeight: "500",
},
  // Tabs
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingVertical: 13,
    position: "relative",
  },
  tabLabel: { fontSize: 13, color: "#9CA3AF" },
  tabLabelActive: { color: GREEN, fontWeight: "600" },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: GREEN,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },

  // Scroll
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },

  // Generic section spacer
  section: { marginBottom: 14 },

  // Generic card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },

  // Account rows inside card
  accountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  accountLabel: { fontSize: 13, color: "#6B7280" },
  accountValue: { fontSize: 13, fontWeight: "600", color: "#111827" },
  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FEE2E2",
  },

  logoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },

  logoutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },

  logoutSubText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },

  // Verification status block
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 12,
  },
  statusLabel: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  statusValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginTop: 4,
    textTransform: "capitalize",
  },

  // Alert boxes
  alertBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  alertDanger: { backgroundColor: "#FEF2F2" },
  alertWarning: { backgroundColor: "#FFFBEB" },
  alertTitle: { fontSize: 12, fontWeight: "700", color: "#991B1B" },
  alertBody: { fontSize: 12, color: "#7F1D1D", marginTop: 2, lineHeight: 16 },

  // Action buttons
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 16,
  },
  actionBtnOutline: {
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: GREEN,
  },
  actionBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});
