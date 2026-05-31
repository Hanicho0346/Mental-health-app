import { api } from "@/lib/api";
import { clearAuthToken } from "@/lib/auth";
import { getApiErrorMessage, logClientError } from "@/lib/log";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { useClerk } from "@clerk/clerk-expo";
import { UpgradeModal } from '@/components/UpgradeModal';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Stop,
} from "react-native-svg";
import { useAuthStore } from "@/stores/authStore";

// ─── Types ────────────────────────────────────────────────────────────────────

type SubscriptionTier = "free" | "premier" | "student";

type MeResponse = {
  id: string;
  full_name: string;
  email: string;
  national_id: string;
  avatar_url?: string;
  mood_status?: string;
  createdAt?: string;
  subscription_tier: SubscriptionTier;
  is_premier: boolean;
  premier_expires_at?: string;
  ai_chats_used_today?: number;
  ai_chats_daily_limit?: number; // null = unlimited for premier
  streak_days?: number;
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

// ─── Constants ────────────────────────────────────────────────────────────────

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

const TIER_META: Record<
  SubscriptionTier,
  { label: string; color: string; bg: string; icon: string }
> = {
  free: {
    label: "Free",
    color: "#6B7280",
    bg: "#F3F4F6",
    icon: "user",
  },
  premier: {
    label: "Premier",
    color: "#B45309",
    bg: "#FEF3C7",
    icon: "star",
  },
  student: {
    label: "Student",
    color: "#1D4ED8",
    bg: "#DBEAFE",
    icon: "book-open",
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

// ─── Upgrade Modal ────────────────────────────────────────────────────────────





// ─── Premier Benefits Card ────────────────────────────────────────────────────

type PremierCardProps = {
  tier: SubscriptionTier;
  isPremier: boolean;
  aiChatsUsedToday: number;
  aiChatsDailyLimit: number | null;
  streakDays: number;
  onUpgrade: () => void;
};

function PremierCard({
  tier,
  isPremier,
  aiChatsUsedToday,
  aiChatsDailyLimit,
  streakDays,
  onUpgrade,
}: PremierCardProps) {
  if (!isPremier) {
    // Show upgrade CTA for free users
    return (
      <View style={premierStyles.upgradeCard}>
        <View style={premierStyles.upgradeLeft}>
          <View style={premierStyles.upgradeIconWrap}>
            <Feather name="star" size={20} color="#B45309" />
          </View>
          <View>
            <Text style={premierStyles.upgradeTitle}>
              Unlock Premier Access
            </Text>
            <Text style={premierStyles.upgradeSubtitle}>
              AI chat · Streaks · Group chats
            </Text>
          </View>
        </View>
        <TouchableOpacity style={premierStyles.upgradeBtn} onPress={onUpgrade}>
          <Text style={premierStyles.upgradeBtnText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const chatProgress =
    aiChatsDailyLimit != null
      ? Math.min(aiChatsUsedToday / aiChatsDailyLimit, 1)
      : 0;

  return (
    <View style={premierStyles.card}>
      {/* Tier badge */}
      <View style={premierStyles.cardHeader}>
        <View
          style={[
            premierStyles.tierBadge,
            { backgroundColor: TIER_META[tier].bg },
          ]}
        >
          <Feather
            name={TIER_META[tier].icon as any}
            size={13}
            color={TIER_META[tier].color}
          />
          <Text style={[premierStyles.tierLabel, { color: TIER_META[tier].color }]}>
            {TIER_META[tier].label.toUpperCase()}
          </Text>
        </View>
        <Text style={premierStyles.cardTitle}>Your Benefits</Text>
      </View>

      {/* 3 benefit pills */}
      <View style={premierStyles.pillRow}>
        {/* AI Chat */}
        <TouchableOpacity
          style={premierStyles.pill}
          onPress={() => router.push("/aichat")}
        >
          <View style={[premierStyles.pillIcon, { backgroundColor: "#F0FDF4" }]}>
            <Feather name="message-circle" size={16} color="#16A34A" />
          </View>
          <Text style={premierStyles.pillLabel}>AI Chat</Text>
          <Text style={premierStyles.pillSub}>
            {aiChatsDailyLimit == null
              ? "Unlimited"
              : `${aiChatsUsedToday}/${aiChatsDailyLimit} today`}
          </Text>
          {aiChatsDailyLimit != null && (
            <View style={premierStyles.progressTrack}>
              <View
                style={[
                  premierStyles.progressFill,
                  { width: `${chatProgress * 100}%` },
                ]}
              />
            </View>
          )}
        </TouchableOpacity>

        {/* Daily Streak */}
        <TouchableOpacity
          style={premierStyles.pill}
          onPress={() => router.push("/streak")}
        >
          <View style={[premierStyles.pillIcon, { backgroundColor: "#FFF7ED" }]}>
            <Feather name="zap" size={16} color="#F59E0B" />
          </View>
          <Text style={premierStyles.pillLabel}>Streak</Text>
          <Text style={[premierStyles.pillSub, { color: "#F59E0B", fontWeight: "800" }]}>
            {streakDays} days 🔥
          </Text>
        </TouchableOpacity>

        {/* Group Chats */}
        <TouchableOpacity
          style={premierStyles.pill}
          onPress={() => router.push("/groupchats")}
        >
          <View style={[premierStyles.pillIcon, { backgroundColor: "#EDE9FE" }]}>
            <Feather name="users" size={16} color="#7C3AED" />
          </View>
          <Text style={premierStyles.pillLabel}>Groups</Text>
          <Text style={premierStyles.pillSub}>Join nearby</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [appointments, setAppointments] = useState<AppointmentDto[]>([]);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  async function loadData(cancelled: { value: boolean }) {
    try {
      const [meRes, apptRes, walletRes] = await Promise.all([
        api.get<MeResponse>("/users/me"),
        api.get<AppointmentDto[]>("/appointments"),
        api.get<WalletData>("/bookings/wallet"),
      ]);
      if (!cancelled.value) {
        setMe(meRes.data);
       
useAuthStore.getState().setIsPremier(meRes.data.is_premier ?? false);
        setAppointments(apptRes.data);
        setWallet(walletRes.data);
      }
    } catch (e) {
      logClientError("profile.load", e);
      if (!cancelled.value) {
        setMe(null);
        setAppointments([]);
        setWallet(null);
        Alert.alert("Could not load profile", getApiErrorMessage(e));
      }
    }
  }

  useFocusEffect(
    useCallback(() => {
      const cancelled = { value: false };
      void loadData(cancelled);
      return () => {
        cancelled.value = true;
      };
    }, [])
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

  const tier: SubscriptionTier = me?.subscription_tier ?? "free";
  const isPremier = me?.is_premier ?? false;
  const streakDays = me?.streak_days ?? 0;
  const aiChatsUsedToday = me?.ai_chats_used_today ?? 0;
  const aiChatsDailyLimit = me?.ai_chats_daily_limit ?? null;

  const joinLabel =
    me?.createdAt != null
      ? `Joined ${new Date(me.createdAt).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}`
      : "Joined";

  const statusLine =
    me?.mood_status && me.mood_status.trim().length > 0
      ? `${me.mood_status.trim()} / የተረጋጋ`
      : "Feeling Calm / የተረጋጋ";

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
          <View style={styles.heroNameRow}>
            <Text style={styles.userName}>{me?.full_name ?? "—"}</Text>
            {isPremier && (
              <View
                style={[
                  styles.heroBadge,
                  { backgroundColor: TIER_META[tier].bg },
                ]}
              >
                <Feather
                  name={TIER_META[tier].icon as any}
                  size={11}
                  color={TIER_META[tier].color}
                />
                <Text
                  style={[styles.heroBadgeText, { color: TIER_META[tier].color }]}
                >
                  {TIER_META[tier].label}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.joinDate}>{joinLabel}</Text>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>{statusLine}</Text>
          </View>
        </View>

        {/* ── PREMIER / UPGRADE SECTION ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {isPremier ? (
              <>
                MY PLAN{" "}
                <Text style={styles.amharicSectionTitle}>/ የደንበኝነት ዕቅድ</Text>
              </>
            ) : (
              <>
                UPGRADE{" "}
                <Text style={styles.amharicSectionTitle}>/ ያሻሽሉ</Text>
              </>
            )}
          </Text>
          <Text style={styles.sectionSubtitle}>
            {isPremier
              ? "Your unlocked features"
              : "Get AI chat, streaks & group access"}
          </Text>
        </View>

        <PremierCard
          tier={tier}
          isPremier={isPremier}
          aiChatsUsedToday={aiChatsUsedToday}
          aiChatsDailyLimit={aiChatsDailyLimit}
          streakDays={streakDays}
          onUpgrade={() => setUpgradeVisible(true)}
        />

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
              <Text style={styles.statValue}>{streakDays}</Text>
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

        {/* WALLET SECTION */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            MY WALLET <Text style={styles.amharicSectionTitle}>/ ዋሌት</Text>
          </Text>
          <Text style={styles.sectionSubtitle}>Balance & recent activity</Text>
        </View>

        <View style={styles.walletCard}>
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
                          {
                            color:
                              meta.sign === "+" ? "#16A34A" : "#EF4444",
                          },
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
                Email Address{" "}
                <Text style={styles.amharicRowTitle}>/ ኢሜል</Text>
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
                National ID{" "}
                <Text style={styles.amharicRowTitle}>/ መታወቂያ</Text>
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
            PREFERENCES{" "}
            <Text style={styles.amharicSectionTitle}>/ ምርጫዎች</Text>
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

      {/* UPGRADE MODAL */}
      <UpgradeModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        onSuccess={() => {
          // Re-fetch user data to reflect new tier
          const cancelled = { value: false };
          void loadData(cancelled);
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const premierStyles = StyleSheet.create({
  // Upgrade CTA (free users)
  upgradeCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 20,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  upgradeLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  upgradeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  upgradeTitle: { fontSize: 14, fontWeight: "800", color: "#92400E" },
  upgradeSubtitle: { fontSize: 12, color: "#B45309", marginTop: 2 },
  upgradeBtn: {
    backgroundColor: "#B45309",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  upgradeBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  // Premier benefits card
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
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  tierBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tierLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },
  pillRow: { flexDirection: "row", gap: 10 },
  pill: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
  },
  pillIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
  },
  pillSub: { fontSize: 10, color: "#6B7280", textAlign: "center" },
  progressTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#16A34A",
    borderRadius: 2,
  },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  sheetSubtitle: { fontSize: 13, color: "#6B7280", marginBottom: 20 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabActive: { backgroundColor: "#FFFFFF" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#9CA3AF" },
  tabTextActive: { color: "#B45309" },
  tabTextActiveBlue: { color: "#1D4ED8" },
  benefits: { gap: 10, marginBottom: 20 },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
  },
  benefitText: { fontSize: 13, color: "#374151", fontWeight: "600" },
  priceBox: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 16,
  },
  price: { fontSize: 28, fontWeight: "800", color: "#111827" },
  pricePer: { fontSize: 14, color: "#6B7280" },
  inputLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#F9FAFB",
  },
  ctaBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 20,
  },
  ctaBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});

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
  heroNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  userName: { fontSize: 20, fontWeight: "800", color: "#111827" },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  heroBadgeText: { fontSize: 10, fontWeight: "800" },
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
  amharicGraphTitle: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "normal",
  },
  graphSubtitle: { fontSize: 12, color: "#9CA3AF" },
  graphContainer: { height: 100, width: "100%" },
  graphDays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  dayText: { fontSize: 11, color: "#9CA3AF" },

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
  walletBannerAmount: {
    fontSize: 26,
    fontWeight: "800",
    color: "#16A34A",
  },
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
  walletEmpty: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
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

  rowItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
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
  divider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 16,
  },

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
  langOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
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