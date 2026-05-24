/**
 * app/admin/index.tsx
 *
 * Admin dashboard — 4 tabs: Dashboard, Psychiatrists, Users, Profile.
 * Uses Clerk for auth/session management.
 *
 * API endpoints:
 *   GET   /admin/stats
 *   GET   /admin/psychiatrists/pending
 *   GET   /admin/psychiatrists/approved
 *   POST  /admin/psychiatrists/:id/approve
 *   POST  /admin/psychiatrists/:id/reject
 *   GET   /admin/users
 *   GET   /admin/wallet
 *   PATCH /admin/profile
 *   POST  /admin/profile/password
 *   POST  /admin/profile/avatar
 */

import { api } from "@/lib/api";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { useAuthStore } from "@/stores/authStore";
import { useClerk } from "@clerk/clerk-expo";
import { Feather, Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Design Tokens ─────────────────────────────────────────────────────────────

const C = {
  // Greens
  green50: "#F0FDF4",
  green100: "#DCFCE7",
  green200: "#BBF7D0",
  green400: "#4ADE80",
  green500: "#22C55E",
  green600: "#16A34A",
  green700: "#15803D",
  green900: "#14532D",
  // Blues
  blue50: "#EFF6FF",
  blue100: "#DBEAFE",
  blue200: "#BFDBFE",
  blue400: "#60A5FA",
  blue500: "#3B82F6",
  blue600: "#2563EB",
  blue700: "#1D4ED8",
  // Neutrals
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray300: "#CBD5E1",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray700: "#334155",
  gray800: "#1E293B",
  gray900: "#0F172A",
  // Status
  red50: "#FEF2F2",
  red100: "#FEE2E2",
  red600: "#DC2626",
  red700: "#B91C1C",
  amber400: "#FBBF24",
  amber50: "#FFFBEB",
};

// ─── Types ─────────────────────────────────────────────────────────────────────

type Tab = "dashboard" | "psychiatrists" | "users" | "profile";
type PsychSubTab = "pending" | "approved";

type Stats = {
  total_users: number;
  total_psychiatrists: number;
  pending_count: number;
};

type PendingRow = {
  id: string;
  full_name: string;
  email: string;
  created_at?: string;
  profile: {
    specialization?: string;
    license_number?: string;
    years_of_experience?: number;
    hospital_or_clinic?: string;
    national_id?: string;
    certificate_url?: string;
  };
};

type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at?: string;
  is_active?: boolean;
};

type TxRow = {
  id: string;
  description: string;
  amount: number;
  type: "credit" | "debit";
  date: string;
};

type PsychRow = {
  id: string;
  full_name: string;
  email: string;
  verification_status: string;
  is_approved: boolean;
  admin_feedback: string;
  createdAt?: string;
  profile: {
    specialization?: string;
    license_number?: string;
    years_of_experience?: number;
    hospital_or_clinic?: string;
    uploaded_documents?: any[];
  };
};

// Wallet types from second file
type RevenueSummary = {
  total_revenue: number;
  platform_revenue: number;
  psychiatrist_revenue: number;
  total_bookings: number;
};

type AdminTx = {
  id: string;
  user: { full_name: string; email: string; role: string } | null;
  booking_id: string | null;
  amount: number;
  transaction_type: string;
  payment_reference: string;
  status: string;
  description: string;
  created_at: string;
};

type BookingRow = {
  id: string;
  user: { full_name: string } | null;
  psychiatrist: { full_name: string } | null;
  amount: number;
  platform_fee: number;
  psychiatrist_share: number;
  payment_status: string;
  booking_status: string;
  time_label?: string;
  createdAt: string;
};

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

const STATUS_COLOR: Record<string, string> = {
  paid: "#16A34A",
  pending_payment: "#D97706",
  failed: "#EF4444",
  refunded: "#7C3AED",
  completed: "#16A34A",
  pending: "#D97706",
  cancelled: "#EF4444",
};

// ─── Shared Components ─────────────────────────────────────────────────────────

function SectionCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[shared.sectionCard, style]}>{children}</View>;
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={shared.sectionHeaderRow}>
      <View style={shared.sectionHeaderAccent} />
      <Text style={shared.sectionHeader}>{title}</Text>
    </View>
  );
}

function Badge({
  label,
  variant = "green",
}: {
  label: string;
  variant?: "green" | "blue" | "amber" | "red";
}) {
  const colors: Record<string, { bg: string; text: string }> = {
    green: { bg: C.green100, text: C.green700 },
    blue: { bg: C.blue100, text: C.blue700 },
    amber: { bg: C.amber50, text: "#92400E" },
    red: { bg: C.red100, text: C.red700 },
  };
  const { bg, text } = colors[variant];
  return (
    <View style={[shared.badge, { backgroundColor: bg }]}>
      <Text style={[shared.badgeText, { color: text }]}>{label}</Text>
    </View>
  );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  color,
  bgColor,
}: {
  icon: string;
  label: string;
  value: number | string;
  color: string;
  bgColor: string;
}) {
  return (
    <View style={[sc.card, { borderTopColor: color, borderTopWidth: 3 }]}>
      <View style={[sc.iconCircle, { backgroundColor: bgColor }]}>
        <Feather name={icon as any} size={20} color={color} />
      </View>
      <Text style={sc.value}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 18,
    marginHorizontal: 5,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  value: {
    fontSize: 28,
    fontWeight: "800",
    color: C.gray900,
    letterSpacing: -0.5,
  },
  label: { fontSize: 12, color: C.gray500, marginTop: 4, fontWeight: "500" },
});

// ─── Dashboard Tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const adminName = useAuthStore((s) => s.user?.full_name);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Stats>("/admin/stats");
      setStats(data);
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.gray50 }}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={C.green500}
        />
      }
    >
      {/* Hero greeting */}
      <View style={dash.heroCard}>
        <View style={dash.heroGradientOverlay} />
        <View style={dash.heroContent}>
          <Text style={dash.greeting}>Good day,</Text>
          <Text style={dash.adminName}>{adminName ?? "Admin"} 👋</Text>
          <Text style={dash.heroSub}>
            Here's what's happening on your platform.
          </Text>
        </View>
        <View style={dash.heroBadgeWrap}>
          <View style={dash.heroBadge}>
            <Feather name="shield" size={12} color={C.green500} />
            <Text style={dash.heroBadgeText}>Admin</Text>
          </View>
        </View>
      </View>

      <SectionHeader title="Overview" />

      {loading && !stats ? (
        <ActivityIndicator color={C.green500} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={{ flexDirection: "row", marginBottom: 10 }}>
            <StatCard
              icon="users"
              label="Total Users"
              value={stats?.total_users ?? 0}
              color={C.green500}
              bgColor={C.green50}
            />
            <StatCard
              icon="briefcase"
              label="Psychiatrists"
              value={stats?.total_psychiatrists ?? 0}
              color={C.blue500}
              bgColor={C.blue50}
            />
          </View>
          <View style={{ flexDirection: "row", marginBottom: 20 }}>
            <StatCard
              icon="clock"
              label="Pending Approvals"
              value={stats?.pending_count ?? 0}
              color={C.amber400}
              bgColor={C.amber50}
            />
            <View style={{ flex: 1, marginHorizontal: 5 }} />
          </View>

          <SectionHeader title="Quick Actions" />
          <SectionCard>
            {[
              {
                icon: "download",
                color: C.green500,
                label: "Export user data",
                bg: C.green50,
              },
              {
                icon: "bell",
                color: C.blue500,
                label: "Send broadcast notification",
                bg: C.blue50,
              },
              {
                icon: "bar-chart",
                color: C.green600,
                label: "View analytics report",
                bg: C.green50,
              },
            ].map((a, i) => (
              <TouchableOpacity
                key={a.label}
                style={[
                  shared.actionRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: C.gray100 },
                ]}
                onPress={() =>
                  Alert.alert("Coming soon", `${a.label} coming soon.`)
                }
              >
                <View style={[shared.actionIcon, { backgroundColor: a.bg }]}>
                  <Feather name={a.icon as any} size={16} color={a.color} />
                </View>
                <Text style={shared.actionText}>{a.label}</Text>
                <Feather name="chevron-right" size={16} color={C.gray300} />
              </TouchableOpacity>
            ))}
          </SectionCard>
        </>
      )}
    </ScrollView>
  );
}

const dash = StyleSheet.create({
  heroCard: {
    backgroundColor: C.gray900,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    overflow: "hidden",
    position: "relative",
  },
  heroGradientOverlay: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: C.green500,
    opacity: 0.08,
  },
  heroContent: {},
  greeting: {
    fontSize: 13,
    color: C.gray400,
    marginBottom: 2,
    fontWeight: "500",
  },
  adminName: {
    fontSize: 26,
    fontWeight: "800",
    color: C.white,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  heroSub: { fontSize: 13, color: C.gray500 },
  heroBadgeWrap: { position: "absolute", top: 20, right: 20 },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(74,222,128,0.12)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.25)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: { color: C.green400, fontSize: 11, fontWeight: "700" },
});

// ─── Document Modal ────────────────────────────────────────────────────────────

function DocModal({
  visible,
  url,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  onClose: () => void;
}) {
  if (!url) return null;
  const isPdf = url.toLowerCase().includes(".pdf");
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.gray900 }}>
        <View style={dm.header}>
          <TouchableOpacity onPress={onClose} style={dm.closeBtn}>
            <Ionicons name="close" size={20} color={C.white} />
          </TouchableOpacity>
          <Text style={dm.title}>Certificate Document</Text>
          <View style={{ width: 36 }} />
        </View>
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          {isPdf ? (
            <View style={dm.pdfBox}>
              <View style={dm.pdfIconWrap}>
                <Feather name="file-text" size={40} color={C.green400} />
              </View>
              <Text style={dm.pdfTitle}>PDF Document</Text>
              <Text style={dm.pdfSub}>Open in browser to view</Text>
              <Text style={dm.pdfUrl} numberOfLines={2}>
                {url}
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: url }}
              style={dm.image}
              resizeMode="contain"
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const dm = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.gray800,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.gray800,
    justifyContent: "center",
    alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "700", color: C.white },
  image: { width: "100%", height: 400, borderRadius: 16 },
  pdfBox: {
    backgroundColor: C.gray800,
    borderRadius: 20,
    padding: 36,
    alignItems: "center",
    width: "100%",
    borderWidth: 1,
    borderColor: C.gray700,
  },
  pdfIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: "rgba(74,222,128,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  pdfTitle: {
    color: C.white,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  pdfSub: { color: C.gray400, fontSize: 13 },
  pdfUrl: {
    color: C.green400,
    fontSize: 11,
    marginTop: 14,
    textAlign: "center",
    lineHeight: 18,
  },
});

// ─── Psychiatrists Tab ─────────────────────────────────────────────────────────

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value?: string;
}) {
  if (!value) return null;
  return (
    <View style={ps.detailRow}>
      <View style={ps.detailIconWrap}>
        <Feather name={icon as any} size={11} color={C.blue500} />
      </View>
      <Text style={ps.detailLabel}>{label}</Text>
      <Text style={ps.detailValue}>{value}</Text>
    </View>
  );
}

function PsychiatristsTab() {
  const [subTab, setSubTab] = useState<PsychSubTab>("all");
  const [all, setAll] = useState<PsychRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [feedbackById, setFeedbackById] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ psychiatrists: PsychRow[] }>(
        "/admin/psychiatrists",
      );
      setAll(data.psychiatrists ?? []);
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered =
    subTab === "all"
      ? all
      : subTab === "pending"
        ? all.filter(
            (r) => !r.is_approved && r.verification_status !== "rejected",
          )
        : all.filter((r) => r.is_approved);

  const pendingCount = all.filter(
    (r) => !r.is_approved && r.verification_status !== "rejected",
  ).length;

  async function handleApprove(id: string) {
    setActingId(id);
    try {
      await api.post(`/admin/psychiatrists/${id}/approve`, {
        feedback: feedbackById[id]?.trim() || undefined,
      });
      setAll((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, is_approved: true, verification_status: "approved" }
            : r,
        ),
      );
      Alert.alert("Approved ✓", "Psychiatrist can now access the platform.");
    } catch (e) {
      Alert.alert("Failed", getApiErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  async function handleReject(id: string) {
    if (!feedbackById[id]?.trim()) {
      Alert.alert("Feedback required", "Add a reason before rejecting.");
      return;
    }
    setActingId(id);
    try {
      await api.post(`/admin/psychiatrists/${id}/reject`, {
        feedback: feedbackById[id]!.trim(),
      });
      setAll((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, is_approved: false, verification_status: "rejected" }
            : r,
        ),
      );
      Alert.alert("Rejected", "Applicant will see your feedback.");
    } catch (e) {
      Alert.alert("Failed", getApiErrorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  const SUB_TABS: { key: PsychSubTab; label: string }[] = [
    { key: "all", label: `All (${all.length})` },
    {
      key: "pending",
      label: `Pending${pendingCount ? ` (${pendingCount})` : ""}`,
    },
    { key: "approved", label: "Approved" },
  ];

  function statusVariant(status: string): "green" | "amber" | "red" {
    if (status === "approved") return "green";
    if (status === "rejected") return "red";
    return "amber";
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Sub-tabs */}
      <View style={ps.subTabContainer}>
        {SUB_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[ps.subTab, subTab === t.key && ps.subTabActive]}
            onPress={() => setSubTab(t.key)}
          >
            {subTab === t.key && <View style={ps.subTabIndicator} />}
            <Text
              style={[ps.subTabText, subTab === t.key && ps.subTabTextActive]}
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.green500} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={loadAll}
              tintColor={C.green500}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="users" size={48} color={C.gray300} />
              <Text style={s.emptyTitle}>No psychiatrists</Text>
              <Text style={s.empty}>None in this category yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={ps.card}>
              {/* Header */}
              <View style={ps.cardHeader}>
                <View style={ps.avatar}>
                  <Text style={ps.avatarText}>
                    {item.full_name[0]?.toUpperCase() ?? "?"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ps.name}>{item.full_name}</Text>
                  <Text style={ps.email}>{item.email}</Text>
                </View>
                <Badge
                  label={item.verification_status ?? "pending"}
                  variant={statusVariant(item.verification_status)}
                />
              </View>

              <View style={ps.divider} />

              {/* Profile details */}
              <View style={ps.detailGrid}>
                <DetailRow
                  icon="award"
                  label="Specialization"
                  value={item.profile.specialization}
                />
                <DetailRow
                  icon="credit-card"
                  label="License"
                  value={item.profile.license_number}
                />
                <DetailRow
                  icon="briefcase"
                  label="Experience"
                  value={
                    item.profile.years_of_experience
                      ? `${item.profile.years_of_experience} yrs`
                      : undefined
                  }
                />
                <DetailRow
                  icon="home"
                  label="Hospital/Clinic"
                  value={item.profile.hospital_or_clinic}
                />
              </View>

              {/* Previous feedback */}
              {item.admin_feedback ? (
                <View
                  style={{
                    backgroundColor: C.amber50,
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 10,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      color: "#92400E",
                      fontWeight: "600",
                    }}
                  >
                    Previous feedback:
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: "#78350F", marginTop: 2 }}
                  >
                    {item.admin_feedback}
                  </Text>
                </View>
              ) : null}

              {/* Feedback input — always visible so admin can update */}
              <TextInput
                style={ps.feedbackInput}
                placeholder="Feedback (required to reject)"
                placeholderTextColor={C.gray400}
                value={feedbackById[item.id] ?? ""}
                onChangeText={(t) =>
                  setFeedbackById((prev) => ({ ...prev, [item.id]: t }))
                }
                multiline
              />

              {/* Actions */}
              <View style={ps.actions}>
                <TouchableOpacity
                  style={[
                    ps.approveBtn,
                    item.is_approved && { opacity: 0.4 },
                    actingId === item.id && { opacity: 0.5 },
                  ]}
                  onPress={() => void handleApprove(item.id)}
                  disabled={actingId === item.id || item.is_approved}
                >
                  {actingId === item.id ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <>
                      <Feather name="check" size={15} color={C.white} />
                      <Text style={ps.approveText}>
                        {item.is_approved ? "Approved" : "Approve"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    ps.rejectBtn,
                    actingId === item.id && { opacity: 0.5 },
                  ]}
                  onPress={() => void handleReject(item.id)}
                  disabled={actingId === item.id}
                >
                  <Feather name="x" size={15} color={C.red700} />
                  <Text style={ps.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const ps = StyleSheet.create({
  subTabContainer: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
    paddingHorizontal: 16,
  },
  subTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 6,
    position: "relative",
  },
  subTabActive: {},
  subTabIndicator: {
    position: "absolute",
    bottom: 0,
    left: "10%",
    right: "10%",
    height: 2.5,
    backgroundColor: C.green500,
    borderRadius: 2,
  },
  subTabText: { fontSize: 13, fontWeight: "600", color: C.gray400 },
  subTabTextActive: { color: C.gray900 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.amber400,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: C.green100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 20, fontWeight: "800", color: C.green700 },
  name: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  email: { fontSize: 12, color: C.gray500, marginTop: 2 },
  divider: { height: 1, backgroundColor: C.gray100, marginBottom: 12 },
  detailGrid: { marginBottom: 12 },
  detailRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  detailIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: C.blue50,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  detailLabel: { fontSize: 12, color: C.gray500, marginRight: 4, width: 90 },
  detailValue: { fontSize: 12, color: C.gray800, fontWeight: "600", flex: 1 },
  certBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.blue50,
    borderWidth: 1,
    borderColor: C.blue200,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  certBtnDisabled: { backgroundColor: C.gray50, borderColor: C.gray200 },
  certText: { flex: 1, fontSize: 13, fontWeight: "600", color: C.blue600 },
  feedbackInput: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    minHeight: 64,
    fontSize: 13,
    color: C.gray900,
    backgroundColor: C.gray50,
    textAlignVertical: "top",
  },
  actions: { flexDirection: "row", gap: 10 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: C.green500,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  approveText: { fontWeight: "700", color: C.white, fontSize: 14 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: C.red100,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  rejectText: { fontWeight: "700", color: C.red700, fontSize: 14 },
});

// ─── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ users: UserRow[] }>("/admin/users");
      setUsers(data.users ?? []);
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  return (
    <View style={{ flex: 1, backgroundColor: C.gray50 }}>
      {/* Search */}
      <View style={us.searchWrap}>
        <View style={us.searchBox}>
          <View style={us.searchIconWrap}>
            <Feather name="search" size={15} color={C.gray500} />
          </View>
          <TextInput
            style={us.searchInput}
            placeholder="Search by name or email…"
            placeholderTextColor={C.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} style={us.clearBtn}>
              <Feather name="x" size={14} color={C.gray500} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.green500} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={C.green500}
            />
          }
          ListHeaderComponent={
            <Text style={us.resultCount}>
              {filtered.length} user{filtered.length !== 1 ? "s" : ""}
            </Text>
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="user-x" size={48} color={C.gray300} />
              <Text style={s.emptyTitle}>No results</Text>
              <Text style={s.empty}>No users match your search.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={us.row}>
              <View
                style={[
                  us.avatar,
                  item.role === "psychiatrist" && {
                    backgroundColor: C.blue100,
                  },
                ]}
              >
                <Text
                  style={[
                    us.avatarText,
                    item.role === "psychiatrist" && { color: C.blue700 },
                  ]}
                >
                  {item.full_name[0]?.toUpperCase() ?? "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={us.name}>{item.full_name}</Text>
                <Text style={us.email}>{item.email}</Text>
                {item.created_at && (
                  <Text style={us.date}>
                    Joined {new Date(item.created_at).toLocaleDateString()}
                  </Text>
                )}
              </View>
              <Badge
                label={item.role}
                variant={item.role === "psychiatrist" ? "blue" : "green"}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

const us = StyleSheet.create({
  searchWrap: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.gray50,
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.white,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.gray900, height: 40 },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: C.gray200,
    marginRight: 2,
  },
  resultCount: {
    fontSize: 12,
    color: C.gray500,
    fontWeight: "500",
    marginBottom: 10,
    marginTop: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: C.green100,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 17, fontWeight: "800", color: C.green700 },
  name: { fontSize: 14, fontWeight: "700", color: C.gray900 },
  email: { fontSize: 12, color: C.gray500, marginTop: 1 },
  date: { fontSize: 11, color: C.gray400, marginTop: 2 },
});

// ─── Profile Tab (with integrated wallet from second file) ─────────────────────

function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const clearSession = useAuthStore((s) => s.clearSession);

  // Clerk sign out
  const { signOut } = useClerk();

  // Edit profile
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Notifications
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(true);
  const [notifNewUser, setNotifNewUser] = useState(true);
  const [notifPendingApproval, setNotifPendingApproval] = useState(true);

  // Wallet state (integrated from second file)
  const [walletExpanded, setWalletExpanded] = useState(false);
  const [walletTab, setWalletTab] = useState<
    "overview" | "transactions" | "bookings"
  >("overview");
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [transactions, setTransactions] = useState<AdminTx[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [refreshingWallet, setRefreshingWallet] = useState(false);

  const loadWalletData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshingWallet(true);
      else if (!walletExpanded) return;
      setWalletLoading(true);
      try {
        const [revRes, txRes, bkRes] = await Promise.all([
          api.get<RevenueSummary>("/admin/revenue"),
          api.get<{ transactions: AdminTx[] }>("/bookings/admin/transactions"),
          api.get<{ bookings: BookingRow[] }>("/bookings/admin/all"),
        ]);
        setRevenue(revRes.data);
        setTransactions(txRes.data.transactions);
        setBookings(bkRes.data.bookings);
      } catch (e: unknown) {
        logClientError("adminWallet.load", e);
        Alert.alert("Could not load wallet data", getApiErrorMessage(e));
      } finally {
        setWalletLoading(false);
        setRefreshingWallet(false);
      }
    },
    [walletExpanded],
  );

  // Load wallet data when expanded
  useEffect(() => {
    if (walletExpanded) {
      void loadWalletData();
    }
  }, [walletExpanded, loadWalletData]);

  function toggleWallet() {
    setWalletExpanded((v) => !v);
  }

  async function handleSaveProfile() {
    if (!fullName.trim()) {
      Alert.alert("Name required", "Full name cannot be empty.");
      return;
    }
    setSavingProfile(true);
    try {
      await api.patch("/admin/profile", { full_name: fullName.trim() });
      Alert.alert("Saved ✓", "Profile updated successfully.");
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Missing fields", "Please fill in all password fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Mismatch", "New password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Too short", "Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await api.post("/admin/profile/password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      Alert.alert("Updated ✓", "Password changed successfully.");
    } catch (e) {
      Alert.alert("Error", getApiErrorMessage(e));
    } finally {
      setSavingPassword(false);
    }
  }

  // ── Clerk-aware logout ──
  function handleLogout() {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          try {
            // 1. Sign out of Clerk (clears Clerk session + tokens)
            await signOut();
          } catch (_) {
            // Clerk sign-out failed — proceed anyway
          }
          // 2. Clear local auth store
          await clearSession();
          // 3. Navigate to login
          router.replace("/login");
        },
      },
    ]);
  }

  const initials = (user?.full_name ?? "A")
    .split(" ")
    .map((w: string) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Wallet helper components
  const StatCardSmall = ({
    label,
    value,
    sub,
    color,
  }: {
    label: string;
    value: string;
    sub?: string;
    color: string;
  }) => (
    <View style={[pf.statCardSmall, { borderLeftColor: color }]}>
      <Text style={pf.statLabelSmall}>{label}</Text>
      <Text style={[pf.statValueSmall, { color }]}>{value}</Text>
      {sub ? <Text style={pf.statSubSmall}>{sub}</Text> : null}
    </View>
  );

  const renderWalletTransaction = useCallback(
    ({ item }: { item: AdminTx }) => (
      <View style={pf.walletRow}>
        <View style={pf.walletRowLeft}>
          <Text style={pf.walletRowTitle}>
            {item.transaction_type.replace(/_/g, " ")}
          </Text>
          <Text style={pf.walletRowSub}>
            {item.user?.full_name ?? "—"} · {item.user?.role ?? ""}
          </Text>
          <Text style={pf.walletRowDate}>{fmt(item.created_at)}</Text>
        </View>
        <View style={pf.walletRowRight}>
          <Text style={[pf.walletRowAmount, { color: "#16A34A" }]}>
            +ETB {item.amount}
          </Text>
          <View
            style={[
              pf.walletBadge,
              {
                backgroundColor:
                  item.status === "completed" ? "#DCFCE7" : "#FEF3C7",
              },
            ]}
          >
            <Text
              style={[
                pf.walletBadgeTxt,
                { color: item.status === "completed" ? "#16A34A" : "#D97706" },
              ]}
            >
              {item.status}
            </Text>
          </View>
        </View>
      </View>
    ),
    [],
  );

  const renderWalletBooking = useCallback(
    ({ item }: { item: BookingRow }) => (
      <View style={pf.walletRow}>
        <View style={pf.walletRowLeft}>
          <Text style={pf.walletRowTitle}>{item.user?.full_name ?? "—"}</Text>
          <Text style={pf.walletRowSub}>
            Dr. {item.psychiatrist?.full_name ?? "—"}
          </Text>
          <Text style={pf.walletRowDate}>
            {item.time_label ?? fmt(item.createdAt)}
          </Text>
        </View>
        <View style={pf.walletRowRight}>
          <Text style={pf.walletRowAmount}>ETB {item.amount}</Text>
          <View style={[pf.walletBadge, { backgroundColor: "#F3F4F6" }]}>
            <Text
              style={[
                pf.walletBadgeTxt,
                { color: STATUS_COLOR[item.payment_status] ?? "#6B7280" },
              ]}
            >
              {item.payment_status}
            </Text>
          </View>
          <Text style={pf.walletSplitTxt}>
            P: {item.psychiatrist_share} · A: {item.platform_fee}
          </Text>
        </View>
      </View>
    ),
    [],
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.gray50 }}
      contentContainerStyle={{ paddingBottom: 60 }}
    >
      {/* ── Hero ── */}
      <View style={pf.hero}>
        <View style={pf.heroDecorCircle} />
        <View style={pf.heroDecorCircle2} />
        <View style={pf.avatarWrap}>
          <View style={pf.avatarOuter}>
            <View style={pf.avatarInner}>
              <Text style={pf.avatarText}>{initials}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={pf.cameraBtn}
            onPress={() =>
              Alert.alert("Coming soon", "Photo upload coming soon.")
            }
          >
            <Feather name="camera" size={13} color={C.white} />
          </TouchableOpacity>
        </View>
        <Text style={pf.heroName}>{user?.full_name ?? "Admin"}</Text>
        <Text style={pf.heroEmail}>{user?.email ?? ""}</Text>
        <View style={pf.adminBadge}>
          <Feather name="shield" size={11} color={C.green600} />
          <Text style={pf.adminBadgeText}>Administrator</Text>
        </View>
      </View>

      <View style={{ padding: 20 }}>
        {/* ── Personal Info ── */}
        <SectionHeader title="Personal Information" />
        <SectionCard>
          <Text style={pf.fieldLabel}>Full Name</Text>
          <View style={pf.inputRow}>
            <Feather
              name="user"
              size={15}
              color={C.gray400}
              style={{ marginRight: 10 }}
            />
            <TextInput
              style={pf.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Full name"
              placeholderTextColor={C.gray400}
            />
          </View>

          <Text style={[pf.fieldLabel, { marginTop: 16 }]}>Email Address</Text>
          <View style={[pf.inputRow, pf.inputRowDisabled]}>
            <Feather
              name="mail"
              size={15}
              color={C.gray400}
              style={{ marginRight: 10 }}
            />
            <Text style={pf.inputDisabled}>{user?.email ?? ""}</Text>
            <View style={pf.lockedBadge}>
              <Feather name="lock" size={10} color={C.gray500} />
              <Text style={pf.lockedText}>Locked</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[pf.saveBtn, { backgroundColor: C.green500 }]}
            onPress={() => void handleSaveProfile()}
            disabled={savingProfile}
          >
            {savingProfile ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <>
                <Feather name="save" size={15} color={C.white} />
                <Text style={pf.saveBtnText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </SectionCard>

        {/* ── Change Password ── */}
        <SectionHeader title="Change Password" />
        <SectionCard>
          {(
            [
              {
                label: "Current Password",
                value: currentPassword,
                setter: setCurrentPassword,
                show: showCurrent,
                toggle: () => setShowCurrent((v) => !v),
              },
              {
                label: "New Password",
                value: newPassword,
                setter: setNewPassword,
                show: showNew,
                toggle: () => setShowNew((v) => !v),
              },
              {
                label: "Confirm New Password",
                value: confirmPassword,
                setter: setConfirmPassword,
                show: showConfirm,
                toggle: () => setShowConfirm((v) => !v),
              },
            ] as const
          ).map((f, i) => (
            <View key={f.label} style={i > 0 ? { marginTop: 14 } : {}}>
              <Text style={pf.fieldLabel}>{f.label}</Text>
              <View style={pf.inputRow}>
                <Feather
                  name="lock"
                  size={15}
                  color={C.gray400}
                  style={{ marginRight: 10 }}
                />
                <TextInput
                  style={pf.input}
                  value={f.value}
                  onChangeText={f.setter as (t: string) => void}
                  placeholder="••••••••"
                  placeholderTextColor={C.gray400}
                  secureTextEntry={!f.show}
                />
                <TouchableOpacity onPress={f.toggle}>
                  <Feather
                    name={f.show ? "eye" : "eye-off"}
                    size={15}
                    color={C.gray400}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={[pf.saveBtn, { backgroundColor: C.blue600 }]}
            onPress={() => void handleChangePassword()}
            disabled={savingPassword}
          >
            {savingPassword ? (
              <ActivityIndicator size="small" color={C.white} />
            ) : (
              <>
                <Feather name="key" size={15} color={C.white} />
                <Text style={pf.saveBtnText}>Update Password</Text>
              </>
            )}
          </TouchableOpacity>
        </SectionCard>

        {/* ── Notification Preferences ── */}
        <SectionHeader title="Notification Preferences" />
        <SectionCard>
          {[
            {
              label: "Email notifications",
              sub: "Receive updates via email",
              value: notifEmail,
              setter: setNotifEmail,
            },
            {
              label: "Push notifications",
              sub: "Alerts on your device",
              value: notifPush,
              setter: setNotifPush,
            },
            {
              label: "New user registrations",
              sub: "Notify when users sign up",
              value: notifNewUser,
              setter: setNotifNewUser,
            },
            {
              label: "Pending approvals",
              sub: "Alert when doctors need review",
              value: notifPendingApproval,
              setter: setNotifPendingApproval,
            },
          ].map((n, i) => (
            <View
              key={n.label}
              style={[
                pf.notifRow,
                i > 0 && { borderTopWidth: 1, borderTopColor: C.gray100 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={pf.notifLabel}>{n.label}</Text>
                <Text style={pf.notifSub}>{n.sub}</Text>
              </View>
              <Switch
                value={n.value}
                onValueChange={n.setter}
                trackColor={{ false: C.gray200, true: C.green200 }}
                thumbColor={n.value ? C.green600 : C.gray400}
              />
            </View>
          ))}
        </SectionCard>

        {/* ── Platform Wallet (Integrated from second file) ── */}
        <SectionHeader title="Platform Wallet" />
        <TouchableOpacity
          style={pf.walletToggle}
          onPress={toggleWallet}
          activeOpacity={0.85}
        >
          <View style={pf.walletToggleLeft}>
            <View style={pf.walletIcon}>
              <Feather name="credit-card" size={18} color={C.green500} />
            </View>
            <View>
              <Text style={pf.walletToggleTitle}>Platform Wallet</Text>
              {revenue !== null && !walletExpanded && (
                <Text style={pf.walletToggleSub}>
                  ETB {revenue.total_revenue.toLocaleString()}
                </Text>
              )}
            </View>
          </View>
          <View
            style={[
              pf.walletChevron,
              walletExpanded && {
                backgroundColor: C.green50,
                borderColor: C.green200,
              },
            ]}
          >
            <Feather
              name={walletExpanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={walletExpanded ? C.green600 : C.gray500}
            />
          </View>
        </TouchableOpacity>

        {walletExpanded && (
          <View style={pf.walletBody}>
            {/* Wallet Tab Bar */}
            <View style={pf.walletTabBar}>
              {(["overview", "transactions", "bookings"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[
                    pf.walletTabBtn,
                    walletTab === t && pf.walletTabBtnActive,
                  ]}
                  onPress={() => setWalletTab(t)}
                >
                  <Text
                    style={[
                      pf.walletTabTxt,
                      walletTab === t && pf.walletTabTxtActive,
                    ]}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {walletTab === "overview" && (
              <>
                {/* Revenue Card */}
                <View style={pf.revenueCard}>
                  <Text style={pf.revenueLabel}>Total Platform Revenue</Text>
                  <Text style={pf.revenueAmount}>
                    ETB {(revenue?.total_revenue ?? 0).toLocaleString()}
                  </Text>
                  <Text style={pf.revenueSub}>
                    {revenue?.total_bookings ?? 0} paid bookings
                  </Text>
                </View>

                {/* Stats Grid */}
                <View style={pf.statsGrid}>
                  <StatCardSmall
                    label="Platform (30%)"
                    value={`ETB ${revenue?.platform_revenue ?? 0}`}
                    sub="Admin commission"
                    color="#2563EB"
                  />
                  <StatCardSmall
                    label="Psychiatrists (70%)"
                    value={`ETB ${revenue?.psychiatrist_revenue ?? 0}`}
                    sub="Session earnings"
                    color="#16A34A"
                  />
                </View>

                {/* Info Box */}
                <View style={pf.infoBox}>
                  <Feather name="info" size={14} color="#2563EB" />
                  <Text style={pf.infoTxt}>
                    Each ETB 300 session: ETB 210 → psychiatrist, ETB 90 →
                    platform. All splits are processed atomically via MongoDB
                    transactions.
                  </Text>
                </View>

                {/* Refresh Button */}
                <TouchableOpacity
                  style={pf.walletRefreshBtn}
                  onPress={() => void loadWalletData(true)}
                  disabled={refreshingWallet}
                >
                  {refreshingWallet ? (
                    <ActivityIndicator size="small" color={C.blue600} />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={14} color={C.blue600} />
                      <Text style={pf.walletRefreshText}>Refresh</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {walletTab === "transactions" && (
              <>
                {walletLoading ? (
                  <ActivityIndicator
                    color={C.green500}
                    style={{ marginVertical: 40 }}
                  />
                ) : transactions.length === 0 ? (
                  <View style={pf.walletEmpty}>
                    <Feather name="inbox" size={40} color={C.gray300} />
                    <Text style={pf.walletEmptyText}>
                      No transactions found
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={transactions}
                    keyExtractor={(item) => item.id}
                    renderItem={renderWalletTransaction}
                    scrollEnabled={false}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshingWallet}
                        onRefresh={() => void loadWalletData(true)}
                        tintColor={C.blue600}
                      />
                    }
                  />
                )}
              </>
            )}

            {walletTab === "bookings" && (
              <>
                {walletLoading ? (
                  <ActivityIndicator
                    color={C.green500}
                    style={{ marginVertical: 40 }}
                  />
                ) : bookings.length === 0 ? (
                  <View style={pf.walletEmpty}>
                    <Feather name="calendar" size={40} color={C.gray300} />
                    <Text style={pf.walletEmptyText}>No bookings found</Text>
                  </View>
                ) : (
                  <FlatList
                    data={bookings}
                    keyExtractor={(item) => item.id}
                    renderItem={renderWalletBooking}
                    scrollEnabled={false}
                    refreshControl={
                      <RefreshControl
                        refreshing={refreshingWallet}
                        onRefresh={() => void loadWalletData(true)}
                        tintColor={C.blue600}
                      />
                    }
                  />
                )}
              </>
            )}
          </View>
        )}

        {/* ── Danger Zone ── */}
        <SectionHeader title="Account" />
        <SectionCard style={{ padding: 0, overflow: "hidden" }}>
          <TouchableOpacity style={pf.logoutBtn} onPress={handleLogout}>
            <View style={pf.logoutIconWrap}>
              <Feather name="log-out" size={16} color={C.red600} />
            </View>
            <Text style={pf.logoutText}>Log Out</Text>
            <Feather
              name="chevron-right"
              size={16}
              color={C.red600}
              style={{ marginLeft: "auto" }}
            />
          </TouchableOpacity>
        </SectionCard>
      </View>
    </ScrollView>
  );
}

const pf = StyleSheet.create({
  // Hero
  hero: {
    backgroundColor: C.gray900,
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 20,
    overflow: "hidden",
    position: "relative",
  },
  heroDecorCircle: {
    position: "absolute",
    top: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: C.green500,
    opacity: 0.06,
  },
  heroDecorCircle2: {
    position: "absolute",
    bottom: -80,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: C.blue500,
    opacity: 0.06,
  },
  avatarWrap: { position: "relative", marginBottom: 16 },
  avatarOuter: {
    width: 96,
    height: 96,
    borderRadius: 28,
    backgroundColor: "rgba(74,222,128,0.15)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(74,222,128,0.3)",
  },
  avatarInner: {
    width: 82,
    height: 82,
    borderRadius: 22,
    backgroundColor: C.gray800,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 30, fontWeight: "800", color: C.green400 },
  cameraBtn: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.green500,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: C.gray900,
  },
  heroName: {
    fontSize: 22,
    fontWeight: "800",
    color: C.white,
    letterSpacing: -0.3,
  },
  heroEmail: { fontSize: 13, color: C.gray500, marginTop: 4 },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(74,222,128,0.1)",
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 12,
    gap: 5,
  },
  adminBadgeText: { fontSize: 12, fontWeight: "700", color: C.green400 },
  // Fields
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray600,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: C.gray200,
    borderRadius: 13,
    paddingHorizontal: 14,
    height: 50,
    backgroundColor: C.gray50,
  },
  inputRowDisabled: { backgroundColor: C.gray100, borderColor: C.gray200 },
  input: { flex: 1, fontSize: 15, color: C.gray900 },
  inputDisabled: { flex: 1, fontSize: 15, color: C.gray500 },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: C.gray200,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  lockedText: { fontSize: 10, color: C.gray600, fontWeight: "600" },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingVertical: 14,
    marginTop: 18,
    gap: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: C.white },
  // Notifications
  notifRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  notifLabel: { fontSize: 14, fontWeight: "600", color: C.gray800 },
  notifSub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  // Wallet toggle
  walletToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 2,
    borderWidth: 1.5,
    borderColor: C.gray200,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  walletToggleLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: C.green50,
    borderWidth: 1,
    borderColor: C.green200,
    justifyContent: "center",
    alignItems: "center",
  },
  walletToggleTitle: { fontSize: 15, fontWeight: "700", color: C.gray900 },
  walletToggleSub: { fontSize: 12, color: C.gray500, marginTop: 2 },
  walletChevron: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.gray200,
  },
  // Wallet body
  walletBody: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  // Wallet tabs
  walletTabBar: {
    flexDirection: "row",
    backgroundColor: C.gray50,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  walletTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  walletTabBtnActive: {
    backgroundColor: C.white,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  walletTabTxt: {
    fontSize: 13,
    fontWeight: "600",
    color: C.gray500,
  },
  walletTabTxtActive: {
    color: C.blue600,
  },
  // Revenue card
  revenueCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: C.blue600,
    marginBottom: 16,
  },
  revenueLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    marginBottom: 6,
  },
  revenueAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: C.white,
    marginBottom: 4,
  },
  revenueSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  // Stats grid
  statsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCardSmall: {
    flex: 1,
    backgroundColor: C.gray50,
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
  },
  statLabelSmall: {
    fontSize: 11,
    color: C.gray500,
    marginBottom: 4,
  },
  statValueSmall: {
    fontSize: 16,
    fontWeight: "700",
  },
  statSubSmall: {
    fontSize: 10,
    color: C.gray400,
    marginTop: 2,
  },
  // Info box
  infoBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: C.blue50,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.blue200,
    marginBottom: 16,
  },
  infoTxt: {
    flex: 1,
    fontSize: 11,
    color: C.blue700,
    lineHeight: 16,
  },
  walletRefreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: C.gray50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  walletRefreshText: {
    fontSize: 12,
    fontWeight: "600",
    color: C.blue600,
  },
  // Wallet list items
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.gray50,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.gray100,
  },
  walletRowLeft: { flex: 1 },
  walletRowTitle: { fontSize: 13, fontWeight: "600", color: C.gray800 },
  walletRowSub: { fontSize: 11, color: C.gray500, marginTop: 2 },
  walletRowDate: { fontSize: 10, color: C.gray400, marginTop: 2 },
  walletRowRight: { alignItems: "flex-end", gap: 4 },
  walletRowAmount: { fontSize: 14, fontWeight: "700", color: C.gray800 },
  walletBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  walletBadgeTxt: { fontSize: 9, fontWeight: "700" },
  walletSplitTxt: { fontSize: 9, color: C.gray500 },
  walletEmpty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  walletEmptyText: {
    fontSize: 13,
    color: C.gray400,
  },
  // Logout
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    backgroundColor: C.red50,
  },
  logoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.red100,
    justifyContent: "center",
    alignItems: "center",
  },
  logoutText: { fontSize: 15, fontWeight: "700", color: C.red600 },
});

// ─── Tab Config ────────────────────────────────────────────────────────────────

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "dashboard", icon: "grid", label: "Dashboard" },
  { id: "psychiatrists", icon: "briefcase", label: "Doctors" },
  { id: "users", icon: "users", label: "Users" },
  { id: "profile", icon: "user", label: "Profile" },
];

// ─── Root Screen ───────────────────────────────────────────────────────────────

export default function AdminDashboardScreen() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const TAB_TITLES: Record<Tab, string> = {
    dashboard: "Dashboard",
    psychiatrists: "Doctors",
    users: "Users",
    profile: "My Profile",
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.topHeader}>
        <TouchableOpacity
          style={s.headerBack}
          onPress={() => router.replace("/")}
        >
          <Ionicons name="chevron-back" size={20} color={C.gray700} />
        </TouchableOpacity>
        <Text style={s.topHeaderTitle}>{TAB_TITLES[activeTab]}</Text>
        <TouchableOpacity style={s.headerMore}>
          <Feather name="more-horizontal" size={20} color={C.gray500} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === "dashboard" && <DashboardTab />}
        {activeTab === "psychiatrists" && <PsychiatristsTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "profile" && <ProfileTab />}
      </View>

      {/* Tab Bar */}
      <View style={s.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={s.tabItem}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <View style={[s.tabIconWrap, active && s.tabIconWrapActive]}>
                <Feather
                  name={tab.icon as any}
                  size={19}
                  color={active ? C.green600 : C.gray400}
                />
              </View>
              <Text style={[s.tabLabel, active && s.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ─── Shared Styles ─────────────────────────────────────────────────────────────

const shared = StyleSheet.create({
  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 8,
    gap: 8,
  },
  sectionHeaderAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: C.green500,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    color: C.gray500,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.gray900,
    marginBottom: 4,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    gap: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: { flex: 1, fontSize: 14, color: C.gray700, fontWeight: "500" },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.gray50 },
  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  headerMore: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  topHeaderTitle: { fontSize: 16, fontWeight: "700", color: C.gray900 },
  emptyWrap: { alignItems: "center", marginTop: 60, gap: 8 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.gray600,
    marginTop: 8,
  },
  empty: { textAlign: "center", color: C.gray400, fontSize: 13 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    paddingBottom: 8,
    paddingTop: 6,
    shadowColor: C.gray900,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  tabItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
  tabIconWrap: {
    width: 42,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  tabIconWrapActive: { backgroundColor: C.green50 },
  tabLabel: { fontSize: 10, color: C.gray400, marginTop: 2, fontWeight: "500" },
  tabLabelActive: { color: C.green700, fontWeight: "700" },
});
