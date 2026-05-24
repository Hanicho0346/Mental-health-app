import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { useClerk } from "@clerk/clerk-expo";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from "react-native-svg";

type MeResponse = {
  id: string;
  full_name: string;
  email: string;
  national_id: string;
  avatar_url?: string;
  mood_status?: string;
  createdAt?: string;
};

type AppointmentDto = {
  id: string;
  counselor_name: string;
  scheduled_at: string;
};

type TransactionType =
  | "session_earning"
  | "platform_commission"
  | "payment_received"
  | "withdrawal"
  | "refund";

type WalletTx = {
  id: string;
  amount: number;
  transaction_type: TransactionType;
  payment_reference: string;
  status: string;
  description: string;
  booking_id: string | null;
  created_at: string;
};

type WalletData = {
  balance: number;
  transactions: WalletTx[];
};

const TYPE_META: Record<
  TransactionType,
  { label: string; icon: string; color: string; bg: string; sign: "+" | "-" }
> = {
  session_earning: {
    label: "Session Earning",
    icon: "trending-up",
    color: "#16A34A",
    bg: "#DCFCE7",
    sign: "+",
  },
  platform_commission: {
    label: "Platform Commission",
    icon: "percent",
    color: "#2563EB",
    bg: "#DBEAFE",
    sign: "+",
  },
  payment_received: {
    label: "Payment",
    icon: "credit-card",
    color: "#D97706",
    bg: "#FEF3C7",
    sign: "-",
  },
  withdrawal: {
    label: "Withdrawal",
    icon: "arrow-up-right",
    color: "#EF4444",
    bg: "#FEE2E2",
    sign: "-",
  },
  refund: {
    label: "Refund",
    icon: "rotate-ccw",
    color: "#7C3AED",
    bg: "#EDE9FE",
    sign: "+",
  },
};

function fmtDate(iso: string): string {
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

export default function ProfileScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        try {
          const [meRes, apptRes, walletRes] = await Promise.all([
            api.get<MeResponse>("/users/me"),
            api.get<AppointmentDto[]>("/appointments"),
            api.get<WalletData>("/bookings/wallet"),
          ]);
          if (!cancelled) {
            setMe(meRes.data);
            setAppointments(apptRes.data);
            setWallet(walletRes.data);
          }
        } catch (e) {
          logClientError("profile.load", e);
          if (!cancelled) {
            setMe(null);
            setAppointments([]);
            setWallet(null);
            Alert.alert("Could not load profile", getApiErrorMessage(e));
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
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

  const joinLabel =
    me?.createdAt != null
      ? `Joined ${new Date(me.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`
      : "Joined";

  const statusLine =
    me?.mood_status && me.mood_status.trim().length > 0
      ? `${me.mood_status.trim()} / የተረጋጋ`
      : "Feeling Calm / የተረጋጋ";

  // Show only the 3 most recent transactions as a preview
  const recentTxs = (wallet?.transactions ?? []).slice(0, 3);

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile / መገለጫ</Text>
        <TouchableOpacity>
          <Feather name="more-vertical" size={24} color="#111827" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* HERO CARD */}
        <View style={styles.heroCard}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatarCircle} />
            <View style={styles.activeDot} />
          </View>
          <Text style={styles.userName}>{me?.full_name ?? "—"}</Text>
          <Text style={styles.joinDate}>{joinLabel}</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{statusLine}</Text>
          </View>
        </View>

        {/* MENTAL GROWTH SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            MENTAL GROWTH{" "}
            <Text style={styles.amharicSectionTitle}>/ የአእምሮ እድገት</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Your journey this week</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: "#F0FDF4" }]}>
              <View style={styles.statIconRow}>
                <Feather name="calendar" size={14} color="#4ADE80" />
                <Text style={[styles.statLabel, { color: "#4ADE80" }]}>
                  SESSIONS
                </Text>
              </View>
              <Text style={styles.statValue}>{appointments.length}</Text>
              <Text style={styles.statSubText}>Total completed</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: "#FFF7ED" }]}>
              <View style={styles.statIconRow}>
                <Feather name="award" size={14} color="#F59E0B" />
                <Text style={[styles.statLabel, { color: "#111827" }]}>
                  STREAK
                </Text>
              </View>
              <Text style={styles.statValue}>5</Text>
              <Text style={styles.statSubText}>Days in a row</Text>
            </View>
          </View>

          <View style={styles.graphHeader}>
            <Text style={styles.graphTitle}>
              <Feather name="trending-up" size={16} /> Mood Trend{" "}
              <Text style={styles.amharicGraphTitle}>/ የስሜት ሁኔታ</Text>
            </Text>
            <Text style={styles.graphSubtitle}>Weekly Overview</Text>
          </View>
          <View style={styles.graphContainer}>
            <Svg
              height="70"
              width="100%"
              viewBox="0 0 300 70"
              preserveAspectRatio="none"
            >
              <Defs>
                <SvgGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#4ADE80" stopOpacity="0.3" />
                  <Stop offset="1" stopColor="#4ADE80" stopOpacity="0" />
                </SvgGradient>
              </Defs>
              <Path
                d="M0 50 Q 30 40, 60 50 T 130 50 T 180 15 T 250 25 T 300 10 L 300 70 L 0 70 Z"
                fill="url(#grad)"
              />
              <Path
                d="M0 50 Q 30 40, 60 50 T 130 50 T 180 15 T 250 25 T 300 10"
                fill="none"
                stroke="#4ADE80"
                strokeWidth="3"
              />
            </Svg>
            <View style={styles.graphDays}>
              {["Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <Text key={day} style={styles.dayText}>
                  {day}
                </Text>
              ))}
            </View>
          </View>
        </View>

        {/* ── WALLET SECTION ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            MY WALLET <Text style={styles.amharicSectionTitle}>/ ዋሌት</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Balance & recent activity</Text>
        </View>

        <View style={styles.walletCard}>
          {/* Balance banner */}
          <View style={styles.walletBanner}>
            <View>
              <Text style={styles.walletBannerLabel}>Available Balance</Text>
              <Text style={styles.walletBannerAmount}>
                ETB {(wallet?.balance ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.walletBannerIcon}>
              <Feather name="credit-card" size={22} color="#16A34A" />
            </View>
          </View>

          {/* Recent transactions preview */}
          {recentTxs.length > 0 ? (
            <>
              <Text style={styles.walletTxHeading}>Recent Transactions</Text>
              {recentTxs.map((item, idx) => {
                const meta =
                  TYPE_META[item.transaction_type] ??
                  TYPE_META.payment_received;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.divider} />}
                    <View style={styles.txRow}>
                      <View
                        style={[styles.txIcon, { backgroundColor: meta.bg }]}
                      >
                        <Feather
                          name={meta.icon as any}
                          size={16}
                          color={meta.color}
                        />
                      </View>
                      <View style={styles.txInfo}>
                        <Text style={styles.txLabel}>{meta.label}</Text>
                        <Text style={styles.txDate}>
                          {fmtDate(item.created_at)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.txAmount,
                          { color: meta.sign === "+" ? "#16A34A" : "#EF4444" },
                        ]}
                      >
                        {meta.sign}ETB {item.amount}
                      </Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </>
          ) : (
            <View style={styles.walletEmpty}>
              <Feather name="inbox" size={24} color="#D1D5DB" />
              <Text style={styles.walletEmptyTxt}>No transactions yet</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.walletViewAll}
            onPress={() => router.push("/wallet")}
          >
            <Text style={styles.walletViewAllTxt}>View full wallet</Text>
            <Feather name="arrow-right" size={14} color="#16A34A" />
          </TouchableOpacity>
        </View>

        {/* ACCOUNT SAFETY SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            ACCOUNT SAFETY{" "}
            <Text style={styles.amharicSectionTitle}>/ መለያ ደህንነት</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Secure and verified data</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity style={styles.rowItem}>
            <View style={styles.iconCircle}>
              <Feather name="mail" size={18} color="#4B5563" />
            </View>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>
                Email Address <Text style={styles.amharicRowTitle}>/ ኢሜል</Text>
              </Text>
              <Text style={styles.rowValue}>{me?.email ?? "—"}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem}>
            <View style={styles.iconCircle}>
              <Feather name="lock" size={18} color="#4B5563" />
            </View>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>
                National ID <Text style={styles.amharicRowTitle}>/ መታወቂያ</Text>
              </Text>
              <Text style={styles.rowValue}>{me?.national_id ?? "—"}</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
          </TouchableOpacity>

          <View style={styles.privacyBox}>
            <Feather
              name="shield"
              size={18}
              color="#111827"
              style={{ marginTop: 2 }}
            />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.privacyText}>
                Your data is protected with 256-bit encryption. National ID is
                only used for verifying identity with professionals.
              </Text>
              <TouchableOpacity>
                <Text style={styles.privacyLink}>
                  Learn more about our Privacy Policy
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* PREFERENCES SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            PREFERENCES <Text style={styles.amharicSectionTitle}>/ ምርጫዎች</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Customize your experience</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowItem}>
            <View style={styles.iconCircle}>
              <Feather name="bell" size={18} color="#4B5563" />
            </View>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>
                Notifications{" "}
                <Text style={styles.amharicRowTitle}>/ ማሳወቂያዎች</Text>
              </Text>
              <Text style={styles.rowValue}>Active</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: "#D1D5DB", true: "#4ADE80" }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.rowItem}>
            <View style={styles.iconCircle}>
              <Feather name="globe" size={18} color="#4B5563" />
            </View>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>
                Language <Text style={styles.amharicRowTitle}>/ ቋንቋ</Text>
              </Text>
              <Text style={styles.rowValue}>English & አማርኛ</Text>
            </View>
            <View style={styles.langToggle}>
              <View style={[styles.langOption, styles.langActive]}>
                <Text style={styles.langTextActive}>EN</Text>
              </View>
              <View style={styles.langOption}>
                <Text style={styles.langText}>አማ</Text>
              </View>
            </View>
          </View>
        </View>

        {/* HELP & SUPPORT SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            HELP & SUPPORT{" "}
            <Text style={styles.amharicSectionTitle}>/ እርዳታ</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Resources for you</Text>
        </View>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.rowItem}
            onPress={() => void logout()}
          >
            <View style={styles.iconCircle}>
              <Feather name="log-out" size={18} color="#EF4444" />
            </View>
            <View style={styles.rowTextContainer}>
              <Text style={styles.rowTitle}>
                Log out <Text style={styles.amharicRowTitle}>/ ውጣ</Text>
              </Text>
              <Text style={styles.rowValue}>
                End this session on this device
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color="#9CA3AF" />
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
    paddingBottom: 15,
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: "#111827" },
  scrollContent: { paddingHorizontal: 20 },

  heroCard: {
    backgroundColor: "#FAF5ED",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    marginBottom: 30,
  },
  avatarContainer: { position: "relative", marginBottom: 16 },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#ECFCCB",
  },
  activeDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    backgroundColor: "#4ADE80",
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FAF5ED",
  },
  userName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  joinDate: { fontSize: 14, color: "#6B7280", marginBottom: 16 },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#22C55E",
    marginRight: 8,
  },
  statusText: { color: "#16A34A", fontSize: 13, fontWeight: "bold" },

  sectionHeader: { marginBottom: 12, marginTop: 10 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 1,
  },
  amharicSectionTitle: { fontSize: 11, color: "#9CA3AF", letterSpacing: 0 },
  sectionSubtitle: { fontSize: 13, color: "#9CA3AF", marginTop: 2 },

  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },

  statsRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  statBox: { flex: 1, borderRadius: 16, padding: 16 },
  statIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  statLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
  },
  statSubText: { fontSize: 12, color: "#6B7280" },

  graphHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  graphTitle: { fontSize: 14, fontWeight: "bold", color: "#111827" },
  amharicGraphTitle: { fontSize: 12, color: "#6B7280", fontWeight: "normal" },
  graphSubtitle: { fontSize: 12, color: "#9CA3AF" },
  graphContainer: { height: 100, width: "100%" },
  graphDays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  dayText: { fontSize: 11, color: "#9CA3AF" },

  // ── Wallet styles ──
  walletCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    marginBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
  },
  walletBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  walletBannerLabel: { fontSize: 12, color: "#6B7280", marginBottom: 4 },
  walletBannerAmount: { fontSize: 26, fontWeight: "800", color: "#16A34A" },
  walletBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  walletTxHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 12,
  },
  walletEmpty: { alignItems: "center", paddingVertical: 20, gap: 8 },
  walletEmptyTxt: { fontSize: 13, color: "#9CA3AF" },
  walletViewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  walletViewAllTxt: { fontSize: 13, fontWeight: "700", color: "#16A34A" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  txIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  txInfo: { flex: 1 },
  txLabel: { fontSize: 13, fontWeight: "700", color: "#111827" },
  txDate: { fontSize: 11, color: "#9CA3AF", marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "800" },

  rowItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  rowTextContainer: { flex: 1 },
  rowTitle: { fontSize: 13, color: "#6B7280", marginBottom: 2 },
  amharicRowTitle: { fontSize: 11, color: "#9CA3AF" },
  rowValue: { fontSize: 15, fontWeight: "700", color: "#111827" },
  divider: { height: 1, backgroundColor: "#F3F4F6", marginVertical: 16 },

  privacyBox: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
  },
  privacyText: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 18,
    marginBottom: 8,
  },
  privacyLink: { fontSize: 12, color: "#4ADE80", fontWeight: "bold" },

  langToggle: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 20,
    padding: 4,
  },
  langOption: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },
  langActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  langText: { fontSize: 12, fontWeight: "700", color: "#9CA3AF" },
  langTextActive: { fontSize: 12, fontWeight: "700", color: "#111827" },
});
